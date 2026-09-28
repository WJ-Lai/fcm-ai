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
- Strategic-abstraction v1 adds a conservative canonical projection and trusted-local cache key.
  Seven frozen pairs cover restaurant blocking, sequential inventory, salary timing, milestone
  closure, bank horizon, reusable commitments and irrelevant/private mutations. The machine audit
  reports 0 material collisions and 0 irrelevant leaks. Cache identity requires ruleset, internal
  snapshot digest, seat, candidate, horizon, evaluator version and belief version; the projection
  intentionally retains the full public board/economy/threat structures until held-out evidence
  justifies compression.
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
- The official-clone mechanism now passes a frozen bounded tactical suite: 13 cases from 11 hashed
  engine fixtures and two reproducible seeds span working-day subphases 1–5. Against exhaustive
  same-horizon scoring it reaches Top-1/Top-3 13/13, 0 illegal selections and local P95 1.31 s;
  source projection and oracle labels are drift-checked. This validates clone execution and budget
  discipline only. Because the oracle still uses the uncalibrated short-horizon evaluator, it does
  not overturn the failed terminal-game results or promote the policy as strong.
- A first terminal-value puncture completed six two-player games and scored 94 turn boundaries using
  only each seat's `DecisionView`, attaching outcomes after Game Over. Reports separate game-macro
  from correlated per-turn metrics. Balanced/growth produced identical orderings (65.7% game-macro
  leader accuracy), cash reached 67.5% by changing only two late calls, and early accuracy was 47.2%
  with 13/18 ties. The inspected diagnostic holdout is consumed. This localizes evaluator weakness;
  it does not calibrate or promote any profile.
- Terminal-value v2 removes the v1 representation bug that treated employee, good and campaign IDs
  as numeric capacity. Its frozen protocol contains 12 development, 12 independent calibration and
  24 still-sealed promotion games across deterministic, random, safe-first and official built-in
  opponents with both seats represented. The first two splits completed 24/24 games and yielded 574
  seat-safe observations. Regularization is selected independently per phase; calibration weighted
  accuracy/log loss is 46.9%/0.692 early, 63.6%/0.626 middle and 78.6%/0.512 late. The predeclared
  gate therefore rejects the early model and exports a neutral abstention there, while middle/late
  remain experimental. The promotion holdout has not been opened and no policy is promoted.
- A fixed-root cutoff puncture prevents those promising aggregate metrics from being overread. At
  three reproducible middle-game hiring/marketing/production roots, three legal candidates were
  scored after 0/2/5/11 official transitions and every branch was completed to Game Over. V2 chose
  the terminal-best action only 3/12 times; one deeper marketing cutoff selected a -$230 branch over
  the +$235 oracle before reversing back later. Therefore v2 is not connected to the playing policy.
  The next estimator must target action-conditioned value deltas/regret and clear this fixed-root
  gate before the sealed promotion league can be opened.
- The first action-conditioned regret experiment also failed its independent gate. On an enlarged
  frozen protocol with 12 development and 12 calibration roots (32 candidates per split), static
  order, state-value v2 and all pairwise action-regret regularization values each achieved only 5/12
  calibration root Top-1, with $255.58 mean and $832 worst terminal regret. Calibration's 26
  decisive comparisons collapse to seven exact post-action feature deltas, and all seven carry
  contradictory terminal labels across roots; the context-free representation's weighted
  pairwise ceiling is therefore only 58.3%. This proves that a linear absolute post-state score
  cancels required root context. It also exposes possible single-continuation label variance.
  No regret model is connected to play, and the promotion holdout remains sealed. Before adding
  nonlinear capacity, run a predeclared multi-continuation stability puncture; only then evaluate a
  bounded action-delta × observed-root-context representation.
- A four-root production puncture then tested the more basic assumption that one deterministic
  continuation gives a usable action label. Each fixed candidate was completed under three paired
  official-built-in opponent seed streams; sample zero exactly reproduced the prior dataset.
  Terminal-optimal action flipped in 4/4 roots, with only 2/3 sample agreement per root, and paired
  production-minus-fallback margins ranged from -$848 to +$735. Therefore single-rollout terminal
  regret is rejected as a supervised target. Future action values must be paired expectations over
  a versioned continuation-policy population, with uncertainty, sequential sampling and abstention;
  only stable targets may be used to test action × observed-context representations. The result is
  specific to the production puncture until hiring and marketing receive the same audit.
