import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from contracts import ContractError  # noqa: E402
from human_trajectory import (  # noqa: E402
    approve_human_review,
    build_human_review,
    validate_human_import,
)


def observation():
    return {
        "schemaVersion": "fcm.decision-view.v1",
        "gameId": 63,
        "sourceVersion": 42,
        "rulesetHash": "sha256:" + "a" * 64,
        "seat": 1,
        "public": {
            "phase": 5,
            "subphase": 3,
            "turn": 7,
            "actingSeats": [1],
            "pendingSeats": [],
            "turnOrder": [2, 1, 0],
            "bank": 167,
            "bankBreaks": 0,
            "enabledModules": [],
        },
        "private": {
            "legalActions": [{"type": "marketing"}],
            "ownPendingChoice": None,
        },
        "derived": {"players": [], "houses": [], "dinnerProjection": None},
        "belief": {"opponents": []},
    }


def package():
    return {
        "schemaVersion": "fcm.human-import.v1",
        "provenance": {
            "source": "obg-seat-export",
            "exportedAt": "2026-09-27T12:00:00Z",
            "contributorId": "anon-001",
            "gameId": 63,
            "seat": 1,
        },
        "consent": {
            "granted": True,
            "purpose": "fcm-strategy-research",
            "permitsTraining": True,
        },
        "license": {
            "licenseId": "owner-consent-v1",
            "permitsTraining": True,
            "permitsRedistribution": False,
        },
        "trajectory": {
            "schemaVersion": "fcm.trajectory.v1",
            "episodeId": "human-episode-001",
            "gameId": 63,
            "rulesetHash": "sha256:" + "a" * 64,
            "steps": [{
                "sequence": 0,
                "sourceVersion": 42,
                "seat": 1,
                "observation": observation(),
                "legalCandidateIds": ["human-action-0"],
                "selectedCandidateId": "human-action-0",
                "primitiveActions": [{"type": "marketing"}],
                "latencyMs": 0,
            }],
            "result": None,
        },
    }


class HumanImportTests(unittest.TestCase):
    def test_valid_import_stays_pending_until_independent_review(self):
        value = package()
        before = copy.deepcopy(value)

        self.assertIs(validate_human_import(value), value)
        review = build_human_review(value, imported_at="2026-09-27T12:01:00Z")

        self.assertEqual(value, before)
        self.assertEqual(review["status"], "pending")
        self.assertRegex(review["contentHash"], r"^sha256:[0-9a-f]{64}$")
        self.assertNotIn("commentary", json.dumps(review).lower())

    def test_rejects_missing_consent_training_license_and_free_text(self):
        mutations = (
            lambda value: value["consent"].__setitem__("granted", False),
            lambda value: value["consent"].__setitem__("permitsTraining", False),
            lambda value: value["license"].__setitem__("permitsTraining", False),
            lambda value: value.__setitem__("commentary", "private coaching notes"),
            lambda value: value["provenance"].__setitem__("contributorId", "Real Person Name"),
            lambda value: value["trajectory"]["steps"][0]["primitiveActions"][0]
                .__setitem__(
                    "payload",
                    "".join(("obg_", "pat_", "abcdefghijkl_", "abcdefghijklmnopqrstuvwxyz012345")),
                ),
        )
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                value = package()
                mutate(value)
                with self.assertRaises(ContractError):
                    validate_human_import(value)

    def test_rejects_hidden_beliefs_cross_seat_data_and_unadvertised_actions(self):
        mutations = (
            lambda value: value["trajectory"]["steps"][0]["observation"]["belief"]
                ["opponents"].append({
                    "seat": 0, "observedPlan": "reserve 200", "confidence": 1,
                    "hypotheses": ["read from hidden move buffer"],
                }),
            lambda value: value["trajectory"]["steps"][0].__setitem__("seat", 0),
            lambda value: value["trajectory"]["steps"][0]["primitiveActions"][0]
                .__setitem__("type", "hidden_reserve_choice"),
            lambda value: value["trajectory"]["steps"][0]["observation"]["private"]
                .__setitem__("ownPendingChoice", {"reserve": 200}),
        )
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                value = package()
                mutate(value)
                with self.assertRaises(ContractError):
                    validate_human_import(value)

    def test_approval_requires_all_review_attestations(self):
        review = build_human_review(package(), imported_at="2026-09-27T12:01:00Z")
        with self.assertRaises(ContractError):
            approve_human_review(
                review,
                reviewer="reviewer-1",
                reviewed_at="2026-09-27T12:02:00Z",
                attestations={
                    "seatVisibilityVerified": True,
                    "actionLegalityVerified": False,
                    "consentVerified": True,
                },
            )

        approved = approve_human_review(
            review,
            reviewer="reviewer-1",
            reviewed_at="2026-09-27T12:02:00Z",
            attestations={
                "seatVisibilityVerified": True,
                "actionLegalityVerified": True,
                "consentVerified": True,
            },
        )
        self.assertEqual(approved["status"], "approved")
        self.assertEqual(review["status"], "pending")

    def test_cli_import_and_approve_never_overwrite_existing_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source.json"
            pending = root / "pending.json"
            approved = root / "approved.json"
            source.write_text(json.dumps(package()), encoding="utf-8")
            command = [sys.executable, str(ROOT / "scripts" / "human_trajectory.py")]

            subprocess.run(
                command + ["import", str(source), str(pending), "--imported-at", "2026-09-27T12:01:00Z"],
                check=True,
            )
            missing_attestations = subprocess.run(
                command + [
                    "approve", str(pending), str(approved), "--reviewer", "reviewer-1",
                    "--reviewed-at", "2026-09-27T12:02:00Z",
                ],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(missing_attestations.returncode, 0)
            self.assertFalse(approved.exists())
            subprocess.run(
                command + [
                    "approve", str(pending), str(approved), "--reviewer", "reviewer-1",
                    "--reviewed-at", "2026-09-27T12:02:00Z",
                    "--attest-seat-visibility", "--attest-action-legality", "--attest-consent",
                ],
                check=True,
            )
            self.assertEqual(json.loads(approved.read_text())["status"], "approved")
            duplicate = subprocess.run(
                command + ["import", str(source), str(pending)],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(duplicate.returncode, 0)
            self.assertIn("already exists", duplicate.stderr)


if __name__ == "__main__":
    unittest.main()
