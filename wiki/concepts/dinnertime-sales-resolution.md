---
title: Dinnertime Sales Resolution
description: How FCM decides which chain each house eats at, how price and distance compete, and how income is computed
created: 2026-09-25
updated: 2026-09-25
type: concept
tags: [sales, phase, economy, turn-structure]
sources: [raw/rules/fcm-base-rules-eng-v4.txt]
confidence: high
verified_against: base
---

Phase 4 is where money is actually made. **Players make no decisions in this phase** — the
houses decide. Everything here is deterministic given the board state, which means an agent
can and should compute it exactly before it happens. (base rules, p.10)

## Step 0: Iteration order

Houses are processed **in ascending order of the number printed on the house**, lowest first.
This order is not cosmetic: a chain can **run out of stock** serving early houses and then
lose later ones. (base rules, p.10)

## Step 1: Does the house eat at all?

- **No demand counters on the house → inhabitants do not go out to eat.** (base rules, p.10)

Demand counters come from marketing campaigns — see [[marketing-campaigns]].

## Step 2: Which chains are even eligible?

A chain is eligible only if:

1. It has a restaurant **connected to the house by road**, and
2. It can deliver **all** the food and drinks the inhabitants want.

> "if the house contains demand for 2 burgers and a beer, there needs to be a chain that can
> provide 2 burgers and a beer — if the chain has only burgers, or not enough burgers, the
> inhabitants will search for a better place or decide not to go out." (base rules, p.10)

- There are **no range restrictions** — but a **road connection is mandatory**.
- The road may start at **any road orthogonally adjacent to the house or the garden**.
- **No road connection → inhabitants stay home.** (base rules, p.10)

If exactly **one** chain qualifies, the house eats there.

## Step 3: Competition — price + distance

If **multiple** chains can provide the full menu and are road-connected, the house evaluates
**unit price + distance** and picks the **lowest total**. (base rules, p.10)

### Unit price

| Component | Effect on unit price |
|---|---|
| Standard unit price | **$10** |
| Each **pricing manager** | **−$1** |
| Each **discount manager** | **−$3** |
| A **luxury manager** | **+$10** |
| **"First to lower prices"** milestone | **−$1 permanently** |

> ⚠️ **Bonuses do NOT change unit price.** CFO, "First burger marketed", etc. are added to
> *income*, not to *price* — so they have **no influence on where inhabitants eat**. (base rules, p.10)

Example from the rulebook: a chain with **2 active pricing managers and 1 active discount
manager** charges a unit price of **$5**. (base rules, p.10)

### Distance

- Determine the **range from the house to the closest restaurant of each chain**.
- You **must follow the road** and end at a **restaurant entrance**.
- **Each tile border crossed = 1 step.**
- A house on the **same tile** as a restaurant entrance is at **distance 0**, provided the two
  are connected by a road on the same tile. (base rules, p.10)

### The comparison

```
score = unit price + distance
```

- The house eats at the chain with the **lowest score**.
- **The number of demand tokens does not matter** for this calculation — only price and
  distance. (base rules, p.10)
- So inhabitants will **walk one step further to save $1 per item**, two steps to save $2, etc.

### Tie-breaks, in order

1. **Most waitresses in structure** wins. (base rules, p.10)
2. If still tied: the chain **earlier in turn order** wins. (base rules, p.10)

## Step 4: Payment

The chosen chain **must serve** the food and drinks.

- **Discard** the demand counters from the house **and** the identical markers from the
  chain's stock.
- The chain is paid **unit price + milestone bonuses** for **each item sold**.

### Gardens double the unit price

If the house has a **garden**, the chain receives **double the unit price** per item.

> ⚠️ **Bonuses are NOT doubled.** Final income = **(2 × unit price) + bonuses**. (base rules, p.10)

### Worked example (verbatim from the rulebook)

Player sells **1 burger and 2 beers** to a house **with a garden**. He has **"First burger
marketed"** (+$5 on burgers) and a **luxury manager** (+$10).

```
unit price      = $10 + $10       = $20
burger          = 2 × $20 + $5    = $45     (garden doubles, then bonus added)
beer (each)     = 2 × $20         = $40     (no drink bonus)
total           = $45 + 2 × $40   = $125
```

(base rules, p.10)

## Step 5: Waitress income

After **all** houses are processed, each chain receives:

- **$3** per waitress **in its structure**, or
- **$5** per waitress with the **"First waitress played"** milestone. (base rules, p.10)

## Step 6: CFO bonus

Each chain with a **CFO in structure** (or the **"First to have $100"** milestone) receives a
**50% bonus on all cash earned this turn, including waitress tips, rounded up**. (base rules, p.10)

## Bank breaking

- If **at any point in this phase** the bank cannot pay out all income, **the bank breaks** and
  reserve cards are opened.
- **1st break:** add the sum of the players' chosen reserve card values to the bank. Also, the
  **most common** slot number (2/3/4) on those cards sets **all CEOs' slots from next turn**.
  Ties → the **highest** number wins. (base rules, p.10)
- **2nd break:** the game **ends at the end of this phase**. Finish paying earnings (write down
  amounts owed if needed). **Salaries are not paid this turn.** Most cash wins; tie → earlier
  in turn order.

See [[bank-and-reserve-cards]] for the full reserve/slot mechanics.

## Agent checklist for phase 4

Before dinnertime, an agent should be able to answer:

- For each house in ascending order: do I have a road-connected restaurant?
- Can I supply the **entire** demanded basket? (partial supply = I lose the house)
- What is my `unit price + distance` vs each rival's?
- Am I losing a tie on waitress count, then on turn order?
- Will I run out of stock before a later (or higher-numbered) house?
- Does any house I'm serving have a garden (→ doubling)?

## Related

- [[marketing-campaigns]] — where demand counters come from
- [[price-managers-and-pricing]] — how unit price is set
- [[salary-and-payday]] — the phase immediately after
- [[bank-and-reserve-cards]] — bank breaking in full
- [[waitress-mechanics]] — waitress tie-break detail
