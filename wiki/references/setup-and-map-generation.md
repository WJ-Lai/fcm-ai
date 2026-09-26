---
title: Setup and Map Generation
description: FCM setup — player count effects, map size, tiles used, billboards removed, and the opening sequence
created: 2026-09-25
updated: 2026-09-25
type: reference
tags: [setup, reference, turn-structure]
sources: [raw/rules/fcm-base-rules-eng-v4.txt]
confidence: high
verified_against: base
---

## Player count effects

| Players | Employee cards used | Billboards removed | Map size (tiles) |
|---|---|---|---|
| 2 | 1 | #12, #15, #16 | 3×3 |
| 3 | 1 | #15, #16 | 3×4 |
| 4 | 2 | #16 | 4×4 |
| 5 | 3 | none | 5×4 |

(base rules, p.4)

- Map tiles are **5×5 squares** each; the map is built by randomly selecting tiles and
  **rotating each randomly** before placing them in a grid. (base rules, p.4)
- For each employee card type marked with a removal indicator, remove copies down to the count
  shown. Exact per-card copy counts are a **graphic** in the PDF and are not reliably extractable
  from the text layer — verify on the physical set. (base rules, p.4)

## Setup sequence

1. **Fill the bank:** $50 × player count. **Players start with no money.** (base rules, p.6)
2. **Player markers:** each player takes a restaurant chain, a **CEO card**, **3 restaurants**,
   and **3 bank reserve cards**. (base rules, p.6)
3. **Initial order of play:** shuffle the turn order markers for the chosen chains and place them
   on the turn order track **in the order drawn**. (base rules, p.6)
4. **Place starting restaurants:** starting with the player **last** in turn order and ending with
   the player **first**. Each may place or pass; if anyone passed, a **second round** runs in turn
   order for those who have not yet placed. (base rules, p.6)
   - Restrictions: fully on empty squares; **entrance borders a road square**; entrance **not on
     the same tile** as another restaurant's entrance.
5. **Set goals:** each player **chooses one bank reserve card**, placed **face down** next to the
   bank; the other two are **discarded unseen**. (base rules, p.6)

> ⚠️ **Note what step 5 means:** the game length is *partially* chosen by the players, but nobody
> knows what anyone else picked, and the unchosen cards are discarded rather than revealed. So the
> total bank refill is unknown until the first break.

## Card layout at setup

The rulebook's layout image doubles as the **upgrade-path overview** — laying cards out as
pictured makes it easy to see upgrade paths and which cards are at risk of running out.
(base rules, p.4)

## Related

- [[turn-structure-and-phases]] — the first turn (CEO-only restructuring)
- [[bank-and-reserve-cards]] — reserve card values and slot determination
- [[restaurant-placement]] — initial placement rules in detail
- [[employees-overview]] — the employee card pool
