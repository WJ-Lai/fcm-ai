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
3. Phase-local generators produce at most 32 complete candidates with deterministic fallbacks and
   diversity budgets.
4. Public deterministic facts and opponent beliefs are separate types. Beliefs carry model id,
   confidence and sample count.
5. A planner may select only an officially validated candidate id. An LLM may later choose intent
   or explain trade-offs, but cannot invent action JSON.
6. Search, imitation, value learning and PPO are promoted only by held-out rank/win improvement;
   legality, same-evaluator agreement or fluent explanations are insufficient.

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

## Next execution order

1. Raise exact bounded hire/train batch coverage toward 75% without exceeding 32 candidates.
2. Freeze an independently labelled tactical suite across at least three working-day subphases,
   including long-horizon build consequences rather than current distance alone.
3. Calibrate a value evaluator and opponent-belief sampler against held-out games.
4. Retry shallow beam search; add MCTS only if branching and latency measurements justify it.
5. Evaluate an LLM selector only on deterministic near-ties and remove it if it adds no measured
   held-out value.
6. Consider imitation/value learning and masked hierarchical PPO only after the simulator,
   evaluator and policy league gates pass.

## Non-goals for the current stage

- No Python rewrite of FCM rules.
- No training through live Django/SQLite games.
- No hidden-state access for stronger play.
- No expansion-general claim from base-game tests.
- No default-policy change based solely on development replay fit.
