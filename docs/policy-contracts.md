# FCM AI policy contracts

The policy boundary is implemented in [`../src/contracts.py`](../src/contracts.py). It is strict,
versioned and dependency-free. These records are for reasoning, evaluation and training; they do
not replace the authoritative OBG snapshot or action validator.

## Classification rule

Every observation field belongs to exactly one container:

| Container | Meaning | May contain |
|---|---|---|
| `public` | Facts visible to every seated player | phase, turn, order, bank, public supply/modules |
| `private` | Facts visible only to the observing seat | that seat's legal actions and own buffered choice |
| `derived` | Deterministic calculation from allowed observations through the official engine | economy, company structure, house competition, dinner projection |
| `belief` | Explicit uncertain inference, never asserted as fact | opponent plan hypotheses and confidence |

An opponent's unrevealed reserve card, restructure or simultaneous action is not valid in any
container. Simulator internals may retain it to advance the environment but must never pass it to
a policy observation.

## `fcm.decision-view.v1`

The envelope is `{schemaVersion, gameId, sourceVersion, rulesetHash, seat, public, private,
derived, belief}`. Unknown envelope or container fields fail closed.

- `sourceVersion` binds all derivations and actions to one canonical state.
- `rulesetHash` is `sha256:<64 lowercase hex>` and binds a fixture/model to engine source.
- `public` contains phase/subphase/turn, acting and pending seats, turn order, bank/break count,
  enabled modules and optional public supplies/campaigns/milestones/map seed.
- `private.legalActions` is copied only from the authenticated seat's authoritative legal view.
  `ownPendingChoice` may contain only that same seat's already-submitted choice.
- `derived.players` reserves explicit fields for cash, bankruptcy, resources, employees, beach,
  decoded company, free slots, salary, price, income bonus, capacities, restaurants and milestones.
- `derived.houses` reserves house number, demand, garden status and per-seat supplier calculations.
- `derived.dinnerProjection` is bound to `sourceVersion` and contains projected house results and
  player revenue. It must be produced without mutating the source snapshot.
- `belief.opponents` contains only `{seat, observedPlan, confidence, hypotheses}`. Confidence is
  metadata about an inference, not permission to inspect hidden engine state.

The derived nested structures are reserved now so later P2 additions do not silently mutate the
v1 envelope. Their precise base-game item validators will be tightened when the official-engine
compiler is implemented; changing meaning requires v2.

## `fcm.trajectory.v1`

An episode records its id, game id, ruleset hash, ordered steps and optional terminal result. Each
step stores the exact DecisionView, source version, seat, offered candidate ids, selected candidate
id, resulting primitive actions and latency. Sequence numbers start at zero and are contiguous.
The selected candidate must have been offered.

Token, password, secret, authorization, cookie and API-key-like keys are rejected recursively.
Trajectories therefore remain safe to retain and use as training data.

Human-supplied trajectories require the additional two-stage `fcm.human-import.v1` /
`fcm.human-review.v1` boundary described in
[`human-trajectory-import.md`](human-trajectory-import.md). Validation alone does not assert that
a claimed exporter or consent record is authentic; only separately approved records may enter a
training/evaluation corpus.

## `fcm.game-result.v1`

A result is terminal and records reason, turns, unique seat/rank/money rows, and winner seats.
Winner seats must exactly match the best recorded rank. Benchmark reports derive from this record
rather than parsing prose or history labels.

## Compatibility and failure behavior

- Consumers accept only the exact version they implement.
- Unknown fields, invalid hashes, duplicate seats/ranks, candidate mismatches and credential-like
  keys raise `ContractError` with a JSON-style path.
- Validation does not mutate inputs.
- Additive-looking semantic changes still require a version review; recorded fixtures are never
  rewritten in place.
- A contract rejection blocks policy/search/training use but must not block normal human gameplay.
