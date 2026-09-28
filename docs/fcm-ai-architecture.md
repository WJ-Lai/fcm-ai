# FCM AI architecture analysis

Status: recommended design and implementation roadmap

Updated: 2026-09-27

Scope: base-game Food Chain Magnate on the OBG Agent API; 2–6 players; human/AI mixed games

## Executive conclusion

The current OBG Agent API and MCP are good **control infrastructure**. They authenticate one AI
per seat, expose public game state, enumerate legal operations and execute them through the
official FCM rules code. DeepSeek completing a game proves that this control loop works.

It does **not** prove that the model has a strategy. The current `fcm-ai` project contains a precise
rules knowledge base and a minimal API client, but almost no decision system. A model that sees a
list of legal actions will naturally choose locally plausible actions—often the first thing it can
do—without understanding whether the action contributes to a winning engine.

The recommended first serious AI is therefore not “LLM alone” and not “start with PPO.” It is a
hybrid, model-based Agent:

1. The existing official FCM engine remains the sole legality and transition authority.
2. Deterministic calculators turn the raw game state into strategic features and score tactical
   consequences.
3. Phase-specific generators produce a small set of complete, legal candidate plans.
4. A planner searches or compares those candidates against several opponent models.
5. An LLM may choose and explain a high-level plan, but it never performs raw board arithmetic or
   invents executable actions.
6. Persistent per-game memory carries commitments, opponent hypotheses and failed predictions
   across calls.
7. Imitation learning and self-play are added only after the simulator, baselines and evaluation
   league are trustworthy.

PPO is technically possible later, with hierarchical action masking and self-play. It is not the
best starting point for FCM because the game combines a long horizon, sparse terminal feedback,
large combinatorial turn plans, variable player counts, simultaneous hidden choices and
competitive general-sum play.

### What to keep from the rules wiki

The rulebook wiki and the web-element/rule mapping are **not a replacement rules engine**, but
they are not disposable. Official JavaScript is the authority for legality, state transitions and
exact arithmetic; it is poorly shaped as strategy context for an LLM and does not explain why a
choice is strategically important. Keep the verified rules, citations, semantic names, phase
decision cards and compact mappings for human review, prompt grounding and explanation. Remove
only code that independently reimplements official map/rule algorithms or stale mappings that
cannot be verified against the versioned wire format. This boundary preserves useful teaching
material without creating two competing implementations of FCM.

## Engineering review corrections

The overall direction survives engineering review, with these mandatory constraints:

1. **No second rules implementation.** Price, salary, reachability, dinner ordering and payouts
   must be obtained from or parity-tested against the official JavaScript engine. A Python policy
   may consume derived facts, but must not become a competing FCM rules engine.
2. **The engine environment is the first hard dependency.** Search and reinforcement learning are
   blocked until a fast, deterministic, cloneable environment reproduces online transitions.
3. **Decision support is side-effect free.** Inspecting a position or projecting dinner must never
   award milestones, consume inventory, pay money or advance the canonical game. Projection runs
   on a clone and returns both the result and the source version/ruleset hash.
4. **Observation and hidden state are separate types.** The simulator may hold complete state, but
   a policy receives only its public/seat-specific observation. Simultaneous opponent choices are
   beliefs until revealed.
5. **One stage, one promotion gate.** A later stage starts only when the earlier stage beats its
   stated baseline and passes parity/adversarial tests. This prevents an opaque learned policy from
   hiding an incorrect environment.
6. **Use the right implementation language at each boundary.** Engine adapters and deterministic
   derived facts stay in JavaScript beside the official engine. Python remains suitable for
   orchestration, experiment tracking and ML policies through a versioned JSON protocol.
7. **Keep the first implementation base-game-only.** Expansion state is preserved but not scored
   until each module receives its own parity scenarios.
8. **Move the offline engine environment onto the critical path.** HTTP/SQLite is suitable for
   acceptance, not for benchmark leagues, candidate evaluation or learning. Build
   `reset/observe/legal/step/clone` beside the first baselines rather than waiting for search.
