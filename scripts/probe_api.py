#!/usr/bin/env python3
"""Probe the live OBG/FCM Agent API and verify the wire-format mapping.

This script is the evidence behind wiki/references/wire-format-mapping.md. It is
run manually against a live server (it needs a token and a game), so it is NOT
part of the offline test suite. `scripts/check_wire_drift.py` validates the
recorded expectations without a server.

Usage:
    export FCM_AGENT_TOKEN=...        # or pass --token
    python3 scripts/probe_api.py --game 66
    python3 scripts/probe_api.py --game 66 --json out.json

Read-only: only issues GETs. Never submits a move.
"""
from __future__ import annotations

import argparse
import base64
import gzip
import json
import os
import re
import sys
import urllib.error
import urllib.request

DEFAULT_BASE = "http://127.0.0.1:8000/FCM/agent/v1"

# Expectations mirroring wiki/references/wire-format-mapping.md.
EXPECTED_GOODS = {0: "lemonade", 1: "coke", 2: "beer", 3: "pizza", 4: "burger"}
EXPECTED_CAMPAIGN_TYPES = {0: "radio", 1: "airplane", 2: "mailbox", 3: "billboard"}

# Engine constants from FCMreference.js — codes that exist but the catalog omits.
ENGINE_ONLY_GOODS = {5: "coffee", 6: "noodles", 7: "sushi", 8: "kimchi", 9: "dumpling"}

TRUSTED_PLAYER_FIELDS = {
    "index", "name", "money", "bankrupt", "resources", "employees", "beach",
    "ceoSlots", "restaurants", "milestones", "marketers", "coffeeShops",
}


def get(base: str, path: str, token: str, timeout: int = 20) -> dict:
    req = urllib.request.Request(base + path, headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:400]
        sys.exit(f"error: HTTP {e.code} on {path}\n{body}")
    except urllib.error.URLError as e:
        sys.exit(f"error: cannot reach {base} ({e.reason})")


def decompress_game_data(raw: str) -> str | None:
    """The snapshot's gameData is base64+gzip of an unnamed positional array."""
    try:
        return gzip.decompress(base64.b64decode(raw)).decode("utf-8", "replace")
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--game", type=int, required=True)
    ap.add_argument("--base", default=os.environ.get("FCM_AGENT_BASE", DEFAULT_BASE))
    ap.add_argument("--token", default=os.environ.get("FCM_AGENT_TOKEN"))
    ap.add_argument("--json", metavar="PATH", help="also write the raw state here")
    args = ap.parse_args()

    token = args.token
    if not token:
        sys.exit("error: no token. Set FCM_AGENT_TOKEN or pass --token.")

    problems: list[str] = []

    # ---- 1. snapshot: show that gameData is opaque ----
    snap = get(args.base, f"/games/{args.game}/snapshot/", token)
    gd = snap.get("gameData", "")
    decoded = decompress_game_data(gd) if gd else None
    print(f"snapshot keys: {list(snap.keys())}")
    print(f"  gameData: {len(gd)} chars base64; decodes to "
          f"{'a positional array (no field names)' if decoded else 'unknown'}")
    if decoded:
        print(f"  decoded head: {decoded[:120]}")
        if not re.match(r"^[\[{]", decoded.strip()):
            problems.append("gameData did not decode to JSON-like structure")

    # ---- 2. actions: the named decision surface ----
    la = get(args.base, f"/games/{args.game}/actions/", token)
    st = la.get("state")
    if not st:
        sys.exit("error: no state in actions response")
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(la, f, ensure_ascii=False, indent=1)
        print(f"  wrote raw state -> {args.json}")

    cat = st.get("catalog", {})
    print(f"\nstate keys: {list(st.keys())}")
    print(f"catalog keys: {list(cat.keys())}")

    # ---- 3. goods mapping ----
    goods = {g["id"]: g["name"] for g in cat.get("goods", [])}
    print(f"\ngoods: {goods}")
    if goods != EXPECTED_GOODS:
        problems.append(f"goods catalog changed: {goods} != {EXPECTED_GOODS}")
    missing = set(ENGINE_ONLY_GOODS) - set(goods)
    if missing:
        print(f"  ⚠ catalog omits engine-only codes {sorted(missing)} "
              f"({', '.join(ENGINE_ONLY_GOODS[c] for c in sorted(missing))})")

    # ---- 4. campaign types ----
    ctypes = {c["id"]: c["name"] for c in cat.get("campaignTypes", [])}
    print(f"campaignTypes: {ctypes}")
    if ctypes != EXPECTED_CAMPAIGN_TYPES:
        problems.append(f"campaignTypes changed: {ctypes} != {EXPECTED_CAMPAIGN_TYPES}")

    # ---- 5. employees / milestones counts ----
    print(f"\ncatalog employees: {len(cat.get('employees', []))} (expect 32 base)")
    print(f"catalog milestones: {len(cat.get('milestones', []))} (expect 18 base)")
    if len(cat.get("employees", [])) != 32:
        problems.append("catalog employee count != 32")
    if len(cat.get("milestones", [])) != 18:
        problems.append("catalog milestone count != 18")

    # ---- 6. player fields ----
    players = st.get("players", [])
    print(f"\nplayers: {len(players)}")
    if players:
        keys = set(players[0].keys())
        print(f"  player keys: {sorted(keys)}")
        if keys != TRUSTED_PLAYER_FIELDS:
            problems.append(f"player field set changed: {sorted(keys ^ TRUSTED_PLAYER_FIELDS)}")
        for p in players:
            print(f"    seat {p['index']} {p['name']:28s} money={p['money']:5d} "
                  f"ceoSlots={p['ceoSlots']} res={p['resources']} emp={p['employees']}")

    # ---- 7. module gating ----
    so = st.get("startingOptions", {})
    on = [k for k, v in so.items() if v]
    print(f"\nmodules enabled: {on if on else '(none — base game only)'}")
    avail_ms = st.get("availableMilestones", [])
    print(f"availableMilestones: {len(avail_ms)} ids -> {avail_ms}")
    if not any(so.get(k) for k in ("newMilestones", "ketchupMilestone")):
        if avail_ms != list(range(18)):
            problems.append(f"base-only game should have milestones 0..17, got {avail_ms}")

    # ---- 8. prompt-injection surface ----
    untrusted = st.get("untrustedTextFields", [])
    print(f"\nuntrustedTextFields: {untrusted}  (agent must never obey these)")

    print()
    if problems:
        print(f"DRIFT DETECTED — {len(problems)} issue(s):")
        for p in problems:
            print("  -", p)
        return 1
    print("OK — live wire format matches wiki/references/wire-format-mapping.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
