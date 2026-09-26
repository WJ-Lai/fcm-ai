#!/usr/bin/env python3
"""Adversarial tests for the card data layer (raw/cards-authoritative.json).

Philosophy: these tests try to *falsify* the card dataset and the card lookup
tool, not to confirm them. A test that cannot fail is worthless.

Run:  python3 tests/test_cards.py
      (also discovered by unittest: python3 -m unittest discover tests -v)
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "raw", "cards-authoritative.json")
CARD = os.path.join(REPO, "scripts", "card.py")


def load():
    with open(DATA, encoding="utf-8") as f:
        return json.load(f)


class TestCardDataIntegrity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load()
        cls.employees = cls.data["employees"]
        cls.milestones = cls.data["milestones"]
        cls.allrecs = cls.employees + cls.milestones

    def test_dataset_exists_and_nonempty(self):
        self.assertGreater(len(self.employees), 40)
        self.assertGreater(len(self.milestones), 30)

    def test_no_duplicate_keys_within_a_kind(self):
        for label, recs in (("employee", self.employees), ("milestone", self.milestones)):
            keys = [r["key"] for r in recs]
            dupes = sorted({k for k in keys if keys.count(k) > 1})
            self.assertEqual(dupes, [], f"{label} duplicate keys: {dupes}")

    def test_no_key_collision_across_kinds(self):
        """An employee and a milestone sharing a key would make lookup ambiguous."""
        ekeys = {e["key"] for e in self.employees}
        mkeys = {m["key"] for m in self.milestones}
        # Overlap is legal in the engine only if names differ meaningfully.
        overlap = ekeys & mkeys
        self.assertEqual(overlap, set(), f"key collision across kinds: {overlap}")

    def test_every_record_has_name_and_text(self):
        for r in self.allrecs:
            self.assertTrue(r.get("name"), f"{r['key']} missing name")
            self.assertTrue(r.get("text"), f"{r['key']} missing text")

    def test_every_record_is_classified(self):
        for r in self.allrecs:
            self.assertIn(r.get("set"), ("base", "expansion", "obg-custom"), f"{r['key']} bad set")

    def test_obg_custom_cards_are_absent_from_official_rulebooks(self):
        """The whole point of the 'obg-custom' label: these must NOT be official.

        If one of these ever appears in a rulebook, our classification is wrong and
        a model would be under-stating official content. Fail loudly if so.
        """
        rules = (
            open(os.path.join(REPO, "raw", "rules", "fcm-base-rules-eng-v4.txt"),
                 encoding="utf-8", errors="ignore").read()
            + open(os.path.join(REPO, "raw", "rules", "fcm-ketchup-expansion-rules.txt"),
                   encoding="utf-8", errors="ignore").read()
        ).lower()
        custom = [r for r in self.allrecs if r["set"] == "obg-custom"]
        self.assertGreater(len(custom), 0, "expected some obg-custom cards to be labelled")
        for r in custom:
            self.assertNotIn(
                r["name"].lower(), rules,
                f"'{r['name']}' is labelled obg-custom but IS in an official rulebook "
                "— reclassify it",
            )

    def test_every_record_has_chinese(self):
        """The engine ships zh for all cards; a gap means extraction broke."""
        for r in self.allrecs:
            self.assertRegex(r.get("name_zh", ""), r"[\u4e00-\u9fff]", f"{r['key']} name_zh")
            self.assertRegex(r.get("text_zh", ""), r"[\u4e00-\u9fff]", f"{r['key']} text_zh")

    def test_expansion_cards_are_actually_named_in_expansion_rulebook(self):
        """An 'expansion' card absent from the Ketchup rulebook would be misclassified.

        Name matching must be whitespace-insensitive: the source PDF wraps card
        names across lines ("first \\ncoffee sold"), so a naive substring test
        produces false negatives.
        """
        raw = open(
            os.path.join(REPO, "raw", "rules", "fcm-ketchup-expansion-rules.txt"),
            encoding="utf-8", errors="ignore",
        ).read().lower()
        flat = re.sub(r"\s+", " ", raw)          # collapse newlines/wraps
        exp = [r for r in self.allrecs if r["set"] == "expansion"]
        self.assertGreater(len(exp), 20, "suspiciously few expansion cards")
        for r in exp:
            name = re.sub(r"\s+", " ", r["name"].lower())
            self.assertIn(
                name, flat,
                f"expansion card '{r['name']}' not found in the expansion rulebook",
            )

    def test_base_employees_appear_in_base_rulebook(self):
        raw = open(
            os.path.join(REPO, "raw", "rules", "fcm-base-rules-eng-v4.txt"),
            encoding="utf-8", errors="ignore",
        ).read().lower()
        flat = re.sub(r"\s+", " ", raw)
        for r in [e for e in self.employees if e["set"] == "base"]:
            name = re.sub(r"\s+", " ", r["name"].lower())
            self.assertIn(name, flat, f"base card '{r['name']}' missing from base rules")

    def test_expected_set_counts(self):
        """Pin the split so a misclassification can't slip through silently."""
        e = {s: sum(1 for x in self.employees if x["set"] == s) for s in ("base", "expansion", "obg-custom")}
        m = {s: sum(1 for x in self.milestones if x["set"] == s) for s in ("base", "expansion", "obg-custom")}
        self.assertEqual(e["base"] + e["expansion"] + e["obg-custom"], len(self.employees))
        self.assertEqual(m["base"] + m["expansion"] + m["obg-custom"], len(self.milestones))
        self.assertEqual(e["base"], 32, f"base employee count changed: {e}")
        self.assertEqual(e["obg-custom"], 5, f"obg-custom employee count changed: {e}")
        self.assertEqual(m["obg-custom"], 1, f"obg-custom milestone count changed: {m}")

    def test_every_card_has_documented_in(self):
        for r in self.allrecs:
            self.assertIn(r.get("documented_in"), ("base", "ketchup", "none"), f"{r['key']}")

    def test_documented_in_is_verified_by_audit_script(self):
        """scripts/verify_sources.py is the authority for `documented_in`.

        If it fails, the wiki could attribute a rule to a rulebook that never
        states it — the exact failure mode this whole layer exists to prevent.
        """
        r = subprocess.run(
            [sys.executable, os.path.join(REPO, "scripts", "verify_sources.py")],
            capture_output=True, text=True, timeout=60,
        )
        self.assertEqual(r.returncode, 0, f"source audit failed:\n{r.stdout}\n{r.stderr}")
        self.assertIn("OK", r.stdout)

    def test_base_set_but_ketchup_documented_cards_are_real(self):
        """The subtle case: engine ships them as BASE, only the Ketchup book
        explains them. If this set empties or changes size, the distinction has
        been lost and the wiki's provenance claims become wrong."""
        special = [r for r in self.allrecs if r["set"] == "base" and r["documented_in"] == "ketchup"]
        self.assertEqual(len(special), 15, f"expected 15 base-set/ketchup-documented cards, got {len(special)}")
        for r in special:
            self.assertIn(r["key"], {
                "firstMarketeer", "firstMarketingTrainee", "firstCampaignManager",
                "firstBrandManager", "firstBrandDirector", "firstBurgerSold",
                "firstPizzaSold", "firstLemonadeSold", "firstBeerSold", "firstCokeSold",
                "firstRecruitingGirl", "firstTrainer", "firstDiscountManager",
                "firstHouse", "firstRuralMarketeer",
            })

    def test_no_extraction_artifacts_in_card_text(self):
        """The PDF-splitting bug produced 'Th e' style tokens; card text is from JS
        so it must be completely clean."""
        bad = re.compile(r"\b(T|t)h\s+e\b|\bfi\s+t\b|\bAft\s+er\b")
        for r in self.allrecs:
            self.assertIsNone(bad.search(r.get("text", "")), f"{r['key']} has split-letter artifact")

    def test_known_cards_exact_text(self):
        """Pin a few strings so a silent re-extraction can't change meaning."""
        expect = {
            "waitress": "Get $3 cash. Win ties against restaurants with fewer waitresses",
            "errandBoy": "Get 1 drink of any type",
            "cartOperator": "Get 2 drinks from each source on route",
            "burgerChef": "Produce 8 burgers",
            "pizzaChef": "Produce 8 pizzas",
            "cfo": "Add +50% to cash earned this round",
        }
        by_key = {e["key"]: e for e in self.employees}
        for key, text in expect.items():
            self.assertIn(key, by_key, f"expected card {key} missing")
            self.assertEqual(by_key[key]["text"], text, f"{key} text drifted")