9. **Bound candidate generation explicitly.** Generate and prune candidates one decision phase at
   a time, with deterministic budgets and dominance rules. Start with a one-turn horizon; compose
   multi-turn plans only after local coverage and latency are measured.
10. **Never label a belief as a calculation.** Reachability, current inventory, price, distance and
    resolution of a frozen public state are deterministic engine derivations. Opponent unrevealed
    actions and future reactions are sampled beliefs with provenance and confidence.

## 1. What an FCM player actually has to understand

FCM is not a sequence of independent legal moves. Early decisions create an economic engine whose
effects compound over many rounds:

- The starting restaurant determines which road network, houses and drink sources are cheaply
  reachable.
- Hiring and training form a technology tree. A useful card hired now normally cannot work until a
  later turn, so a move is valuable because of what it enables, not just what it does immediately.
- Company restructuring decides both productive capacity and turn-order priority. Filling every
  slot can improve the current turn while sacrificing the next order choice.
- Milestones are one-turn races and can permanently change salary, price, income, range or company
  capacity.
- Marketing creates demand that competitors may satisfy. “Generate more demand” is not inherently
  good; the AI must forecast who can deliver the complete basket at the lowest price-plus-distance.
- A price cut, restaurant placement, production plan and turn-order choice interact. Evaluating
  them separately misses the main tactics of the game.
- Salary creates a cash-flow constraint. A larger company can be weaker if its recurring payroll
  is unsupported.
- The first bank break and reserve choices alter the remaining horizon and CEO capacity. The best
  plan depends on whether the game is likely to end soon or allow an engine to mature.
- Restructuring and reserve-card choices are simultaneous and temporarily hidden. A strong player
  acts on beliefs about opponents rather than privileged state.

The local official sources and compiled rule pages already describe these mechanics:

- `raw/rules/fcm-base-rules-eng-v4.txt`
- `wiki/concepts/turn-structure-and-phases.md`
- `wiki/concepts/dinnertime-sales-resolution.md`
- `wiki/concepts/company-structure-and-slots.md`
- `wiki/playbooks/milestone-strategy.md`

Those documents explain the rules. They do not yet constitute a policy for trading off all of the
above in a concrete position.

## 2. Why the current LLM looks like “it does whatever it can”

### 2.1 The current client has no policy

`src/fcm_agent.py` is intentionally a transport client. It can fetch state, list legal actions and
submit a versioned command. It has no position evaluator, strategy memory, candidate generator,
opponent model, search procedure or learning component.

The existing system prompt asks the model to inspect legal actions and consult the wiki. That is
useful for avoiding rule hallucinations, but “do not break a rule” and “maximize the chance of
winning” are different problems.

### 2.2 A rulebook is not a strategy book

The knowledge base answers questions such as whether a garden doubles a bonus or when a newly hired
employee can work. It mostly cannot answer:

- Which opening is best on this generated map?
- Is a milestone race worth delaying a trainer?
- Should I create demand now if another chain is closer?
- Is it better to take income this turn or leave slots open for first choice next turn?
- Which opponent is the actual threat, and how will they respond?
- Does the current bank horizon reward immediate cash or a longer training chain?

Only one current page, `wiki/playbooks/milestone-strategy.md`, meaningfully enters this strategy
layer. The rest correctly stays close to rules.

### 2.3 Reactive retrieval fails before the model knows what it does not know

`scripts/ask.py` is lexical retrieval. It works when the Agent asks a good rule question. A novice
policy often does not notice that price, distance, salary timing or a milestone window is the
decisive issue, so it never asks the query that would retrieve the relevant page.

Rules therefore need to be loaded **proactively by decision type**, not only reactively after the
LLM feels uncertain. For example, a marketing decision should automatically receive the sales,
marketing, price and reachable-house decision cards.

### 2.4 Each tool call is effectively a new working session

An LLM's conversation context is not a reliable game-state database. Long games dilute old plans,
and separate Agent runs may not share context at all. A strategic memo must be stored outside the
model and supplied on every decision.

### 2.5 Raw identifiers consume reasoning capacity

