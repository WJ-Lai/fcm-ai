# FCM AI specification

Updated: 2026-09-28

This file is the normative system specification for the base-game FCM AI. It defines the product
boundary, architecture, component contracts, safety invariants, algorithm-selection process and
promotion gates. Detailed reasoning lives in
[`docs/fcm-ai-architecture.md`](docs/fcm-ai-architecture.md), dependency-ordered work lives in
[`TODOS.md`](TODOS.md), and experiment evidence lives in [`log.md`](log.md).

## 1. Goal and success definition

Build an external Agent that can play base-game Food Chain Magnate on OBG legally, privately and
strategically in 2–6 player human/AI mixed games. It must combine:

- multi-turn preparation, such as hiring now for a capability or milestone several turns later;
- reactive exploitation of newly revealed opportunities without abandoning a sound plan for every
  local gain;
- explicit uncertainty about future and temporarily hidden opponent choices;
- reproducible evaluation across maps, seats, player counts and opponent styles;
- safe execution exclusively through the same official rules paths available to a human player.

“The Agent completed a game” proves integration only. Strategy promotion requires legal completion,
calibrated predictions and confidence-bounded improvement in terminal rank/win metrics against a
frozen, diverse policy league.

## 2. Product boundary

- The official OBG FCM JavaScript is the sole authority for legality, transitions, map arithmetic,
  dinner resolution and scoring. No planner, Python module, LLM prompt or learned model may become a
  second rules engine.
- MCP/HTTP is the safe online control plane. The strategy implementation may run locally beside it,
  but it submits only an officially validated candidate id through the normal Agent API.
- The policy may consume public or acting-seat-visible `DecisionView` data and deterministic
  official-engine derivations. It must never consume another seat's reserve card, unrevealed
  restructure choice or pending simultaneous move.
- The current policy target is the base game. Expansion state may be preserved in transport, but an
  expansion is unsupported until it has its own observation, candidate, parity and benchmark suites.
- Human public replays are evidence, not an oracle. They may train proposals, priors and values only
  after provenance, visibility, engine-version and replayability classification.

## 3. Non-negotiable invariants

1. **One rule authority.** Every executable action is enumerated or validated by the official
   engine, and every simulated transition uses an isolated official-engine clone.
2. **Seat-safe information.** Policy inputs are classified as `observed`, `derived` or `believed`.
   Unknown or unclassified fields fail closed.
3. **Information-set consistency.** Two states indistinguishable to the acting seat must induce the
   same policy distribution within deterministic seed/tolerance. A search branch may sample hidden
   choices internally, but the returned policy may not condition on which private sample happened
   to be drawn as if it were observed.
4. **Canonical-state isolation.** Projection, candidate evaluation and search never mutate the live
   game, source fixture or sibling branch. Process-global engine state requires isolated workers or
   serialized execution until proven otherwise.
5. **Bounded anytime decisions.** Every decision has an explicit candidate, transition, memory and
   wall-clock budget plus a deterministic legal fallback.
6. **Reproducibility.** Reports record ruleset, policy, evaluator, belief-model and candidate-generator
   versions, seeds, seat, map, player count, budgets and relevant hashes.
7. **Terminal promotion.** Development-label fit, agreement with the same evaluator, human-action
   imitation and fluent explanations cannot promote a policy without held-out terminal rank/win
   lift and no safety regression.

## 4. Current verified boundary

- The base-game offline environment, 35 phase fixtures, seat-safe `DecisionView`, public replay
  pipeline, weak baselines, bounded candidates and persistent `GameMemory v1` are implemented.
- A 50-seed/100-game paired-seat league completes 100/100 games with zero rule violations. The
  official built-in AI places first 68/100 versus safe-first 32/100; this is a benchmark baseline,
  not a strong-play claim.
- The 100-game public corpus contains 14,078 audited decision observations. The official action
  layer exactly replays 10,001 labels; 3,541 lossy production/payday records are value-only and 536
  legacy-drift records are quarantined.
- Candidate data is now split by manifest identity rather than directory name: games 1–50 are the
  proposal-training corpus and games 51–100 are the frozen final test. This corrects the earlier
  mistaken description of `pilot-50` as untouched even though it contains `pilot-10`. A versioned
  prior retains only repeated 50-game hire/train patterns and transitions. Under the 32-candidate
  cap, training-corpus hire/train pattern coverage is 1093/1337 (81.8%) and 672/891 (75.4%). On the
  disjoint final 50 games it is 1013/1260 (80.4%) and 656/825 (79.5%), so both pass the frozen 75%
  proposal gate. Exact final-test coverage is 837/1260 and 615/825; pattern coverage remains a
  proposal diagnostic, not evidence that orders or plans have equal long-term value.
