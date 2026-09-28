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

## [2026-09-26] add | authoritative card database (task A)
- **New data layer:** `raw/cards-authoritative.json` — all 94 cards (54 employees, 40
  milestones) with **exact text + Chinese translation**, extracted programmatically from the
  game engine's own i18n locale blocks in `FCMvuedist/main.js`. This replaces the previous
  "card text unavailable without scans" gap. Not OCR; the strings the live game renders.
- **New scripts:**
  - `scripts/extract_cards.py` — regenerates the dataset; self-verifies (dup keys, missing
    fields) and fails loudly rather than emitting a subtly bad file. Idempotent.
  - `scripts/card.py` — offline card lookup by English or Chinese name, with `--expansion`,
    `--milestones`, `--employees`, `--search` modes.
  - `scripts/verify_sources.py` — audits every card's provenance against both rulebooks.
- **New wiki pages:** `references/employee-cards-full.md`, `references/milestone-cards-full.md`
  (both indexed, cited, and carrying the 5 most-misread-card warnings).
- **Defect found and fixed by the new suite:** `card.py` answered off-domain queries with a
  confident irrelevant card ("pokemon type chart" matched on the generic word "type").
  Added `GENERIC` word filtering + explicit refusal with exit code 1.
- **Substantive provenance finding:** 15 milestones ship in the engine's **base** set but are
  documented **only** in the Ketchup rulebook's "New Milestones" chapter (under the "used"
  wording). `set` and `documented_in` are therefore tracked as separate fields — a model
  citing the base rulebook for those cards would be wrong.

## [2026-09-26] classify | engine-only cards discovered
- 6 cards exist solely in the OBG engine, in **neither** official rulebook and **not** in the
  engine's own `modules:` list: Dumpling Cook/Chef, Hawker Marketeer, Delivery Driver,
  Jazz Musician, First dumpling sold.
- Labelled `set: obg-custom`, `documented_in: none`, and the lookup tool prints
  "OBG house variant — NOT in the official rulebooks". A regression test asserts they stay
  absent from the official rulebooks.

## [2026-09-26] lint | post-card-database check
- Broken wikilinks: **0** · Orphan pages: **0** · Pages: **26**
- Tests: **71 passed** (23 content integrity + 26 card layer + 22 client)
- `verify_sources.py`: OK — 94 cards (base 66 / expansion 22 / obg-custom 6;
  documented_in base 51 / ketchup 37 / none 6)

