---
title: Buyers and Drink Routes
description: Detailed FCM route-counting rules for errand boy, cart operator, truck driver and zeppelin pilot
created: 2026-09-25
updated: 2026-09-25
type: concept
tags: [production, employee, sales]
sources: [raw/rules/fcm-base-rules-eng-v4.txt]
confidence: high
verified_against: base
---

Drinks are printed on map tiles. Buyers **trace a route** and collect drinks from the symbols
they pass. The route-counting details are the fiddliest in the rulebook — get them wrong and an
agent will miscalculate its drink supply.

## The four buyers

| Card | Base yield | Range | Road required? |
|---|---|---|---|
| **Errand Boy** | 1 drink of any type | — | no route |
| **Cart Operator** | 2 drinks per symbol | 2 | yes |
| **Truck Driver** | 3 drinks per symbol | 3 | yes |
| **Zeppelin Pilot** | 2 drinks per symbol | 4 | **no — ignores roads** |

(base rules, p.9)

## Route counting: cart operator

Verbatim rule (base rules, p.9):

> "starting from one of your restaurant entrances, trace a route of range 2 over roads.
> **Including the tile of your restaurant**, the route will thus cover up to three tiles. Take 2
> drinks from the stock for each drink symbol you pass by on either side of the road. Note that
> you have to **traverse the road directly (orthogonally) adjacent to the drink symbol**. If
> there are multiple drink symbols on the same tile, it is sometimes possible to pass more than
> one of them. However, it is **not allowed to make U-turns** in order to do so. There is **no
> need** for the cart operator to return to one of your restaurants."

Decomposed:

| Rule | Meaning |
|---|---|
| Start at **a restaurant entrance** | The buyer is anchored to your restaurant |
| Range 2 **includes the restaurant's own tile** | Route covers up to **3 tiles** total |
| Drinks collected **on both sides** of the road | Symbols flanking the path count |
| Road must be **orthogonally adjacent** to the symbol | Diagonal doesn't count |
| Multiple symbols on one tile | Sometimes both collectable |
| **No U-turns** | Cannot double back to farm extra symbols |
| **No return trip required** | One-way is fine |

## Truck driver

Same as cart operator but **range 3** and **3 drinks per symbol**. (base rules, p.9)

## Zeppelin pilot

> "Starting from your restaurant entrance, trace a route of range 4, **ignoring roads**.
> Including the tile of your restaurant, the route will cover up to **five tiles**. You **may not
> cover the same tile twice**. Collect **2 drinks** from stock for each drink symbol on the tiles
> you fly over. **If there are multiple drink symbols on a tile, you may collect drinks for all
> of them.**" (base rules, p.9)

Decomposed, and note how it **differs** from the cart/truck:

| Rule | Zeppelin |
|---|---|
| Range | 4 → covers up to **5 tiles** |
| Roads | **ignored** |
| Same tile twice | **not allowed** |
| Multiple symbols on a tile | **all** collectable (no "orthogonal adjacency" or U-turn limitation, because there is no road) |

> ⚠️ **The "all symbols on a tile" allowance is zeppelin-only.** Do not apply it to cart
> operators or truck drivers — for them the orthogonal-adjacency and no-U-turn rules bind.

## Milestone bonuses

**"First errand boy played"** → each source provides **+1 drink**:

| Card | Before | After |
|---|---|---|
| Errand Boy | 1 | **2** (identical type) |
| Cart Operator | 2/symbol | **3**/symbol |
| Zeppelin Pilot | 2/symbol | **3**/symbol |
| Truck Driver | 3/symbol | **4**/symbol |

(base rules, pp.12)

**"First cart operator played"** → cart operators, truck drivers and zeppelin pilots get
**+1 range** (applies immediately, so the first cart operator already has range 3). (base rules, p.13)

> 🔢 **Combined range with both milestones:** cart operator range 2 → 3, truck 3 → 4,
> zeppelin 4 → 5. Ranges stack from these two separate sources.

## Related

- [[production-and-food-stock]] — where buyers fit in production overall
- [[milestones-overview]] — both buyer-related milestones in full
- [[restaurant-placement]] — restaurant entrances anchor routes
- [[employees-overview]] — the buyer cards
