---
title: Milestones Overview
description: Every FCM milestone — trigger condition, effect, and the timing rules that decide who gets it
created: 2026-09-25
updated: 2026-09-25
type: reference
tags: [milestone, reference, phase]
sources: [raw/rules/fcm-base-rules-eng-v4.txt]
confidence: high
verified_against: base
---

Milestones are the main strategic engine of FCM and the most common source of rules
disputes, because **who gets a milestone depends on the exact order in which things
happened this turn**. (base rules, p.12)

## The three timing rules (read these first)

1. **Immediate award.** A player who fulfils a milestone's requirement *at any point in the
   turn* is awarded it **immediately**. Benefits then apply immediately — and you must keep
   applying them for the rest of the game **even if the benefit is not helpful to you**.
   (base rules, p.12)
2. **Same-turn sharing.** Other players may claim the *same* milestone provided they do so
   **during the same turn**. So a milestone is not exclusive the moment it is claimed — it is
   exclusive only after cleanup. (base rules, p.12)
3. **Cleanup removal.** In **phase 7** of each turn, all milestone cards that have been
   claimed **at least once** are **removed from the game** — no one else can ever claim them.
   (base rules, p.12)

> ⚠️ **Consequence for an agent:** if a milestone was claimed by *anyone* last turn, it is
> gone. Do not plan around reaching it later. Conversely, in the *current* turn, a milestone
> you see someone else hold is still claimable by you until cleanup.

If there aren't enough milestone cards to hand out, make proxy copies. (base rules, p.12)

## Milestone table

| Milestone | Trigger | Effect (rest of game) |
|---|---|---|
| **First billboard placed** | Place a billboard campaign on the map | (a) **No salaries for marketeers** (campaign manager, brand manager, brand director) — paying them voluntarily is not allowed. (b) Campaigns you place **remain on the board forever** (eternal side); the corresponding marketeer card is gone for good. This already applies to the billboard you just placed. |
| **First to train someone** | Train an employee to a higher level | **$15 discount** on salary costs. Salary can never go below $0. Discount use is **obligatory**. |
| **First to hire three people in one turn** | Hire ≥3 people in the same turn | Immediately receive **2 management trainee cards**, placed **on the beach**. Because recruiting precedes training, you may immediately train them if you have training capacity. If the supply is short, you get what's left. |
| **First burger marketed** | Place a campaign advertising burgers | **+$5 bonus** every time you sell a burger ("Home of the original burger"). Bonus does **not** change unit price → **no influence on where inhabitants eat**, and is **not doubled by gardens**. Is boosted by a CFO. |
| **First pizza marketed** | Place a campaign advertising pizza | As above, for pizza. |
| **First drink marketed** | Place a campaign advertising **any** type of drink | As above, for **all drinks** — not just the type originally marketed. |
| **First errand boy played** | Play an errand boy **in your structure** (not on the beach) | Your **buyers** (errand boys, cart operators, truck drivers, zeppelin pilots) get **+1 drink per source**. So errand boys take 2 identical drinks; cart operators and zeppelin pilots gather 3 per symbol; truck drivers 4. Applies to the errand boy played to get it. |
| **First to have $20** | Have $20 cash at any time (in practice: after income, before salaries) | You may **look at the face-down reserve cards**. You may make truthful or confusing noises about them, but may not show them. |
| **First burger produced** | Produce a burger | Immediately receive a **burger cook** card. Awarded during production, so you **cannot train** it (training precedes production). If none left, you get nothing. The cook **requires salary** at payday — you may fire her instead. |
| **First pizza produced** | Produce a pizza | As above, **pizza cook**. |
| **First waitress played** | Play a waitress **in your structure** (not on the beach) | Waitresses pay **$5** instead of $3, for each waitress in your structure. Applies to the waitress played to get it. |
| **First to throw away drink/food** | Throw away ≥1 food or drink token in **phase 7 (Cleanup)** | The card becomes a **freezer**: store up to **10 tokens** (food and/or drink) during phase 7, sellable in later turns, kept indefinitely. With >10 tokens you choose what to keep. **Cannot store anything in the turn you receive it.** |
| **First to lower prices** | Play a **pricing manager or discount manager** into your structure, lowering prices | Prices are **automatically $1 lower** permanently. E.g. $9 if you have no price-related managers. **Cannot be undone.** Takes effect immediately, so prices are already lower in the turn you first lowered them. |
| **First cart operator played** | Place the **first cart operator in your structure** (not beach) | Your cart operators, truck drivers and zeppelin pilots get **+1 range**. Applies immediately, so the first cart operator already has range 3. |
| **First airplane campaign** | Place an airplane campaign | When determining order of play, add **2 extra open slots**. These slots **cannot hold managers or employees** — they only count for turn-order priority. |
| **First radio campaign** | Place a radio campaign | If you have a radio campaign running in **phase 6**: place **2 goods** of the advertised type on **each house reached by the radio**. If a house is already full, place 0 or 1 as fits. You **may not choose to market 1 instead of 2**, and the radio markets the **same good twice** — it cannot market two different goods. Takes effect immediately, i.e. phase 6 of the turn you achieve it. |
| **First to have $100** | Have ≥$100 cash **at the end of phase 4** | Your **CEO gains the CFO ability**: a 50% cash bonus at the end of phase 4. You do **not** get a CFO card. If you already have a CFO card, you must **fire the CFO in phase 5 of this turn**. You **may no longer train a CFO**. Effect starts **only from the next turn** (you can only get it after phase 4 has ended). |
| **First to pay $20 or more in salaries** | Owe ≥$20 salaries in **phase 5** | You may use **training actions from multiple employees to train the same person**. E.g. with 2 trainers and a coach, train a management trainee up to executive vice president in one turn. |

### Notes on the $20-salary milestone trigger

- The salaries must be **actually paid out** — salaries covered by a discount **do not count**.
  (base rules, p.13)
- You **must use all discounts available to you at the start of phase 5**. You may not
  voluntarily pay more salary than required.
- Legal workaround: you may use a recruiting manager or HR director to hire in phase 3 so
  that her salary discounts are no longer available in phase 5. (base rules, p.13)

### Notes on "played in your structure" vs "on the beach"

Several milestones explicitly require the card to be **in your structure**, not on the beach:
errand boy, waitress, cart operator. This means the card must have been chosen at
restructuring (phase 1) and placed into the org chart. A card on the beach does **not**
trigger the milestone. (base rules, pp.12-14)

## Milestones by when they normally trigger

| Window | Milestones |
|---|---|
| Phase 1 (restructuring) | *(none — cards are only being chosen)* |
| Phase 3 (working day) | First billboard placed, First to train someone, First to hire three people in one turn, First burger/pizza/drink marketed, First errand boy played, First to have $20, First to lower prices, First cart operator played, First airplane campaign, First radio campaign |
| Phase 3 production sub-phase | First burger produced, First pizza produced |
| Phase 4 (dinnertime) | First waitress played, First to have $100 (checked at end of phase 4) |
| Phase 5 (payday) | First to pay $20 or more in salaries |
| Phase 7 (cleanup) | First to throw away drink/food |

> The distinction matters: "First burger produced" is won during **production**, which
> happens *after* training — which is why the free cook cannot be trained that turn.

## Related

- [[turn-structure-and-phases]] — the phase order these triggers depend on
- [[salary-and-payday]] — the $20 milestone and mandatory discount rules
- [[marketing-campaigns]] — campaign types behind the marketing milestones
- [[employees-overview]] — which card is needed for each "played/produced" milestone
- [[milestone-strategy|Milestone racing strategy]] — which are worth racing for