class TestCardLookupTool(unittest.TestCase):
    """Drive scripts/card.py as a subprocess — test the interface agents actually use."""

    def run_card(self, *args):
        return subprocess.run(
            [sys.executable, CARD, *args],
            capture_output=True, text=True, timeout=30,
        )

    def test_english_name_lookup(self):
        r = self.run_card("Errand Boy")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Get 1 drink of any type", r.stdout)
        self.assertIn("跑腿伙计", r.stdout)

    def test_chinese_name_lookup(self):
        r = self.run_card("跑腿伙计")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Errand Boy", r.stdout)

    def test_exact_name_beats_substring(self):
        r = self.run_card("Waitress")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Waitress", r.stdout)

    def test_offdomain_query_refuses_and_exits_nonzero(self):
        """The critical anti-hallucination property: an unrelated query must NOT
        return a confident card."""
        for junk in ["pokemon type chart", "how do I bake bread", "quantum chromodynamics"]:
            r = self.run_card(junk)
            self.assertEqual(r.returncode, 1, f"{junk!r} should have refused:\n{r.stdout}")
            self.assertIn("does NOT cover", r.stdout)
            self.assertNotIn("effect:", r.stdout)

    def test_generic_only_query_refuses(self):
        """A query made only of generic card-body words has no basis to match."""
        r = self.run_card("the card for each turn")
        self.assertEqual(r.returncode, 1, f"generic query must refuse:\n{r.stdout}")

    def test_ondomain_search_still_works(self):
        r = self.run_card("--search", "drink")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("drink", r.stdout.lower())

    def test_expansion_listing_complete(self):
        r = self.run_card("--expansion")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("(22)", r.stdout.splitlines()[0])

    def test_milestones_listing_complete(self):
        r = self.run_card("--milestones")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("(40)", r.stdout)

    def test_employees_listing_complete(self):
        r = self.run_card("--employees")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("(54)", r.stdout)


class TestExtractionReproducibility(unittest.TestCase):
    def test_extraction_script_is_idempotent(self):
        """Running the extractor must not change semantic content."""
        before = load()
        r = subprocess.run(
            [sys.executable, os.path.join(REPO, "scripts", "extract_cards.py")],
            capture_output=True, text=True, timeout=60,
        )
        self.assertEqual(r.returncode, 0, f"extractor failed:\n{r.stderr}")
        after = load()
        self.assertEqual(before["employees"], after["employees"], "employee data drifted on re-extract")
        self.assertEqual(before["milestones"], after["milestones"], "milestone data drifted on re-extract")

    def test_extraction_script_fails_loudly_on_bad_input(self):
        """Pointing at a path without the bundle must exit non-zero, not emit junk."""
        r = subprocess.run(
            [sys.executable, os.path.join(REPO, "scripts", "extract_cards.py"), "--server", "/tmp"],
            capture_output=True, text=True, timeout=30,
        )
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("error", r.stderr.lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