The MCP returns employee ids, goods ids, square indices, raw history records and a flat employee
array. Much of the information is technically derivable, but repeatedly decoding it leaves fewer
tokens and less attention for actual strategy. It also makes silent arithmetic mistakes likely.

## 3. Is the current MCP information sufficient?

### 3.1 Sufficient for safe base-game control: yes

For the supported base-game phases, it provides the essential execution loop:

- authenticated identity and seat;
- versioned public snapshot;
- players, money, resources, employees, restaurants and milestones;
- board, houses, demand, campaigns and public supply;
- phase, subphase, turn order and bank state;
- legal action shapes and legal parameters;
- authoritative rejection of illegal, stale or spoofed commands.

This is enough for an Agent to finish a game without modifying server code or bypassing FCM rules.

### 3.2 Sufficient as raw input for a custom strategy program: mostly

A program that imports engine constants and implements calculators can reconstruct much of what a
human sees. `houseDemands.restaurantDistances` is particularly useful. The official engine source
also remains available locally for exact calculations.

However, “the value exists somewhere in the raw state” is not the same as a stable observation
contract suitable for LLMs, search or reinforcement learning.

### 3.3 Sufficient for strong LLM-only play: no

The important missing or opaque decision features are:

- A decoded company structure: which employees report to the CEO, which report to each manager,
  free slots and next-turn restructuring capacity.
- Each player's effective unit price, permanent bonuses, salary due and available recruiting and
  training capacity.
- A decoded road graph with restaurant entrances, sources, shortest paths and reachability.
- For every demanded house: eligible suppliers, complete-basket feasibility, price, distance,
  tie-break position, likely winner, units consumed and projected income.
- A projected dinner result under the current public state.
- Milestone race status: available, claimable this turn, threatened by which opponent, and likely
  strategic effect.
- A semantic history stream. Raw history codes are useful for replay but poor input for an LLM.
- Complete candidate company structures and complete working-day plans. The current API often
  exposes primitive ingredients, leaving the client to solve a large combinatorial assembly task.
- A consequence/simulation interface for comparing legal plans without committing them.
- Persistent strategic memory and explicit uncertainty about simultaneous hidden choices.

The first five items can be deterministically derived without changing any FCM rule. They should
live in a client-side `DecisionView` compiler initially. Only generally useful, objectively defined
fields should later be considered for the canonical API.

### 3.4 Information that must remain hidden

A stronger AI must not become a cheating AI. It must not receive another player's unrevealed
restructure, reserve card or temporary simultaneous move. Search must sample plausible hidden
choices from a belief model rather than read them from the engine's private context.

## 4. Candidate implementation approaches

### A. LLM + wiki + MCP only

Useful for demonstrations and natural-language explanations. Cheap to build, but inconsistent,
poor at geometry and arithmetic, forgetful across turns and weak at long-horizon credit assignment.
This should remain a convenience client, not the target AI.

### B. Scripted heuristic AI

Implement deterministic opening templates, calculators and weighted evaluations. This can become
competent much sooner than RL, is debuggable, produces training data and establishes a meaningful
baseline. Its weakness is brittleness when the position leaves its templates.

### C. Hybrid LLM + deterministic planner — recommended first target

The planner generates and calculates legal plans; the LLM chooses strategic intent, compares
trade-offs, maintains an opponent narrative and explains the final choice. Execution accepts only
a candidate id already validated by code.

This combines reliable mechanics with flexible high-level reasoning and lets every component be
tested independently.

### D. Search with the official engine

A shallow beam search or Monte Carlo tree search can compare candidate turn plans if the engine can
be cloned and stepped cheaply. Because FCM has multiple opponents and simultaneous hidden phases,
the search needs scripted/belief-sampled opponent policies rather than assuming a single perfectly
observed adversary.

This is more promising than asking an LLM to mentally simulate five rounds. It also produces
state/action/value data for later learning.

### E. Reinforcement learning / self-play

Feasible only after an efficient environment exists. The original PPO algorithm is a general
on-policy optimizer, not a ready-made game-playing architecture. MAPPO results show PPO can be a
strong baseline in cooperative multi-agent benchmarks, but FCM is competitive and general-sum, so
that evidence does not transfer directly.

