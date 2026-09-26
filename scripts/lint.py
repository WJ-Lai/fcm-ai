#!/usr/bin/env python3
"""
lint.py — hygiene checks for the FCM knowledge base.

Deterministic, dependency-free. Run before committing wiki changes.

Checks:
  1. Broken wikilinks        — [[x]] where no x.md exists
  2. Orphan pages            — no inbound links from other pages
  3. Frontmatter completeness— required fields present on every page
  4. Tag taxonomy            — every tag declared in SCHEMA.md
  5. Index completeness      — every page listed in index.md
  6. Secret scan             — no agent tokens or credentials anywhere
  7. Citation presence       — rules pages should cite (base rules, p.N) or similar
  8. Oversized pages         — over 200 lines (candidate for splitting)

Exit code 0 = clean, 1 = issues found.
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIKI = os.path.join(ROOT, "wiki")
REQUIRED_FM = ["title", "created", "updated", "type", "tags", "sources", "confidence"]
SECRET_RE = re.compile(r"obg_pat_[A-Za-z0-9_\-]{8,}")
CITATION_RE = re.compile(r"\(base rules, p\.\d+\)|\(ketchup rules?, p\.\d+\)")


def pages():
    return sorted(glob.glob(f"{WIKI}/**/*.md", recursive=True))


def read(p):
    with open(p, encoding="utf-8") as fh:
        return fh.read()


def strip_code(text: str) -> str:
    """Remove fenced and inline code before scanning for wikilinks.

    Code samples legitimately contain bracket sequences that look like links
    (e.g. a JSON array `[[103,0]]`). Scanning them produces phantom broken
    links, which trains the reader to ignore the linter. Strip first.
    """
    text = re.sub(r"```.*?```", "", text, flags=re.S)      # fenced blocks
    text = re.sub(r"`[^`\n]*`", "", text)                  # inline code
    return text


def frontmatter(text):
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    return m.group(1) if m else None


def main():
    issues = {}
    files = pages()
    existing = {os.path.basename(p)[:-3] for p in files}

    # 1 + 2: links
    targets = {}
    for p in files:
        for m in re.findall(r"\[\[([^\]]+)\]\]", strip_code(read(p))):
            targets.setdefault(m.split("|")[0].strip(), []).append(os.path.basename(p))
    broken = sorted(set(targets) - existing)
    if broken:
        issues["broken wikilinks"] = broken

    orphans = [os.path.basename(p)[:-3] for p in files
               if os.path.basename(p)[:-3] not in targets
               and os.path.basename(p)[:-3] != "overview"]
    if orphans:
        issues["orphan pages"] = orphans

    # 3: frontmatter
    fm_problems = []
    for p in files:
        fm = frontmatter(read(p))
        if fm is None:
            fm_problems.append(f"{os.path.relpath(p, ROOT)}: no frontmatter")
            continue
        miss = [k for k in REQUIRED_FM if not re.search(rf"^{k}:", fm, re.M)]
        if miss:
            fm_problems.append(f"{os.path.relpath(p, ROOT)}: missing {miss}")
    if fm_problems:
        issues["frontmatter"] = fm_problems

    # 4: tag taxonomy
    schema = read(os.path.join(ROOT, "SCHEMA.md"))
    tax_block = schema.split("## Tag Taxonomy", 1)[-1].split("## Page Thresholds", 1)[0]
    declared = set(re.findall(r"`([a-z0-9\-]+)`", tax_block))
    used = set()
    for p in files:
        fm = frontmatter(read(p)) or ""
        tm = re.search(r"^tags:\s*\[(.*?)\]", fm, re.M)
        if tm:
            used |= {t.strip() for t in tm.group(1).split(",") if t.strip()}
    undeclared = sorted(used - declared)
    if undeclared:
        issues["undeclared tags (add to SCHEMA.md first)"] = undeclared

    # 5: index completeness
    index = read(os.path.join(ROOT, "index.md"))
    missing_from_index = [s for s in sorted(existing) if s not in index]
    if missing_from_index:
        issues["pages missing from index.md"] = missing_from_index

    # 6: secrets
    secret_hits = []
    for dirpath, dirs, fs in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d != ".git"]
        for fn in fs:
            p = os.path.join(dirpath, fn)
            try:
                txt = open(p, encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            for m in SECRET_RE.findall(txt):
                if not any(k in m for k in ("abc123", "REDACTED", "...")):
                    secret_hits.append(f"{os.path.relpath(p, ROOT)}: {m[:16]}…")
    if secret_hits:
        issues["POSSIBLE SECRETS"] = secret_hits

    # 7: citation presence on rules pages
    no_cite = []
    for p in files:
        rel = os.path.relpath(p, ROOT)
        if rel.startswith(os.path.join("wiki", "playbooks")):
            continue  # playbooks synthesize; they cite via links
        if not CITATION_RE.search(read(p)):
            no_cite.append(rel)
    if no_cite:
        issues["rules pages with no page citation"] = no_cite

    # 8: oversized
    big = [f"{os.path.relpath(p, ROOT)}: {len(read(p).splitlines())} lines"
           for p in files if len(read(p).splitlines()) > 200]
    if big:
        issues["pages over 200 lines"] = big

    # ---- report
    print(f"lint: {len(files)} pages")
    if not issues:
        print("clean ✅")
        return 0
    for k, v in issues.items():
        print(f"\n❌ {k}:")
        for item in v:
            print(f"   - {item}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
