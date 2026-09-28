# Plan-health and opportunity arbiter v1

## Objective

Add the missing decision layer between `GameMemory v2` and candidate/search ranking. It chooses one
of `continue`, `repair`, `tactical_deviation`, `pivot`, or `abandon` from public, bounded evidence
without duplicating official legality.

## Frozen input and policy

The arbiter receives the current strategic memory plus one evidence record containing:

- a public observation digest and explicit review trigger;
- terminal-oriented values for continue/repair/tactical/pivot/abandon;
- switching and tactical costs, reusable-asset fraction, salary runway;
- opportunity expiry, confidence, impact and uncertainty.

V1 uses a declared deterministic score decomposition. A challenger must clear an enter margin;
returning to the stable plan uses a smaller exit margin. A one-turn cooldown blocks repeated mode
changes except for infeasible/invalidated plans or cash emergencies. An unchanged observation digest
reuses the prior decision exactly, so evaluator noise cannot cause replanning.

`tactical_deviation` is a temporary mode: it retains the same plan graph and must have a near-term
expiry. `pivot` marks the existing plan as replaced but does not invent the replacement plan;
creating that plan remains an explicit later memory event. `abandon` is eligible only when the plan
is infeasible/invalidated or cash runway is exhausted.

## Frozen adversarial cases

1. A genuine expiring gain beats a sound plan after tactical cost and selects temporary deviation.
2. An attractive bait loses after commitment damage and the plan continues.
3. A reusable repair beats abandonment after a prerequisite failure.
4. An infeasible goal pivots when the alternative clears switching cost.
5. A dead plan with no viable repair or pivot is abandoned.
6. Repeated identical observations and cooldown pressure cannot make the mode oscillate.
7. Low-confidence opportunity evidence cannot replace a feasible plan.
8. Hidden/private-shaped and credential-shaped evidence fails closed.

## Promotion gate

The reducer must preserve plan identity/capabilities/commitments during tactical deviation, record an
auditable arbitration summary, rebuild byte-for-byte from events, and pass the full privacy,
strategy, candidate, official-engine and documentation suites. This promotes infrastructure only;
terminal playing strength still requires P4 equal-budget league evidence.

## Iteration 17 outcome

- All five modes are scored through one exact public evidence schema. Low-confidence non-emergency
  challengers are suppressed; infeasible/cash-emergency states may still repair, pivot or abandon.
- Enter/exit margins, one-turn cooldown and same-turn observation-digest reuse prevent oscillation.
- Tactical deviation retains plan identity, capabilities and commitments. Pivot/abandon make the
  old plan terminal until an explicit replacement plan is created.
- Arbitration mode is connected to candidate-plan features as a bounded priority, never as a legal
  action or hard action override.
- Ten adversarial tests and the existing memory/candidate/strategy suites pass. The values remain
  bootstrap inputs pending P4 search and terminal league calibration.