AlphaZero-style search also does not transfer directly: its standard setting is two-player,
zero-sum and perfect-information. FCM has 2–6 players and temporary hidden simultaneous actions.
ReBeL addresses imperfect information but is proved for two-player zero-sum games, again not this
full setting. These methods provide design ideas, not drop-in solutions.

OpenSpiel is a useful conceptual target because it explicitly models n-player, general-sum,
simultaneous-move and imperfect-information games. Porting all FCM rules into a second OpenSpiel
implementation would be expensive and risky, so the better first step is an OpenSpiel-like adapter
around the existing official JavaScript engine.

## 5. Recommended architecture

Use a hexagonal design so live play, offline simulation, heuristics, LLMs and learned policies can
be replaced independently:

```text
                       ┌──────────────────────────┐
Live OBG HTTP/MCP ────▶│ Environment port         │◀──── Offline engine simulator
                       │ observe / legal / step    │
                       └────────────┬─────────────┘
                                    ▼
                       ┌──────────────────────────┐
                       │ DecisionView compiler    │
                       │ graph + economy + races  │
                       └────────────┬─────────────┘
                                    ▼
             ┌──────────────────────┴─────────────────────┐
             ▼                                            ▼
┌──────────────────────────┐                 ┌──────────────────────────┐
│ Candidate plan generator │                 │ Persistent game memory   │
│ complete legal macros    │                 │ goals / beliefs / errors │
└────────────┬─────────────┘                 └────────────┬─────────────┘
             └──────────────────────┬─────────────────────┘
                                    ▼
                       ┌──────────────────────────┐
                       │ Evaluator + search       │
                       │ heuristics/value/rollout │
                       └────────────┬─────────────┘
                                    ▼
                       ┌──────────────────────────┐
                       │ Policy selector          │
                       │ scripted / LLM / learned │
                       └────────────┬─────────────┘
                                    ▼
                       validated candidate id only
```

The live adapter uses the current Agent API. The offline adapter runs the same official rules code
without HTTP, database writes or browser rendering. Neither planner nor policy is allowed to mutate
canonical game state directly.

## 6. DecisionView: the state an AI should reason over

Keep the authoritative raw snapshot, then compile a normalized observation with stable ids.

### Global features

- phase, subphase, turn and acting/pending seats;
- bank, bank-break count and estimated remaining horizon;
- full turn order and next-order availability;
- public employee, campaign and milestone supply;
- enabled modules and ruleset hash.

### Board graph

- road nodes and edges;
- houses, gardens and complete demand baskets;
- restaurant entrances, open/coming-soon state and owner;
- drink sources and campaign coverage;
- shortest legal distances from each house to each chain;
- legal restaurant/marketing placements expressed both as engine index and semantic coordinates.

A graph representation is preferable to a screenshot or an unexplained flat tile array.

### Per-player economy and engine

- cash, resources and bankruptcy;
- decoded company hierarchy, beach, free slots and salary obligation;
- recruiting/training/production/marketing capacity available this turn;
- effective price, income bonuses and tie-break strength;
- restaurants and their reachable market;
- milestones held and strategically live races.

### Competition matrix

For each demanded house and each player:

- can supply the full basket;
- reachable;
- unit price and road distance;
- price-plus-distance score;
- tie-break result;
- projected goods consumed and revenue **if the current public state were frozen and resolved
  now**.

This matrix is the most important missing bridge between rules and strategy.

Every value carries one of these origins:

- `observed`: present in the seat-safe server observation;
- `derived`: deterministically computed by the official engine from that observation;
- `believed`: produced by an opponent model for unrevealed or future choices, with model id,
  confidence and sample count.

The deterministic matrix must not call its frozen-state winner the “likely winner.” A likely
future winner exists only after sampling one or more explicit opponent beliefs.

### Memory and belief

Store a small `GameMemory` record outside the LLM:

