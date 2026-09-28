# FCM AI specification

Updated: 2026-09-28

This file is the stable entry point for the FCM AI design. Detailed reasoning and component
contracts live in [`docs/fcm-ai-architecture.md`](docs/fcm-ai-architecture.md); dependency-ordered
work and promotion gates live in [`TODOS.md`](TODOS.md); experiment evidence lives in
[`log.md`](log.md).

## Product boundary

The AI plays base-game Food Chain Magnate through the OBG Agent interface. The official OBG FCM
JavaScript is the only authority for legality and transitions. The policy may consume public or
seat-visible `DecisionView` data and official-engine derivations, but never another seat's hidden
reserve card, restructure choice or pending simultaneous move. Expansions remain out of policy
scope until they receive separate observation/action/parity suites.

## Chosen architecture

1. MCP/HTTP is the safe online control plane; it is not the strategy.
2. A database-free cloneable wrapper runs the official engine for fixtures, leagues and candidate
   consequences.
3. A **reactive strategic plan graph** carries multi-turn goals, prerequisites, target turns,
   deadline slack, committed assets, repair options and invalidation conditions. This is a small,
   typed HTN/GOAP-inspired capability graph, not a general HTN framework and not another rules
   engine.
4. A plan-health and opportunity arbiter compares `continue`, `repair`, `tactical deviation`,
   `pivot` and `abandon`. It includes switching cost and hysteresis so the policy can exploit an
   opponent mistake without discarding a sound long-term plan or oscillating every phase.
5. Phase-local generators produce at most 32 complete candidates with deterministic fallbacks and
   diversity budgets. The plan graph prioritizes plan-consistent candidates but reserves an
   off-plan/opportunity quota so an incomplete goal library cannot suppress every pivot. It never
   emits raw action JSON.
6. Public deterministic facts and opponent beliefs are separate types. Beliefs carry model id,
   confidence and sample count. “Opponent state” always means human-visible state; unrevealed
   simultaneous choices are sampled beliefs, never observations.
7. Bounded scenario beam search evaluates plan macros in official-engine clones with sampled
   opponent responses and a calibrated terminal/value bootstrap. MCTS is optional only after beam
   branching, latency and held-out strength measurements justify it; a nominal “2–3 turn MCTS” is
   not assumed to solve FCM's horizon.
8. A planner may select only an officially validated candidate id. The existing legal-action,
   validation and fail-closed execution path is the safety layer; a separate behavior-tree rules
   layer would duplicate authority. An LLM may later propose intent or explain trade-offs, but
   cannot invent executable actions.
9. Search, imitation, value learning and PPO are promoted only by held-out rank/win improvement;
   legality, same-evaluator agreement, human-action imitation or fluent explanations are
   insufficient.

## Current verified boundary

- The base-game environment, phase fixtures, public replay pipeline, weak baselines, bounded
  candidates and persistent game memory are implemented.
- The 50-game held-out replay audit offers 1516/2730 (55.5%) exact working-day decisions and
  645/1195 (54.0%) eventual-winner decisions. Hire exact/order-insensitive pattern coverage is
  795/935 of 1337; training is 562/605 of 891. Pattern coverage is a proposal diagnostic, not yet
  an official consequence-equivalence claim, and remains below the 75% gate.
- Marketing equivalence is based on worker/campaign/good/duration/affected houses.
- Build/open/move equivalence is based on public pre/post official-engine consequences. Build
  coverage is 103/147 (70.1%); restaurant coverage is 82/85 (96.5%). Exact coordinates remain
  execution inputs, not the primary learning target.
- The existing static policy and shallow rollout policy are experimental and are not promoted.
  A naive current-distance build scorer was also tested, performed substantially worse on human
  labels, and was removed.
- `GameMemory v1` stores only a coarse intent, horizon, confidence and evidence. The current
  same-seat shallow rollout stops at opponent/simultaneous boundaries. Consequently the present
  policy does **not yet** implement executable multi-turn prerequisites, opponent-response
  scenarios or calibrated reactive replanning; the architecture above is the next target, not a
  claim about current playing strength.

## Next execution order

1. Raise exact bounded hire/train batch coverage toward 75% without exceeding 32 candidates.
2. Freeze an independently labelled tactical suite across at least three working-day subphases,
   including long-horizon build consequences rather than current distance alone.
3. Implement `GameMemory v2` and the reactive strategic plan graph: capability prerequisites,
   earliest activation, target turn/deadline slack, commitments, repair/fallback paths and explicit
   invalidation events. Freeze long-horizon and reactive adversarial fixtures before tuning.
4. Calibrate a value evaluator and opponent-belief sampler against held-out games.
5. Add plan-health and opportunity arbitration with switching cost, confidence, hysteresis and a
   distinction between tactical deviation and strategic pivot.
6. Add bounded scenario beam search over plan macros. Add MCTS only if measured branching,
   uncertainty, latency and held-out league lift justify it.
7. Evaluate an LLM selector only on deterministic near-ties and remove it if it adds no measured
   held-out value.
8. Consider imitation/value learning and masked hierarchical PPO only after the simulator,
   evaluator and policy league gates pass.

## Non-goals for the current stage

- No Python rewrite of FCM rules.
- No training through live Django/SQLite games.
- No hidden-state access for stronger play.
- No expansion-general claim from base-game tests.
- No default-policy change based solely on development replay fit.
- No full-state GOAP/HTN search, hand-authored early/mid/late script as the strategic oracle, or
  duplicate behavior-tree execution layer.
- No claim that reinforcement learning is inherently unsuitable; it is deferred until the
  simulator, value target and frozen policy league make it measurable.
