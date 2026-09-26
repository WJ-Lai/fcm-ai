#!/usr/bin/env python3
"""Card lookup for FCM — query employee and milestone cards offline.

Companion to scripts/ask.py (which searches rule *prose*). This one answers
"what does card X actually do?", in English or Chinese, with no network and no
API key.

Usage:
    python3 scripts/card.py "Errand Boy"
    python3 scripts/card.py "服务员"          # Chinese name works
    python3 scripts/card.py --expansion        # list all expansion-only cards
    python3 scripts/card.py --milestones       # list all milestones
    python3 scripts/card.py --search "drink"   # full-text over card text

Exit codes:
    0 = found / listed
    1 = no match (prints a clear "not in the card set" message)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "raw", "cards-authoritative.json")


def load() -> dict:
    if not os.path.isfile(DATA):
        sys.exit(
            f"error: {DATA} not found.\n"
            "Regenerate it from the game engine with: python3 scripts/extract_cards.py"
        )
    with open(DATA, encoding="utf-8") as f:
        return json.load(f)


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", " ", s.lower()).strip()


# Words that appear in almost every FCM card body. Matching on them produces
# confident-but-irrelevant answers ("pokemon type chart" -> "type" -> marketing
# card). They are excluded from scoring so a query must share *meaningful* terms.
GENERIC = {
    "the", "a", "an", "of", "to", "in", "on", "at", "is", "are", "and", "or", "not",
    "my", "i", "you", "your", "do", "does", "can", "may", "get", "gets", "for",
    "with", "from", "each", "all", "any", "one", "two", "per", "turn", "round",
    "type", "types", "card", "cards", "place", "placed", "use", "used", "work",
    "player", "players", "game", "first", "new", "one", "more", "same", "than",
}


def meaningful_tokens(q: str) -> list[str]:
    """Tokens worth scoring on: not generic, not single-character."""
    toks = [t for t in norm(q).split() if len(t) > 1 and t not in GENERIC]
    return toks


def score_hits(q: str, allrecs):
    """Return [(score, kind, rec)] using only meaningful tokens."""
    toks = meaningful_tokens(q)
    if not toks:
        return []                      # query was entirely generic words -> no basis to match
    hits = []
    for kind, r in allrecs:
        hay = norm(" ".join([r.get("name", ""), r.get("name_zh", ""), r.get("title", ""),
                             r.get("text", ""), r.get("text_zh", "")]))
        score = sum(1 for t in toks if t in hay)
        if score:
            hits.append((score, kind, r))
    hits.sort(key=lambda x: -x[0])
    return hits


def print_search_result(q: str, allrecs, header: bool = False, limit: int = 8) -> bool:
    """Print matches. Returns True if anything matched."""
    hits = score_hits(q, allrecs)
    if not hits:
        print(
            f"No FCM card matches \"{q}\".\n"
            f"  (searched {len(allrecs)} cards: {sum(1 for _,r in allrecs if _=='employee')} employees, "
            f"{sum(1 for _,r in allrecs if _=='milestone')} milestones)\n"
            "  This knowledge base covers Food Chain Magnate cards only — it does NOT cover\n"
            "  other games or general topics. Rephrase using card/effect words, or use\n"
            "  scripts/ask.py for rule prose."
        )
        return False
    if header:
        print(f"# {len(hits)} card(s) matching \"{q}\"\n")
    for _, kind, r in hits[:limit]:
        print(f"[{kind}] " + fmt(r, kind) + "\n")
    return True


def fmt(rec: dict, kind: str) -> str:
    lines = [f"{rec['name']}  /  {rec.get('name_zh','')}"]
    SET_NOTE = {
        "base": "base game",
        "expansion": "Ketchup expansion",
        "obg-custom": "OBG house variant — NOT in the official rulebooks",
    }
    lines.append(f"  set   : {SET_NOTE.get(rec['set'], rec['set'])}")
    if rec.get("title"):
        lines.append(f"  when  : {rec['title']}" + (f"  /  {rec.get('title_zh','')}" if rec.get("title_zh") else ""))
    lines.append(f"  effect: {rec.get('text','')}")
    if rec.get("text_zh"):
        lines.append(f"          {rec['text_zh']}")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("query", nargs="?", help="card name (English or Chinese)")
    ap.add_argument("--expansion", action="store_true", help="list expansion-only cards")
    ap.add_argument("--milestones", action="store_true", help="list milestone cards")
    ap.add_argument("--employees", action="store_true", help="list employee cards")
    ap.add_argument("--search", metavar="TEXT", help="full-text search across card text")
    args = ap.parse_args()

    data = load()
    employees, milestones = data["employees"], data["milestones"]
    allrecs = [("employee", e) for e in employees] + [("milestone", m) for m in milestones]

    if args.expansion:
        print(f"# Expansion-only cards ({sum(1 for _,r in allrecs if r['set']=='expansion')})\n")
        for kind, r in allrecs:
            if r["set"] == "expansion":
                print(f"[{kind}] {r['name']:26s} {r.get('name_zh',''):12s} — {r.get('text','')}")
        return 0

    if args.milestones:
        print(f"# Milestones ({len(milestones)})\n")
        for m in milestones:
            print(f"[{m['set']:9s}] {m['name']:28s} {m.get('name_zh',''):14s} — {m.get('text','')}")
        return 0

    if args.employees:
        print(f"# Employees ({len(employees)})\n")
        for e in employees:
            print(f"[{e['set']:9s}] {e['name']:28s} {e.get('name_zh',''):14s} — {e.get('text','')}")
        return 0

    if args.search:
        return 0 if print_search_result(args.search, allrecs, header=True) else 1

    if not args.query:
        ap.print_help()
        return 1

    qn = norm(args.query)
    # exact key / name / chinese-name match first
    exact = []
    for kind, r in allrecs:
        if qn in (norm(r.get("key","")), norm(r.get("name","")), norm(r.get("name_zh",""))):
            exact.append((kind, r))
    if not exact:
        # substring on name only (avoid matching body text and returning junk)
        exact = [(k, r) for k, r in allrecs
                 if qn and qn in norm(r.get("name","")) + " " + norm(r.get("name_zh",""))]
    if not exact:
        # fall back to full-text, but say so
        print(f"No card named \"{args.query}\". Falling back to text search:\n")
        return 0 if print_search_result(args.query, allrecs) else 1

    for kind, r in exact:
        print(f"[{kind}] " + fmt(r, kind) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
