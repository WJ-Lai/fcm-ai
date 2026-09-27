import copy
import re
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from contracts import (  # noqa: E402
    ContractError,
    validate_decision_view,
    validate_game_result,
    validate_trajectory,
)


def decision_view():
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
        "derived": {
            "players": [],
            "houses": [],
            "dinnerProjection": None,
        },
        "belief": {"opponents": []},
    }


class DecisionViewContractTests(unittest.TestCase):
    def test_accepts_minimal_classified_observation_without_mutating_it(self):
        value = decision_view()
        before = copy.deepcopy(value)
        self.assertIs(validate_decision_view(value), value)
        self.assertEqual(value, before)

    def test_rejects_unknown_top_level_and_nested_fields(self):
        for path, mutate in (
            ("$.cheat", lambda value: value.__setitem__("cheat", True)),
            ("$.public.weather", lambda value: value["public"].__setitem__("weather", 3)),
            ("$.private.rivalChoice", lambda value: value["private"].__setitem__("rivalChoice", {})),
            ("$.derived.players[0].cheat", lambda value: value["derived"]["players"].append({"cheat": True})),
            ("$.belief.opponents[0].hiddenChoice", lambda value: value["belief"]["opponents"].append({"hiddenChoice": 4})),
        ):
            with self.subTest(path=path):
                value = decision_view()
                mutate(value)
                with self.assertRaisesRegex(ContractError, re.escape(path)):
                    validate_decision_view(value)

    def test_rejects_wrong_version_duplicate_seats_and_invalid_hash(self):
        mutations = (
            lambda value: value.__setitem__("schemaVersion", "fcm.decision-view.v2"),
            lambda value: value["public"].__setitem__("turnOrder", [1, 1, 0]),
            lambda value: value.__setitem__("rulesetHash", "latest"),
        )
        for mutate in mutations:
            value = decision_view()
            mutate(value)
            with self.assertRaises(ContractError):
                validate_decision_view(value)


class TrajectoryContractTests(unittest.TestCase):
    def test_accepts_a_versioned_step(self):
        trajectory = {
            "schemaVersion": "fcm.trajectory.v1",
            "episodeId": "episode-001",
            "gameId": 63,
            "rulesetHash": "sha256:" + "b" * 64,
            "steps": [{
                "sequence": 0,
                "sourceVersion": 42,
                "seat": 1,
                "observation": decision_view(),
                "legalCandidateIds": ["plan-01"],
                "selectedCandidateId": "plan-01",
                "primitiveActions": [{"type": "marketing"}],
                "latencyMs": 12.5,
            }],
            "result": None,
        }
        self.assertIs(validate_trajectory(trajectory), trajectory)

    def test_rejects_credentials_anywhere_and_unoffered_candidate(self):
        base = {
            "schemaVersion": "fcm.trajectory.v1",
            "episodeId": "episode-001",
            "gameId": 63,
            "rulesetHash": "sha256:" + "b" * 64,
            "steps": [{
                "sequence": 0,
                "sourceVersion": 42,
                "seat": 1,
                "observation": decision_view(),
                "legalCandidateIds": ["plan-01"],
                "selectedCandidateId": "plan-02",
                "primitiveActions": [],
                "latencyMs": 1,
            }],
            "result": None,
        }
        with self.assertRaisesRegex(ContractError, "selectedCandidateId"):
            validate_trajectory(base)

        base["steps"][0]["selectedCandidateId"] = "plan-01"
        base["steps"][0]["primitiveActions"] = [{"type": "end_turn", "agentToken": "secret"}]
        with self.assertRaisesRegex(ContractError, "credential-like key"):
            validate_trajectory(base)


class ResultContractTests(unittest.TestCase):
    def test_rejects_duplicate_rank_or_inconsistent_winner(self):
        result = {
            "schemaVersion": "fcm.game-result.v1",
            "gameId": 63,
            "terminal": True,
            "reason": "bank_break",
            "turns": 15,
            "rankings": [
                {"seat": 0, "rank": 1, "money": 250},
                {"seat": 1, "rank": 2, "money": 190},
            ],
            "winnerSeats": [0],
        }
        self.assertIs(validate_game_result(result), result)

        result["rankings"][1]["rank"] = 1
        with self.assertRaisesRegex(ContractError, "duplicate rank"):
            validate_game_result(result)

        result["rankings"][1]["rank"] = 2
        result["winnerSeats"] = [1]
        with self.assertRaisesRegex(ContractError, "winnerSeats"):
            validate_game_result(result)


if __name__ == "__main__":
    unittest.main()
