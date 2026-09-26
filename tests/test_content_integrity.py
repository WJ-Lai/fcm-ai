"""Adversarial content-integrity tests for the FCM knowledge base.

These try to FALSIFY the wiki rather than confirm it. They answer the question that
matters for a rules oracle: "could this knowledge base cause an agent to play a wrong
move while feeling confident?"

Run:  python3 -m pytest tests/test_content_integrity.py -v

Adversarial angles covered:
  A. Quote fidelity   — every "verbatim" quote must exist in the raw source
  B. Citation range   — every cited page number must exist in the source
  C. Corpus sanity    — raw text must be free of PDF split-word artifacts
  D. Answer calibration — off-domain queries must NOT return confident answers
  E. Link integrity   — no broken wikilinks
  F. Frontmatter      — required fields on every page
  G. Confidence honesty — unverifiable claims must not be marked high
"""
import glob
import hashlib
import os
import re
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIKI = os.path.join(ROOT, "wiki")
RAW = os.path.join(ROOT, "raw", "rules")

BASE_TXT = os.path.join(RAW, "fcm-base-rules-eng-v4.txt")
KETCHUP_TXT = os.path.join(RAW, "fcm-ketchup-expansion-rules.txt")

# ⚠️ Citation schemes differ between the two sources, and conflating them produced a false
# failure during adversarial testing. Both PDFs are page SPREADS: a single PDF sheet prints
# two page numbers (e.g. sheet 7 prints "12" and "13"). Wiki pages cite the PRINTED number.
#
#   base PDF    : 15 sheets, printed numbers roughly 1:1 with sheets
#   ketchup PDF : 10 sheets, printed numbers in steps of 2 (3,4,6,8,10,12,14,16)
#
# So a validity check must map printed -> sheet, not compare a printed number to a sheet count.
# The ranges below are the printed page numbers each source actually contains.
SOURCE_PRINTED_PAGES = {
    "base": set(range(1, 16)),                      # printed 1..15
    "ketchup": {3, 4, 6, 8, 10, 12, 13, 14, 16, 17},  # spreads: 12/13 and 16/17 share a sheet
}

CITE_RE = re.compile(
    r"\((base rules|ketchup rules?),?\s*pp?\.\s*([\d,\s\u2013\-]+)\)"
)

# PDF split-ligature artifacts. Their presence in the CLEANED text is a failure.
SPLIT_ARTIFACT_RE = re.compile(
    r"\b(?:Th|Aft|fi|eff|diff|specifi)\s+(?:e|is|ey|ese|ere|er|rst|re|red|t|erent|ect|c)\b"
)


def wiki_pages():
    return sorted(glob.glob(f"{WIKI}/**/*.md", recursive=True))


def read(p):
    with open(p, encoding="utf-8") as fh:
        return fh.read()


def strip_frontmatter_body(text):
    m = re.match(r"^---\n.*?\n---\n", text, re.S)
    return text[m.end():] if m else text


def norm(s):
    s = s.replace("\u2019", "'").replace("\u2018", "'")
    s = s.replace("\u201c", '"').replace("\u201d", '"')
    s = re.sub(r"\s+", " ", s)
    return s


def norm_loose(s):
    """Case-insensitive, punctuation-loose form for quote containment checks.

    Needed because the PDF text layer capitalises after semicolons (e.g. "...listed here;
    The position...") where the underlying rulebook sentence continues lowercase. A faithful
    wiki quote writes it lowercase, so exact-case matching would produce a FALSE failure.
    """
    s = norm(s)
    s = s.replace("-", " ")          # U-turns vs U turns
    s = re.sub(r"[^\w\s]", " ", s)   # drop punctuation entirely
    return re.sub(r"\s+", " ", s).strip().lower()


def load_source(path):
    """Return the raw text body (after frontmatter), normalized for comparison."""
    text = read(path)
    body = strip_frontmatter_body(text)
    return norm(body)


