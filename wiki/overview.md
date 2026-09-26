---
title: Food Chain Magnate Rules Knowledge Base
description: Hub page for the FCM rulebook compiled into an agent-queryable knowledge base
created: 2026-09-25
updated: 2026-09-25
type: concept
tags: [reference, turn-structure, phase]
sources: [raw/rules/fcm-base-rules-eng-v4.txt, raw/rules/fcm-ketchup-expansion-rules.pdf]
confidence: high
verified_against: base
---

This knowledge base compiles the **official Food Chain Magnate rulebook** into interlinked
markdown pages, built for one specific consumer: **an AI agent that plays FCM and needs to look
up a rule mid-game without guessing.**

## Why this exists

A general-purpose LLM asked "how is unit price computed?" will produce a plausible answer that
is often subtly wrong — FCM is unusually unforgiving about ordering and edge cases, and the
rulebook itself says so: *"Food Chain Magnate is a highly unforgiving game. If you make a
mistake, it can be very hard or even impossible to get back on track."* (base rules, p.14)

Every page here is built to be **cited and checkable**: claims carry `(base rules, p.N)` markers
pointing into `raw/rules/`, and pages state their `confidence` honestly rather than flattening
uncertainty into false authority.

## Scope

**In:** official base-game rules, employee/milestone cards, setup, all 8 phases, sales and
economy math, and the Ketchup expansion (raw source staged; pages pending).

**Out:** strategy beyond rules-as-procedure, and the OBG server/Agent-API implementation
details — those belong to the `fcm-ai` codebase, not the rulebook layer.

## Key findings

These are the rules most often misremembered. Each is expanded on its linked page.

> 🚨 **1. Bonuses do not affect price.** CFO, "first X marketed", etc. change **income**, not
> **unit price**. Inhabitants compare **price + distance** only, so a bonus never wins you a
> house. And garden doubling applies to **price, not bonuses**. → [[dinnertime-sales-resolution]]

> 🚨 **2. Milestone windows are exactly one turn wide, then permanent.** Award is immediate;
> others may share it **the same turn**; in **phase 7** any claimed-at-least-once milestone is
> **gone forever**. Being one action late is permanent loss. → [[milestones-overview]]

> 🚨 **3. "Played in your structure" is not the same as "hired".** Several milestones (errand
> boy, waitress, cart operator) require the card **in the structure**. A card hired this turn is
> **on the beach** and does not trigger. → [[employees-overview]]

> 🚨 **4. A card hired this turn cannot act this turn.** It lands on the beach. Likewise the free
> cook from "first produced" arrives during production, *after* training — so it cannot be trained
> that turn. → [[production-and-food-stock]]

> 🚨 **5. Overfilling your structure is catastrophic, not cosmetic.** Too many cards → **all
> non-CEO cards go to the beach** and you play the turn with the **CEO alone**. → [[company-structure-and-slots]]

> 🚨 **6. Full structure = you choose turn order last.** Priority goes to **most open slots**, so
> deliberately leaving slots empty is sometimes correct. The airplane milestone grants +2 priority
> slots that hold no employees. → [[company-structure-and-slots]]

> 🚨 **7. Local vs regional manager differ on timing.** Local manager's new restaurant is
> **"COMING SOON" — opens end of turn**. Regional manager's is **immediate** and can also **move
> and rotate** existing restaurants. Both grant drive-in/all-corner entrances while active.
> → [[restaurant-placement]]

## How to use this

| You want to… | Read |
|---|---|
| Look up a milestone's exact trigger/effect | [[milestones-overview]] |
| Know what a card does / whether it costs salary | [[employees-overview]] |
| Know what actions are legal and in what order | [[working-day-actions]] |
| Compute what a house will pay | [[dinnertime-sales-resolution]] |
| Work out who wins a contested house | [[dinnertime-sales-resolution]] + [[waitress-mechanics]] |
| Decide which milestone to race for | [[milestone-strategy]] |
| Understand the turn's shape | [[turn-structure-and-phases]] |

## Provenance

- Base rules: *Food Chain Magnate* rules v4 (English), staged at
  `raw/rules/fcm-base-rules-eng-v4.pdf`, extracted to
  `raw/rules/fcm-base-rules-eng-v4.txt` (sha256 in frontmatter).
- Expansion: *Ketchup* expansion rules, staged at `raw/rules/fcm-ketchup-expansion-rules.pdf`.
- `raw/` is immutable — never edited. Corrections go into wiki pages.

## Open questions

See the "Known gaps" section of `index.md` (repo root). Notable: per-card supply counts are a PDF graphic and
are **not** reliably text-extractable; they are marked unverified rather than guessed.
