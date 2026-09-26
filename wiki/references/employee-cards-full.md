---
title: Employee Cards — Authoritative Text (EN/中文)
description: Full authoritative text of all 54 FCM employee cards in English and Chinese, extracted from the game engine
created: 2026-09-26
updated: 2026-09-26
type: reference
tags: [employee, reference, cards, lookup]
sources:
  - raw/cards-authoritative.json
  - raw/rules/fcm-base-rules-eng-v4.txt
  - raw/rules/fcm-ketchup-expansion-rules.txt
confidence: high
verified_against: base
---

# Employee Cards — Authoritative Text

> **Provenance.** Every name, description and Chinese translation below is extracted
> programmatically from the **FCM game engine's own locale data** (the same strings the
> live game renders), not from OCR of card photos and not hand-transcribed.
> Extraction: `python3 scripts/extract_cards.py`. Source of truth: `raw/cards-authoritative.json`.
>
> Because this comes from the engine, it is the string the rules engine itself treats as
> card text. Where it disagrees with the printed rulebook, **the engine is what the game
> enforces**. The card list itself is printed on the component sheets (base rules, p.4) and
> the individual abilities are described across the rulebook — for example the slot counts
> and structure rules (base rules, p.6), and the training paths (base rules, p.7).

**54 employees total: 32 base game, 22 expansion.** Chinese names are included because the
engine ships them (`zh_Hans` locale) and they are useful when discussing a game in Chinese.

⚡ **`set` vs `documented_in` — two different facts.** `set` is which card set the **engine**
ships the card in. `documented_in` is which **rulebook** actually explains it. They are not
always the same, and the 15-card gap matters: see
[[milestone-cards-full]].

## Slots / corporate structure

These determine how many employees a restaurant can hold. Slots are the backbone of
restructuring: every employee you keep in your structure occupies slots, and your CEO's
level caps the total. See [[company-structure-and-slots]].

| English | 中文 | Effect | Set |
|---|---|---|---|
| Management Trainee | 管理培训生 | 2 slots | base |
| Junior Vice President | 总经理助理 | 3 slots | base |
| Vice President | 副总裁 | 4 slots | base |
| Senior Vice President | 高级副总裁 | 5 slots | base |
| Executive Vice President | 执行副总裁 | 10 slots | base |

⚡ **Trap:** more slots is not automatically better. A 10-slot EVP costs $10/turn in salary.
Filling slots with expensive staff you cannot pay is the single most common way to go bankrupt.

## Cash & turn order

| English | 中文 | Effect | Set |
|---|---|---|---|
| Waitress | 服务员 | Get $3 cash. Win ties against restaurants with fewer waitresses | base |
| B-Movie Star | B-电影明星 | Win all ties; first choice in turn order | expansion |
| C-Movie Star | C-电影明星 | Win all ties; first choice in turn order (unless B at work) | expansion |
| D-Movie Star | D-电影明星 | Win all ties; first choice in turn order (unless B or C at work) | expansion |
| Jazz Musician | 爵士乐手 | Get $15 cash. Lose ties against restaurants with fewer musicians | expansion |

⚡ **Trap:** Waitress/Jazz Musician are *discard* employees — they hand you cash once and
then leave. They are not permanent staff and do not occupy your structure long-term.
Movie stars (Ketchup) are the tie-breaking engine; ordering matters (B > C > D).

## Hiring & training

| English | 中文 | Effect | Set |
|---|---|---|---|
| Recruiting Girl | 人力资源专员 | Hire 1 person | base |
| Recruiting Manager | 人力资源经理 | 2x Hire 1 person or $5 less salary | base |
| HR Director | 人力资源总监 | 4x Hire 1 person or $5 less salary | base |
| Trainer | 培训讲师 | Train 1 person | base |
| Coach | 培训指导员 | 2 training slots. May train the same person two steps | base |
| Guru | 培训专家 | 3 training slots. May train the same person up to three steps | base |

⚡ **Trap:** training is *instead of* the employee's normal action for that round — a trained
employee does not also work. See [[working-day-actions]].

## Marketing

| English | 中文 | Effect | Set |
|---|---|---|---|
| Marketing Trainee | 营销实习生 | Place billboard, max duration 2 | base |
| Campaign Manager | 营销经理 | Place mailbox or lower, max duration 3 | base |
| Brand Manager | 品牌经理 | Place airplane or lower, max duration 4 | base |
| Brand Director | 品牌总监 | Place radio or lower, max duration 5 | base |
| Gourmet Food Critic | 美食评论家 | Market to all houses with a garden. Max duration 3 | expansion |
| Mass Marketeer | 大众推销员 | Play an extra marketing phase this turn. Do not remove an extra duration token | expansion |
| Rural Marketeer | 乡村推销员 | Place a giant billboard next to the rural area tile | expansion |
| Hawker Marketeer | 小贩推销员 | Place a hawker marketing campaign | expansion |

