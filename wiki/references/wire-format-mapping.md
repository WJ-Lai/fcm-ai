---
title: Wire Format — Mapping the Rulebook to the Live Game API
description: Field-by-field mapping between physical-board rules vocabulary and the OBG/FCM Agent API payloads, in both directions, with the gaps named explicitly
created: 2026-09-26
updated: 2026-09-26
type: reference
tags: [reference, api, lookup]
sources:
  - raw/cards-authoritative.json
  - live OBG Agent API /FCM/agent/v1/games/<id>/actions/ (game 66, probed 2026-09-26)
  - obg-server-fcm-agent/FCM/vueFCM/src/js/FCMreference.js (engine ID tables)
  - obg-server-fcm-agent/mcp-server/fcm-adapter.mjs (field naming)
confidence: high
verified_against: live
---

# Wire Format — Rulebook ↔ Live Game API

> **Why this page exists.** The rulebook describes a *physical* game: wooden drink tokens,
> money on a cardboard bank, tiles you rotate with your hands. The online game transmits a
> *positional array* over HTTP. If an agent reads the rulebook for concepts but the API for
> state, it will silently mis-map them — e.g. treat a "drink point" as one thing when the
> wire gives it as an integer code among five food/drink types.
>
> Every mapping below was verified against a **live response**, not inferred. The probe is
> reproducible: `python3 scripts/probe_api.py` (see docs/agent-integration.md).

## How to read this

The Agent API presents state **twice**, and only one of the two is safe to reason from:

| Surface | Shape | Safe? |
|---|---|---|
| `snapshot.gameData` | base64+gzip of a **positional array**, no field names | ❌ Do not parse |
| `actions[].state` | **named, decoded** structure + `catalog` | ✅ Use this |

⚡ **Never parse `snapshot.gameData` yourself.** It is the engine's internal save format
(`[[[name],seat,[[103,0]],...]]`) — no keys, unstable layout. `legalActions` returns the same
information decoded.

## The `catalog` object — self-describing ID maps

The API ships its own dictionaries. **Use these instead of hardcoding.**

### Goods / food / drink codes

⚡ **These are NOT grouped the way you'd guess.** All drinks are low (0–2), then pizza,
then burger — the rulebook's "food vs drink" distinction is *not* a range split.

| Code | `catalog.goods` name | Rulebook concept |
|---|---|---|
| `0` | lemonade | drink (lemonade token) |
| `1` | coke | drink (soft drink / cola token) |
| `2` | beer | drink (beer token) |
| `3` | pizza | food (pizza token) |
| `4` | burger | food (burger token) |
| `5` | *(not in catalog)* | **coffee** — expansion only |
| `6` | *(not in catalog)* | **noodles** — expansion only |
| `7` | *(not in catalog)* | **sushi** — expansion only |
| `8` | *(not in catalog)* | **kimchi** — expansion only |
| `9` | *(not in catalog)* | **dumpling** — OBG house variant |

⚡ **Gap #1 (answers 「饮料点对应什么」):** `catalog.goods` lists **only the 5 base goods**.
Codes 5–9 exist in the engine (`FCMreference.js`: `COFFEE=5 … DUMPLING=9`) but are **absent
from the catalog**, so expansion play must hardcode them. The rulebook's "drink" is exactly
`{0,1,2}`, "food" is `{3,4}`, and 3–9 count as *food* for milestones — **except coffee, which
counts as neither**.

> Rulebook nuance the wire does not encode: `coffee` is not a drink and not food for
> milestones (ketchup rules, p.10). Noodles/sushi/kimchi/dumplings **do** count as food.
> The API gives no flag for this — it lives in [[expansion-coffee]] only.

### Campaign types

| Code | Name | Rulebook |
|---|---|---|
| `0` | radio | radio campaign |
| `1` | airplane | airplane campaign |
| `2` | mailbox | mailbox campaign |
| `3` | billboard | billboard campaign |

⚠️ **Unintuitive:** the ordering is *descending* by range/power (radio strongest = 0).
`availableMarketingCampaigns` in game 66 returned `[1,2,3,...,13,14,12]` — these are
**tile serial numbers**, a different namespace from `campaignTypes`. Do not confuse them.

### Employees

`catalog.employees` has **32 entries = the 32 base employees**, each with `id`, `title`,
`description`. `id` is **not** array position — it matches the engine's employee constants
(`BURGER_COOK=28`, `KIMCHI_MASTER=33`, …). Full table → [[employee-cards-full]].

