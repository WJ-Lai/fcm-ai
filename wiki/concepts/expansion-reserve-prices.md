---
title: Expansion — Reserve Prices
description: The Ketchup Reserve Prices module — replacing the base reserve-card effect with a new base unit price
created: 2026-09-25
updated: 2026-09-25
type: concept
tags: [expansion, economy, setup, sales]
sources: [raw/rules/fcm-ketchup-expansion-rules.txt]
confidence: high
verified_against: ketchup
---

> 🚨 **This module directly contradicts the base game.** If it is in play,
> [[bank-and-reserve-cards]]' slot-determination rule does **not** apply.

**Components:** 3 new bank reserve cards per player. **The bank reserve cards from the base game
are not used.** (ketchup rules, p.16)

## Why the module exists

> "We wanted to experiment with other effects on the bank reserve cards, specifically because given
> the fast expansion seen in many games, the current bank reserve card mechanism sometimes **only has
> a small impact on the duration of the game**." (ketchup rules, p.16)

## The rules (verbatim structure)

- At the start of the game, determine bank reserve cards using the **alternate set**.
- **When the bank breaks for the first time, add $200 per player to the bank.**
- **This may change the base price for the rest of the game.**
  - Check if one type of bank reserve card occurs **more than any other**. If so, **take this price
    as the new base unit price.**
  - **Tie-break:** **$20 wins over $10 and $5**; **$5 wins over $10**.
- **From now on, use this new base price during dinnertime.**

(ketchup rules, p.16)

## Comparison with the base game

| | Base game | Reserve Prices module |
|---|---|---|
| Money added at first break | **Sum** of the chosen reserve cards | **$200 per player** (flat) |
| Effect on CEO slots | **Most common** slot number (2/3/4) sets slots | ⚠️ **None stated** — slots unchanged |
| Effect on price | None | **New base unit price** for the rest of the game |

> ⚠️ **Two consequences an agent must internalise:**
> 1. The base-game rule where reserve cards **resize every company's structure** is replaced — with
>    this module, the reserve cards govern **price** instead.
> 2. The **base unit price itself changes mid-game** (from $10 to $20 or $5), which shifts every
>    dinnertime comparison in [[dinnertime-sales-resolution]]. A price war's whole calculus changes.

## The tie-break rule, restated

The tie-break is **not** "highest wins" as in the base game's slot rule. Here it is a specific
preference order:

```
$20  beats  $10  and  $5
$5   beats  $10
```

So:
- $20 vs $10 → **$20**
- $20 vs $5 → **$20**
- $5 vs $10 → **$5**
- $20 vs $5 vs $10 (all tied) → **$20**

> 💡 Note the asymmetry: **$5 beats $10**. A naive "highest wins" assumption would pick $10 and be
> wrong. This is exactly the kind of rule a model misremembers.

## Interaction with other modules

Recommended pairings including Reserve prices:
- **First mover** = Hard choices + Ketchup + Movie stars + Lobbyists + Reserve prices
- **Overtime** = Night shift managers + Mass marketeers + Rural marketeers + New districts + Noodles
  + Reserve price

(ketchup rules, p.6)

## Related

- [[expansion-overview]] — module list; this is one of the two base-contradicting modules
- [[bank-and-reserve-cards]] — the base rule this module replaces
- [[dinnertime-sales-resolution]] — where the new base price takes effect
- [[price-managers-and-pricing]] — how price is otherwise computed