- Marketing proposal diversity is still below its desired ceiling. Separating candidates by
  employee/campaign/good/duration raised strict effect-equivalent coverage from 22/62 to 29/62 on
  development games and from 78/208 to 109/208 (52.4%) on the disjoint 40-game validation slice.
  The enumerated ceiling there is 138/208; multi-marketing batches and missing placements remain
  explicit follow-up work. The already-opened final 50 set was not reused to tune this change.
- A bounded multi-marketing spike was tested and rejected: multi-batch semantic labels are now
  measurable, but adding pair macros or every intermediate campaign duration consumed scarce
  proposal slots and reduced development coverage from 29/62 to 24–26/62. Production generation
  remains on the better single-campaign policy until a learned/versioned proposal can demonstrate
  lift. This is a measured combinatorial blocker, not an unimplemented legality path.
- Strategy fixture v1 freezes 15 policy-independent cases across long-horizon, reactive, tactical,
  abstraction, information-set and leaf-cutoff axes. Cases cover six working-day subphases, anchor
  to content-hashed official-engine fixtures and separate legality, feasibility and desirability.
  Restaurant blocking, sequential inventory and milestone closure have paired states requiring
  different choices; hidden reserve-card mutations require identical policy input and preference.
- `GameMemory v2` now coexists with v1 behind an explicit migration boundary. It stores a typed,
  acyclic capability graph with activation lead times, target/deadline slack, commitments,
  assumptions with provenance, repair/fallback paths and public invalidation events. Its reducer is
  byte-for-byte rebuildable from events, rejects private engine fields, and compiles critical plan
  steps into candidate features while reserving an off-plan slot. It does not yet generate plans or
  arbitrate continue/repair/deviate/pivot/abandon; those remain separate promotion gates. The current
  shallow rollout still stops at opponent/simultaneous boundaries.
- The static policy lost $35–$493 and the shallow rollout lost $10–$498 to the built-in AI on the
  same paired probe. The rollout changed 43/66 choices, hired 34 employees and placed no marketing.
  This falsifies local score agreement as a strategy oracle. No current experimental policy is
  promoted as the default strong AI.

## 5. Target architecture

The target is **hierarchical belief-state model-predictive planning with later search
distillation and policy-population training**. HTN, Utility, beam search, RHEA, information-set
search and learning are components or experimental contenders, not unquestioned product choices.

```text
live MCP/HTTP or offline official engine
                  │
                  ▼
        seat-visible DecisionView
                  │
          ┌───────┴────────┐
          ▼                ▼
 reactive plan graph   belief state +
 and commitments       opponent population
          └───────┬────────┘
                  ▼
 plan-health/opportunity arbiter
 continue / repair / deviate / pivot / abandon
                  │
                  ▼
 bounded phase-local macro candidates
 plan-consistent + repair + opportunity + fallback quotas
                  │
                  ▼
 equal-budget online planner bake-off
 scenario beam │ RHEA │ belief-aware search specialist
                  │
                  ▼
 official validation → one candidate id → MCP/HTTP execution
                  │
                  ▼
 outcome and prediction error → memory/value/belief updates
                  │
                  └── later: Expert Iteration / policy population
```

## 6. Component contracts

### 6.1 Environment and DecisionView

The environment contract is `reset / observe / legal / step / clone`. Online and offline adapters
must expose the same seat-scoped semantics. `DecisionView` retains stable ids and provides:

- phase, subphase, acting/pending seats, turn order, bank and estimated horizon;
- graph-shaped board, houses, full demand baskets, restaurants, sources and campaign coverage;
- decoded company capacity, free slots, salary runway, production, training, recruiting and price;
- milestone windows and public race status;
- per-house deterministic fulfillment, reach, price, distance, tie-break and frozen-state dinner
  consequences;
- provenance on every field: `observed`, official-engine `derived`, or versioned `believed`.

Deterministic reachability and frozen-state dinner results must not be described as predictions.
Future opponent actions, sequential competition under alternative plans and hidden simultaneous
choices are beliefs with model id, confidence and sample count.

### 6.2 Reactive strategic plan graph

The plan graph is a small typed capability/deadline/commitment graph inspired by HTN/GOAP. It is
not a generic full-state planner and never encodes concrete legality. Each plan records:

- terminal-oriented goal and plan id;
- prerequisite capabilities and partial ordering;
- earliest activation, target turn, deadline and slack;
- committed, reusable and stranded assets;
- expected value, uncertainty and assumptions;
- repair paths, fallback plans and public invalidation events.

