#!/usr/bin/env python3
"""Verify every card in raw/cards-authoritative.json against the official rulebooks.

This audit justifies the two independent facts recorded on each card:
  * `set`  — which card set the ENGINE ships it in (base vs Ketchup/expansion),
             plus `obg-custom` for engine-only house variants.
  * `documented_in` — which rulebook actually explains the card.

Those are NOT the same question, and conflating them is how a knowledge base ends
up mislabeling real game content. The concrete case that forced this distinction:
the engine ships "First marketeer used", "First burger sold", "First house built"
etc. in the BASE set, but the base rulebook never explains them — only the
Ketchup rulebook's "New Milestones" chapter does, under the "used" wording.

Checks
------
1. `set` is one of base / expansion / obg-custom.
2. Every card claiming `documented_in: base` really appears in the base rulebook.
3. Every card claiming `documented_in: ketchup` really appears in the Ketchup book.
4. Every `obg-custom` card appears in NEITHER book (they must never be presented
   as official rules).
5. Any card claiming `documented_in: none` must genuinely be absent from both.

Matching is whitespace-insensitive: the PDFs wrap card names across lines.

Usage: python3 scripts/verify_sources.py     (exit 0 = OK, 1 = discrepancies)
"""
from __future__ import annotations

import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "raw", "cards-authoritative.json")
BASE_RULES = os.path.join(REPO, "raw", "rules", "fcm-base-rules-eng-v4.txt")
EXP_RULES = os.path.join(REPO, "raw", "rules", "fcm-ketchup-expansion-rules.txt")


def norm(s: str) -> str:
    """Lowercase + collapse whitespace so line-wrapped names match."""
    return re.sub(r"\s+", " ", s.lower()).strip()


def mentions(book: str, name: str) -> bool:
    """True if the card name appears in `book` (already normalised).

    Tries the full name first, then a relaxed form that drops a trailing
    ' used' / ' played' / ' built' qualifier, because the rulebooks introduce
    these milestones under the 'used' heading while the engine's card title
    omits it.
    """
    n = norm(name)
    if n in book:
        return True
    relaxed = re.sub(r"\s+(used|played|built|placed)$", "", n)
    return relaxed != n and relaxed in book


def main() -> int:
    for path in (DATA, BASE_RULES, EXP_RULES):
        if not os.path.isfile(path):
            sys.exit(f"error: missing {path}")

    data = json.load(open(DATA, encoding="utf-8"))
    base = norm(open(BASE_RULES, encoding="utf-8", errors="ignore").read())
    exp = norm(open(EXP_RULES, encoding="utf-8", errors="ignore").read())

    cards = data["employees"] + data["milestones"]
    failures: list[str] = []
    counts: dict[str, int] = {}
    doc_counts: dict[str, int] = {}

    for c in cards:
        s = c.get("set")
        doc = c.get("documented_in")
        counts[s] = counts.get(s, 0) + 1
        doc_counts[doc] = doc_counts.get(doc, 0) + 1

        if s not in ("base", "expansion", "obg-custom"):
            failures.append(f"{c['key']}: unknown set '{s}'")
            continue
        if doc not in ("base", "ketchup", "none"):
            failures.append(f"{c['key']}: unknown documented_in '{doc}'")
            continue

        in_base, in_exp = mentions(base, c["name"]), mentions(exp, c["name"])

        if doc == "base" and not in_base:
            failures.append(f"{c['name']}: claims documented_in=base but absent from base rulebook")
        if doc == "ketchup" and not in_exp:
            failures.append(f"{c['name']}: claims documented_in=ketchup but absent from expansion rulebook")
        if doc == "none" and (in_base or in_exp):
            failures.append(
                f"{c['name']}: claims documented_in=none but it IS in a rulebook "
                f"(base={in_base}, ketchup={in_exp})"
            )
        if s == "obg-custom" and (in_base or in_exp):
            failures.append(
                f"{c['name']}: labelled obg-custom but present in an official rulebook "
                "— reclassify as official content"
            )
        if s == "base" and not (in_base or in_exp):
            failures.append(
                f"{c['name']}: engine says base, but absent from BOTH rulebooks — "
                "needs an explicit documented_in value"
            )

    print(f"cards checked: {len(cards)}")
    print("  by engine set:  " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    print("  by documented:  " + ", ".join(f"{k}={v}" for k, v in sorted(doc_counts.items())))
    if failures:
        print(f"\nFAILED — {len(failures)} discrepancy(ies):")
        for f in failures:
            print("  -", f)
        return 1
    print("\nOK — engine `set` and rulebook `documented_in` are both consistent.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
