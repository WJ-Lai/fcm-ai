#!/usr/bin/env python3
"""Adversarial tests for the rulebook <-> live-API mapping.

The failure mode these guard against: an agent reads the physical-board rulebook
for concepts but the HTTP API for state, and silently maps the two wrong — e.g.
assumes goods are ordered food-then-drink, or that `turnOrder` is the turn-order
track. A wrong mapping produces confidently illegal moves.

Run:  python3 tests/test_wire_format.py
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIRE = os.path.join(REPO, "raw", "wire-format.json")
PAGE = os.path.join(REPO, "wiki", "references", "wire-format-mapping.md")


def load():
    with open(WIRE, encoding="utf-8") as f:
        return json.load(f)


class TestWireFormatData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.wire = load()
        with open(PAGE, encoding="utf-8") as fh:
            cls.page = fh.read()

    def test_base_goods_are_exactly_five_and_ordered_drinks_then_food(self):
        """Pin the actual codes. The rulebook does not order goods this way, so a
        plausible-sounding guess (burger=0) would be wrong."""
        self.assertEqual(self.wire["goods"], {
            "0": "lemonade", "1": "coke", "2": "beer", "3": "pizza", "4": "burger",
        })

    def test_drink_set_matches_rulebook(self):
        """Rulebook 'drink' = beer, coke(soft drink), lemonade. Codes 0,1,2."""
        drinks = {c for c, n in self.wire["goods"].items() if n in ("lemonade", "coke", "beer")}
        self.assertEqual(drinks, {"0", "1", "2"})
        foods = {c for c, n in self.wire["goods"].items() if n in ("pizza", "burger")}
        self.assertEqual(foods, {"3", "4"})

    def test_engine_only_goods_are_recorded(self):
        """The catalog omits these; if we forget them an expansion game breaks."""
        self.assertEqual(self.wire["engine_only_goods"], {
            "5": "coffee", "6": "noodles", "7": "sushi", "8": "kimchi", "9": "dumpling",
        })

    def test_campaign_types_recorded(self):
        self.assertEqual(self.wire["campaign_types"], {
            "0": "radio", "1": "airplane", "2": "mailbox", "3": "billboard",
        })

    def test_player_fields_include_money(self):
        """The user's explicit question: which field is a player's money?"""
        self.assertIn("money", self.wire["player_fields"])

    def test_untrusted_fields_declared(self):
        self.assertIn("chat", self.wire["untrusted_text_fields"])

    def test_opaque_paths_declared(self):
        self.assertIn("snapshot.gameData", self.wire["opaque_paths"])
        self.assertIn("state.board.tiles", self.wire["opaque_paths"])


class TestPageDocumentsTheMapping(unittest.TestCase):
    """The page is the deliverable; data alone helps nobody."""

    @classmethod
    def setUpClass(cls):
        cls.wire = load()
        with open(PAGE, encoding="utf-8") as fh:
            cls.page = fh.read()

    def test_page_exists_and_is_substantial(self):
        self.assertGreater(len(self.page), 4000)

    def test_page_documents_every_good_code(self):
        for code, name in self.wire["goods"].items():
            self.assertIn(f"| `{code}` |", self.page, f"goods row for {code} missing")
            self.assertIn(name, self.page)

    def test_page_warns_that_catalog_omits_expansion_goods(self):
        for name in self.wire["engine_only_goods"].values():
            self.assertIn(name, self.page, f"{name} not mentioned")

    def test_page_answers_the_money_question_explicitly(self):
        self.assertIn("players[i].money", self.page)
        self.assertIn("bank", self.page)

    def test_page_names_the_two_mis_mapping_risks(self):
        """The page claims goods codes and turnOrder are the ones that bite."""
        self.assertIn("turnOrder", self.page)

    def test_page_states_dinnertime_has_no_action_endpoint(self):
        low = self.page.lower()
        self.assertIn("dinnertime", low)
        self.assertTrue(
            "no agent action" in low or "没有 Agent 操作入口" in self.page,
            "page must warn that dinnertime has no agent action entry",
        )

    def test_page_has_frontmatter_and_citation(self):
        self.assertTrue(self.page.startswith("---"))
        self.assertRegex(self.page, r"\(ketchup rules, p\.\d+\)|\(MCP README")


class TestDriftCheck(unittest.TestCase):
    def test_drift_script_passes(self):
        r = subprocess.run(
            [sys.executable, os.path.join(REPO, "scripts", "check_wire_drift.py")],
            capture_output=True, text=True, timeout=60,
        )
        self.assertEqual(r.returncode, 0, f"{r.stdout}\n{r.stderr}")
        self.assertIn("OK", r.stdout)

    def test_drift_script_catches_a_renumbered_good(self):
        """Prove the guard actually guards: corrupt a code and expect failure."""
        original = open(WIRE, encoding="utf-8").read()
        try:
            bad = json.loads(original)
            bad["goods"]["4"] = "pizza"   # was burger -> collides with code 3
            with open(WIRE, "w", encoding="utf-8") as f:
                json.dump(bad, f, ensure_ascii=False, indent=1)
            r = subprocess.run(
                [sys.executable, os.path.join(REPO, "scripts", "check_wire_drift.py")],
                capture_output=True, text=True, timeout=60,
            )
            self.assertNotEqual(r.returncode, 0, "drift check failed to notice a bad good code")
        finally:
            with open(WIRE, "w", encoding="utf-8") as f:
                f.write(original)


class TestProbeScriptIsSafe(unittest.TestCase):
    """The probe hits a live server; it must be read-only and never hardcode a token."""

    def test_probe_only_issues_gets(self):
        src = open(os.path.join(REPO, "scripts", "probe_api.py"), encoding="utf-8").read()
        self.assertNotIn("method=\"POST\"", src)
        self.assertNotIn("POST", src)
        self.assertEqual(src.count("urllib.request.Request("), 1, "expected one request helper")

    def test_probe_has_no_embedded_token(self):
        src = open(os.path.join(REPO, "scripts", "probe_api.py"), encoding="utf-8").read()
        self.assertIsNone(re.search(r"obg_pat_[A-Za-z0-9_]{10,}", src))
        self.assertIn("FCM_AGENT_TOKEN", src)


if __name__ == "__main__":
    unittest.main(verbosity=2)