Backward scheduling or bounded A*/constraint reasoning may test whether prerequisites can finish by
the deadline. Only the official engine chooses the concrete legal hire, train, build or market
action. The graph is a prior rather than a tunnel: candidate generation always retains an off-plan
quota so incomplete templates cannot suppress all novel opportunities.

### 6.3 Plan-health and opportunity arbiter

At meaningful public decision boundaries, compare:

- `continue`: plan remains feasible and valuable;
- `repair`: preserve the goal using reusable commitments;
- `tactical_deviation`: take an expiring gain and return to the same plan;
- `pivot`: replace the goal after switching cost;
- `abandon`: stop funding an infeasible or dominated plan.

Inputs include estimated terminal rank value, deadline/milestone risk, salary runway, opportunity
expiry, asset reuse, belief uncertainty and prediction error. Separate enter/exit thresholds,
cooldown and minimum evidence prevent oscillation. Repeated unchanged observations must not trigger
replanning merely because the evaluator has numeric noise.

### 6.4 Candidate generator

- Generate complete candidates one phase at a time, not a Cartesian product of an entire turn.
- Use official primitives, deterministic deduplication, dominance pruning and a maximum of 32
  candidates at the policy boundary.
- Reserve explicit quotas for plan-consistent, repair, tactical/opportunity, pivot/diverse and safe
  fallback candidates.
- Report recall by action family and intent quota. High-volume hiring may not hide missing marketing,
  build or restaurant candidates.
- Use official consequence equivalence for spatial proposals when exact squares are strategically
  interchangeable, while retaining exact labels for discrete hire/train batches.
- Never emit executable raw JSON directly to an LLM or learning policy.

Candidate proposal is a hard ceiling on every downstream algorithm. Search cannot discover a plan
that was never proposed, so candidate recall and strategic-plan coverage remain independent gates.

### 6.5 Belief state and opponent population

Beliefs are distributions over plausible future or hidden opponent decisions conditioned only on
public history and legal seat-visible observations. They must be versioned, calibrated and sampled
from a population containing multiple strategy archetypes and frozen policies rather than one
stationary “average opponent.”

Tests must distinguish:

- deterministic facts such as current reach and inventory;
- uncertainty about which legal action an opponent will choose;
- model uncertainty caused by sparse or out-of-distribution histories.

The system reports belief calibration and sensitivity. Search must remain robust when the true
opponent differs from the highest-probability model.

### 6.6 Value and objective

The primary objective is terminal performance:

- two players: win/loss with documented tie handling;
- multiplayer: normalized terminal rank with a small normalized final-cash tie-break;
- every report: raw rank, first-place rate, cash, completion and confidence intervals.

The evaluator separately estimates:

- plan feasibility and deadline slack;
- terminal desirability/rank value;
- uncertainty and calibration;
- intermediate diagnostics such as cash after salary, milestone race, capacity, market share,
  demand donation, network reach and horizon.

A leaf evaluator is a bootstrap approximation, not ground truth. Training and search must audit
cutoff bias by comparing the same choice at multiple horizons and against completed outcomes.
Potential-based reward shaping may later use a frozen, held-out-calibrated evaluator, but promotion
always uses unshaped terminal metrics.

### 6.7 Online planning algorithms

No online planner is selected by label or intuition. Contenders use the same observation, candidate
set, belief samples, evaluator, seeds and wall-clock budgets:

1. **Scenario beam / receding-horizon baseline.** Search diverse macro sequences, preserve distinct
   strategic intents and adapt horizon to the active plan deadline and bank horizon.
2. **Rolling Horizon Evolutionary Algorithm (RHEA) challenger.** Evolve bounded macro sequences;
   useful when the candidate tree is irregular and sequence mutation finds plans beam pruning loses.
3. **Belief-aware information-set search specialist.** Consider ISMCTS/POMCP-style sampling only at
   hidden/simultaneous or highly uncertain boundaries, and only after information-set consistency
   tests pass. Ordinary determinization that lets different sampled hidden states choose mutually
   incompatible actions is rejected as strategy fusion.
4. **Progressive widening or learned policy priors.** Add only if measured branching remains the
   bottleneck after candidate pruning. Sampled MuZero is a later design reference, not a current
   commitment.

Search is anytime and deadline-aware. Timeout, engine error, empty branch or low-confidence belief
falls back to the best officially validated static candidate. Increasing search depth must not
systematically make decisions worse because of leaf-value bias.

### 6.8 Execution, memory and learning

