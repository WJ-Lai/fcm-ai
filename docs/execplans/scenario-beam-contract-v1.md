# Scenario beam contract v1

## Objective

Establish the first belief-sampled, multi-decision receding-horizon baseline without opening the
promotion holdout or pretending that a passing unit contract proves playing strength.

## Frozen contract

- Root actions come only from the already-ranked, officially legal candidate list.
- Every declared belief seed samples one model from the frozen opponent belief exactly once per
  root scenario. The same seed set is reused across every root candidate.
- Opponent moves come from an injected versioned policy dispatcher; the planner never invents raw
  actions.
- At later acting-seat decisions, branch only over bounded legal macro candidates, keep a bounded
  beam and score leaves with the supplied frozen evaluator.
- A live/partially submitted simultaneous root always falls back. A fresh simultaneous phase reached
  wholly inside a non-simultaneous search trajectory may be resolved by choosing the actor's branch
  from its pre-submission public view first, then sampling opponent policies. The actor branch never
  conditions on the sampled hidden submissions. It is a single frozen public-policy action across
  matched belief samples—not a per-scenario maximum—so hidden outcomes cannot create strategy fusion.
- Low-confidence/OOD beliefs, root simultaneous phases, deadline exhaustion, empty evaluation and
  engine/policy failure fall back to the original top-ranked legal candidate.
- Candidate order breaks equal-value ties so search cannot introduce id-order drift.
- Budgets bound roots, branch factor, beam width, actor-depth, official transitions and wall time.

## RED cases

1. A two-decision consequence tree overturns the static root ranking.
2. Matched belief seeds are sampled and dispatched once per root scenario.
3. An unresolved simultaneous root returns static without cloning or reading trusted hidden state.
4. Low-confidence and OOD beliefs return static without simulation.
5. Deadline and transition exhaustion return a legal static fallback.
6. Equal leaf values preserve static order.
7. Opponent-policy/engine errors are audited and cannot yield an illegal selection.

## Promotion boundary

This iteration promotes only the planner contract. The next iteration must run it on official
offline environments, predeclare one-second/three-second budgets and a disjoint development league,
then measure completion, violations, paired-seat terminal rank/win, P95 latency, fallback rate,
horizon sensitivity and seed variance. Promotion holdout remains sealed.

## Iteration 18 outcome

- Ten contract/adversarial checks pass, including future simultaneous information-set consistency:
  every matched belief sample uses the same public actor commitment before opponent resolution.
- A frozen official two-player smoke evaluated two roots × two official-AI belief samples, completed
  4/4 scenarios, crossed restructuring, reached actor depth 4 through 20 official transitions and
  produced zero failures or private report payloads. Repeated report hashes match.
- The beam changed the turn-1 static hire to skip because the current cutoff evaluator scored skip
  39 and hire 35.4. This is a useful failure signal: the mechanism works, but the current value and
  horizon may prefer strategically implausible short-term inactivity.
- Therefore only the planner contract advances. Strength remains rejected/unproven, the promotion
  holdout remains sealed, and P4.1 proceeds to one-/three-second development leagues plus horizon
  sensitivity rather than integrating this policy into live play.
