---
title: Price Managers and Pricing
description: How FCM unit price is set — pricing/discount/luxury managers, the lower-prices milestone, and why bonuses don't affect price
created: 2026-09-25
updated: 2026-09-25
type: concept
tags: [sales, economy, employee]
sources: [raw/rules/fcm-base-rules-eng-v4.txt]
confidence: high
verified_against: base
---

Unit price is one half of the dinnertime competition formula (price + distance). Getting it
wrong is the classic way an agent mis-plans a turn. (base rules, p.10)

## Computing unit price

| Component | Adjustment |
|---|---|
| **Base unit price** | **$10** |
| Each **Pricing Manager** | **−$1** |
| Each **Discount Manager** | **−$3** |
| A **Luxuries Manager** | **+$10** |
| **"First to lower prices"** milestone | **−$1** (permanent, cannot be undone) |

Rulebook example: **2 active pricing managers + 1 active discount manager → unit price $5**.
(base rules, p.10)

## These actions are MANDATORY

If a pricing manager, discount manager or luxury manager is **at work**, its price action
**must** be applied. (base rules, p.7)

> ⚠️ You cannot decline a luxury manager's +$10. Playing her is a commitment to higher prices —
> which is a *feature*, since higher price = more income per item, provided you still win the
> house on price+distance.

## Bonuses do NOT change price

This is the most commonly confused rule in the game:

> "Note that bonuses (CFO, 'First burger marketed', etc.) **do not alter the unit price**."
> (base rules, p.10)

Bonuses affect **income**, not **price**. Therefore:

- A bonus does **not** help you win a house — inhabitants compare **price + distance** only.
- The **"First burger/pizza/drink marketed"** +$5 bonus explicitly does not affect the
  inhabitants' decision and is **not doubled by gardens**. (base rules, p.12)

```
Where inhabitants eat  → f(unit price, distance, waitresses, turn order)
What you get paid      → f(unit price, bonuses, garden doubling)
```

## The "First to lower prices" milestone

- Trigger: play a **pricing manager or discount manager** into your structure.
- Effect: your prices are **automatically $1 lower** for the rest of the game. **Cannot be undone.**
- Takes effect **immediately** — so your prices are already $1 lower in the turn you first
  lowered them. (base rules, p.13)

> ⚠️ This is a **double-edged** milestone: lower price wins more houses, but earns less per item.
> Its real value is market share, not margin.

## Strategic note

Price is a **competitive weapon**: dropping price by $1 can flip every house where you were
trailing by exactly 1 on the price+distance comparison. But since you must apply **all** price
managers at work, an agent should decide *before* restructuring whether to have them at work.

## Related

- [[dinnertime-sales-resolution]] — where price is compared against distance
- [[employees-overview]] — the manager cards
- [[milestones-overview]] — the lower-prices milestone in context
- [[marketing-campaigns]] — demand that price then competes over
