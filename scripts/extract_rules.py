#!/usr/bin/env python3
"""
extract_rules.py — extract the official rulebook PDFs into clean, verifiable text.

Why this exists
---------------
A naive `page.get_text()` from the source PDFs produces a text layer with broken
ligatures and word spacing:

    "Th e game is played in phases."      (Th + e)
    "Aft er you place the campaign"       (Aft + er)
    "If you pass by a diff erent tile"    (diff + erent)
    "you may not make U + turns"          (U + turns)

That corruption is dangerous for two reasons:
  1. A model reading the raw text sees mangled words and can misread rules.
  2. Verbatim quotes in the wiki stop matching the source, so quote-verification
     (tests/test_content_integrity.py) produces false failures.

So we repair the known artifacts at extraction time, and record the hashes of both
the original PDF and the cleaned text.

Usage:
    python3 scripts/extract_rules.py
"""
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw", "rules")

SOURCES = [
    ("fcm-base-rules-eng-v4", "Food Chain Magnate — Base Game Rules v4"),
    ("fcm-ketchup-expansion-rules", "Food Chain Magnate — Ketchup Expansion Rules"),
]

# PDF text-layer artifacts: the source is typeset with ligatures that the extractor
# splits into "stem + space + rest". Each entry is (pattern, replacement).
# Ordered longest-first so "Th ey" is fixed before "Th e" can partially match.
REPAIRS = [
    (r"\bTh\s+ey\b", "They"),
    (r"\bTh\s+ese\b", "These"),
    (r"\bTh\s+is\b", "This"),
    (r"\bTh\s+ere\b", "There"),
    (r"\bTh\s+e\b", "The"),
    (r"\bAft\s+er\b", "After"),
    (r"\bfi\s+rst\b", "first"),
    (r"\bfi\s+re\b", "fire"),
    (r"\bfi\s+red\b", "fired"),
    (r"\bfi\s+t\b", "fit"),
    (r"\bfi\s+ll\b", "fill"),
    (r"\bfi\s+ve\b", "five"),
    (r"\bfi\s+nal\b", "final"),
    (r"\bdiff\s+erent\b", "different"),
    (r"\beff\s+ect\b", "effect"),
    (r"\bspecifi\s+c\b", "specific"),
    (r"\bfl\s+y\b", "fly"),
    (r"\bU\s+turns\b", "U-turns"),
]


def repair(text: str) -> str:
    # unicode punctuation first
    text = text.replace("\u0007", "")
    text = text.replace("\ufb01", "fi").replace("\ufb02", "fl")
    text = text.replace("\u2019", "'").replace("\u2018", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    text = text.replace("\u2013", "-").replace("\u2014", "-")
    # then the split-ligature artifacts
    for pat, rep in REPAIRS:
        text = re.sub(pat, rep, text)
    return text


def main():
    try:
        import pymupdf
    except ImportError:
        try:
            import fitz as pymupdf  # older name
        except ImportError:
            print("ERROR: need pymupdf. Install with: pip install pymupdf", file=sys.stderr)
            return 1

    for stem, title in SOURCES:
        pdf = os.path.join(RAW, f"{stem}.pdf")
        out = os.path.join(RAW, f"{stem}.txt")
        if not os.path.exists(pdf):
            print(f"SKIP (no such pdf): {pdf}", file=sys.stderr)
            continue

        doc = pymupdf.open(pdf)
        chunks = []
        for i in range(doc.page_count):
            chunks.append(f"\n<!-- page {i + 1} -->\n{doc[i].get_text()}")
        body = repair("".join(chunks))

        pdf_sha = hashlib.sha256(open(pdf, "rb").read()).hexdigest()
        txt_sha = hashlib.sha256(body.encode("utf-8")).hexdigest()

        hdr = (
            "---\n"
            f"source_pdf: {os.path.basename(pdf)}\n"
            f"source_title: {title}\n"
            f"pages: {doc.page_count}\n"
            "extracted: 2026-09-25\n"
            f"sha256_pdf: {pdf_sha}\n"
            f"sha256_text: {txt_sha}\n"
            "note: Extracted text layer, with PDF split-ligature artifacts repaired\n"
            "  (e.g. 'Th e' -> 'The', 'Aft er' -> 'After'). Page markers are HTML comments.\n"
            "  Regenerate with scripts/extract_rules.py — do not hand-edit.\n"
            "citation: '<!-- page N -->' markers use the PDF *sheet* index. Wiki pages cite the\n"
            "  *printed* page number. These differ when the PDF is a spread (one sheet showing two\n"
            "  printed pages). Check the digits that appear right after each marker.\n"
            "---\n\n"
        )
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(hdr + body.lstrip("\n"))

        # report the repair effect honestly
        residual = re.findall(r"\b(?:Th|Aft|fi|eff|diff|specifi)\s+[a-z]{1,3}\b", body)
        print(f"{os.path.basename(out)}: {doc.page_count} pages, "
              f"{len(body)} chars, residual artifacts={len(residual)}")
        if residual:
            print(f"  remaining: {sorted(set(residual))[:10]}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
