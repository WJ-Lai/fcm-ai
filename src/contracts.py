"""Strict, dependency-free contracts at the FCM policy trust boundary."""

from __future__ import annotations

import math
import re
from typing import Any


DECISION_VIEW_VERSION = "fcm.decision-view.v1"
TRAJECTORY_VERSION = "fcm.trajectory.v1"
GAME_RESULT_VERSION = "fcm.game-result.v1"

_RULESET_HASH = re.compile(r"^sha256:[0-9a-f]{64}$")
_CREDENTIAL_TERMS = ("token", "password", "secret", "authorization", "cookie", "apikey")
_CREDENTIAL_VALUES = (
    re.compile(r"^obg_pat_[A-Za-z0-9]{12}_[A-Za-z0-9_-]{32,}$"),
    re.compile(r"^Bearer\s+\S{16,}$", re.IGNORECASE),
)


class ContractError(ValueError):
    """Raised when data is unsafe or incompatible with a versioned contract."""


def _object(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{path}: expected object")
    return value


def _exact_keys(value: dict[str, Any], allowed: set[str], required: set[str], path: str) -> None:
    unknown = value.keys() - allowed
    if unknown:
        key = sorted(unknown)[0]
        raise ContractError(f"{path}.{key}: unknown field")
    missing = required - value.keys()
    if missing:
        raise ContractError(f"{path}: missing {sorted(missing)!r}")


def _integer(value: Any, path: str, minimum: int = 0) -> int:
    if type(value) is not int or value < minimum:
        raise ContractError(f"{path}: expected integer >= {minimum}")
    return value


def _number(value: Any, path: str, minimum: float = 0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ContractError(f"{path}: expected finite number")
    result = float(value)
    if not math.isfinite(result) or result < minimum:
        raise ContractError(f"{path}: expected finite number >= {minimum}")
    return result


def _string(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value:
        raise ContractError(f"{path}: expected non-empty string")
    return value


def _list(value: Any, path: str) -> list[Any]:
    if not isinstance(value, list):
        raise ContractError(f"{path}: expected array")
    return value


def _unique_integers(value: Any, path: str) -> list[int]:
    result = _list(value, path)
    for index, item in enumerate(result):
        _integer(item, f"{path}[{index}]")
    if len(result) != len(set(result)):
        raise ContractError(f"{path}: duplicate seat")
    return result


def _ruleset_hash(value: Any, path: str) -> str:
    result = _string(value, path)
    if not _RULESET_HASH.fullmatch(result):
        raise ContractError(f"{path}: expected sha256:<64 lowercase hex chars>")
    return result


def _reject_credentials(value: Any, path: str = "$") -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            compact_key = re.sub(r"[^a-z0-9]", "", str(key).lower())
            if any(term in compact_key for term in _CREDENTIAL_TERMS):
                raise ContractError(f"{path}.{key}: credential-like key is forbidden")
            _reject_credentials(item, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _reject_credentials(item, f"{path}[{index}]")
    elif isinstance(value, str) and any(pattern.fullmatch(value) for pattern in _CREDENTIAL_VALUES):
        raise ContractError(f"{path}: credential-like value is forbidden")


def _derived_player(value: Any, path: str) -> None:
    player = _object(value, path)
    keys = {
        "seat", "cash", "bankrupt", "resources", "employees", "beach", "company",
        "freeSlots", "salary", "price", "incomeBonus", "capacities", "restaurants",
        "milestones",
    }
    _exact_keys(player, keys, keys, path)


def _derived_house(value: Any, path: str) -> None:
    house = _object(value, path)
    keys = {"number", "demand", "garden", "suppliers"}
    _exact_keys(house, keys, keys, path)


def _dinner_projection(value: Any, path: str) -> None:
    projection = _object(value, path)
    keys = {"sourceVersion", "houses", "playerRevenue"}
    _exact_keys(projection, keys, keys, path)


def _opponent_belief(value: Any, path: str) -> None:
    opponent = _object(value, path)
    keys = {"seat", "observedPlan", "confidence", "hypotheses"}
    _exact_keys(opponent, keys, keys, path)


def validate_decision_view(value: Any) -> dict[str, Any]:
    view = _object(value, "$")
    required = {
        "schemaVersion", "gameId", "sourceVersion", "rulesetHash", "seat",
        "public", "private", "derived", "belief",
    }
    _exact_keys(view, required, required, "$")
    if view["schemaVersion"] != DECISION_VIEW_VERSION:
        raise ContractError("$.schemaVersion: unsupported version")
    _integer(view["gameId"], "$.gameId", 1)
    _integer(view["sourceVersion"], "$.sourceVersion")
    _ruleset_hash(view["rulesetHash"], "$.rulesetHash")
    seat = _integer(view["seat"], "$.seat")

    public = _object(view["public"], "$.public")
    public_required = {
        "phase", "subphase", "turn", "actingSeats", "pendingSeats", "turnOrder",
        "bank", "bankBreaks", "enabledModules",
    }
    public_allowed = public_required | {
        "employeeSupply", "campaigns", "milestonesAvailable", "mapSeed",
    }
    _exact_keys(public, public_allowed, public_required, "$.public")
    _integer(public["phase"], "$.public.phase")
    if public["subphase"] is not None:
        _integer(public["subphase"], "$.public.subphase")
    _integer(public["turn"], "$.public.turn")
    acting = _unique_integers(public["actingSeats"], "$.public.actingSeats")
    pending = _unique_integers(public["pendingSeats"], "$.public.pendingSeats")
    order = _unique_integers(public["turnOrder"], "$.public.turnOrder")
    if not {seat, *acting, *pending}.issubset(set(order)):
        raise ContractError("$.public: seat lists must be subsets of turnOrder")
    if public["bank"] is not None:
        _integer(public["bank"], "$.public.bank")
    _integer(public["bankBreaks"], "$.public.bankBreaks")
    for index, module in enumerate(_list(public["enabledModules"], "$.public.enabledModules")):
        _string(module, f"$.public.enabledModules[{index}]")

    private = _object(view["private"], "$.private")
    private_keys = {"legalActions", "ownPendingChoice"}
    _exact_keys(private, private_keys, private_keys, "$.private")
    for index, action in enumerate(_list(private["legalActions"], "$.private.legalActions")):
        action = _object(action, f"$.private.legalActions[{index}]")
        _string(action.get("type"), f"$.private.legalActions[{index}].type")
    if private["ownPendingChoice"] is not None:
        _object(private["ownPendingChoice"], "$.private.ownPendingChoice")

    derived = _object(view["derived"], "$.derived")
    derived_keys = {"players", "houses", "dinnerProjection"}
    _exact_keys(derived, derived_keys, derived_keys, "$.derived")
    for index, player in enumerate(_list(derived["players"], "$.derived.players")):
        _derived_player(player, f"$.derived.players[{index}]")
    for index, house in enumerate(_list(derived["houses"], "$.derived.houses")):
        _derived_house(house, f"$.derived.houses[{index}]")
    if derived["dinnerProjection"] is not None:
        _dinner_projection(derived["dinnerProjection"], "$.derived.dinnerProjection")

    belief = _object(view["belief"], "$.belief")
    _exact_keys(belief, {"opponents"}, {"opponents"}, "$.belief")
    for index, opponent in enumerate(_list(belief["opponents"], "$.belief.opponents")):
        _opponent_belief(opponent, f"$.belief.opponents[{index}]")
    _reject_credentials(view)
    return view


def validate_game_result(value: Any) -> dict[str, Any]:
    result = _object(value, "$")
    keys = {"schemaVersion", "gameId", "terminal", "reason", "turns", "rankings", "winnerSeats"}
    _exact_keys(result, keys, keys, "$")
    if result["schemaVersion"] != GAME_RESULT_VERSION:
        raise ContractError("$.schemaVersion: unsupported version")
    _integer(result["gameId"], "$.gameId", 1)
    if result["terminal"] is not True:
        raise ContractError("$.terminal: game result must be terminal")
    _string(result["reason"], "$.reason")
    _integer(result["turns"], "$.turns")
    rankings = _list(result["rankings"], "$.rankings")
    if not rankings:
        raise ContractError("$.rankings: at least one player is required")
    seats: list[int] = []
    ranks: list[int] = []
    for index, item in enumerate(rankings):
        path = f"$.rankings[{index}]"
        item = _object(item, path)
        fields = {"seat", "rank", "money"}
        _exact_keys(item, fields, fields, path)
        seats.append(_integer(item["seat"], f"{path}.seat"))
        ranks.append(_integer(item["rank"], f"{path}.rank", 1))
        _number(item["money"], f"{path}.money", -10**12)
    if len(seats) != len(set(seats)):
        raise ContractError("$.rankings: duplicate seat")
    if len(ranks) != len(set(ranks)):
        raise ContractError("$.rankings: duplicate rank")
    winners = _unique_integers(result["winnerSeats"], "$.winnerSeats")
    expected = {item["seat"] for item in rankings if item["rank"] == min(ranks)}
    if set(winners) != expected:
        raise ContractError("$.winnerSeats: must exactly match the best rank")
    _reject_credentials(result)
    return result


def validate_trajectory(value: Any) -> dict[str, Any]:
    trajectory = _object(value, "$")
    keys = {"schemaVersion", "episodeId", "gameId", "rulesetHash", "steps", "result"}
    _exact_keys(trajectory, keys, keys, "$")
    if trajectory["schemaVersion"] != TRAJECTORY_VERSION:
        raise ContractError("$.schemaVersion: unsupported version")
    _string(trajectory["episodeId"], "$.episodeId")
    _integer(trajectory["gameId"], "$.gameId", 1)
    _ruleset_hash(trajectory["rulesetHash"], "$.rulesetHash")
    steps = _list(trajectory["steps"], "$.steps")
    step_keys = {
        "sequence", "sourceVersion", "seat", "observation", "legalCandidateIds",
        "selectedCandidateId", "primitiveActions", "latencyMs",
    }
    for index, step in enumerate(steps):
        path = f"$.steps[{index}]"
        step = _object(step, path)
        _exact_keys(step, step_keys, step_keys, path)
        if _integer(step["sequence"], f"{path}.sequence") != index:
            raise ContractError(f"{path}.sequence: must be contiguous from zero")
        _integer(step["sourceVersion"], f"{path}.sourceVersion")
        _integer(step["seat"], f"{path}.seat")
        observation = validate_decision_view(step["observation"])
        if observation["gameId"] != trajectory["gameId"]:
            raise ContractError(f"{path}.observation.gameId: trajectory mismatch")
        if observation["rulesetHash"] != trajectory["rulesetHash"]:
            raise ContractError(f"{path}.observation.rulesetHash: trajectory mismatch")
        if observation["sourceVersion"] != step["sourceVersion"]:
            raise ContractError(f"{path}.sourceVersion: observation mismatch")
        if observation["seat"] != step["seat"]:
            raise ContractError(f"{path}.seat: observation mismatch")
        candidate_ids = _list(step["legalCandidateIds"], f"{path}.legalCandidateIds")
        for candidate_index, candidate_id in enumerate(candidate_ids):
            _string(candidate_id, f"{path}.legalCandidateIds[{candidate_index}]")
        if len(candidate_ids) != len(set(candidate_ids)):
            raise ContractError(f"{path}.legalCandidateIds: duplicates are forbidden")
        selected = _string(step["selectedCandidateId"], f"{path}.selectedCandidateId")
        if selected not in candidate_ids:
            raise ContractError(f"{path}.selectedCandidateId: candidate was not offered")
        for action_index, action in enumerate(
            _list(step["primitiveActions"], f"{path}.primitiveActions")
        ):
            action_path = f"{path}.primitiveActions[{action_index}]"
            action = _object(action, action_path)
            _string(action.get("type"), f"{action_path}.type")
        _number(step["latencyMs"], f"{path}.latencyMs")
    if trajectory["result"] is not None:
        result = validate_game_result(trajectory["result"])
        if result["gameId"] != trajectory["gameId"]:
            raise ContractError("$.result.gameId: trajectory mismatch")
    _reject_credentials(trajectory)
    return trajectory