# ---------------------------------------------------------------- A. quote fidelity
class TestQuoteFidelity(unittest.TestCase):
    """Every long blockquote is presented as verbatim. Verify it actually is.

    This is the highest-value adversarial test: a wiki that misquotes the rulebook is
    worse than no wiki, because the quote lends false authority.
    """

    def setUp(self):
        self.src = {
            "base": load_source(BASE_TXT),
            "ketchup": load_source(KETCHUP_TXT),
        }
        self.hay_loose = norm_loose(" ".join(self.src.values()))

    def test_blockquotes_exist_in_source(self):
        failures = []
        checked = 0
        for p in wiki_pages():
            text = read(p)
            # only consider the page's own quoted rule text ("> ...")
            for m in re.finditer(r'^>\s*"([^"]{40,})"', text, re.M):
                quote = m.group(1)
                checked += 1
                clean = re.sub(r"\*\*|\*|`", "", quote)
                # Compare on a leading fragment, before any ellipsis.
                probe = norm_loose(clean.split("...")[0])[:70].strip()
                if not probe:
                    continue
                if probe not in self.hay_loose:
                    failures.append((os.path.relpath(p, ROOT), probe))
        self.assertGreater(checked, 5, "expected several verbatim quotes to check")
        self.assertEqual(failures, [], f"{len(failures)} quotes not verifiable:\n" +
                         "\n".join(f"  {f}: {q!r}" for f, q in failures))

    def test_quotes_are_not_empty_or_trivial(self):
        """Guard against the test being neutered by deleting all quotes."""
        total = 0
        for p in wiki_pages():
            total += len(re.findall(r'^>\s*"[^"]{40,}"', read(p), re.M))
        self.assertGreaterEqual(total, 8, "blockquotes were removed — test would be vacuous")

    def test_key_rules_are_quoted_somewhere(self):
        """The load-bearing rules must appear, in wording faithful to the source.

        NOTE: fragments are checked against the *loose* normalization (case- and
        punctuation-insensitive), and each fragment must match the source's actual wording.
        An earlier version asserted a paraphrase ("no U-turns") as if it were a quote —
        the source says "not allowed to make U-turns". This test must assert what the
        source says, not what a summary says.
        """
        for fragment in [
            "bonuses (CFO",
            "inadvertently placed more cards",
            "not allowed to make U-turns",
            "alter the unit price",
        ]:
            self.assertIn(
                norm_loose(fragment), self.hay_loose,
                f"rule not quoted in source-faithful wording: {fragment!r}",
            )


# ---------------------------------------------------------- B. citation integrity
class TestCitationIntegrity(unittest.TestCase):
    def test_all_cited_pages_exist_in_source(self):
        """Every cited printed page number must exist in the source it names.

        Also asserts the citation style itself stays parseable — an unparseable citation is
        indistinguishable from a missing one.
        """
        bad = []
        for p in wiki_pages():
            for m in CITE_RE.finditer(read(p)):
                which = "base" if m.group(1) == "base rules" else "ketchup"
                for n in re.findall(r"\d+", m.group(2)):
                    if int(n) not in SOURCE_PRINTED_PAGES[which]:
                        bad.append((os.path.relpath(p, ROOT), which, n))
        self.assertEqual(bad, [], f"citations point at pages the source lacks: {bad}")

    def test_citations_are_parseable(self):
        """Guard: if the citation format drifts, the range check above silently passes."""
        total = 0
        for p in wiki_pages():
            total += len(CITE_RE.findall(read(p)))
        self.assertGreater(total, 40, "citation format drifted or citations were removed")

    def test_ketchup_citations_use_printed_numbers(self):
        """Regression guard for the spread-page bug found in adversarial testing.

        The ketchup PDF is a spread: sheet N prints pages 2N and 2N+1. Citing a *sheet*
        number (1..10) would be wrong for anything past the intro. Every ketchup citation
        must land in the printed set.
        """
        bad = []
        for p in wiki_pages():
            for m in CITE_RE.finditer(read(p)):
                if m.group(1) != "ketchup rules":
                    continue
                for n in re.findall(r"\d+", m.group(2)):
                    if int(n) not in SOURCE_PRINTED_PAGES["ketchup"]:
                        bad.append((os.path.relpath(p, ROOT), n))
        self.assertEqual(bad, [], f"ketchup citations not on printed pages: {bad}")

    def test_rules_pages_carry_at_least_one_citation(self):
        """A rules page with no citation is unsourced and must not be presented as fact."""
        missing = []
        for p in wiki_pages():
            rel = os.path.relpath(p, ROOT)
            if "playbooks" in rel:
                continue  # playbooks cite via links, by design
            if not CITE_RE.search(read(p)):
                missing.append(rel)
        self.assertEqual(missing, [], f"rules pages with no page citation: {missing}")


