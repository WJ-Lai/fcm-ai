---
title: Bank and Reserve Cards
description: FCM bank economics — starting pool, breaking the bank twice, reserve card values and CEO slot changes
created: 2026-09-25
updated: 2026-09-25
type: concept
tags: [economy, setup, turn-structure]
sources: [raw/rules/fcm-base-rules-eng-v4.txt]
confidence: high
verified_against: base
---

The bank is the game clock. FCM ends when the bank runs out of money **twice**, so
"how much is in the bank" is the single best proxy for "how many turns remain".

## Setup

- Place **$50 × number of players** into the bank pool. (base rules, p.6)
- **Players start with no money.**

## Reserve cards

Each player receives a set of **3 bank reserve cards**. (base rules, p.6)

At setup, each player **chooses one** reserve card and places it **face down** next to the
bank. **The other two are discarded unseen.** (base rules, p.6)

- The chosen reserve cards **collectively** set how much money is added to the bank when it
  runs out.
- **Higher card values → longer game.**
- At the start of the game **players do not know** how long the game will take — this is
  deliberate, to make balancing short- vs long-term strategy harder. (base rules, p.6)

Reserve card values observed in the rulebook graphics: **+$100, +$200, +$300**, each also
showing a slot count of **2, 3 or 4**. (base rules, p.3)

## First bank break

Triggered **at any point during phase 4** when the bank cannot pay out all income.

1. **Open the reserve cards** chosen at setup.
2. **Sum their money values** and add the total to the bank.
3. **Determine new CEO slot count:**
   - The reserve cards each show **2, 3 or 4** open slots.
   - Whichever number occurs **most often** sets the number of CEO slots **for all CEOs,
     from the next turn onwards**.
   - Example: two "2 slot" cards, one "3 slot", one "4 slot" → **all CEOs get 2 slots**.
   - **Tie → the highest number wins.** Example: two "2 slot" + two "4 slot" → **4 slots**.
   - Place the reserve cards under the CEOs as a visual reminder.

(base rules, p.10)

> ⚠️ **This is a major strategic swing.** A low slot count (2) permanently shrinks every
> company; a high count (4) lets everyone run a bigger structure. Which mode you get is not
> decided until the bank breaks.

## Second bank break

- The **game ends** at the end of phase 4.
- Finish phase 4 and **pay all players their earnings**, writing down amounts if the bank is short.
- **Salaries are not paid this turn.**
- **Most cash wins.** Tie → the tied player **earlier in turn order** wins.

(base rules, p.10)

## Introductory-game variants

For a first game the rulebook recommends: **$75 per player** instead of $50, no reserve
cards, no milestones, no salaries, and the game ends when the bank breaks **once**.
(base rules, p.14)

## Related

- [[turn-structure-and-phases]] — where bank breaking fits in the turn
- [[dinnertime-sales-resolution]] — income that drains the bank
- [[salary-and-payday]] — salaries that also drain the bank
- [[company-structure-and-slots]] — what CEO slot counts mean for structure
