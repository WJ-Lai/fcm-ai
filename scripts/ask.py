#!/usr/bin/env python3
"""
ask.py — query the FCM rules knowledge base from the command line.

Built for the in-game use case: an agent (or a human mid-game) needs a specific
rule in seconds, with a citation it can trust.

Usage:
    python3 scripts/ask.py "how is unit price computed"
    python3 scripts/ask.py "can I fire a busy marketeer"
    python3 scripts/ask.py --list                       # list all pages
    python3 scripts/ask.py --page milestones-overview   # print a whole page
    python3 scripts/ask.py "garden" --json              # machine-readable

Scoring is deliberately simple and explainable (term frequency + field weights).
No external dependencies, no API key, no index build step — it reads the markdown
directly so the wiki stays the single source of truth.
"""
import argparse
import json
import math
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIKI = os.path.join(ROOT, "wiki")

STOP = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "do", "does",
    "did", "how", "what", "when", "where", "which", "who", "whom", "why", "can", "could",
    "i", "me", "my", "you", "your", "it", "its", "of", "to", "in", "on", "at", "for",
    "with", "and", "or", "if", "then", "that", "this", "these", "those", "there", "here",
    "not", "no", "yes", "but", "so", "as", "by", "from", "into", "than", "too", "very",
    "s", "t", "re", "ve", "ll", "must", "may", "should", "would", "get", "got",
}


def pages():
    """Yield (slug, path, text) for every wiki page."""
    for dirpath, _dirs, files in os.walk(WIKI):
        for fn in sorted(files):
            if fn.endswith(".md"):
                p = os.path.join(dirpath, fn)
                with open(p, encoding="utf-8") as fh:
                    yield fn[:-3], p, fh.read()


def tokenize(text):
    return [w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP and len(w) > 1]


def parse_frontmatter(text):
    """Return (frontmatter dict-ish string, body)."""
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        return "", text
    return m.group(1), text[m.end():]


def split_sections(body):
    """Split body into (heading, text) chunks so we can return the relevant section."""
    parts = re.split(r"\n(?=#{2,3} )", body)
    out = []
    for part in parts:
        lines = part.split("\n", 1)
        head = lines[0].lstrip("# ").strip() if lines[0].startswith("#") else ""
        out.append((head, part))
    return out


def score_page(query_terms, slug, text):
    fm, body = parse_frontmatter(text)
    # Field weights: title/frontmatter and headings matter more than body prose.
    title = ""
    tm = re.search(r"^title:\s*(.+)$", fm, re.M)
    if tm:
        title = tm.group(1).lower()
    description = ""
    dm = re.search(r"^description:\s*(.+)$", fm, re.M)
    if dm:
        description = dm.group(1).lower()

    body_l = body.lower()
    headings = " ".join(h for h, _ in split_sections(body)).lower()

    score = 0.0
    hits = Counter()
    for term in query_terms:
        # substring match, so "milestone" hits "milestones" and vice versa
        if term in title:
            score += 12
            hits[term] += 1
        if term in slug:
            score += 8
            hits[term] += 1
        if term in description:
            score += 5
            hits[term] += 1
        if term in headings:
            score += 3
            hits[term] += 1
        n = body_l.count(term)
        if n:
            score += math.log1p(n) * 1.5
            hits[term] += 1
    return score, hits


def best_section(query_terms, body, max_chars=900):
    """Return the section of the page that best matches the query."""
    best, best_score = "", -1.0
    for _head, chunk in split_sections(body):
        cl = chunk.lower()
        s = sum(cl.count(t) for t in query_terms)
        if s > best_score:
            best, best_score = chunk, s
    if not best:
        return body[:max_chars]
    return best[:max_chars]


def cmd_search(query, as_json=False, limit=5):
    terms = tokenize(query)
    if not terms:
        print("No searchable terms in query.", file=sys.stderr)
        return 1

    results = []
    for slug, path, text in pages():
        s, hits = score_page(terms, slug, text)
        if s <= 0:
            continue
        fm, body = parse_frontmatter(text)
        cm = re.search(r"^confidence:\s*(\S+)", fm, re.M)
        tm = re.search(r"^title:\s*(.+)$", fm, re.M)
        results.append({
            "slug": slug,
            "path": os.path.relpath(path, ROOT),
            "title": tm.group(1).strip() if tm else slug,
            "confidence": cm.group(1) if cm else "?",
            "score": round(s, 1),
            "matched_terms": sorted(hits),
            "snippet": best_section(terms, body).strip(),
        })
    results.sort(key=lambda r: -r["score"])
    results = results[:limit]

    if as_json:
        print(json.dumps({"query": query, "terms": terms, "results": results}, indent=2))
        return 0 if results else 1

    if not results:
        print(f"No match for: {query!r}")
        return 1

    print(f"query: {query}")
    print(f"terms: {', '.join(terms)}\n")
    for i, r in enumerate(results, 1):
        print(f"{i}. {r['title']}   [{r['score']}]  ({r['confidence']})")
        print(f"   {r['path']}")
        print()
        for line in r["snippet"].split("\n")[:18]:
            print(f"   {line}")
        print()
    return 0


def cmd_list():
    for slug, path, _ in pages():
        print(f"{slug:44} {os.path.relpath(path, ROOT)}")
    return 0


def cmd_page(slug):
    for s, path, text in pages():
        if s == slug:
            print(text)
            return 0
    print(f"No such page: {slug}", file=sys.stderr)
    return 1


def main():
    ap = argparse.ArgumentParser(description="Query the FCM rules knowledge base.")
    ap.add_argument("query", nargs="?", help="natural-language question or keywords")
    ap.add_argument("--list", action="store_true", help="list all pages")
    ap.add_argument("--page", metavar="SLUG", help="print a full page by slug")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--limit", type=int, default=5, help="max results (default 5)")
    a = ap.parse_args()

    if a.list:
        return cmd_list()
    if a.page:
        return cmd_page(a.page)
    if not a.query:
        ap.print_help()
        return 2
    return cmd_search(a.query, as_json=a.json, limit=a.limit)


if __name__ == "__main__":
    sys.exit(main())