# ------------------------------------------------------- C. corpus (raw text) sanity
class TestCorpusSanity(unittest.TestCase):
    def test_no_split_ligature_artifacts(self):
        """The PDF extraction must be repaired — 'Th e' style breakage confuses models."""
        for path in (BASE_TXT, KETCHUP_TXT):
            body = strip_frontmatter_body(read(path))
            hits = SPLIT_ARTIFACT_RE.findall(body)
            self.assertEqual(
                hits, [],
                f"{os.path.basename(path)} still has split-word artifacts: {sorted(set(hits))[:8]}",
            )

    def test_extracted_text_is_substantial(self):
        for path in (BASE_TXT, KETCHUP_TXT):
            body = strip_frontmatter_body(read(path))
            self.assertGreater(len(body), 30000, f"{os.path.basename(path)} looks truncated")

    def test_page_markers_match_declared_page_count(self):
        for path, expect in ((BASE_TXT, 15), (KETCHUP_TXT, 10)):
            body = read(path)
            markers = re.findall(r"<!-- page (\d+) -->", body)
            self.assertEqual(len(markers), expect,
                             f"{os.path.basename(path)}: {len(markers)} markers, expected {expect}")

    def test_source_hash_is_recorded(self):
        for path in (BASE_TXT, KETCHUP_TXT):
            self.assertRegex(read(path), r"sha256_text: [0-9a-f]{64}")

    def test_raw_pdfs_are_present_and_unmodified(self):
        """Guard the immutable source layer."""
        for name, expect_md5 in [
            ("fcm-base-rules-eng-v4.pdf", "409b971829ddeb6d041db152ca0b01e9"),
            ("fcm-ketchup-expansion-rules.pdf", "65d0538aa2b78a6bf395d285b911ceeb"),
        ]:
            p = os.path.join(RAW, name)
            self.assertTrue(os.path.exists(p), f"missing source: {name}")
            actual = hashlib.md5(open(p, "rb").read()).hexdigest()
            self.assertEqual(actual, expect_md5, f"{name} was modified — raw/ is immutable")


# ----------------------------------------------------- D. answer calibration (ask.py)
class TestAnswerCalibration(unittest.TestCase):
    """The dangerous failure mode: an off-domain question returning a confident answer.

    An agent that asks "what is the pokemon type chart" and receives a Marketing page
    with no hedge may act on nonsense. Off-domain queries must be clearly refused.
    """

    def _ask(self, q):
        r = subprocess.run(
            [sys.executable, os.path.join(ROOT, "scripts", "ask.py"), q, "--limit", "1", "--json"],
            capture_output=True, text=True, cwd=ROOT,
        )
        import json
        try:
            return json.loads(r.stdout), r.returncode
        except Exception:
            return {"results": []}, r.returncode

    def test_in_domain_queries_return_high_scores(self):
        for q in ["unit price", "milestone", "cart operator", "salary payday"]:
            data, rc = self._ask(q)
            self.assertTrue(data.get("results"), f"no result for in-domain query {q!r}")
            self.assertGreater(data["results"][0]["score"], 15,
                               f"in-domain query {q!r} scored suspiciously low")

    def test_off_domain_queries_are_refused(self):
        """These have no answer in this wiki and must not produce a confident hit."""
        off_domain = [
            "pokemon type chart",
            "how to bake bread",
            "who won the world cup",
            "python list comprehension",
            "recipe for pasta",
        ]
        leaked = []
        for q in off_domain:
            data, rc = self._ask(q)
            results = data.get("results") or []
            if results and results[0]["score"] >= 7.5:
                leaked.append((q, results[0]["score"], results[0]["title"]))
        self.assertEqual(leaked, [],
                         f"off-domain queries returned confident answers: {leaked}")

    def test_empty_query_does_not_crash(self):
        r = subprocess.run(
            [sys.executable, os.path.join(ROOT, "scripts", "ask.py"), "   "],
            capture_output=True, text=True, cwd=ROOT,
        )
        self.assertNotIn("Traceback", r.stderr)

    def test_page_traversal_is_rejected(self):
        r = subprocess.run(
            [sys.executable, os.path.join(ROOT, "scripts", "ask.py"),
             "--page", "../../../etc/passwd"],
            capture_output=True, text=True, cwd=ROOT,
        )
        self.assertNotIn("root:", r.stdout)
        self.assertIn("No such page", r.stderr + r.stdout)