The execution layer accepts one versioned candidate id, revalidates it against the current game
version and submits through MCP/HTTP. A small retry state machine handles stale state and transport
failure; a behavior tree must not duplicate official legality.

`GameMemory v2` is schema-versioned, bounded and event-rebuildable. It stores plans, public evidence,
belief summaries, prediction errors and decisions, but no credentials or hidden opponent state.
The implemented v2 schema lives alongside v1 rather than silently reinterpreting old records. Its
timing analysis detects cyclic/impossible prerequisites and missed deadlines; plan-aware candidate
budgeting retains both critical plan steps and an off-plan alternative. The current numeric plan
priority is provisional infrastructure, not a promoted strategy or substitute for the arbiter.

After a search policy is measurably useful, Expert Iteration may distil search choices and values
into faster proposal/ranking models, which in turn guide later search. PPO is one later masked
hierarchical baseline, not the assumed final solution. Population self-play and frozen historical
policies are required to limit cycles and opponent overfitting.

## 7. Decision cycle

1. Fetch a versioned seat-visible observation and legal action envelope.
2. Compile deterministic `DecisionView`; reject missing provenance or stale ruleset versions.
3. Update public-history beliefs without reading private engine context.
4. Check plan feasibility, deadline slack and invalidation events.
5. Compare continue/repair/deviate/pivot/abandon; preserve the existing plan unless net evidence
   crosses the appropriate hysteresis threshold.
6. Generate bounded, diverse phase candidates, including a safe fallback and off-plan quota.
7. Allocate planning budget from decision impact, uncertainty and deadline—not from a hard-coded
   claim that all important choices need exactly 2–3 turns.
8. Evaluate contenders in isolated official clones using belief samples and a frozen evaluator.
9. Select and revalidate one candidate id; fall back deterministically on timeout or mismatch.
10. Execute through MCP/HTTP and record outcome, latency, prediction error and memory event.

## 8. Algorithm bake-off and promotion protocol

### 8.1 Equal-budget comparison

Beam, RHEA and any belief-aware search run on identical frozen cases with, initially, one-second and
three-second local budgets. Comparisons are stratified by seed, map, seat, player count, phase,
active-plan horizon and opponent population. The same evaluator may generate a development oracle,
but agreement with that oracle is not a promotion result.

### 8.2 Required metrics

- zero illegal actions, hidden-state access and canonical-state mutation;
- completion, P50/P95 latency, timeout and fallback rates;
- candidate recall and plan-template coverage;
- long-horizon prerequisite completion and missed-deadline rate;
- opportunity exploitation, bait rejection, pivot regret and oscillation;
- value calibration, horizon sensitivity and terminal-outcome prediction error;
- hidden-state invariance and information-set policy consistency;
- terminal first-place/rank/cash with confidence intervals and seat/map/player-count breakdowns;
- robustness against a frozen opponent population, not only the previous checkpoint.

### 8.3 Promotion rule

A planner becomes default only when it produces confidence-bounded held-out terminal rank/win lift
over the simpler baseline, stays within the declared P95 deadline and causes no regression in
legality, privacy, completion or reproducibility. Component ablations must show where the lift comes
from: plan graph, arbiter, beliefs, search or learned prior.

### 8.4 Kill or defer rule

Remove an algorithm from the online path, or keep it research-only, when it:

- provides no reproducible terminal lift at equal compute;
- violates information-set consistency or depends on private simulator state;
- exceeds latency/fallback budgets;
- is unstable across seeds, evaluator versions or opponent populations;
- adds complexity without beating a simpler contender;
- improves shaped/development scores while worsening held-out terminal outcomes.

## 9. Validation matrix and hard gates

### 9.1 Rules, isolation and privacy

- online/offline transition parity for every phase fixture;
- source/sibling branch non-mutation and deterministic clone tests;
- legal-envelope and stale-version adversarial tests;
- mutate hidden opponent state while preserving the acting information set: recommendation
  distribution must remain invariant;
- simultaneous branches must never advance from an opponent's unrevealed submitted action.

### 9.2 Strategic abstraction fidelity

Compressed features and plan macros can alias strategically different raw states. Maintain
adversarial state pairs that share the proposed abstraction but require different preferred macros.
Promotion requires:

- raw-to-abstract collision reports by feature/version;
- state-pair discrimination for restaurant blocking, dinner inventory order, salary timing,
  milestone closure, bank horizon and reusable commitments;
- no cache reuse across states that differ in a rules- or strategy-relevant way.

If collisions remain material, enrich the abstraction before increasing search depth.

### 9.3 Long-horizon and reactive behavior

