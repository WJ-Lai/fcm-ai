#!/usr/bin/env python3
"""Extract authoritative FCM card text (employees + milestones) from the game engine.

Why this exists
---------------
The printed rulebook PDFs list card *names* but the per-card rules text lives on the
physical cards. Rather than photograph/OCR cards (lossy, unverifiable), we read the
string table the **live game engine itself** renders. That is the text the engine
enforces, it is machine-readable, and it ships with English + Chinese in one place.

Source (read-only, never modified):
    <OBG_SERVER>/FCM/static/FCM/FCMvuedist/main.js
    -- the i18n locale blocks `milestones:{...}` and `employees:{...}`.
    Two copies exist: [0] = English, [1] = Chinese (zh_Hans).

Bloc is a JS object literal. Values are backtick-quoted template strings, so we must
respect backtick state when matching braces (a value can itself contain `{`/`}`).

Usage:
    python3 scripts/extract_cards.py [--server PATH] [--out PATH]

Verification: the script self-checks after extraction and exits non-zero on any
integrity failure (duplicate keys, missing name/text, unbalanced parse).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import OrderedDict

DEFAULT_SERVER_CANDIDATES = [
    "~/obg-server-fcm-agent",
    "~/obg-server",
]
RELATIVE_MAIN_JS = "FCM/static/FCM/FCMvuedist/main.js"

# Base-game employee keys. Anything else is Ketchup expansion.
# Derived from the base rulebook card list (raw/rules/fcm-base-rules-eng-v4.txt).
BASE_EMPLOYEE_KEYS = {
    "waitress", "newBusinessDeveloper", "localManager", "regionalManager", "cfo",
    "managementTrainee", "juniorVicePresident", "vicePresident", "seniorVicePresident",
    "executiveVicePresident", "pricingManager", "luxuriesManager", "discountManager",
    "marketingTrainee", "campaignManager", "brandManager", "brandDirector",
    "recruitingGirl", "recruitingManager", "hrDirector", "trainer", "coach", "guru",
    "errandBoy", "cartOperator", "truckDriver", "zeppelinPilot", "kitchenTrainee",
    "burgerCook", "burgerChef", "pizzaCook", "pizzaChef",
}

# Milestone keys that only exist with the Ketchup "New Milestones" module.
EXPANSION_MILESTONE_KEYS = {
    "firstWaitressUsed", "firstCartOperatorUsed", "firstCoffeeSold",
    "someoneSellsYourDemand", "firstLobbyist", "firstDumplingSold",
}

# Cards present in the OBG engine but ABSENT from both official rulebooks and
# absent from the engine's own `modules:` list. These are OBG house/variant
# additions (e.g. a Chinese-edition tie-in), NOT official Splotter expansion
# content. Labelled "obg-custom" so a model never presents them as official
# rules. Verified by scripts/verify_sources.py.
OBG_CUSTOM_KEYS = {
    "dumplingCook", "dumplingChef", "hawkerMarketeer", "deliveryDriver",
    "jazzMusician", "firstDumplingSold",
}

# Cards the ENGINE ships in the base set, but that the BASE rulebook never
# explains — they are only written up in the Ketchup book's "New Milestones"
# chapter (under the "used" wording). Verified by scripts/verify_sources.py.
# Recording this prevents a model from claiming "the base rulebook says X" when
# the base rulebook is silent on it.
BASE_SET_DOCUMENTED_IN_KETCHUP = {
    "firstMarketeer", "firstMarketingTrainee", "firstCampaignManager",
    "firstBrandManager", "firstBrandDirector", "firstBurgerSold",
    "firstPizzaSold", "firstLemonadeSold", "firstBeerSold", "firstCokeSold",
    "firstRecruitingGirl", "firstTrainer", "firstDiscountManager",
    "firstHouse", "firstRuralMarketeer",
}

# Cards documented in the BASE rulebook.
BASE_RULEBOOK_KEYS = {
    "waitress", "newBusinessDeveloper", "localManager", "regionalManager", "cfo",
    "managementTrainee", "juniorVicePresident", "vicePresident", "seniorVicePresident",
    "executiveVicePresident", "pricingManager", "luxuriesManager", "discountManager",
    "marketingTrainee", "campaignManager", "brandManager", "brandDirector",
    "recruitingGirl", "recruitingManager", "hrDirector", "trainer", "coach", "guru",
    "errandBoy", "cartOperator", "truckDriver", "zeppelinPilot", "kitchenTrainee",
    "burgerCook", "burgerChef", "pizzaCook", "pizzaChef",
    "firstToHire3", "firstToThrowAway", "firstWaitress", "firstToHave20",
    "firstToHave100", "firstToLowerPrices", "firstToTrain", "firstBurgerProduced",
    "firstPizzaProduced", "firstErrandBoy", "firstCartOperator", "firstToPay20Salaries",
    "firstBillboard", "firstBurgerMarketed", "firstPizzaMarketed", "firstDrinkMarketed",
    "firstAirplane", "firstRadio", "firstRestaurant",
}


def find_main_js(explicit: str | None) -> str:
    if explicit:
        path = os.path.expanduser(explicit)
        if not os.path.isfile(path):
            sys.exit(f"error: --server path has no {RELATIVE_MAIN_JS}: {path}")
        return path
    for cand in DEFAULT_SERVER_CANDIDATES:
        path = os.path.join(os.path.expanduser(cand), RELATIVE_MAIN_JS)
        if os.path.isfile(path):
            return path
    sys.exit(
        "error: could not locate the FCM frontend bundle. Pass --server <path to obg-server checkout>.\n"
        f"tried: {[os.path.expanduser(c) for c in DEFAULT_SERVER_CANDIDATES]}"
    )


def extract_object_literal(src: str, start: int) -> str:
    """Return the balanced {...} literal beginning at the first '{' at/after `start`.

    Tracks backtick-quoted template strings so braces inside card text are ignored.
    """
    j = src.index("{", start)
    depth = 0
    k = j
    in_backtick = False
    while k < len(src):
        c = src[k]
        if c == "`":
            in_backtick = not in_backtick
        elif not in_backtick:
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return src[j : k + 1]
        k += 1
    raise ValueError("unbalanced object literal")


def parse_backtick_pairs(block: str) -> "OrderedDict[str, str]":
    """Parse `key: \`value\`` pairs from a JS object literal body."""
    out: "OrderedDict[str, str]" = OrderedDict()
    pat = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)\s*:\s*`((?:[^`\\]|\\.)*)`", re.S)
    for m in pat.finditer(block):
        out[m.group(1)] = m.group(2)
    return out


def blocks(src: str, marker: str) -> list[int]:
    return [m.start() for m in re.finditer(re.escape(marker), src)]


def build_records(en: "OrderedDict[str,str]", zh: "OrderedDict[str,str]") -> list[dict]:
    """Group foo / fooTitle / fooDesc triples into records."""
    recs: "OrderedDict[str, dict]" = OrderedDict()
    for k in en:
        if not (k.endswith("Desc") or k.endswith("Title")):
            recs[k] = {"key": k, "name": en[k], "name_zh": zh.get(k, "")}
    for k in en:
        if k.endswith("Desc") and k[:-4] in recs:
            recs[k[:-4]]["text"] = en[k]
            recs[k[:-4]]["text_zh"] = zh.get(k, "")
        if k.endswith("Title") and k[:-5] in recs:
            recs[k[:-5]]["title"] = en[k]
            recs[k[:-5]]["title_zh"] = zh.get(k, "")
    return list(recs.values())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--server", default=None, help="path to OBG server checkout")
    ap.add_argument("--out", default=None, help="output JSON path")
    args = ap.parse_args()

    main_js = find_main_js(args.server)
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = os.path.expanduser(args.out) if args.out else os.path.join(
        repo_root, "raw", "cards-authoritative.json"
    )

    src = open(main_js, encoding="utf-8").read()

    eb, mb = blocks(src, "employees:{"), blocks(src, "milestones:{")
    if len(eb) < 2 or len(mb) < 2:
        sys.exit(
            f"error: expected >=2 employees/milestones locale blocks (en, zh); "
            f"found employees={len(eb)} milestones={len(mb)}. "
            "The frontend bundle layout changed — inspect main.js."
        )

    en_emp = parse_backtick_pairs(extract_object_literal(src, eb[0]))
    zh_emp = parse_backtick_pairs(extract_object_literal(src, eb[1]))
    en_ms = parse_backtick_pairs(extract_object_literal(src, mb[0]))
    zh_ms = parse_backtick_pairs(extract_object_literal(src, mb[1]))

    employees = build_records(en_emp, zh_emp)
    milestones = build_records(en_ms, zh_ms)

    for e in employees:
        e["set"] = "base" if e["key"] in BASE_EMPLOYEE_KEYS else "expansion"
        if e["key"] in OBG_CUSTOM_KEYS:
            e["set"] = "obg-custom"
    for m in milestones:
        m["set"] = "expansion" if m["key"] in EXPANSION_MILESTONE_KEYS else "base"
        if m["key"] in OBG_CUSTOM_KEYS:
            m["set"] = "obg-custom"

    # `documented_in` answers a DIFFERENT question from `set`: which rulebook
    # actually explains the card. Keeping them apart is what stops the wiki from
    # attributing a rule to a book that never mentions it.
    for r in employees + milestones:
        if r["set"] == "obg-custom":
            r["documented_in"] = "none"
        elif r["key"] in BASE_SET_DOCUMENTED_IN_KETCHUP:
            r["documented_in"] = "ketchup"
        elif r["set"] == "expansion":
            r["documented_in"] = "ketchup"
        elif r["key"] in BASE_RULEBOOK_KEYS:
            r["documented_in"] = "base"
        else:
            r["documented_in"] = "none"

    # ---- self-verification: fail loudly rather than emit a subtle bad dataset ----
    problems: list[str] = []
    for label, recs in (("employee", employees), ("milestone", milestones)):
        keys = [r["key"] for r in recs]
        dupes = sorted({k for k in keys if keys.count(k) > 1})
        if dupes:
            problems.append(f"{label}: duplicate keys {dupes}")
        for r in recs:
            if not r.get("name") or not r.get("text"):
                problems.append(f"{label}: {r['key']} missing name/text")
    if problems:
        sys.exit("error: extraction integrity check failed:\n  " + "\n  ".join(problems))

    payload = {
        "_comment": (
            "Authoritative FCM card text extracted from the game engine's own locale data "
            "(the strings the live game renders). Not OCR, not hand-transcription."
        ),
        "_source": f"<OBG_SERVER>/{RELATIVE_MAIN_JS} (locale blocks: milestones, employees)",
        "_generator": "scripts/extract_cards.py",
        "employees": employees,
        "milestones": milestones,
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    base_e = sum(1 for e in employees if e["set"] == "base")
    print(f"wrote {out_path}")
    print(f"  source: {main_js}")
    print(f"  employees: {len(employees)} ({base_e} base, {len(employees)-base_e} expansion)")
    print(f"  milestones: {len(milestones)} ({sum(1 for m in milestones if m['set']=='base')} base, "
          f"{sum(1 for m in milestones if m['set']=='expansion')} expansion)")
    print("  integrity: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