- A versioned paired sequential estimator now turns that uncertainty into an explicit safety
  decision. It predeclares sample stages 3/7/15 and spends family-wise alpha 0.05 using exact
  two-sided paired terminal-rank sign tests, with stage-wise Bonferroni correction for multiple
  candidates. On the existing four production roots it selects 0/4 and requests seven samples for
  4/4; p-values are all 1.0 and cash-advantage standard errors are $264–$441. Cash diagnostics cannot
  override uncertain terminal rank. This is the intended fail-closed result, not a weak-policy
  failure. Subsequent collection must resume the same paired seed streams and may export a training
  label only when the predeclared test selects one candidate; otherwise it proceeds or abstains.
- Resuming the same production roots from three to seven paired continuations preserved every prior
  sample exactly and recomputed none. The stage-seven estimator still selects 0/4; all roots proceed
  to the frozen 15-sample maximum, with p-values 0.375–1.0 against alpha 0.02. Cash means remain
  unstable (one root moved from -$215.67 to +$10) and therefore remain non-authoritative. At sample
  15, unresolved roots must be recorded as abstentions rather than assigned cash-sign/static labels.
- At the frozen 15-sample maximum, 0/4 production roots are selected and 4/4 become explicit
  abstentions. Final p-values are 0.289–1.0; 4–10 of 15 paired continuations per root give both
  actions the same terminal rank, and cash-margin standard errors remain $107–$139. These roots are
  therefore excluded from supervised action-preference training under continuation population v1.
  The maximum must not be enlarged after seeing the result. Apply the same three-sample first gate
  to hiring and marketing, and define the versioned opponent-policy population required by P3.3d;
  repeated seeds from one weak built-in policy are not evidence of value against realistic agents.
- The same three-sample puncture on two hiring and two marketing roots also exports 0/4 labels; a
  naive cash winner is stable in only 1/4. Adversarial review additionally found that with three
  candidates the 3- and 7-sample stages are mathematically unable to clear their Bonferroni-adjusted
  alpha even under unanimous outcomes. The estimator now reports stage reachability and skips to
  sample 15. Rather than spend 144 more complete continuations against one weak built-in policy,
  collection is deferred until P3.3d freezes a multi-archetype opponent population. This avoids
  optimizing labels for a stationary opponent that does not represent external-agent play.

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

Opponent-population v1 now freezes deterministic-balanced, safe-first, seeded-random and official
built-in archetypes behind one strict contract. `observed`, official/public `derived` and model
`believed` partitions cannot be interchanged; updates are bound to a public-history digest and
updater id, while every component carries model id, confidence and sample count. External policies
receive only the legal seat view, and the official built-in is an environment-adapter directive.
The seeded sampler reproduced its declared distributions over two 4,096-sample conditions with a
maximum absolute error of 0.0137 and reacted to an explicit public update. These are mechanical
contract and sensitivity results only: v1's prior weights remain uncalibrated until evaluated on
public trajectories and independent self-play traces, so the population is not yet connected to
rollout labels or search.

The first empirical calibration puncture used 12 four-player official-engine prefixes, with each
archetype represented once per game and rotated across six development plus six disjoint
calibration seeds. A public-event histogram model achieved 17/24 (70.8%) calibration Top-1, below
the predeclared 75% gate. Its public-history OOD threshold rejected 82/120 (68.3%) human prefixes,
but non-rejected predictions were overconfident and heavily collapsed into official built-in.
Therefore histogram-only beliefs are rejected and cannot drive rollout or search. The next
representation may add bounded public event order and phase/action context, but must keep the same
seeds, horizons, policies, model capacity and thresholds so improvement cannot come from changing
the test.

