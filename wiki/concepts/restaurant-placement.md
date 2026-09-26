---
title: Restaurant Placement and Movement
description: FCM rules for placing, opening, moving and rotating restaurants — local vs regional manager, COMING SOON, drive-in
created: 2026-09-25
updated: 2026-09-25
type: concept
tags: [phase, sales, setup]
sources: [raw/rules/fcm-base-rules-eng-v4.txt]
confidence: high
verified_against: base
---

Restaurant placement determines everything about which houses you can reach — and therefore
whether you earn anything at all.

## Initial placement (setup)

Each player has **3 restaurants**, each **2×2 squares**, with one square marked as its
**entrance**. Players place one starting restaurant, starting with the player **last in turn
order** and ending with the player **first**. (base rules, p.6)

A player may **pass** in the first round; then a **second round** runs in turn order where
everyone who has not placed **must** place. Players who already placed do not participate.
(base rules, p.6)

Restrictions on initial placement:

- Must be placed **fully on empty squares** — no other restaurants, roads, drinks or houses.
- The **entrance must border a square with a road**.
- **The entrance may not be on the same tile as another restaurant's entrance.**

(base rules, p.6)

> ⚠️ **The same-tile-entrance ban applies only at setup.** Later placement explicitly allows
> it: "unlike during the initial placement, a restaurant may be placed in such a way that its
> entrance is on the same tile as the entrance of another restaurant." (base rules, p.10)

## Later placement / movement

Requires a **Local Manager** or **Regional Manager** in your structure. A restaurant must be
placed **fully on empty squares** with **no other map elements**, and its **entrance adjacent
to a road**. (base rules, p.10)

### Local Manager

- May place a new restaurant within **range 3 by road** from one of the chain's existing
  restaurants.
- The new restaurant's **printed entrance** must connect to a road — **this need not be the road
  used to measure the range**.
- Placed **"COMING SOON" side up**: it **only opens at the end of the turn**.
- **While the local manager is active**, that chain's restaurants have a **drive-in** and are
  considered to have **entrances in every corner**.

(base rules, p.10)

> ⚠️ **Two consequences that decide games:**
> 1. A restaurant placed this turn **does not sell this turn** — it opens at end of turn.
> 2. The **drive-in / all-corner-entrances** bonus applies *as long as the local manager is
>    active*, which massively relaxes road-connection requirements for dinnertime.

### Regional Manager

- May place a restaurant **anywhere on the board**, provided the **entrance connects to a road**.
- May also **pick up an existing restaurant and move it** elsewhere and/or **rotate** it.
- Restaurants placed or moved by a regional manager are **active immediately** — **no "COMING
  SOON" wait**.
- **While the regional manager is active**, that chain also has a **drive-in** and **all-corner
  entrances**.

(base rules, p.10)

### Summary

| | Local Manager | Regional Manager |
|---|---|---|
| Placement range | **3 by road** from an existing restaurant | **anywhere** |
| New restaurant opens | **end of turn** (COMING SOON) | **immediately** |
| Can move existing restaurant | no | **yes** (and rotate) |
| Grants drive-in + all-corner entrances | yes | yes |

## New Business Developer

Places a **house or garden** — see [[houses-gardens-and-demand]]. (The rulebook's card text says
"Place new restaurant, COMING SOON / Place or move restaurant, opens immediately" for the
Regional Manager / New Business Developer pair; house-and-garden placement is the Local
Manager's later form in the card upgrade track.) Verify the exact card-to-ability mapping in
[[employees-overview]].

## Why "entrances in each corner" matters

Dinnertime requires a **road connection ending at a restaurant entrance**. With more permitted
entrance squares, far more houses become reachable. This is why playing a local or regional
manager can swing a turn's income dramatically — see [[dinnertime-sales-resolution]].

## Related

- [[turn-structure-and-phases]] — setup and phase 3 action order
- [[houses-gardens-and-demand]] — houses and gardens
- [[dinnertime-sales-resolution]] — how placement converts to money
- [[employees-overview]] — Local/Regional Manager and New Business Developer cards
- [[setup-and-map-generation]] — map size per player count
