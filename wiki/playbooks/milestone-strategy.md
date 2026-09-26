---
title: Milestone Racing Strategy
description: How to prioritize FCM milestones — which to race for, which to ignore, and the timing windows that decide races
created: 2026-09-25
updated: 2026-09-25
type: playbook
tags: [playbook, milestone, economy]
sources: [raw/rules/fcm-base-rules-eng-v4.txt]
confidence: medium
verified_against: base
---

> ⚠️ **This page is a playbook, not rules.** It synthesizes the rulebook's own strategy section
> with the mechanical consequences documented elsewhere in this wiki. `confidence: medium` —
> the rules it rests on are high-confidence, the prioritization is judgment.

The rulebook is blunt about milestones: *"Milestones are very important in the game and it is
vital to plan your strategy around them."* (base rules, p.12) And: *"You will need to achieve
milestones before others do."* (base rules, p.15)

## Why timing is the whole game

Three rules make milestone races sharp (see [[milestones-overview]]):

1. Award is **immediate** on fulfilment.
2. Others may still claim the **same** milestone **within the same turn**.
3. In **phase 7**, any milestone claimed **at least once** is **gone forever**.

So the race window is exactly **one turn wide**, and being one action late means permanent loss.

## Tier 1 — structural, game-shaping

These change your whole engine. Racing is usually correct.

| Milestone | Why it matters |
|---|---|
| **First billboard placed** | Two effects at once: **marketeteers stop costing salary** *and* your campaigns become **eternal**. This removes an entire recurring cost while locking in demand for the rest of the game. |
| **First to lower prices** | Permanent −$1 price. Wins contested houses; compounds with every future turn. **Irreversible** — plan around it. |
| **First errand boy played** | Every buyer gets +1 per source. Scales with your entire drink operation. |
| **First to have $100** | CEO becomes a CFO (+50% all cash) **and** you must fire any real CFO. Huge if held long. |
| **First to train someone** | $15 flat salary discount, every payday, forever. |

## Tier 2 — strong and cheap

| Milestone | Why |
|---|---|
| **First cart operator played** | +1 range to all buyers. Cheap if you were buying a cart operator anyway. |
| **First burger / pizza / drink marketed** | +$5 per unit sold, forever. The **drink** version covers **all** drinks — the broadest of the three. |
| **First waitress played** | $3 → $5 per waitress, plus tie-break dominance. |
| **First burger / pizza produced** | Free cook immediately. Note: **unusable that turn** (arrives after training) and **costs salary**. |
| **First to hire three people in one turn** | 2 free management trainees. Only if you were hiring 3+ anyway. |
| **First to throw away drink/food** | Freezer (10 items). Mostly relevant in long games where you over-produce. |

## Tier 3 — situational

| Milestone | When it's worth it |
|---|---|
| **First to have $20** | Pure information (see reserve cards). Valuable early for planning game length. |
| **First airplane campaign** | +2 open slots **for turn order only** — those slots hold no employees. Strong if turn order is contested, since it lets you choose position first. |
| **First radio campaign** | Double marketing (2 goods per house). Expensive to reach (needs Brand Director tier). |
| **First to pay $20+ in salaries** | Lets multiple trainers target one person. Requires *actually paying* $20 — you cannot use discounts, and you must use all available discounts. |

## Key mechanical traps in racing

### "Played in your structure" ≠ hired

Errand boy, waitress and cart operator milestones require the card **in your structure**. A card
hired this turn sits **on the beach** and **does not trigger**. To race these you must have hired
it in a **previous** turn so it can be chosen at restructuring. (base rules, pp.12-14)

### Milestones awarded mid-working-day are already too late to train

"First burger produced" / "First pizza produced" award a **free cook** during the **production**
sub-phase. Training happens **before** production — so the free cook **cannot be trained this
turn**. (base rules, p.12)

### You may be forced into a milestone's downside

Milestone benefits must be applied **even if not helpful**. The clearest case: **"First to lower
prices"** permanently lowers your price and **cannot be undone**. If you trigger it accidentally
via a discount manager, you are committed. (base rules, pp.12-13)

### The $20-salary milestone can be manipulated

Since you must use all discounts, you can legally **consume** a recruiting manager's or HR
director's unused hiring capacity earlier in the working day so her discount no longer exists at
payday — raising the salaries you actually pay. The rulebook explicitly acknowledges this.
See [[salary-and-payday]].

### "First to have $100" forces you to fire your CFO

If you already hold a CFO card, you **must fire it in phase 5 of that turn**, and you **may not
train a CFO** afterwards. And the CEO-as-CFO ability only starts **next turn**. So there is a
one-turn gap where you have neither. (base rules, p.13)

## A practical race heuristic

1. **Turn 1-2:** decide your engine. Price-war, drink-volume, or marketing-lock?
2. **Identify which Tier-1 milestones that engine needs**, and check whether each is still
   available (claimed last turn = gone).
3. **Compute whether you can trigger it this turn**, remembering the structure-vs-beach and
   training-timing traps.
4. **If yes, spend the actions.** A Tier-1 milestone is usually worth more than a turn of
   optimal-but-unremarkable moves.
5. **If a rival will get it this turn too**, remember they can share it — the loss only occurs if
   they claim it and it clears at phase 7 without you.

## Related

- [[milestones-overview]] — the authoritative trigger/effect table
- [[turn-structure-and-phases]] — why timing windows are one turn wide
- [[salary-and-payday]] — salary discounts and the $20 milestone
- [[marketing-campaigns]] — the eternal-campaign effect
- [[dinnertime-sales-resolution]] — how milestone bonuses enter income (but not price)