Holding that protocol fixed, adding only adjacent within-seat public event transitions improved
calibration Top-1 to 22/24 (91.7%), log loss to 0.296 and Brier score to 0.159; human OOD rose to
102/120 (85%). This passes the representation-selection gates and confirms that action order carries
material style information absent from histograms. It does not yet calibrate probabilities: all 24
known-policy samples received over 0.8 confidence (mean 0.981) while two seeded-random samples were
wrongly called safe-first. V2 therefore advances only to a new-seed temperature/abstention
calibration stage. It remains disconnected from rollout labels and search.

Independent probability calibration then selected temperature 3 on the old calibration split and
evaluated once on six new official-engine seeds. New-seed Top-1 was 21/24 (87.5%); temperature
scaling improved log loss from 0.439 to 0.264 and achieved 0.055 five-bin ECE. Accepted predictions
were 10/11 correct (90.9%), but combined confidence/OOD coverage was only 11/24 (45.8%), below the
predeclared 50% gate. The global NLL OOD threshold rejected six correctly classified samples and is
not style-calibrated. Iteration 11 is therefore rejected despite improved probabilities. The
validation set is now consumed: the next experiment may fit class-conditional OOD thresholds on
old calibration data, but must use another untouched validation seed block and may not loosen the
failed gate post hoc.

That class-conditional experiment used a second fresh six-game block. Thresholds were selected by
the predicted model (never the true label), and restored accepted coverage to 12/24 (50%) with
12/12 accepted predictions correct; Top-1 reached 23/24 and ECE was 0.081. However, the frozen
temperature 3 worsened log loss from 0.0947 to 0.1649 on this block, failing the predeclared
non-inferiority gate. Iteration 12 is also rejected. Together, iterations 11–12 show that style-
specific OOD filtering is useful but one small calibration block does not identify a stable scalar
temperature. Both validation blocks are consumed. The next calibration experiment must predeclare
a block-robust fitting rule using consumed blocks only as development, use multiple untouched seed
blocks for a single final assessment, and retain per-block metrics so aggregate success cannot hide
a failed subgroup. Until then, beliefs remain disconnected from rollout labels and search.

Iteration 13 applied that rule to three consumed development blocks. Worst-block constraints chose
identity temperature 1 and confidence threshold 0.8189, rather than chasing either prior validation
block. On three predeclared fresh six-game blocks, Top-1 was 24/24, 23/24 and 22/24; accepted
coverage was 17/24, 19/24 and 15/24; accepted accuracy was 17/17, 18/19 and 15/15; ECE was 0.030,
0.031 and 0.059. Every per-block gate passed and the promotion holdout stayed sealed. This freezes
opponent-belief calibration v5 for the next information-set consistency audit only. It does not by
itself prove search lift or authorize reading hidden simulator state.

Information-set audit v1 is now the mandatory next gate. It reuses identical belief-sampling seeds
across trusted simulator worlds that share a public-observation digest and legal candidate set,
then compares per-seed choices and pairwise candidate-distribution total variation. Adversarial unit
tests prove that a public-only recommender passes with zero variation while a recommender reading a
private reserve choice fails with total variation 1. Reports contain only ids/counts, never trusted
world payloads. This is audit infrastructure, not completion of the gate: official-engine paired
hidden-world fixtures and the eventual belief-aware planner must still pass before integration.

The first official-engine paired fixture now covers reserve-card simultaneous submissions. Official
legal transitions created two worlds with different private submission envelopes but identical
public snapshots and actor DecisionViews. Across 16 matched belief seeds and three reserve-card
candidates, the current bounded official rollout produced zero per-seed mismatches and zero total
variation. Its sanitized report is byte-reproducible after normalizing display-only history
timestamps and contains no private envelope. This proves one authentic boundary only; P3.3e still
requires another authentic hidden submission fixture and an actual belief-aware planner audit.

The second official fixture corrects an earlier plan error: the base-game working day is sequential,
so there is no "working-day hidden submission" to test. Instead it covers company restructuring,
where opponents privately commit active and beach employees before resolution. Two official worlds
with different opponent assignments retained identical actor-visible state and candidates; all 16
matched belief seeds again produced zero mismatch and zero total variation. The fixture freezes its
clock because the UI records and sorts simultaneous history by display timestamps; this prevents
test scheduling from changing history order. Reports remain private-payload-free and byte-
reproducible. P3.3e remains open until the belief-sampled planner itself passes these audits.

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