```json
{
  "game_id": 63,
  "strategy": "short description of the current economic plan",
  "commitments": ["employees being trained toward a capability"],
  "milestone_races": ["target, deadline, rival threat"],
  "opponent_models": {"seat": {"observed_plan": "...", "confidence": 0.0}},
  "horizon_assumption": "short | medium | long",
  "last_prediction": {"expected_income": 0, "actual_income": 0},
  "lessons": ["prediction errors or invalid assumptions"]
}
```

Update it after every revealed simultaneous phase and dinner result. Never treat a hypothesis as
an observed fact.

## 7. Action space design

Do not make a learning algorithm select arbitrary JSON tokens. Use the authoritative legal list as
an action mask and define hierarchical, phase-specific decisions.

### Primitive level

The current API operations remain the execution vocabulary: place restaurant, select reserve,
place employees, choose turn order, hire, train, market, produce, collect drinks, build, open or
move a restaurant, resolve payday/cleanup and end a subphase/turn.

### Macro level

Planning and learning should operate on complete candidates:

- setup: `(restaurant square, rotation)`;
- reserve: one of the legal cards;
- restructure: a complete valid company hierarchy plus expected free slots;
- order: one legal order position;
- working day: a complete sequence of hires, training, campaigns, production, construction and
  restaurant actions ending at a valid boundary;
- payday/cleanup: a complete payment or discard plan.

The generator must not enumerate a Cartesian product of the whole working day. Use a staged beam:

```text
official legal primitives
        │
        ▼
phase-local expansion ── deduplicate ── hard legality/dominance pruning
        │                                      │
        └──────── retain top K per intent ◀────┘
                               │
                               ▼
                    one-turn macro candidates
                               │
                   later: bounded multi-turn search
```

Each phase has a deterministic expansion budget, a safe fallback and explicit pruning rules.
Examples include removing strictly worse restaurant placements with identical reach, structures
that use more slots for the same capabilities, and production plans that create unavoidable waste
without gaining a milestone. Preserve diversity with a small top-K set per strategic intent rather
than only the globally highest immediate score. Benchmarks record generated, pruned and evaluated
counts plus latency.

## 8. Evaluation function before learning

Start with an explainable evaluator rather than arbitrary weights hidden in a prompt. Candidate
features should include:

- projected income and market share this dinner;
- cash after salary and risk of forced firing;
- employee capability available next turn;
- milestone value and probability of winning/losing its race;
- price/distance margin on contested houses;
- demand the Agent can exploit versus demand donated to rivals;
- turn-order flexibility and free slots;
- restaurant network coverage;
- inventory waste;
- estimated game horizon and terminal rank probability.

Weights must depend on phase and horizon. Immediate money is more valuable near the second bank
break; training capacity is more valuable early. The first version can use explicit weights, but
every score must produce a breakdown so failures can be diagnosed and later fitted from data.

## 9. Reinforcement-learning formulation

### Observation space

Use the `DecisionView`, not raw prose. Encode global scalars, per-player sets and the board graph.
A graph neural network or set/attention encoder naturally handles variable maps and player counts;
a fixed padded tensor is acceptable for an initial base-game experiment.

The observation must exclude unrevealed opponent choices. A recurrent state or belief model can
summarize public action history.

### Action space

Use a variable set of generated legal macro-actions. Score each candidate with an action embedding,
then mask everything not generated by the official legality layer. For especially large candidate
sets, sample/prune before policy evaluation; Sampled MuZero demonstrates the general planning idea
for complex action spaces.

### Transition function

Build an in-process or persistent Node environment around the existing FCM engine:

```text
reset(seed, players, options) -> observations
legal(seat)                  -> candidate primitives/macros
step(seat, action)           -> observations, rewards, terminal, info
clone()                      -> independent search branch
```

It must support deterministic seeds, simultaneous-action buffers, hidden observations, fast clone
and millions of steps without Django, SQLite or network calls.

### Reward

The primary reward should stay aligned with winning:

- two players: terminal win/loss, with a documented tie rule;
- multiplayer: normalized terminal rank plus a small normalized final-money tie-break;
- training reports should always include raw win/rank metrics independent of shaped reward.

