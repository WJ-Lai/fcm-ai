---
title: Milestone Cards — Authoritative Text (EN/中文)
description: Full authoritative text of all 40 FCM milestone cards, plus the engine-set vs rulebook-provenance distinction
created: 2026-09-26
updated: 2026-09-26
type: reference
tags: [milestone, reference, cards, lookup]
sources:
  - raw/cards-authoritative.json
  - raw/rules/fcm-base-rules-eng-v4.txt
  - raw/rules/fcm-ketchup-expansion-rules.txt
confidence: high
verified_against: base
---

# Milestone Cards — Authoritative Text

> **Provenance.** Extracted programmatically from the FCM game engine's own locale data —
> the exact strings the live game renders. Not OCR, not transcription.
> Source of truth: `raw/cards-authoritative.json`. Regenerate: `python3 scripts/extract_cards.py`.
>
> The milestone list is printed on the component sheets (base rules, p.4) and the awarding
> rules — including the "immediately awarded" and proxy-copy provisions — are in the
> milestone phase rules (base rules, p.12). Expansion milestones are described in the
> "New Milestones" chapter (ketchup rules, p.8).

**40 milestone cards total: 34 base game, 6 expansion.** The engine ships English + 中文 for
every one.

⚡ **Read this first.** This page is the *card text*. For the trigger conditions, timing
subtleties and what counts as "first", see [[milestones-overview]] — the rulebook prose
there disambiguates several cards whose one-line text is misleading on its own.

## Base milestones — achieving

| Card | 中文 | Trigger | Reward |
|---|---|---|---|
| First to Hire 3 | 首个进行3雇佣 | First to hire 3 people in 1 turn | +2 Management Trainees |
| First burger produced | 首个制作汉堡 | First burger produced | +1 Burger Cook |
| First pizza produced | 首个制作披萨 | First pizza produced | +1 Pizza Cook |
| First house built | 首个房屋 | First house built | May use multiple trainers on the same person |
| First new restaurant | 首个餐厅 | First new restaurant | Place a permanent mailbox in restaurant area |
| First to pay $20 in salaries | 首个支付 $20 或更高薪水 | First to pay $20 in salaries | May use multiple trainers on the same person |
| First to have $20 | 首个拥有$20 | First to have $20 | May see bank reserve cards |
| First to have $100 | 首个拥有100美元 | First to have $100 | CEO counts as CFO (+50% cash). May not hire a CFO |
| First to lower price | 首个降价 | First to lower price | Price -$1 |
| First to train someone | 首个培训 | First to train someone | $15 discount on salaries |

## Base milestones — playing / using employees

| Card | 中文 | Trigger | Reward |
|---|---|---|---|
| First waitress played | 首个服务员 | First waitress played | Each Waitress +$2 ($5 total) |
| First errand boy played | 首个跑腿伙计 | First errand boy played | All buyers get +1 drink from each source |
| First cart operator played | 首个手推车操作员 | First cart operator played | Buyers get range +1 |
| First marketing trainee used | 首个营销实习生 | First marketing trainee used | Free kitchen trainee + free errand boy |
| First marketeer used | 首个营销人员 | First marketeer used | $5 per good your marketeers market. Distance -? |
| First campaign manager used | 首个营销经理 | First campaign manager used | May place 1 extra marketing tile this turn |
| First brand manager used | 首个品牌经理 | First brand manager used | May place 2 different goods on 1 plane this turn |
| First brand director used | 首个品牌总监 | First brand director used | Your radio becomes permanent |
| First trainer used | 首个培训讲师 | First trainer used | Free trainer; no longer need to fire employees when broke |
| First recruiting girl used | 首个人力资源专员 | First recruiting girl used | Free Executive VP; pay no salary for him |
| First discount manager used | 首位促销经理 | First discount manager used | Remove $100 from bank each round you discount by $3 |
| First to throw away | 首个丢弃 | First to throw away food/drink | Freezer storing 10 items |

## Base milestones — marketing / selling