### Milestones

`catalog.milestones` has **18 entries**, ids `0..17`, in engine order. Full text in each
entry, so no rulebook lookup is needed to read a milestone off the wire.

## Field-by-field mapping (both directions)

### Player state

| Rulebook concept | Wire path | Type / units | Notes |
|---|---|---|---|
| **Your money on hand** | `players[i].money` | integer dollars | ⚡ This is it — see below |
| Player's identity | `players[i].name` | string | Agent display name |
| seat / position | `players[i].index` | 0-based seat | Also `mySeat` |
| Company structure (cards at work) | `players[i].employees` | array of employee ids | |
| Cards "on the beach" | `players[i].beach` | array of employee ids | rulebook "on the beach" ✅ |
| Food/drink **in hand** | `players[i].resources` | array of **good codes** | ⚡ repeated per unit |
| CEO slot count | `players[i].ceoSlots` | integer | after reserve-card effect |
| Restaurants | `players[i].restaurants[]` | `{index, rotation, open}` | `index` = raw board cell |
| Milestones held | `players[i].milestones` | array of ids | ⚡ bare ids, no text here |
| Active marketeers | `players[i].marketers[]` | array | |
| Coffee shops | `players[i].coffeeShops` | array | expansion |
| Bankrupt flag | `players[i].bankrupt` | boolean | |
| Waitress count (tie-break) | *not a field* | — | derive: count employee id `0` in `employees` + `beach` |
| "At work" marker | *not a field* | — | membership in `employees` **is** the marker |

⚡ **Answering "玩家的金钱总额对应哪一个":** `players[i].money`, in whole dollars. The bank is
`state.bank` (a single integer shared by all), and `state.bankBroken` counts how many times it
has run out. **There is no separate "income this round" field** — dinnertime income is only
visible via `history` entries after the fact.

### Board state

| Rulebook concept | Wire path | Notes |
|---|---|---|
| Map grid | `board.tiles` | flat array, length = `dimensions[0]*dimensions[1]*25`; `-1` = empty cell |
| Map size | `board.dimensions` | `[width, height]` in **tiles** (game 66: `[17,16]`) |
| Houses | `board.houses[]` | placed house records |
| Gardens | `board.gardens[]` | |
| **Demand on houses** | `board.needs[]` | `{needs: [[goodCode, …]], …}` |
| Active campaigns | `board.campaigns[]` | marketing tiles in play |
| Freeways / parks / new roads | `board.freeways`, `.parks`, `.newRoads` | expansion |

⚡ **Gap #2:** `board.tiles` uses **raw engine cell codes** (`-1` empty, `1` road, `2` drink
source …) with **no catalog and no legend**; decoding needs the engine's `sg` tile table.
Treat it as opaque and prefer `board.houses` / `board.needs` / `board.campaigns`, which **are**
self-describing.

### Phase / turn

| Rulebook concept | Wire path | Notes |
|---|---|---|
| Phase number | `state.phase` | engine int |
| Phase name | `state.phaseName` | e.g. `"Setup - Restaurants Round 1"` |
| Turn number | `state.turn` | |
| Sub-phase | `state.subphase` | ⚡ no rulebook equivalent — wire-only |
| Turn order | `state.turnOrder` | ⚡ **partial** — only players still to move |
| Full turn order | `state.fullTurnOrder` | everyone |
| New order (being chosen) | `state.newTurnOrder` | during order-of-business |

⚡ **Naming gotcha:** `turnOrder` is *not* the turn-order track from the rulebook. It is the
**list of seats yet to act this phase**. `fullTurnOrder` is closer to the rulebook concept.

## Full asymmetry audit

The API and the rulebook are **not** symmetric — each carries things the other lacks
(no agent action endpoint for dinnertime; `version`/`subphase`/`chat` with no rulebook
counterpart; tiles with no legend; salary and distance math that live rules-side only).

→ Full list, both directions: [[wire-format-gap-analysis]]

## Rules claims on this page

- Dinnertime and other automatic phases have no agent action entry (MCP README, "架构与安全边界").
- Coffee is not a drink and not food for milestones; noodles/sushi/kimchi are food (ketchup rules, p.10).
- "New Milestones" replaces the base milestone set (ketchup rules, p.8).
- Goods codes and module flags as enumerated above (`FCMreference.js`, verified live on game 66).

→ Relates to: docs/agent-integration.md · [[employee-cards-full]] · [[milestone-cards-full]] · [[expansion-coffee]]
