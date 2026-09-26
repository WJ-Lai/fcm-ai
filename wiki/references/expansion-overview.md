---
title: Ketchup Expansion Overview
description: The FCM Ketchup expansion — its modular design, the ketchup mechanism, and every module it introduces
created: 2026-09-25
updated: 2026-09-25
type: reference
tags: [expansion, reference, milestone, phase]
sources: [raw/rules/fcm-ketchup-expansion-rules.txt]
confidence: high
verified_against: ketchup
---

The **Ketchup** expansion is not a single rules change — it is a **set of independent
modules**. Each module can be played on its own, and the rulebook publishes recommended
"chef's choice" pairings. (ketchup rules, p.6)

> ⚠️ **This is the single most important thing to understand before enabling anything:** the
> modules are additive and opt-in. Nothing here applies unless that module is selected. An agent
> must know **which modules are in play** before reasoning about legality — several modules
> directly contradict base-game behaviour.

## General rule that applies to all modules

**Large food and drink pieces represent 5 of the respective type.** (ketchup rules, p.6)

## The module list

| Module | What it adds | Base-game interaction |
|---|---|---|
| **New milestones** | A replacement milestone set | ⚠️ **Removes all base milestones** |
| **Coffee** | Coffee shops, coffee demand, route-drinking | New resource; coffee cannot be frozen |
| **Ketchup** | The "Someone sells your demand" milestone | New milestone |
| **Noodles** | Noodle cooks/chefs, noodles as universal substitute food | Noodles cannot be marketed |
| **Kimchi** | Kimchi Master, sushi/noodles interactions | Needs New Districts for full effect |
| **Sushi** | Sushi chef | Interacts with kimchi/noodles |
| **New districts** | City tiles, park, apartments | Expands the map |
| **Rural marketeers** | Highway off-ramp placement | New milestone |
| **Mass marketeers** | Extra marketing phases | Global, additive effect |
| **Night shift managers** | Extra production | |
| **Reserve prices** | ⚠️ Replaces reserve-card effect entirely | Base reserve cards **not used** |
| **Hard choices** | Milestone depletion markers | |
| **Movie stars / Gourmet food critic / Fry chefs / Lobbyists / 6 players** | See individual sections | |

## Recommended starting scenarios

The rulebook suggests starting with the two major expansions:

- **New milestones** — "This shakes the strategic space up quite a bit already!" (ketchup rules, p.6)
- **Coffee** — "makes board positions even more important. Try using this one stand-alone, with or
  without the New Milestones module." (ketchup rules, p.6)

### Curated pairings from the rulebook (verbatim names)

| Name | Modules |
|---|---|
| Korean city | New districts (≥1 apartment tile) + Kimchi |
| Nightlife | New milestones + Night shift managers |
| Sustenance | Coffee + Fry chefs |
| Upmarket Area | New milestones + Park tile from new districts + Gourmet food critic + Sushi |
| City builder | Lobbyist + New districts + Rural marketeers |
| Asian Fusion | Sushi + Kimchi + Noodles + Ketchup |
| First mover | Hard choices + Ketchup + Movie stars + Lobbyists + Reserve prices |
| Overtime | Night shift managers + Mass marketeers + Rural marketeers + New districts + Noodles + Reserve price |
| Henri Lo menu | All modules except 6 players & Hard choices |

(ketchup rules, p.6)

## Modules that CONTRADICT the base game

These are the dangerous ones for an agent — they change rules the base pages describe as fixed:

| Module | Base rule it replaces |
|---|---|
| **New milestones** | "Remove **all** the milestone cards from the base game. Instead, use the new milestone cards provided…" (ketchup rules, p.8) |
| **Reserve prices** | "The bank reserve cards chosen at the start of the game **no longer impact the number of slots or the money in the bank**. Instead, they change the **base price** of all products." (ketchup rules, p.16) |

> 🚨 **An agent must check module selection first.** If **Reserve prices** is on, the base-game
> bank-break/slot rules in [[bank-and-reserve-cards]] do **not** apply — see
> [[expansion-reserve-prices]]. If **New milestones** is on, [[milestones-overview]] is void —
> see [[expansion-new-milestones]].

## Related

- [[expansion-new-milestones]] — the replacement milestone set in full
- [[expansion-coffee]] — the coffee module
- [[expansion-noodles-and-kimchi]] — noodles, kimchi, sushi
- [[expansion-marketing-modules]] — mass marketeers, rural marketeers, lobbyists
- [[expansion-reserve-prices]] — the reserve-card replacement
- [[milestones-overview]] — base milestones (void if the New milestones module is used)