Freeze causal fixtures before tuning:

- turn-1 enabler required for a turn-3 capability or milestone;
- missed prerequisite and repair using reusable assets;
- expiring genuine opportunity versus attractive bait;
- one-phase tactical deviation followed by plan resumption;
- infeasible goal requiring pivot or abandonment;
- unchanged observations that must not cause oscillation;
- salary runway, restaurant/network expansion and bank-horizon cases.

Labels distinguish feasibility from desirability and use only actor-visible information.

### 9.4 Search cutoff and leaf-value bias

- compare the same candidate under multiple horizons, terminal completion where affordable and
  randomized cutoffs;
- measure whether deeper search reversals are justified by terminal outcomes or merely leaf-score
  artifacts;
- calibrate value predictions by phase, player count and remaining horizon;
- require the planner not to degrade systematically when granted more compute.

### 9.5 Multiplayer general-sum robustness

FCM is not a two-player zero-sum game. Fixtures and leagues must include 3–6 players, third-party
externalities, tie-break effects, kingmaking-like choices and opponents with different styles.
Evaluation uses rank distributions and population robustness rather than assuming a single best
response. If self-play cycles or exploitability against the frozen league persist, evaluate a
policy-population method such as PSRO/JPSRO before claiming convergence.

## 10. Known failure modes and guards

- **Proposal ceiling:** increase candidate/action-family recall before deeper search.
- **Template blindness:** retain off-plan quotas and measure plan-template coverage.
- **Abstraction aliasing:** run collision/state-pair audits; expand features before search.
- **Leaf hallucination:** calibrate value, vary horizons and compare with terminal outcomes.
- **Strategy fusion:** enforce information-set policy invariance; do not use naive determinization.
- **Opponent-model overconfidence:** keep diverse populations, confidence and out-of-distribution
  flags; allocate robust scenarios rather than one assumed response.
- **Multiplayer overfitting:** use 3–6 player leagues, frozen opponents and rank-based metrics.
- **Human-data bias:** stratify by version/skill/player count; never equate winner action with oracle.
- **Self-play cycling:** retain historical league snapshots and later consider PSRO/JPSRO.
- **Latency collapse:** compare equal wall-clock budgets and always keep a deterministic fallback.
- **Cache/privacy leak:** include ruleset, internal snapshot digest, seat, candidate, horizon,
  evaluator and belief versions; keep full-state cache inside the trusted planner.
- **Online staleness:** revalidate candidate and game version immediately before submission.
- **Expansion drift:** isolate every module behind separate parity and policy gates.

## 11. Execution order

1. **Completed:** implement `GameMemory v2`, the typed plan graph and event-rebuild tests against
   the frozen strategy-fixture v1 suite.
2. **Next:** calibrate terminal/value evaluation and a versioned opponent-population belief sampler.
3. Implement plan-health/opportunity arbitration with switching cost and hysteresis.
4. Run the equal-budget scenario-beam versus RHEA bake-off; add belief-aware search only at
   hidden/uncertain boundaries after privacy semantics pass.
5. Run held-out leagues and component ablations; promote only on terminal lift.
6. Evaluate an LLM selector only on deterministic near-ties and remove it if it adds no lift.
7. Distil useful search through Expert Iteration; evaluate masked PPO and potential shaping only
   after the simulator, value and policy-population gates pass.
8. Add expansions one module at a time after base-game strength and parity stabilize.

## 12. Non-goals for the current stage

- No Python rewrite of FCM rules or remote public simulation endpoint.
- No training through live Django/SQLite games.
- No hidden-state access for stronger play.
- No expansion-general claim from base-game tests.
- No arbitrary LLM action JSON or LLM mental simulation as the official consequence model.
- No full-state generic HTN/GOAP framework, fixed early/mid/late script as strategic oracle, or
  behavior-tree legality layer.
- No assumption that beam, RHEA, MCTS, PPO or an LLM is the final answer before equal-budget evidence.
- No default-policy change based only on development replay fit or the same evaluator used to tune it.

## 13. Open research decisions

These are deliberately unresolved until the stated evidence exists:

- whether scenario beam or RHEA is the better default online planner;
- whether information-set MCTS/POMCP adds value beyond belief-sampled receding-horizon search;
- which strategic abstractions are sufficient without damaging state discrimination;
- whether a learned policy/value prior repays its complexity through Expert Iteration;
- whether PPO adds terminal strength after search-guided imitation;
- whether multiplayer cycling justifies PSRO/JPSRO-style population solvers.

The specification therefore commits to contracts, tests and promotion rules—not to an algorithm
because its name sounds suitable.
