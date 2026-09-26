---
title: Marketing Campaigns
description: FCM campaign types (billboard, mailbox, airplane, radio), range, duration, and how demand reaches houses
created: 2026-09-25
updated: 2026-09-25
type: concept
tags: [marketing, phase, sales]
sources: [raw/rules/fcm-base-rules-eng-v4.txt]
confidence: high
verified_against: base
---

Marketing is how demand is created. No campaign → no demand counter → the house never eats →
no income. (base rules, p.8)

## Who can place what

For **each marketeer in your structure**, you may place **one** campaign. The marketeer type
determines which campaign types are allowed:

| Marketeer | May place | Max duration |
|---|---|---|
| **Marketing Trainee** | billboard only | 2 |
| **Campaign Manager** | mailbox or billboard | 3 |
| **Brand Manager** | airplane, mailbox or billboard | 4 |
| **Brand Director** | **any** campaign | 5 |

Range: Marketing Trainee has **range 2**. Brand Managers and Brand Directors are
**not limited by range**.

(base rules, p.8)

## Range

- All connections **must be by road** and **start at a restaurant entrance**.
- You **freely choose which of your restaurants** the marketeer counts range from.
- "Own tile (0), adjacent tile (1), tile two steps away (2)." (base rules, p.8)
- **Brand managers / directors:** not limited by range — can place on areas they cannot reach by
  road. **But** a billboard, mailbox or radio must still be **adjacent to a road**.

## Duration

- The marketeer card states the **maximum** duration; **minimum is 1 turn**.
- A marketing trainee (max 2) can initiate a campaign running 1 **or** 2 turns.
- **Campaigns can never be ended prematurely.** (base rules, p.8)

## Placement constraints

- **Billboards, mailboxes and radios** must go on **empty squares**.
- They must **connect to the road used to reach the tile**.
- If a campaign spans multiple tiles, **only one** of the squares adjacent to a road needs to
  be in range of the marketeer.
- **The marketing tile itself must be in range** — not just the road used to get there.
- **Airplanes** go on the **side of the board**: no road connection, no range. Available sizes
  **1, 3 or 5 squares**, flying over that many rows/columns. **Not allowed to fly outside the board.**
- **It is allowed to place a campaign where it will not reach any houses.** (base rules, p.8)

## Advertising content

A campaign advertises **exactly one** of: **pizza, burgers, or one type of drink**.

- Represented by placing wooden pieces of the advertised type on the campaign.
- **The number of pieces should correspond to the campaign's duration.**

(base rules, p.8)

## The marketeer becomes "busy"

After placing the campaign, the **marketeer card is set aside with a "busy" chip**. The chip
number corresponds to the campaign number.

- The marketeer is **unavailable until the campaign ends**.
- A busy marketeer **does not take up a slot** in your organizational structure.
- ⚠️ A busy marketeer **may not normally be fired**, and if she requires salary she **must
  still be paid**. (base rules, pp.8,11)

## Demand counters

Campaigns place **demand counters on houses** they reach. Demand is what makes houses eat.
See [[dinnertime-sales-resolution]] for how a house chooses where to eat, and
[[houses-gardens-and-demand]] for how advertising accumulates on a house.

## The "First billboard placed" milestone

If you hold it, **your campaigns never end**:

- Place the campaign tile on its **eternal side** with a **single wooden piece** on it.
- The corresponding marketeer card is **unavailable for the rest of the game** — it will not
  return to the stock or your hand.

(base rules, p.8) See [[milestones-overview]].

## Interaction between campaigns and houses

Reaching a house is **necessary but not sufficient** — the house also needs a **road
connection** to a restaurant to eat anywhere. Adding a **garden** to a house can change its
road accessibility, so placing a campaign on a currently-unreachable house can still be
correct play. (base rules, p.8, example)

## Related

- [[dinnertime-sales-resolution]] — how demand converts into sales
- [[milestones-overview]] — the four marketing milestones
- [[employees-overview]] — marketeer cards and their salary status
- [[houses-gardens-and-demand]] — demand counters and house processing order
- [[houses-gardens-and-demand]] — gardens and road accessibility
