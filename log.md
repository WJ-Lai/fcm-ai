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

## [2026-09-25] ingest | FCM Ketchup expansion rules (10 pages) — STAGED ONLY
- Source staged: `raw/rules/fcm-ketchup-expansion-rules.pdf` (md5 `65d0538aa2b78a6bf395d285b911ceeb`)
- Text extracted: `raw/rules/fcm-ketchup-expansion-rules.txt` (sha256 `86a5e26b2fa0…`, 44 164 chars)
- **No wiki pages created yet** — expansion content is pending a second ingest pass.

## [2026-09-25] lint | post-build check
- Broken wikilinks: **0**
- Orphan pages: **0** (minimum outbound links per page = 4)
- Pages: **18** (17 content + 1 overview/index pairing)
- Known issues carried forward: per-card supply counts unverified; Ketchup pages missing
