"""Consent- and visibility-gated human trajectory import/review pipeline."""

from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any

from contracts import ContractError, validate_trajectory


HUMAN_IMPORT_VERSION = "fcm.human-import.v1"
HUMAN_REVIEW_VERSION = "fcm.human-review.v1"

_ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$")
_PSEUDONYM = re.compile(r"^anon-[A-Za-z0-9_-]{3,64}$")
_FORBIDDEN_ACTION_KEYS = {
    "opponentchoice", "rivalchoice", "hiddenchoice", "otherplayerchoice",
    "movedata", "gamedata", "chat", "commentary", "reasoning",
    "username", "displayname",
}


def _object(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{path}: expected object")
    return value


def _exact_keys(value: dict[str, Any], keys: set[str], path: str) -> None:
    unknown = value.keys() - keys
    missing = keys - value.keys()
    if unknown:
        raise ContractError(f"{path}.{sorted(unknown)[0]}: unknown field")
    if missing:
        raise ContractError(f"{path}: missing {sorted(missing)!r}")


def _string(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value:
        raise ContractError(f"{path}: expected non-empty string")
    return value


def _timestamp(value: Any, path: str) -> str:
    result = _string(value, path)
    if not _ISO_UTC.fullmatch(result):
        raise ContractError(f"{path}: expected an ISO-8601 UTC timestamp")
    return result


def _integer(value: Any, path: str, minimum: int = 0) -> int:
    if type(value) is not int or value < minimum:
        raise ContractError(f"{path}: expected integer >= {minimum}")
    return value


def _true(value: Any, path: str) -> None:
    if value is not True:
        raise ContractError(f"{path}: explicit true is required")


def _reject_forbidden_action_keys(value: Any, path: str) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            compact = re.sub(r"[^a-z0-9]", "", str(key).lower())
            if compact in _FORBIDDEN_ACTION_KEYS:
                raise ContractError(f"{path}.{key}: hidden/text field is forbidden")
            _reject_forbidden_action_keys(item, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _reject_forbidden_action_keys(item, f"{path}[{index}]")


def _canonical_hash(value: dict[str, Any]) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def validate_human_import(value: Any) -> dict[str, Any]:
    package = _object(value, "$")
    keys = {"schemaVersion", "provenance", "consent", "license", "trajectory"}
    _exact_keys(package, keys, "$")
    if package["schemaVersion"] != HUMAN_IMPORT_VERSION:
        raise ContractError("$.schemaVersion: unsupported version")

    provenance = _object(package["provenance"], "$.provenance")
    provenance_keys = {"source", "exportedAt", "contributorId", "gameId", "seat"}
    _exact_keys(provenance, provenance_keys, "$.provenance")
    if provenance["source"] != "obg-seat-export":
        raise ContractError("$.provenance.source: only obg-seat-export is accepted")
    _timestamp(provenance["exportedAt"], "$.provenance.exportedAt")
    contributor_id = _string(provenance["contributorId"], "$.provenance.contributorId")
    if not _PSEUDONYM.fullmatch(contributor_id):
        raise ContractError("$.provenance.contributorId: expected an anon-* pseudonym")
    game_id = _integer(provenance["gameId"], "$.provenance.gameId", 1)
    seat = _integer(provenance["seat"], "$.provenance.seat")

    consent = _object(package["consent"], "$.consent")
    consent_keys = {"granted", "purpose", "permitsTraining"}
    _exact_keys(consent, consent_keys, "$.consent")
    _true(consent["granted"], "$.consent.granted")
    if consent["purpose"] != "fcm-strategy-research":
        raise ContractError("$.consent.purpose: unsupported purpose")
    _true(consent["permitsTraining"], "$.consent.permitsTraining")

    license_data = _object(package["license"], "$.license")
    license_keys = {"licenseId", "permitsTraining", "permitsRedistribution"}
    _exact_keys(license_data, license_keys, "$.license")
    _string(license_data["licenseId"], "$.license.licenseId")
    _true(license_data["permitsTraining"], "$.license.permitsTraining")
    if type(license_data["permitsRedistribution"]) is not bool:
        raise ContractError("$.license.permitsRedistribution: expected boolean")

    trajectory = validate_trajectory(package["trajectory"])
    if trajectory["gameId"] != game_id:
        raise ContractError("$.provenance.gameId: trajectory mismatch")
    for index, step in enumerate(trajectory["steps"]):
        path = f"$.trajectory.steps[{index}]"
        if step["seat"] != seat or step["observation"]["seat"] != seat:
            raise ContractError(f"{path}.seat: cross-seat data is forbidden")
        if step["observation"]["belief"]["opponents"]:
            raise ContractError(f"{path}.observation.belief.opponents: imports must contain no beliefs")
        if step["observation"]["private"]["ownPendingChoice"] is not None:
            raise ContractError(
                f"{path}.observation.private.ownPendingChoice: temporary hidden choices are forbidden"
            )
        legal_types = {
            action["type"] for action in step["observation"]["private"]["legalActions"]
        }
        for action_index, action in enumerate(step["primitiveActions"]):
            action_path = f"{path}.primitiveActions[{action_index}]"
            action = _object(action, action_path)
            action_type = _string(action.get("type"), f"{action_path}.type")
            if action_type not in legal_types:
                raise ContractError(f"{action_path}.type: action was not advertised as legal")
            _reject_forbidden_action_keys(action, action_path)
    return package


def build_human_review(package: Any, *, imported_at: str) -> dict[str, Any]:
    validated = validate_human_import(package)
    _timestamp(imported_at, "$.importedAt")
    stored_package = copy.deepcopy(validated)
    return {
        "schemaVersion": HUMAN_REVIEW_VERSION,
        "status": "pending",
        "contentHash": _canonical_hash(stored_package),
        "importedAt": imported_at,
        "package": stored_package,
        "review": None,
    }


def approve_human_review(
    value: Any,
    *,
    reviewer: str,
    reviewed_at: str,
    attestations: dict[str, Any],
) -> dict[str, Any]:
    record = _object(value, "$")
    keys = {"schemaVersion", "status", "contentHash", "importedAt", "package", "review"}
    _exact_keys(record, keys, "$")
    if record["schemaVersion"] != HUMAN_REVIEW_VERSION or record["status"] != "pending":
        raise ContractError("$: only a pending fcm.human-review.v1 record can be approved")
    if record["review"] is not None:
        raise ContractError("$.review: pending record must not already contain a review")
    _timestamp(record["importedAt"], "$.importedAt")
    validated = validate_human_import(record["package"])
    if record["contentHash"] != _canonical_hash(validated):
        raise ContractError("$.contentHash: package changed after import")
    reviewer = _string(reviewer, "$.review.reviewer")
    _timestamp(reviewed_at, "$.review.reviewedAt")
    attestation_keys = {
        "seatVisibilityVerified", "actionLegalityVerified", "consentVerified",
    }
    attestations = _object(attestations, "$.review.attestations")
    _exact_keys(attestations, attestation_keys, "$.review.attestations")
    for key in sorted(attestation_keys):
        _true(attestations[key], f"$.review.attestations.{key}")

    approved = copy.deepcopy(record)
    approved["status"] = "approved"
    approved["review"] = {
        "reviewer": reviewer,
        "reviewedAt": reviewed_at,
        "attestations": copy.deepcopy(attestations),
    }
    return approved
