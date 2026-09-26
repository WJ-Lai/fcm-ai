# Wiki Log

> Chronological record of all wiki actions. Append-only.
> Format: `## [YYYY-MM-DD] action | subject`
> Actions: ingest, update, query, lint, create, archive, delete

## [2026-09-25] create | Wiki initialized
- Domain: Food Chain Magnate rules, compiled for an AI agent that plays the game
- Structure created: `SCHEMA.md`, `index.md`, `log.md`, `wiki/overview.md`

## [2026-09-25] ingest | FCM base rules v4 (English, 15 pages)
- Source staged: `raw/rules/fcm-base-rules-eng-v4.pdf` (md5 `409b971829ddeb6d041db152ca0b01e9`)
- Text extracted: `raw/rules/fcm-base-rules-eng-v4.txt` (sha256 `5514fef8b989…`, 46 566 chars)
- Pages created (17):
  - `concepts/turn-structure-and-phases.md`
  - `concepts/dinnertime-sales-resolution.md`
  - `concepts/salary-and-payday.md`
  - `concepts/bank-and-reserve-cards.md`
  - `concepts/company-structure-and-slots.md`
  - `concepts/marketing-campaigns.md`
  - `concepts/production-and-food-stock.md`
  - `concepts/price-managers-and-pricing.md`
  - `concepts/restaurant-placement.md`
  - `concepts/houses-gardens-and-demand.md`
  - `concepts/buyers-and-drink-routes.md`
  - `concepts/waitress-mechanics.md`
  - `references/milestones-overview.md`
  - `references/employees-overview.md`
  - `references/working-day-actions.md`
  - `references/setup-and-map-generation.md`
  - `playbooks/milestone-strategy.md`
- Notes: every rules claim carries a `(base rules, p.N)` citation into the raw text.
  Per-card supply counts are a PDF graphic and are marked `unverified` rather than guessed.

## [2026-09-25] ingest | FCM Ketchup expansion rules (10 PDF sheets / printed pp.3-17)
- Source staged: `raw/rules/fcm-ketchup-expansion-rules.pdf` (md5 `65d0538aa2b78a6bf395d285b911ceeb`)
- Text extracted: `raw/rules/fcm-ketchup-expansion-rules.txt` (sha256 `86a5e26b2fa0…`, 44 164 chars)
- Pages created (6):
  - `references/expansion-overview.md`
  - `references/expansion-new-milestones.md`
  - `concepts/expansion-coffee.md`
  - `concepts/expansion-noodles-and-kimchi.md`
  - `concepts/expansion-marketing-modules.md`
  - `concepts/expansion-reserve-prices.md`
- Notes: the expansion is **modular**; two modules override base rules, so both the wiki and the
  overview now lead with that warning.
- Honest gaps recorded on-page rather than guessed: **Kimchi, Sushi, rural marketeers, night shift
  managers, new districts** have their behaviour mainly in **card text**, not rulebook prose.
- Source note: expansion PDF page 10 is empty (marker only) — recorded so a future audit does not
  read it as extraction data loss.

## [2026-09-25] fix | PDF text-layer repair + adversarial test suite
- **Defect found:** the source PDFs' text layers split ligatures ("Th e", "Aft er", "fi t",
  "diff erent"). This both risks a model misreading rules and broke verbatim quote verification.
- **Fix:** added `scripts/extract_rules.py` which repairs the known artifacts; both raw texts
  regenerated, 0 residual artifacts. Extraction is now reproducible rather than a one-off.
- **Added:** `tests/test_content_integrity.py` — adversarial suite (quote fidelity, citation
  ranges, corpus sanity, answer calibration, confidence honesty). 24 tests.
- **Defect found by the suite:** ketchup citations use *printed* page numbers while the raw
  markers use PDF *sheet* indices (the PDF is a spread: sheet 7 prints pages 12 and 13). The
  citation check was comparing incommensurable scales. Fixed the checker and added a regression
  test; the wiki's citations themselves were correct.
- **Defect found by the suite:** `ask.py` returned a confident-looking match for off-domain
  queries ("pokemon type chart" matched on the incidental word "type"). Added a confidence
  threshold, generic-term filtering, and explicit refusal messaging. Measured separation:
  in-domain 23-60+, off-domain 0-5, threshold 10.

## [2026-09-25] create | Agent integration documentation
- `docs/agent-integration.md` — the four ways an agent can call this wiki (direct file reads,
  CLI tool, MCP server, system-prompt inlining) with honest trade-offs.
- Clarifies a naming ambiguity: this repo implements the LLM Wiki **pattern** and follows the
  `lucasastorian/llmwiki` conventions, but does **not** run the llmwiki **application**.

## [2026-09-25] lint | post-expansion check
- Broken wikilinks: **0**
- Orphan pages: **0**
- Pages: **24** (23 wiki pages + overview)
- Tests: **45 passed** (22 client + 23 content integrity)
- Known issues carried forward: per-card supply counts unverified; five expansion modules flagged
  as card-text-dependent.
