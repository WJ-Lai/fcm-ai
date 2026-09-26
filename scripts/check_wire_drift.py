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


def main() -> int:
    if not os.path.isfile(WIRE):
        sys.exit(f"error: missing {WIRE}")
    if not os.path.isfile(PAGE):
        sys.exit(f"error: missing {PAGE}")

    wire = json.load(open(WIRE, encoding="utf-8"))
    page = open(PAGE, encoding="utf-8").read()
    failures: list[str] = []

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