| Card | 中文 | Trigger | Reward |
|---|---|---|---|
| First billboard placed | 首个广告牌 | First billboard placed | No salaries for marketeers; eternal marketing |
| First airplane campaign | 首个飞机 | First airplane campaign | Count +2 open slots when determining order of play |
| First radio campaign | 首个广播 | First radio campaign | Your radios market 2 goods per turn instead of 1 |
| First burger marketed | 首个推销汉堡 | First burger marketed | +$5 for every burger sold |
| First pizza marketed | 首个推销披萨 | First pizza marketed | +$5 for every pizza sold |
| First drink marketed | 首个推销饮料 | First drink marketed | +$5 for every drink sold |
| First burger sold | 首个卖出汉堡 | First burger sold | CEO always has 4 slots |
| First pizza sold | 首个卖出披萨 | First pizza sold | Place radio (pizza, 2 turns) on each house that bought pizza |
| First lemonade sold | 首个卖出柠檬水 | First lemonade sold | Any employee can be trained on the job, preserving colour |
| First beer sold | 首个卖出啤酒 | First beer sold | May pay salary with food/drink |
| First coke sold | 首个卖出可乐 | First coke sold | Freezer storing 10 items |
| First rural marketeer used | 首个农村推销员 | First rural marketeer used | Place a highway offramp |

## Expansion milestones (Ketchup)

⚡ These require the **New Milestones** module. When it is on, **the base milestone set is
replaced entirely** — you are not adding to the base list. See [[expansion-new-milestones]].

| Card | 中文 | Trigger | Reward |
|---|---|---|---|
| First waitress used | 首个服务员 | First waitress **used** | Your salaries are $3 each |
| First cart operator used | 首个手推车操作员 | First cart operator **used** | Double drinks hauled by cart/truck/zeppelin |
| First coffee sold | 首个卖出咖啡 | First coffee sold | Build a coffee shop in the next cleanup phase |
| Someone sells your demand | 首个遭遇抢单 | Someone sells your demand | Distance -1 |
| First lobbyist used | 首个提案人 | First lobbyist used | Add a tile to the city |
| First dumpling sold | 首个卖出饺子 | First dumpling sold | Your CEO gets a bonus |

⚡ **The single most important distinction in the expansion:** these say "**used**", not
"played". Playing a card from your hand, hiring it, training it, or paying its salary does
**not** count. The employee must actually **perform its function** during the working day.
A Marketeer only counts once it has actually placed an advert. This is strictly harder than
the base "played" wording. Full detail → [[expansion-new-milestones]].

## Text-vs-rulebook discrepancies worth knowing

The engine's one-line card text is terse and in a few places is **not** the whole rule.
These are the ones most likely to mislead a model:

1. **"First marketeer used" — Distance -?** Card text truncates in the engine. The rulebook
   specifies the distance reduction concretely; read [[milestones-overview]].
2. **"First to have $100"** — the card says the CEO counts as CFO. Note it also **forbids
   hiring a CFO**; a model that only reads the first half will over-value CFO.
3. **"First burger sold" → CEO always has 4 slots.** This *overrides* the bank-broken CEO
   level rule. It interacts with [[bank-and-reserve-cards]].
4. **Marketing bonuses (+$5/unit) raise *income*, not the price on the house.** A model that
   conflates them will predict wrong winners. See [[price-managers-and-pricing]].
5. **"First pizza sold" places *radio* (duration 2), not a permanent advert.** The card is
   frequently misread as permanent.

## Engine set vs rulebook provenance

⚡ **This is the single most important thing on this page for a model that cites rules.**

There are two independent facts about every card, and confusing them produces confident
misattribution:

| Field | Question it answers |
|---|---|
| `set` | Which set does the **engine** ship the card in? (`base` / `expansion` / `obg-custom`) |
| `documented_in` | Which **rulebook** actually explains the card? (`base` / `ketchup` / `none`) |

**They disagree for 15 cards.** These are shipped by the engine in the **base** set, but the
**base rulebook never explains them** — they are written up only in the Ketchup rulebook's
"New Milestones" chapter, where they carry the "**used**" wording:

First marketeer used · First marketing trainee used · First campaign manager used ·
First brand manager used · First brand director used · First burger sold · First pizza sold ·
First lemonade sold · First beer sold · First coke sold · First recruiting girl used ·
First trainer used · First discount manager used · First house built · First rural marketeer used

**Why it matters:** if a model is asked "what does the base rulebook say about First trainer
used?", the honest answer is **nothing — the base rulebook is silent**. The rule is in the
expansion book. A model that only reads `set` will cite the wrong book with full confidence.

⚡ **A related trap:** the base rulebook describes the milestone *effects* inline while
explaining other mechanics (e.g. it mentions the $15 salary discount from "First to train
someone" inside the training section) rather than in a milestone chapter. So "not in a
milestone list" ≠ "not in the base rulebook". The audit script checks presence anywhere in
the book, which is the correct test.

Audit this at any time:

```bash
python3 scripts/verify_sources.py
```

→ Relates to: [[milestones-overview]] · [[employee-cards-full]] · [[expansion-new-milestones]]
