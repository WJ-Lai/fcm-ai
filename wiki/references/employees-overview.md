---
title: Employees Overview
description: FCM employee cards — abilities, salary obligation, training paths, and supply counts
created: 2026-09-25
updated: 2026-09-25
type: reference
tags: [employee, reference, production, marketing, sales]
sources: [raw/rules/fcm-base-rules-eng-v4.txt]
confidence: medium
verified_against: base
---

Employee cards are the company. Each card's text states what that person does. Three
properties matter for every card: **can it be hired** (entry position), **does it require
salary**, and **can it be trained** (future career options printed bottom-left).

## Card anatomy (from the rulebook's Concepts page)

| Marking | Meaning |
|---|---|
| ▲ top-left | **Entry position** — can be hired by recruiters |
| $ (salary) icon | **Requires a salary** of $5 at payday |
| Bottom-left career options | **Can be trained** into those cards |
| ★ bottom-left | **Top position** — each player may only own **one** of that particular card |
| Top-right number | **Range**, counted by road (or by zeppelin if the card has the zeppelin symbol) |

(base rules, p.3)

> ⚠️ **Confidence note.** The rulebook's card-supply table (how many copies of each card
> exist) is rendered as a graphic in the PDF, so exact per-card counts are **not** reliably
> extracted from the text layer. The counts below are marked `unverified` where that is the
> case. Do not treat them as authoritative — verify against the physical card set or the
> board layout if a decision depends on scarcity. (base rules, p.4)

## Action ordering inside the working day

Card position in the org chart does **not** determine action order — the rulebook's listed
order does. (base rules, p.7) See [[working-day-actions]].

## Employees by function

### Initiate / recruit / train

| Card | Ability | Notes |
|---|---|---|
| **Recruiting Girl** | Hire 1 person | Entry position. Salary: **no** |
| **Recruiting Manager** | Hire 1 person, or **$5 less salary** | 2x version hires... see note. Unused recruitment capacity gives a **salary discount** in phase 5 |
| **HR Director** | Hire 1 person, or $5 less salary, **4x** | Unused capacity gives salary discount. Top position ★ |
| **Management Trainee** | (no active ability — training fodder) | Trains upward into managers |
| **Trainer** | Train 1 person | |
| **Coach** | **2 training slots**; may train the *same* person **two steps** | |
| **Guru** | **3 training slots**; may train the same person **up to three steps** | Top position ★ |

### Marketing (marketeers)

| Card | Ability | Range / duration |
|---|---|---|
| **Marketing Trainee** | Place **billboard**, max duration 2 | range 2 |
| **Campaign Manager** | Place **mailbox or lower**, max duration 3 | |
| **Brand Manager** | Place **airplane or lower**, max duration 4 | range: unlimited |
| **Brand Director** | Place **radio or lower**, max duration 5 | range: unlimited |

Brand managers and directors are **not limited by range** — they can place campaigns on areas
they cannot reach by road. However, a billboard, mailbox or radio must still be placed
**adjacent to a road**. (base rules, p.8)

> ⚠️ Marketeers that are **busy** may normally **not be fired**, and busy marketeers that
> require salary **must still be paid** even if you have no money. (base rules, p.11)

### Kitchen staff (production)

| Card | Ability | Trains into |
|---|---|---|
| **Kitchen Trainee** | Produce **1 burger or 1 pizza** | Burger Cook / Pizza Cook |
| **Burger Cook** | Produce **3 burgers** | Burger Chef |
| **Burger Chef** | Produce **8 burgers** | — |
| **Pizza Cook** | Produce **3 pizzas** | Pizza Chef |
| **Pizza Chef** | Produce **8 pizzas** | — |

### Buyers (drinks)

| Card | Ability | Range |
|---|---|---|
| **Errand Boy** | Get **1 drink** of any type | — |
| **Cart Operator** | Get **2 drinks** from each source on route | 2 |
| **Truck Driver** | Get **3 drinks** from each source on route | 3 |
| **Zeppelin Pilot** | Get **2 drinks** from each source on route, **ignore roads** | 4 |

Buyers gather from **drink symbols printed on the map**. Route counting details are fiddly —
see [[buyers-and-drink-routes]].

### Managers that change price (mandatory actions)

| Card | Ability |
|---|---|
| **Pricing Manager** | Price **−$1** |
| **Discount Manager** | Price **−$3** |
| **Luxuries Manager** | Price **+$10** |

These actions are **mandatory** when the card is at work. (base rules, p.7)

### Restaurants and houses

| Card | Ability |
|---|---|
| **Local Manager** | Place **house or garden** |
| **Regional Manager** | Place **new restaurant**, "COMING SOON", drive-in available |
| **New Business Developer** | Place or move restaurant, **opens immediately**, drive-in available |

### Other

| Card | Ability |
|---|---|
| **Waitress** | Get **$3 cash**. Wins ties against a restaurant with **fewer waitresses**. Mandatory action |
| **Junior Vice President** | (senior management — see card) |
| **Senior Vice President** | |
| **Executive Vice President** | |
| **CFO** | **+50% to cash earned this round**. Mandatory action |
| **CEO** | Hire 1 person (free recruitment action, always available) |

## Training rules (critical for planning)

- Each training action trains **one person one step**.
- Only cards **on the beach** can be trained — **including just-hired employees**.
- Cards **at work** in the structure and **busy marketeers** **cannot** be trained.
- Marketeers, kitchen staff and buyers each have their **own upgrade track**. All other
  (non-entry) employees are trained **directly from managers** (black cards).
- You **may not normally train the same employee more than one step per turn**. Exceptions:
  - A **Coach** may train the same card **two steps**
  - A **Guru** may train the same card **up to three steps**
  - With the **"First to pay $20 in salaries"** milestone, you may use **multiple** trainers,
    coaches and gurus on the same card
- A Coach or Guru may instead **split attention** across multiple employees.
- You **cannot train to a position if the final card is unavailable** in the stock. But if
  going multiple steps or hiring-and-immediately-training, intermediate cards need not be
  available.
- You may only have **one copy of each ★ top-position card**.

(base rules, pp.7-8)

## Hiring rules

- **Hiring is only at entry positions** (▲).
- The CEO always grants **one free recruitment action**. Each recruitment action available
  hires **one additional employee**.
- New hires go **on the beach** — they are **not** usable this turn. (A card hired this turn
  is on the beach, and the beach is what gets trained; it does not act during the working day
  because only cards *at work* act.)
- If a deck runs out of a card type you may not hire it — **unless** you immediately train it
  to a higher level in the training sub-phase of that turn.

(base rules, p.7)

## Related

- [[working-day-actions]] — the order actions must be performed in
- [[salary-and-payday]] — which cards cost $5 and the discount rules
- [[milestones-overview]] — milestones triggered by playing/hiring specific cards
- [[marketing-campaigns]] — campaign types and ranges in full
- [[buyers-and-drink-routes]] — route-counting detail for cart/truck/zeppelin
