---
title: Wiki Schema
description: Conventions, structure rules and tag taxonomy the FCM knowledge base obeys
created: 2026-09-25
updated: 2026-09-25
type: reference
tags: [reference]
sources: []
confidence: high
---

# Wiki Schema

> This file constrains how the FCM knowledge base is built. Read it before creating
> or editing any wiki page. It is the contract between the human curator and the agent.

## Domain

**Food Chain Magnate (FCM) rules, as needed by an AI agent that plays the game.**

Scope — in:
- Official base-game rules (setup, phases, turn structure, sales, payday, milestones)
- Official expansions: Ketchup / "Saucy" expansion (coffee, noodles, kimchi, sushi, New York)
- Employee cards: hiring cost, salary obligation, abilities, training upgrades
- Milestone cards: trigger condition + effect, and when each becomes unclaimable
- Structural game concepts the agent needs to reason about: slots, price, demand,
  distance/road rules, bank, reserve cards

Scope — out (belongs in `fcm-ai` code, not this wiki):
- Strategy heuristics and opening theory → those live in playbooks, not the rulebook layer
- Server/implementation details of the OBG Agent API
- House rules and variants, unless labelled `house-rule`

**Ground rule: every rules claim must trace to a source in `raw/`.** If it doesn't,
set `confidence: low` and mark it as unsourced. Do not let a guess harden into fact —
an agent playing the game will be confidently wrong and lose.

## Conventions

- File names: lowercase, hyphens, no spaces (`milestone-triggers.md`)
- Every page starts with YAML frontmatter (see below)
- Use `[[wikilinks]]` — minimum 2 outbound links per page
- Bump `updated` (and `date`) when you revise a page
- Every new page must be added to `index.md` under the correct section
- Every action must be appended to `log.md`
- **Citation format for rules claims:** inline, pointing at the raw text with a page marker:
  `(base rules, p.11)` / `(ketchup rules, p.4)`. Page markers exist in the raw files as
  `<!-- page N -->`.
- **Quote exactly when the wording is load-bearing.** FCM rules are precise about
  ordering and edge cases ("including the tile of your restaurant", "no U-turns").
  Paraphrase is where bugs get introduced.

## Frontmatter

```yaml
---
title: Page Title
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: concept | entity | reference | playbook | query | comparison
tags: [from taxonomy below]
sources: [raw/rules/fcm-base-rules-eng-v4.txt]
confidence: high | medium | low
verified_against: base | ketchup | both      # which rulebook(s) the claims come from
---
```

`confidence` guidance for this domain:
- `high` — stated verbatim in an official rulebook and quoted/paraphrased faithfully
- `medium` — derived by combining 2+ rulebook statements, or an implementation
  interpretation the rulebook does not spell out
- `low` — inferred, unverified, or sourced only from play experience

## Tag Taxonomy

Rules-content:
- `setup` — board setup, restaurant placement, reserve cards, turn order
- `phase` — one of the 8 turn phases
- `turn-structure` — Slots/order-of-play, what happens when
- `employee` — staff cards, abilities, training
- `milestone` — milestone triggers and effects
- `marketing` — campaigns, billboards, mailboxes, airplanes, radio
- `production` — food/drink acquisition, stock, kitchen staff
- `sales` — dinnertime resolution, demand, price, distance
- `economy` — salary, payday, firing, bank, discounts
- `expansion` — ketchup/Saucy content

Meta:
- `reference` — tables, lookups, quick-reference
- `playbook` — how to use the rules when deciding a move
- `comparison` — side-by-side analyses
- `open-question` — known ambiguity or unverified item
- `house-rule` — not official
- `cards` — full card-text listings (employees, milestones)
- `lookup` — pages whose primary job is fast mid-game retrieval

Rule: every tag must appear above. Add it here first, then use it.

## Page Thresholds

- **Create a page** when a rule area is central to play (all 8 phases, all milestones,
  all employees, sales resolution, economy)
- **Add to existing page** when a source mentions something already covered
- **Don't create a page** for passing mentions
- **Split a page** when it exceeds ~200 lines
- Prefer *complete and precise* over *brief* — this is a lookup layer for an agent,
  not a human tutorial. Completeness of trigger conditions and edge cases is the point.

## Page Types

### `references/` — Lookup tables (the agent's primary interface)
Dense, scannable, complete. Milestone list, employee list, phase checklist, price table.
Format as tables where possible. These pages are what an agent reads mid-game when it
needs a specific fact in a hurry.

### `concepts/` — Rule mechanics explained
How sales resolution works, how salary discounts stack, how training upgrades change a
card. Include the *ordering* of steps and the edge cases.

### `entities/` — Named things
Specific employees, specific milestones, expansions, the bank. One page per notable card
**only if** it needs more depth than the lookup table row.

### `playbooks/` — Rules-as-decision-procedure
"How to choose where to place a restaurant", "which milestone to race". These synthesize
rules into procedure. Mark `confidence` honestly — this is where judgment enters.

## Update Policy

1. Rulebook text is authoritative. If the wiki disagrees with `raw/`, the wiki is wrong.
2. If base rules and ketchup rules conflict, ketchup wins **when the expansion is enabled**.
   Note both with `verified_against`.
3. Genuinely ambiguous rules → create an `open-question` page. Do not silently pick a side.
4. Never edit `raw/`. Corrections go in wiki pages.