## [2026-09-26] add | rulebook ↔ live-API wire mapping (requested by Vincent)
Vincent's concern: the rulebook describes a *physical* game, the MCP/HTTP API returns
*online* state, so concepts may not line up (specifically: what is a "drink point", and
which field is a player's money?). Audited both directions against a live response.

- **New pages:** `references/wire-format-mapping.md` (field-by-field, both directions) and
  `references/wire-format-gap-analysis.md` (the asymmetry audit).
- **New data:** `raw/wire-format.json` — recorded expectations.
- **New scripts:** `probe_api.py` (read-only live probe, verifies the mapping; needs token
  via env, never embedded), `check_wire_drift.py` (offline: page ↔ JSON ↔ engine source).
- **New tests:** `tests/test_wire_format.py` (18 assertions), incl. a negative test that
  deliberately corrupts a good code to prove the drift guard actually fires.

### Answers to the two specific questions
1. **"饮料点" (a drink point)** → goods codes in `players[i].resources` / `board.needs`:
   `0=lemonade, 1=coke, 2=beer, 3=pizza, 4=burger`. Note drinks are 0–2 and foods 3–4 —
   the rulebook's food/drink split is NOT a numeric range. Rulebook "drink" = exactly
   `{0,1,2}`. ⚡ `catalog.goods` omits the expansion codes 5–9
   (coffee/noodles/sushi/kimchi/dumpling), so those must be hardcoded.
2. **Player's money** → `players[i].money` (whole dollars); bank is `state.bank` +
   `state.bankBroken`. **There is no "income this round" field** — dinnertime income is
   only visible via `history` after resolution.

### Gaps found (both directions)
- API lacks: tile legend, unit price, salary math, distance, "played vs used", tie-breaks.
- Rulebook lacks: version/ruleset hash, subphase, history, chat, live supply counts, module flags.
- ⚡ Dinnertime and other automatic phases have **no agent action endpoint** (MCP README).
- ⚡ `snapshot.gameData` is base64+gzip of an **unnamed positional array** — do not parse.
- ⚡ `state.chat` is server-declared `untrustedTextFields` — a prompt-injection surface.
- ⚡ `state.turnOrder` is the seats *yet to act*, not the rulebook's turn-order track.

### Tooling defects found and fixed
- `lint.py` and `test_content_integrity.py` scanned fenced/inline code for wikilinks, so a
  JSON sample like `[[103,0]]` produced phantom broken links. Both now strip code first.
- A confidence-honesty test fired on the phrase "supply counts" even when describing the
  API's *live* `availableEmployees`. Narrowed the trigger to assertions of a count.

Verification: **89 tests pass**, lint clean (28 pages), `verify_sources.py` OK,
`check_wire_drift.py` OK, live probe OK against game 66.

## [2026-09-27] design | strategy-capable FCM AI architecture

- Added `docs/fcm-ai-architecture.md` after auditing the live Agent API/MCP, minimal Python
  client, rules wiki, strategy playbook and official built-in AI.
- Core finding: the current integration is sufficient for safe legal control but not for strong
  play. It lacks a policy, persistent strategy memory, semantic decision features, complete-plan
  candidate generation, consequence simulation and an evaluation league.
- Recommended a hybrid architecture: official engine for legality/transitions, deterministic
  calculators and candidate plans, shallow search/value evaluation, optional LLM high-level
  selection, then imitation/self-play only after an offline simulator exists.
- Recorded explicit observation/action/reward formulations and why raw PPO is not the first step
  for a 2–6 player, general-sum game with simultaneous hidden choices.
- Verification: **95 tests passed**, wiki lint clean, card provenance audit clean and wire-format
  drift check clean.

## [2026-09-27] build | policy contracts, engine fixtures and architecture hardening

- Added strict versioned validators for `DecisionView`, trajectories and terminal results. Unknown
  fields, credential-like keys, mismatched rulesets and invalid candidate selections fail closed.
- Captured 35 credential-free snapshots spanning every base-game phase/subphase and verify each by
  loading the official JavaScript engine. Dinner projection is compared with a real official
  `end_turn` transition from the same immutable source state.
- Moved the cloneable offline environment ahead of benchmark/search work; specified bounded
  phase-local candidate generation, observed/derived/believed provenance, human-game ingestion,
  measurable LLM A/B value and potential-difference reward-shaping gates.
- Removed the unused Python map-engine port because it duplicated official rules and could drift.
- Audited game 69: confirmed the direct-hire fairness bug and public/internal end-turn mismatch;
  fixed both in the OBG branch with adversarial tests and a 276-command mixed-game acceptance run.
- Verification: **104 Python tests**, 83 MCP tests, 31 Vue tests and 42 targeted Django tests pass;
  35 fixtures pass official-engine and dinner-transition parity.

## [2026-09-27] build | cloneable offline environment and first weak benchmark

- Added a database-free `reset/observe/legal/step/clone` environment around the official
  JavaScript engine. It preserves per-seat observations, aggregates simultaneous moves and returns
  canonical snapshots without opening HTTP or WebSocket connections. A process-wide FIFO guards
  the official engine's global Pinia/browser state; parallel rollouts must use worker processes.
- Added deterministic `safe-first-legal-v1`, prioritizing productive workers over idle managers,
  plus a JSON benchmark runner with completion, command, phase, bank, latency, action-count and
  final-company metrics.
- The benchmark exposed two control-path defects: explicit Agent restructuring was not confirming
  the normal human warning, and last-player-standing Game Over was not persisted. Both were fixed
  in the OBG integration branch without adding a second rule implementation.
- Fixed seeds now reach Game Over in 197 commands (2 players) and 606 commands (3 players). This is
  simulator/control validation, not evidence that the weak baseline plays strategically.

## [2026-09-27] build | seeded random baseline and skipped-seat hardening

- Added reproducible `random-legal-v1`. It samples only advertised legal values while retaining
  the minimum productive structure needed to create demand, produce matching goods and terminate
  a game; this distinguishes a benchmark opponent from an unconstrained liveness fuzzer.
- Extended the benchmark JSON with policy selection, completion/violation totals, mean latency and
  mean terminal rank per seat. The first two fixed two-player random seeds reached Game Over in
  185 and 178 commands with zero rejected actions.
- The randomized trajectory found inherited empty-envelope crashes when bankrupt or automatic
  zero-salary seats were removed from simultaneous turn order. The OBG client now exempts and
  ignores only seats that its authoritative controller already marks skippable.
- Remaining P1.4 work: adapt the state-mutating 1v1 built-in bot without conflating bot-seat rules
  with external Agent seats, then run full multi-seed/all-seat leagues.

## [2026-09-27] build | isolated official built-in AI benchmark adapter

- Wrapped the legacy state-mutating `FcmAI` controller in a dedicated offline-only transition.
  Normal offline Agent steps suppress its implicit browser auto-run; the online browser still uses
  its existing default behavior. The adapter accepts only the literal `FcmAI` seat, base-game
  snapshots and an explicit random seed.
- Added an independent `official-builtin-v1` source fingerprint for `FCM_AI.js`. Benchmark reports
  now identify both ruleset and opponent-policy code, and the runtime restores `Math.random` plus
  all process-global transport flags after every attempt.
- A paired two-map/four-game smoke league completed 4/4 with zero rule violations. Seat 0 won all
  four games, so the run validates the adapter and exposes material seat bias; it is deliberately
  not presented as statistical evidence that either weak policy is stronger.
- Verification at this checkpoint: targeted contract/runtime tests 14/14, full MCP suite 94/94,
  full Vue suite 31/31, deterministic single-seed replay, and production Vue build.

## [2026-09-27] build | consented human trajectory safety gate

- Added strict `fcm.human-import.v1` and `fcm.human-review.v1` records around the existing
  trajectory contract. Import requires one-seat provenance, explicit research/training consent and
  a declared license; approval recomputes the content hash and requires three explicit reviewer
  attestations.
- Adversarial checks reject cross-seat records, opponent beliefs, temporary own pending choices,
  action types absent from the seat's legal view, credentials, raw blobs and free-form prose.
  Output paths are create-only so a review stage cannot silently replace an earlier artifact.
- This implements the safety/review boundary, not live human capture. A trusted seat-scoped OBG UI
  exporter and the first consented sample remain before P1.5 is complete.

## [2026-09-27] build | authoritative company and economic DecisionView

- Added `state.decisionSupport.economyPlayers` to the official-engine adapter. It delegates free
  slots, salary liabilities, unit price/discount, recruiting, training, producer, marketer and
  restaurant-building capacity to existing official functions instead of copying card rules.
- Decoded the persisted company layout into CEO slots and the official shared subordinate-slot
  pool. No manager-parent relationship is invented because the source model does not persist one.
- Added fail-closed unit tests and expanded all 35 base phase fixtures to require valid economic
  projections. MCP tests pass 96/96 and the fixture parity suite remains green.

## [2026-09-28] build | public milestone and market-threat DecisionView

- Added `state.decisionSupport.strategicThreats`. Milestones distinguish unclaimed open windows,
  same-turn shared windows and closed races from the public official store.
- Added sorted per-house fulfillment tiers and eligible suppliers through official demand priority,
  reachability, milestone-distance, inventory, price and tie-break inputs. The view never reads
  hidden simultaneous choices and does not predict a winner.
- Made the inventory boundary explicit: houses are evaluated independently from the current public
  position; exact sequential dinner consumption remains owned by isolated `projectDinner`.
- Added delegation, non-mutation and fail-closed tests and extended all 35 phase fixtures to require
  the new view.

## [2026-09-28] benchmark | 10-seed paired-seat built-in AI pilot

- Ran 20 complete base games, swapping `official-builtin-v1` and `safe-first-legal-v1` across both
  seats for every one of 10 seeds. All 20 reached Game Over with zero rule violations.
- Official built-in AI placed first 13/20 (65%; Wilson 95% CI 43.3–81.9%) and safe-first placed
  first 7/20 (35%; 18.1–56.7%). Seat 0 also placed first 13/20, so policy comparisons must remain
  paired by seed and seat.
- Added Wilson first-place/completion intervals to benchmark JSON and adversarial tests for empty,
  extreme and invalid samples. The intervals overlap at this sample size; no strength claim is
  promoted until the planned 100-game league.

## [2026-09-28] benchmark | 50-seed/100-game promotion league

- Added `--seed-offset` so paired-seat leagues can be partitioned into disjoint reproducible
  shards without repeating maps or policy RNG seeds.
- Completed seeds 0–49 with both seat assignments: 100/100 games reached Game Over and produced
  zero engine/action violations under the same built-in policy hash.
- Official built-in AI placed first 68/100 (68%; Wilson 95% CI 58.3–76.3%) versus safe-first
  32/100 (32%; 23.7–41.7%). Mean money was $294.33 versus $181.33.
- Seat 0 placed first 54/100 (54%; 44.3–63.4%) versus seat 1 46/100 (46%; 36.6–55.7%); those
  confidence intervals overlap strongly. The earlier four-game all-seat-0 result was small-sample
  noise, while the built-in policy advantage survives paired seat swapping.
- P1.4 is closed: random, first-legal and the official built-in adapter are reproducible; the
  harness reports completion, violations, rank, money, latency, seat bias and confidence bounds.

## [2026-09-28] capture | two-game public replay gate

- Added a CDP-based collector that asks the current OBG client to rebuild ended public games through
  its official Replay path. Passwords and cookies never enter the command or output.
- Added strict local capture validation: completed games only, array-format map metadata, standard
  base-rule filtering, one state per event, terminal history code 26, content digests and create-only
  staged output. Player names and timestamps are removed; embedded history and transient runtime
  context are cleared before storage.
- The first old candidate, game 6113, exposed an actual version boundary: its legacy scalar
  `startingMap` leaves the current Replay store empty. The collector now rejects this format instead
  of coercing it.
- Current-format base games 35807 (2 players, 177 states) and 35732 (3 players, 272 states) were
  captured successfully. A fresh second browser capture produced identical per-game state digests.
  Both remain quarantined pending event-to-action mapping and pinned local-engine re-execution; the
  10-game gate is intentionally not started.
