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


class TestNewWireGuardsActuallyBite(unittest.TestCase):
    """Negative controls for the game-63-derived guards.

    Each test deliberately corrupts the recorded expectation in a COPY, runs the
    drift checker against it, and asserts failure. Without these, a guard could
    silently become dead code (e.g. if a key gets renamed) and we'd never notice.
    The real file is restored in `finally`.
    """

    PAGE = os.path.join(REPO, "wiki", "references", "wire-format-mapping.md")
    GAP = os.path.join(REPO, "wiki", "references", "wire-format-gap-analysis.md")

    def _run_with(self, mutate):
        """Apply `mutate(wire, combined_pages) -> (wire, combined_pages)`.

        The checker reads BOTH wire-format pages (some findings live on the companion
        page), so mutations must be applied to the concatenation and then written back
        split on the marker ``"\n===SPLIT===\n"``.
        """
        wire_orig = open(WIRE, encoding="utf-8").read()
        page_orig = open(self.PAGE, encoding="utf-8").read()
        gap_orig = open(self.GAP, encoding="utf-8").read()
        try:
            new_wire, new_combined = mutate(
                json.loads(wire_orig), page_orig + "\n===SPLIT===\n" + gap_orig
            )
            new_page, _, new_gap = new_combined.partition("\n===SPLIT===\n")
            with open(WIRE, "w", encoding="utf-8") as f:
                json.dump(new_wire, f, ensure_ascii=False, indent=1)
            with open(self.PAGE, "w", encoding="utf-8") as f:
                f.write(new_page)
            with open(self.GAP, "w", encoding="utf-8") as f:
                f.write(new_gap)
            return subprocess.run(
                [sys.executable, os.path.join(REPO, "scripts", "check_wire_drift.py")],
                capture_output=True, text=True, timeout=60,
            )
        finally:
            with open(WIRE, "w", encoding="utf-8") as f:
                f.write(wire_orig)
            with open(self.PAGE, "w", encoding="utf-8") as f:
                f.write(page_orig)
            with open(self.GAP, "w", encoding="utf-8") as f:
                f.write(gap_orig)

    def test_catches_removed_coordinate_encoding(self):
        """Dropping the ssW=85 warning from the page must fail."""
        def mutate(wire, page):
            page = page.replace("85", "XX").replace("dimensions[0]", "dim[0]")
            return wire, page
        r = self._run_with(mutate)
        self.assertNotEqual(r.returncode, 0, "guard missed a missing coordinate-encoding note")

    def test_catches_stale_tiles_description(self):
        """Re-introducing the old wrong 'cell array' wording must fail."""
        def mutate(wire, page):
            page = page.replace("PAIRS", "cells").replace("pairs", "cells")
            page += "\nflat array, length = dimensions[0]*dimensions[1]*25\n"
            return wire, page
        r = self._run_with(mutate)
        self.assertNotEqual(r.returncode, 0, "guard missed a stale board.tiles description")

    def test_catches_removed_history_code_25(self):
        """Un-documenting the reserve ladder must fail."""
        def mutate(wire, page):
            return wire, page.replace("code 25", "XXXXX").replace("`25`", "`XX`")
        r = self._run_with(mutate)
        self.assertNotEqual(r.returncode, 0, "guard missed the reserve-ladder removal")

    def test_catches_removed_startingmap_note(self):
        """Un-documenting startingMap must fail."""
        def mutate(wire, page):
            return wire, page.replace("startingMap", "theMap")
        r = self._run_with(mutate)
        self.assertNotEqual(r.returncode, 0, "guard missed the startingMap removal")

    def test_catches_deleted_required_key(self):
        """Deleting a recorded key must fail, not silently disable its own guard.

        Regression for a vacuous-green hole found by adversarial testing: removing
        `history_codes` made the code-25 guard skip entirely and the check still passed.
        """
        def mutate(wire, page):
            wire.pop("history_codes", None)
            return wire, page
        r = self._run_with(mutate)
        self.assertNotEqual(
            r.returncode, 0,
            "checker passed green after a required key was deleted (vacuous green)",
        )
        self.assertIn("history_codes", r.stdout, "failure message should name the missing key")

    def test_catches_removed_negative_bank_note(self):
        """Un-documenting negative bank must fail."""
        def mutate(wire, page):
            return wire, page.replace("negative", "NEG").replace("Negative", "NEG")
        r = self._run_with(mutate)
        self.assertNotEqual(r.returncode, 0, "guard missed the negative-bank removal")


if __name__ == "__main__":
    unittest.main(verbosity=2)