⚡ **Trap:** "max duration" is a *cap*, not a fixed value — you choose any duration up to
the cap. And the milestone bonus for marketing raises **income, not the price on the
house**; see [[price-managers-and-pricing]] and [[milestones-overview]].

## Drinks & delivery

| English | 中文 | Effect | Set |
|---|---|---|---|
| Errand Boy | 跑腿伙计 | Get 1 drink of any type | base |
| Cart Operator | 手推车操作员 | Get 2 drinks from each source on route | base |
| Truck Driver | 货车驾驶员 | Get 3 drinks from each source on route | base |
| Zeppelin Pilot | 飞艇驾驶员 | Get 2 drinks from each source on route, ignore roads | expansion |
| Delivery Driver | 送货司机 | Distance from any residence with 2+ demand is 0 | expansion |

⚡ **Trap:** Cart/Truck "from each source" means each producer tile along the route, so a
long route multiplies fast. Zeppelin Pilot ignores roads entirely — a different geometry
from every other drink employee.

## Production

| English | 中文 | Effect | Set |
|---|---|---|---|
| Kitchen Trainee | 见习厨师 | Produce 1 burger or 1 pizza | base |
| Burger Cook | 汉堡厨师 | Produce 3 burgers | base |
| Burger Chef | 汉堡主厨 | Produce 8 burgers | base |
| Pizza Cook | 披萨厨师 | Produce 3 pizzas | base |
| Pizza Chef | 比萨主厨 | Produce 8 pizzas | base |
| Fry Chef | 炸薯条主厨 | Bonus: +$10 per sale | expansion |
| Kimchi Master | 泡菜大师 | Produce 1 kimchi at end of cleanup phase | expansion |
| Noodle Cook | 面条厨师 | Produce 6 noodles | expansion |
| Noodle Chef | 面条主厨 | Produce 16 noodles | expansion |
| Sushi Cook | 寿司厨师 | Produce 2 sushi | expansion |
| Sushi Chef | 寿司主厨 | Produce 5 sushi | expansion |
| Barista Trainee | 见习咖啡师 | Produce 1 coffee | expansion |
| Barista | 咖啡师 | Produce 2 coffee | expansion |
| Lead Barista | 首席咖啡师 | Produce 5 coffee | expansion |
| Dumpling Cook | 饺子厨师 | Produce 3 dumplings | expansion |
| Dumpling Chef | 饺子主厨 | Produce 8 dumplings | expansion |

⚡ **Trap:** Kimchi Master produces in the **cleanup phase**, not the working day — so kimchi
is available for the *next* dinnertime, and it interacts with the fridge. See [[expansion-noodles-and-kimchi]].
Fry Chef is a **bonus on sales**, not production: it changes income, not supply.

## Price & finance

| English | 中文 | Effect | Set |
|---|---|---|---|
| Pricing Manager | 定价经理 | Price -$1 | base |
| Luxuries Manager | 奢侈品经理 | Price +$10 | base |
| Discount Manager | 折扣经理 | Price -$3 | base |
| CFO | 首席财务官 | Add +50% to cash earned this round | base |
| Local Manager | 区域经理 | Place new restaurant, "COMING SOON". Drive-in available | base |
| Regional Manager | 大区经理 | Place or move restaurant, opens immediately. Drive-in available | base |
| Night Shift Manager | 夜班经理 | All employees who don't require a salary work twice | expansion |

⚡ **Trap:** "Local Manager" in this engine = *place new restaurant, COMING SOON* (opens next
round); "Regional Manager" = *place or move, opens immediately*. The Chinese names
(区域经理 / 大区经理) do **not** line up with the English one-to-one reading order — trust the
effect column, not the name.

⚡ **Trap (CFO):** CFO modifies cash earned *this round*. If you also hold the
"First to have $100" milestone, the milestone grants a stand-in CFO — see [[milestones-overview]].

## Restaurants & map

| English | 中文 | Effect | Set |
|---|---|---|---|
| New Business Developer | 新业务拓展经理 | Place house or garden | base |
| Lobbyist | 提案人 | Place 1 road or park | expansion |

## Expansion-only employees (quick index)

Jazz Musician, B/C/D-Movie Star, Fry Chef, Kimchi Master, Noodle Cook/Chef, Sushi Cook/Chef,
Barista Trainee/Barista/Lead Barista, Dumpling Cook/Chef, Gourmet Food Critic, Lobbyist,
Mass Marketeer, Night Shift Manager, Rural Marketeer, Hawker Marketeer, Delivery Driver.

→ Relates to: [[employees-overview]] · [[milestones-overview]] · [[expansion-overview]]
