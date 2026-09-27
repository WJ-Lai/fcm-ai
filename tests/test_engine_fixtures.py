import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures" / "base-v1"
SENSITIVE_KEY = re.compile(r"token|password|secret|authorization|cookie|api.?key", re.I)


def walk(value, path="$"):
    if isinstance(value, dict):
        for key, item in value.items():
            yield path, key, item
            yield from walk(item, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from walk(item, f"{path}[{index}]")


class BaseEngineFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records = [
            json.loads(path.read_text(encoding="utf-8"))
            for path in sorted(FIXTURES.glob("*.json"))
        ]

    def test_covers_every_base_game_decision_phase(self):
        covered = {
            (record["expected"]["phase"], record["expected"]["subphase"])
            for record in self.records
        }
        required = {
            (0, 1), (1, 1), (2, 1), (3, 1), (4, 1),
            (5, 1), (5, 2), (5, 3), (5, 4), (5, 5), (5, 6), (5, 7),
            (7, 1), (9, 1), (10, 1),
        }
        self.assertEqual(required - covered, set())

    def test_fixtures_are_versioned_seeded_and_credential_free(self):
        self.assertTrue(self.records)
        hashes = set()
        seeds = set()
        for record in self.records:
            self.assertEqual(record["fixtureVersion"], "fcm-engine-fixture-v1")
            self.assertEqual(record["snapshot"]["chatData"], "")
            self.assertEqual(record["snapshot"]["moveData"], "")
            self.assertEqual(record["key"], Path(record["key"]).name)
            hashes.add(record["expected"]["rulesetHash"])
            seeds.add(record["snapshot"]["initializationSeed"])
            serialized = json.dumps(record)
            self.assertNotIn("obg_pat_", serialized)
            for path, key, _value in walk(record):
                self.assertIsNone(SENSITIVE_KEY.search(key), f"credential key at {path}.{key}")
        self.assertEqual(len(hashes), 1)
        self.assertNotEqual(hashes, {""})
        self.assertEqual(len(seeds), 1)

    def test_fixture_names_and_expected_engine_state_agree(self):
        for record in self.records:
            expected = record["expected"]
            phase_label = f"phase-{expected['phase']:02d}"
            self.assertIn(phase_label, record["key"])
            self.assertEqual(expected["actorSeat"], record["snapshot"]["mySeat"])
            self.assertEqual(str(expected["sourceVersion"]), record["snapshot"]["latestUpdate"])


if __name__ == "__main__":
    unittest.main()