FCM's reward is sparse. Dense shaping can help but can also teach pathological money farming or
premature demand creation. If shaping is used, prefer a potential-difference form based on a
validated, frozen position evaluator:

```text
r'(s,a,s') = r(s,a,s') + gamma * Phi(s') - Phi(s)
```

`Phi` may be promoted from the deterministic evaluator only after its predictions are calibrated
against held-out completed games. The theoretical policy-invariance result assumes a Markov state
and consistent discounting; FCM's partial observations and changing opponent population make it a
design guide, not a guarantee. Always run terminal-only and shaping ablations, and promote on raw
win/rank metrics rather than shaped return.

### Opponent population

Self-play against only the latest policy tends to cycle or overfit. Maintain a league containing:

- random legal and first-legal policies;
- the existing OBG built-in AI;
- several scripted strategic archetypes;
- frozen historical learned policies;
- the current candidate policy.

Evaluate every seat, map seed and player count. Do not call an Agent stronger because it beats one
fixed opponent from one seat.

### Is PPO appropriate?

PPO can be a baseline after the above environment exists. It will require:

- hierarchical or candidate-set policy heads;
- legal-action masking;
- recurrent memory or belief features;
- parallel self-play environments;
- careful reward normalization and long-horizon credit assignment;
- population-based opponents rather than a single stationary environment.

That is a substantial project. PPO is not a substitute for defining the observation, actions,
simulator and evaluation protocol. A search-guided value model or imitation-first pipeline is more
likely to deliver useful play earlier.

## 10. Role of the LLM in the recommended system

The LLM should receive:

1. a compact `DecisionView` summary;
2. persistent `GameMemory`;
3. the relevant phase decision cards from the wiki;
4. 3–10 validated candidate plans;
5. deterministic consequence estimates and uncertainty;
6. the strategic objective: maximize terminal rank, not merely make progress.

It returns strict structured output such as:

```json
{
  "candidate_id": "plan-04",
  "reason": "one concise strategic comparison",
  "assumptions": ["opponent seat 2 likely competes for house 7"],
  "memory_update": {
    "strategy": "...",
    "milestone_races": []
  }
}
```

Only `candidate_id` is executable. The planner ignores invented actions in free text. The LLM's
prediction is compared with the revealed result, and the error is stored for the next turn.

This makes the LLM useful where language models are strongest—abstraction, comparison and
explanation—while calculators and the official engine handle exactness.

## 11. Implementation roadmap

### Current implementation checkpoint (2026-09-27)

- The base-game `reset/observe/legal/step/clone` environment now executes the official JavaScript
  engine entirely in memory, including simultaneous-move aggregation and seat-specific views.
- Because the inherited Pinia/browser runtime is process-global, all branches in one process share
  a FIFO executor. Parallel rollouts must use isolated worker processes; this prevents search
  branches from silently contaminating one another while retaining safe cloning semantics.
- Thirty-five seeded phase/subphase fixtures detect ruleset and legal-action drift; cloned dinner
  resolution matches the official transition and restructuring resolves without mutating its
  parent branch.
- Deterministic `safe-first-legal-v1` and seeded `random-legal-v1` weak policies now share a JSON
  benchmark runner. Fixed two-player and three-player deterministic seeds reached Game Over in
  197 and 606 commands; the first two two-player random seeds reached Game Over in 185 and 178
  commands with no rejected actions. The random policy randomizes only within strategically viable action
  families so it remains a completion baseline rather than an endless legal-action fuzzer.
- The benchmark exposed and regression-tested two real integration defects: explicit Agent
  restructuring needed to confirm the normal UI warning, and last-player-standing Game Over had
  to be persisted instead of remaining browser-only state.
- The randomized run exposed another inherited simultaneous-phase boundary: players automatically
  skipped during restructuring/payday could leave an empty move envelope for the final submitter
  to decode. The official client path now marks and safely ignores only seats that the controller
  itself declares skippable; no salary or restructuring rule was reimplemented.
