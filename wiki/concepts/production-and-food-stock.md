---
title: Production and Food Stock
description: How FCM chains acquire burgers, pizza and drinks — kitchen staff, buyers, route rules, and stock limits
created: 2026-09-25
updated: 2026-09-25
type: concept
tags: [production, phase, employee]
sources: [raw/rules/fcm-base-rules-eng-v4.txt]
confidence: high
verified_against: base
---

Food and drink come from the **general stock** during the working day. Whatever you take sits
**in front of the player** and is **available to all restaurants in the chain** as needed.
(base rules, p.9)

## Kitchen staff — burgers and pizza

| Card | Take from stock |
|---|---|
| **Kitchen Trainee** | **1** burger **or** 1 pizza |
| **Burger Cook** | **3** burgers |
| **Burger Chef** | **8** burgers |
| **Pizza Cook** | **3** pizzas |
| **Pizza Chef** | **8** pizzas |

(base rules, p.9)

> Note the asymmetry: a Kitchen Trainee produces 1 item of **either** type; cooks and chefs are
> **single-type** specialists.

## Buyers — drinks

Drinks are **printed on the map tiles**. Buyers trace a route and collect drinks from the
symbols they pass.

| Card | Ability | Range |
|---|---|---|
| **Errand Boy** | 1 drink of any type | — |
| **Cart Operator** | 2 drinks from each source on route | 2 |
| **Truck Driver** | 3 drinks from each source on route | 3 |
| **Zeppelin Pilot** | 2 drinks from each source on route, **ignore roads** | 4 |

(base rules, p.9)

### Cart operator route rules (these are fiddly)

> "Cart operator: starting from one of your restaurant entrances, trace a route of range 2 over
> roads. **Including the tile of your restaurant**, the route will thus cover up to three tiles.
> Take 2 drinks from the stock for each drink symbol you pass by on either side of the road.
> Note that you have to **traverse the road directly (orthogonally) adjacent to the drink
> symbol**. If there are multiple drink symbols on the same tile, it is sometimes possible to
> pass more than one of them. However, **it is not allowed to make U-turns** in order to do so.
> There is no need for the cart operator to return to one of your restaurants."
> (base rules, p.9)

Key points an agent must not get wrong:

1. Route starts at **a restaurant entrance**.
2. Range 2 **includes the restaurant's own tile** → covers up to **3 tiles** total.
3. Drinks collected **on either side** of the road, but the road must be **orthogonally
   adjacent** to the symbol.
4. **No U-turns** to grab multiple symbols on one tile.
5. **No return trip required.**

### Truck driver

Same as cart operator, but **range 3** and **3 drinks per symbol**. (base rules, p.9)

### Zeppelin pilot

Starts from a restaurant entrance, **range 4**, travels **ignoring roads**. (base rules, p.9)

## The "First errand boy played" milestone

Your **buyers** (errand boys, cart operators, truck drivers, zeppelin pilots) get **+1 drink
per source**:

- Errand boys → **2 identical drinks** of any type
- Cart operators and zeppelin pilots → **3 drinks per symbol**
- Truck drivers → **4 drinks per symbol**

(base rules, p.12) See [[milestones-overview]].

## Stock limits and discarding

- Stock is **shared across your whole chain** — one pool, any restaurant may draw on it.
- If you cannot sell everything, excess stock is **discarded in phase 7 (Cleanup)** — unless you
  have the **"First to throw away drink/food"** milestone, which turns the card into a
  **freezer storing up to 10 tokens**.
- ⚠️ **Stock availability is a real constraint mid-dinnertime:** the house order means a chain
  can run out serving early houses and then lose later ones. (base rules, p.10)

## Where production sits in the working day

"Get food & drinks" appears **after** recruiting and training in the mandatory action order.
(base rules, p.7)

> ⚠️ **Consequence:** a card hired **this turn** goes on the beach and **acts next turn at the
> earliest**. It cannot produce this turn. Likewise the free **Burger Cook / Pizza Cook** from
> the "first produced" milestones is awarded **during production**, after training has already
> happened — so it **cannot be trained that same turn**. (base rules, p.12)

## Related

- [[working-day-actions]] — full action ordering
- [[employees-overview]] — kitchen staff and buyer cards
- [[milestones-overview]] — errand boy and freezer milestones
- [[dinnertime-sales-resolution]] — stock consumed here
- [[buyers-and-drink-routes]] — route counting in full detail
