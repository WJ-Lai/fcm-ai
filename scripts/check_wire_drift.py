#!/usr/bin/env python3
"""Offline regression check for the wire-format mapping.

`scripts/probe_api.py` needs a live server. This script needs nothing — it
verifies that the *recorded* expectations in `raw/wire-format.json` still agree
with (a) the wiki page that documents them, and (b) the engine's own ID tables
in the FCM source, when that source is available.

It exists so the mapping can't silently rot: if the engine renumbers goods, or
a milestone id is added, this fails before an agent plays a wrong move.

Usage: python3 scripts/check_wire_drift.py     (exit 0 = OK, 1 = drift)
"""
from __future__ import annotations

import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIRE = os.path.join(REPO, "raw", "wire-format.json")
PAGE = os.path.join(REPO, "wiki", "references", "wire-format-mapping.md")
ENGINE_REF = os.path.expanduser(
    "~/obg-server-fcm-agent/FCM/vueFCM/src/js/FCMreference.js"
)

GAP_PAGE = os.path.join(REPO, "wiki", "references", "wire-format-gap-analysis.md")


def _gap_page() -> str:
    """The companion page. Some findings live there by design (page-size limits)."""
    try:
        return open(GAP_PAGE, encoding="utf-8").read()
    except FileNotFoundError:
        return ""


def main() -> int:
    if not os.path.isfile(WIRE):
        sys.exit(f"error: missing {WIRE}")
    if not os.path.isfile(PAGE):
        sys.exit(f"error: missing {PAGE}")

    wire = json.load(open(WIRE, encoding="utf-8"))
    page = open(PAGE, encoding="utf-8").read()
    failures: list[str] = []

    # ---- 0. required keys must EXIST, or every guard below silently no-ops ----
    # Without this, deleting a recorded fact disables its own guard and the check
    # still passes -- a vacuous green. Every key added for a verified finding is required.
    REQUIRED_KEYS = (
        "goods", "engine_only_goods", "campaign_types", "player_fields",
        "catalog_sizes", "engine_milestone_table_size", "untrusted_text_fields",
        "opaque_paths", "coordinate_encoding", "game_data_index_map",
        "history_codes", "starting_map", "bank_semantics",
    )
    for key in REQUIRED_KEYS:
        if key not in wire:
            failures.append(
                f"raw/wire-format.json is missing required key '{key}' — its guard "
                f"would silently no-op"
            )

    # ---- 1. the page must actually document the recorded goods mapping ----
    for code, name in wire["goods"].items():
        if not re.search(rf"\|\s*`?{code}`?\s*\|\s*{re.escape(name)}", page, re.I):
            # accept the table row format used on the page
            if f"| `{code}` | {name}" not in page:
                failures.append(f"goods {code}={name} not documented on the wire-format page")

    # ---- 2. every engine-only good code must be called out as a catalog gap ----
    for code, name in wire["engine_only_goods"].items():
        if name not in page:
            failures.append(f"engine-only good {name} (code {code}) missing from the page")

    # ---- 3. player fields the page claims must be listed ----
    for f in wire["player_fields"]:
        if f not in page:
            failures.append(f"player field '{f}' not mentioned on the page")

    # ---- 3b. coordinate encoding: the page must warn about both units ----
    coord = wire.get("coordinate_encoding", {})
    if coord:
        if str(coord.get("small_square_width")) not in page:
            failures.append(
                f"coordinate encoding: small-square width "
                f"{coord.get('small_square_width')} not documented on the page"
            )
        if "dimensions[0]" not in page:
            failures.append("coordinate encoding: tile-grid width (dimensions[0]) not documented")
        ex = coord.get("verified_example", {})
        if ex and str(ex.get("tile")) not in page:
            failures.append(
                f"coordinate encoding: verified example tile {ex.get('tile')} missing from page"
            )

    # ---- 3c. board.tiles must be described as PAIRS, never as a cell array ----
    if "PAIRS" not in page and "pairs" not in page:
        failures.append("board.tiles is not documented as (tileId, rotation) pairs")
    for bad in ("dimensions[0]*dimensions[1]*25", "flat array of cells"):
        if bad in page:
            failures.append(f"stale/incorrect board.tiles description still on the page: {bad!r}")

    # ---- 3d. history code 25 (reserve ladder) must be recorded and documented ----
    # It lives on the gap-analysis companion page by design (the mapping page has a line limit).
    hc = wire.get("history_codes", {})
    if "25" in hc:
        companions = [page, _gap_page()]
        if not any(("code 25" in t or "`25`" in t) for t in companions):
            failures.append(
                "history code 25 (bank-break / reserve ladder) not documented on either "
                "wire-format page"
            )
        shape = hc["25"]["shape"]
        if "reserve" not in shape.lower():
            failures.append("history code 25 shape no longer mentions reserve values")

    # ---- 3e. startingMap + negative bank must be documented (either page) ----
    both = page + _gap_page()
    if wire.get("starting_map") and "startingMap" not in both:
        failures.append("startingMap behaviour not documented on either wire-format page")
    if wire.get("bank_semantics", {}).get("bank_can_go_negative"):
        if "negative" not in both.lower():
            failures.append("neither page documents that the bank can go negative at game end")

    # ---- 4. cross-check against the engine source, when present ----
    if os.path.isfile(ENGINE_REF):
        src = open(ENGINE_REF, encoding="utf-8").read()
        # goods constants: export const NAME = n
        for want in ("LEMONADE", "COKE", "BEER", "PIZZA", "BURGER"):
            m = re.search(rf"^export const {want} = (\d+)", src, re.M)
            if not m:
                failures.append(f"engine source: constant {want} not found")
                continue
            code = int(m.group(1))
            expect = wire["goods"].get(str(code))
            if expect != want.lower():
                failures.append(
                    f"engine says {want}={code} but wire-format records {code}={expect}"
                )
        for want, canon in (("COFFEE", "coffee"), ("NOODLES", "noodles"),
                            ("SUSHI", "sushi"), ("KIMCHI", "kimchi"), ("DUMPLING", "dumpling")):
            m = re.search(rf"^export const {want} = (\d+)", src, re.M)
            if not m:
                failures.append(f"engine source: constant {want} not found")
                continue
            code = int(m.group(1))
            expect = wire["engine_only_goods"].get(str(code))
            if expect != canon:
                failures.append(
                    f"engine says {want}={code} but wire-format records {code}={expect}"
                )
        # milestone table length
        m = re.search(r"export const MILESTONES_STR = \[(.*?)\n\]", src, re.S)
        if m:
            n = len(re.findall(r"\{ text:", m.group(1)))
            if n != wire["engine_milestone_table_size"]:
                failures.append(
                    f"engine MILESTONES_STR has {n} entries, "
                    f"wire-format records {wire['engine_milestone_table_size']}"
                )
        else:
            failures.append("could not parse MILESTONES_STR from engine source")
    else:
        print(f"note: engine source not present ({ENGINE_REF}) — skipped source cross-check")

    print(f"wire-format expectations: goods={len(wire['goods'])}, "
          f"engine-only={len(wire['engine_only_goods'])}, "
          f"player_fields={len(wire['player_fields'])}")
    if failures:
        print(f"\nDRIFT — {len(failures)} issue(s):")
        for f in failures:
            print("  -", f)
        return 1
    print("\nOK — recorded wire format agrees with the page and the engine source.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
