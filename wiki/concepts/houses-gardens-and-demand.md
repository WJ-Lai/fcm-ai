---
title: Houses, Gardens and Demand
description: FCM house mechanics — placing houses and gardens, demand counters, house numbering, and garden income doubling
created: 2026-09-25
updated: 2026-09-25
type: concept
tags: [sales, marketing, phase]
sources: [raw/rules/fcm-base-rules-eng-v4.txt]
confidence: high
verified_against: base
---

Houses are where the money comes from. A house needs **demand** to eat, and a **road
connection** to be reachable. Gardens both change road access and double income.

## Placing a new house

Requires a **New Business Developer** (Local Manager upgrade) in your structure.

- May be placed in **any empty area on the map**, provided the house is **connected to at least
  one road**.
- **No range limitation.**
- You **freely choose** which house to place (its printed demand value is fixed by the tile).

(base rules, p.9)

## Placing a garden

- Must be placed so it **connects to a house printed on a map tile**.
- It must **connect over 2 squares**, so the **house + garden forms a 2×3 rectangle**.
- Gardens may **only** be placed on **empty squares**.
- **Each house may only get one garden.**
- Rotate the garden so it is obvious which house it belongs to.
- Houses placed by a New Business Developer **automatically come with a garden** and **may not
  get another**.

(base rules, p.9)

## Demand counters

- Demand comes from **marketing campaigns** — the advertised food/drink type and number of
  wooden pieces correspond to campaign duration. (base rules, p.8)
- A house with **no demand counters does not eat at all**. (base rules, p.10)
- Demand counters sit **on the house** and are **discarded when the house is served**.
- The **number of demand tokens does not affect** the price+distance comparison — only whether
  you can supply the **full basket**. (base rules, p.10)

## House processing order

Houses are processed **in ascending order of the number printed on the house**, lowest first.

> "As the order of the houses depends on the house numbers, it is quite possible that a chain
> runs out of food to serve houses later in the order. These will then search for food
> elsewhere." (base rules, p.10)

An agent should read this as: **stock is a shared, depleting resource across the whole phase.**
Serving a low-numbered house may cost you a high-numbered one.

## Gardens double the unit price

If the house being served has a **garden**, the chain receives **double the unit price per item**.

> ⚠️ **Bonuses are NOT doubled.** Final income = **(2 × unit price) + bonuses**. (base rules, p.10)

Worked example (rulebook): 1 burger + 2 beers to a garden house; unit price $20; "First burger
marketed" (+$5 on burgers):

```
burger = 2×$20 + $5 = $45
beer   = 2×$20      = $40 each
total  = $45 + 2×$40 = $125
```

See [[dinnertime-sales-resolution]] for the full computation.

## Road connectivity

A house eats at a chain only if there is a **road connection** between them:

- The road may start at **any road orthogonally adjacent to the house or the garden**.
- You must **follow the road** and end at a **restaurant entrance**.
- **No road connection → inhabitants stay home.** (base rules, p.10)

> 💡 This is why adding a **garden** can be offensive as well as lucrative: it can create a new
> road access point to a house, potentially bringing it into reach of your chain — or of a
> rival's. The rulebook's own example notes that placing a billboard on a house you cannot
> yet deliver to "may still make sense: by adding a garden to house 15, it will become
> accessible by road." (base rules, p.8)

## Related

- [[marketing-campaigns]] — where demand comes from
- [[dinnertime-sales-resolution]] — how demand is served and paid
- [[restaurant-placement]] — the other side of the road connection
- [[production-and-food-stock]] — supplying the demand