- The legacy official `FcmAI` is now available only through a dedicated seeded offline benchmark
  adapter. It remains the original state-mutating 1v1 controller rather than pretending to be an
  external Agent policy. Normal offline steps disable its implicit browser auto-run, while the
  online browser default is unchanged. Benchmark output records a separate `policyHash` for
  `FCM_AI.js` in addition to the ruleset hash.
- A two-map/four-game paired-seat smoke league completed 4/4 with zero violations. Seat 0 won all
  four games: when the built-in policy had seat 0 it finished with $212 and $497 against $199 and
  $21; when the deterministic baseline had seat 0 it finished with $471 and $382 against $59 and
  $126. Both policies therefore had mean rank 1.5 in this tiny sample. This is a strong warning
  about seat bias, not a statistically useful policy-strength result.
- This completes the adapter part of the weak-baseline milestone, not the strategy AI. A larger
  paired league, privacy-safe human trajectory import, `DecisionView` economics, bounded candidate
  generation and evaluators remain next.
- The human-data trust boundary now has strict import and independent-review records. It requires
  consent, license, one-seat provenance, legal advertised actions and explicit reviewer
  attestations; beliefs, temporary simultaneous choices, credentials and prose fail closed. A
  trusted live-UI exporter is still required before any real human trace enters the corpus.
- Company/economic decoding is now authoritative rather than prompt-derived. Every state includes
  CEO/shared subordinate slots, free slots, salary liabilities, effective unit price/discount and
  recruiting, training, production, marketing and restaurant-building capacity. The official save
  stores subordinate slots as a pool, so the view deliberately does not invent manager-parent
  links. Thirty-five phase fixtures exercise the projection, and missing official functions fail
  closed.
- Public milestone and market-threat decoding is now authoritative as well. It reports open/shared
  milestone windows and current per-house eligible suppliers using official priority, distance,
  stock and price functions. The view labels its independent-house inventory assumption and sends
  exact sequential dinner evaluation to `projectDinner`, so observed facts cannot be mistaken for
  an opponent belief or a predicted winner.
- The first larger paired pilot now covers 10 seeds/20 games with seat swapping: 20/20 completed
  without violations; official built-in placed first 13 times and safe-first 7 times. Wilson 95%
  intervals (43.3–81.9% versus 18.1–56.7%) still overlap, and seat 0 also won 13 games, so this is
  pipeline evidence rather than a promoted policy-strength conclusion. Reports now include these
  confidence bounds by policy and seat.
- The promotion run now covers 50 seeds/100 paired-seat games: 100/100 completed with zero
  violations. Official built-in placed first 68% (Wilson 95% CI 58.3–76.3%) versus safe-first 32%
  (23.7–41.7%). Seat 0 was 54% (44.3–63.4%) versus seat 1 46% (36.6–55.7%), so the apparent seat
  sweep in the four-game smoke sample did not persist. This closes the weak-baseline benchmark
  gate; it does not claim that the official built-in AI is a strong human-level policy.

### Phase 0 — define contracts, evidence and the benchmark

- Save complete trajectories from controlled games: public observation, legal actions, selected
  action, versions, outcome and timing; never store Tokens.
- Add fixed tactical scenarios for sales, price wars, salary, turn order, milestone timing,
  restaurant reachability and demand donation.
- Implement random, first-legal and current built-in-AI baselines.
- Define a consent/privacy-safe human-game import containing only seat-visible observations,
  public actions and outcomes. Preserve provenance, player-count and ruleset metadata; reject
  Tokens, private simultaneous choices and unlicensed commentary.
- Treat public ended-game replays as quarantined evidence, not automatically approved trajectories.
  Scale collection through explicit 2 -> 10 -> 50 -> 100 gates; require deterministic recapture,
  anonymization, ruleset/version classification and pinned-engine replay before each promotion.
- Record win/rank rate, illegal attempts, completion rate, decision latency and seat/map bias.

Exit criterion: a result is reproducible by seed and every policy can play 100 base games without
rules corruption.

### Phase 1 — offline engine, weak baselines and deterministic decision support

- Extract a fast cloneable environment from the official JS engine early; online parity fixtures
  remain its promotion gate.