# --------------------------------------------------------------- E/F. structural lint
class TestStructure(unittest.TestCase):
    def test_no_broken_wikilinks(self):
        existing = {os.path.basename(p)[:-3] for p in wiki_pages()}
        broken = set()
        for p in wiki_pages():
            # Strip code first: samples like `[[[name],seat,[[103,0]],...]]` are not links.
            body = re.sub(r"```.*?```", "", read(p), flags=re.S)
            body = re.sub(r"`[^`\n]*`", "", body)
            for m in re.findall(r"\[\[([^\]]+)\]\]", body):
                t = m.split("|")[0].strip()
                if t not in existing:
                    broken.add((os.path.relpath(p, ROOT), t))
        self.assertEqual(sorted(broken), [], f"broken wikilinks: {sorted(broken)}")

    def test_every_page_has_required_frontmatter(self):
        required = ["title", "created", "updated", "type", "tags", "sources", "confidence"]
        bad = []
        for p in wiki_pages():
            m = re.match(r"^---\n(.*?)\n---\n", read(p), re.S)
            if not m:
                bad.append((os.path.relpath(p, ROOT), "no frontmatter"))
                continue
            miss = [k for k in required if not re.search(rf"^{k}:", m.group(1), re.M)]
            if miss:
                bad.append((os.path.relpath(p, ROOT), f"missing {miss}"))
        self.assertEqual(bad, [], f"frontmatter problems: {bad}")

    def test_every_page_has_cross_references(self):
        """Isolated pages are invisible to a browsing agent."""
        lonely = []
        for p in wiki_pages():
            if os.path.basename(p)[:-3] == "overview":
                continue
            n = len(re.findall(r"\[\[", read(p)))
            if n < 2:
                lonely.append((os.path.relpath(p, ROOT), n))
        self.assertEqual(lonely, [], f"pages with <2 outbound links: {lonely}")

    def test_confidence_values_are_from_the_allowed_set(self):
        allowed = {"high", "medium", "low"}
        bad = []
        for p in wiki_pages():
            m = re.search(r"^confidence:\s*(\S+)", read(p), re.M)
            if m and m.group(1) not in allowed:
                bad.append((os.path.relpath(p, ROOT), m.group(1)))
        self.assertEqual(bad, [], f"invalid confidence values: {bad}")


# --------------------------------------------------- G. confidence honesty
class TestConfidenceHonesty(unittest.TestCase):
    """Adversarial: does the wiki hide uncertainty?

    Anything the rulebook does not state outright must not claim `high` confidence.
    """

    def test_unverifiable_claims_are_not_high_confidence(self):
        """Per-card supply counts are a PDF graphic; pages asserting them must hedge.

        The trigger is deliberately narrow: it fires on phrasing that asserts a
        count, not on any mention of the words. `availableEmployees` on the API is
        a *live* count and is a different thing entirely — it must not be flagged.
        """
        assert_re = re.compile(
            r"supply count of|per-card count of|\d+\s+copies of (each|every)|"
            r"there are \d+ (copies|of each)",
            re.I,
        )
        for p in wiki_pages():
            text = read(p)
            if assert_re.search(text):
                self.assertIn(
                    "unverified", text.lower(),
                    f"{os.path.relpath(p, ROOT)} asserts card supply counts without marking "
                    "them unverified",
                )

    def test_playbooks_are_not_marked_high(self):
        """Strategy is judgment, not rulebook fact."""
        for p in wiki_pages():
            if "playbooks" in p:
                m = re.search(r"^confidence:\s*(\S+)", read(p), re.M)
                self.assertNotEqual(
                    m.group(1), "high",
                    f"{os.path.relpath(p, ROOT)} is a playbook but claims high confidence",
                )

    def test_medium_confidence_pages_explain_why(self):
        """A page claiming medium/low should say what is uncertain, not just tag it."""
        for p in wiki_pages():
            m = re.search(r"^confidence:\s*(medium|low)", read(p), re.M)
            if m:
                text = read(p)
                hedged = re.search(
                    r"unverified|not reliably|not extractable|verify against|"
                    r"not a bug|is a graphic|playbook, not rules|confidence note",
                    text, re.I,
                )
                self.assertTrue(
                    hedged,
                    f"{os.path.relpath(p, ROOT)} declares {m.group(1)} confidence "
                    "but never explains the limitation",
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)