- Implement `DecisionView` and the competition matrix.
- Implement persistent `GameMemory`.
- Generate bounded phase-local candidates, then one-turn macros; record pruning coverage and
  latency before attempting multi-turn composition.
- Add an explainable evaluator and a few intentionally distinct strategy profiles.
- Distil reviewed human trajectories into playbook examples and evaluator diagnostics; use them to
  calibrate opponent models, not as unquestioned ground truth.
- Play a benchmark league and review the largest prediction errors.

Exit criterion: clearly beats first-legal/random across seats and makes zero illegal submissions.

### Phase 2 — engine search

- Add shallow beam search first; add MCTS only if measured branching and latency justify it.
- Sample opponent actions from versioned belief models for simultaneous and future phases.
- Train a value model from completed trajectories only after deterministic rollout parity passes.

Exit criterion: search improves held-out league rank at an acceptable per-decision latency.

### Phase 3 — hybrid LLM planner

- Automatically retrieve rule/strategy decision cards by phase.
- Ask the LLM to rank calculated candidates, not write commands.
- Validate strict output and fall back to the deterministic evaluator.
- Evaluate only near-tie scenarios where deterministic scores are within a declared margin; compare
  `LLM selector` against the same planner's deterministic choice using paired seeds and seats.
- Report win/rank lift, confidence intervals, disagreement rate, cost and latency. Remove the LLM
  from the decision path if it has no statistically meaningful held-out gain.

Exit criterion: statistically improves over the deterministic baseline without increasing illegal
actions or timeouts.

### Phase 4 — imitation and reinforcement learning

- Train candidate ranking/value models on heuristic, search and—if available—strong human games.
- Run self-play against a frozen policy population.
- Compare terminal-only learning, conservative shaping and imitation initialization.
- Try PPO as one baseline; compare it with search-guided/value-based alternatives.

Exit criterion: promotion requires a confidence-bounded improvement against the entire league, not
just the previous checkpoint.

### Phase 5 — expansions

Only after the base-game benchmark is stable, add one module at a time. Each module needs its own
observation fields, action candidates, simulator parity tests and benchmark scenarios.

## 12. Immediate TODO list

The dependency-ordered source of truth is `../TODOS.md`. In summary:

1. Stabilize the current Agent branch on the newest upstream and rerun parity/acceptance tests.
2. Freeze versioned observation, trace and benchmark contracts.
3. Add side-effect-free official-engine `DecisionView` primitives and dinner projection.
4. Add company-structure candidates, persistent memory and deterministic baselines.
5. Use the early offline environment for bounded search and human-game calibration.
6. Add the LLM only as a selector over validated near-tie candidates and require measured lift.
7. Evaluate imitation learning and PPO/self-play only after every prior promotion gate passes.

## 13. What success should mean

“The Agent completed a game” is an integration test, not an intelligence metric.

A strategy-capable FCM AI should:

- never submit an illegal or stale action without correct recovery;
- explain which long-term engine it is building;
- predict sales and salary consequences with calibrated error;
- recognize milestone and opponent threats;
- revise its plan when predictions fail;
- beat random/first-legal and the current built-in AI across maps and seats;
- improve against a diverse frozen league without relying on hidden information;
- remain reproducible and auditable enough to diagnose why it lost.

## Research references

- Schulman et al., [Proximal Policy Optimization Algorithms](https://arxiv.org/abs/1707.06347).
- Lanctot et al., [OpenSpiel: A Framework for Reinforcement Learning in Games](https://arxiv.org/abs/1908.09453).
- Brown et al., [Combining Deep Reinforcement Learning and Search for Imperfect-Information Games (ReBeL)](https://arxiv.org/abs/2007.13544).
- Hubert et al., [Learning and Planning in Complex Action Spaces (Sampled MuZero)](https://arxiv.org/abs/2104.06303).
- Schrittwieser et al., [Mastering Atari, Go, Chess and Shogi by Planning with a Learned Model (MuZero)](https://arxiv.org/abs/1911.08265).
- Yu et al., [The Surprising Effectiveness of PPO in Cooperative, Multi-Agent Games](https://arxiv.org/abs/2103.01955).
