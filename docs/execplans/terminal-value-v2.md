# Terminal value evaluator v2

Status: feature/data/calibration slices complete; search integration and promotion pending

## Goal

Replace the experimental v1 evaluator's structurally invalid generic capacity sum with an isolated,
versioned and calibratable terminal-value feature contract. Represent delayed economic capability
without reimplementing legality or reading hidden engine state, then fit only on predeclared
development games and promote only through untouched terminal leagues.

## Observed v1 defect

`numericCapacity()` recursively sums every numeric leaf under `economyPlayers.capacities`. Employee
IDs, good IDs, campaign-type IDs and duration metadata therefore contribute as if they were units of
economic capacity. More weight tuning cannot make that representation meaningful. V1 remains frozen
as the current baseline until v2 clears every gate; it is not silently changed in place.

## Data protocol

- Predeclare disjoint `development`, `calibration` and `promotion-holdout` seed namespaces.
- Extract bounded numeric features only from each seat's `DecisionView`; never persist raw snapshots,
  moves, credentials or hidden simultaneous choices.
- Attach rank/money targets only after Game Over.
- Weight games equally during fitting so long games cannot dominate through repeated turn samples.
- Fit on development, choose regularization/profile on calibration, and open promotion holdout once
  after evaluator/version/thresholds are frozen.

## TDD slices

1. RED: explicit economy features count workers/coverage and never sum identifier magnitude.
2. RED: market features separate reachable, currently servable, uncontested and unreachable demand.
3. RED: delayed-value interactions distinguish production-only, marketing-only and a reachable
   demand/supply engine; salary gap penalizes unaffordable growth.
4. RED: hidden/raw engine mutations leave features unchanged, while missing official decision
   support fails closed.
5. GREEN: implement the minimal immutable feature extractor and stable ordered vector.
6. GREEN: add a development-only collector and group-balanced fitting/audit pipeline.
7. REFACTOR: freeze v2 weights and calibration diagnostics before any policy uses them; run fresh
   paired terminal leagues and leaf-cutoff diagnostics before promotion.

## Evidence checkpoint (2026-09-28)

- The explicit v2 extractor, strict dataset validator, equal-game pairwise fitter and per-phase
  model selector pass the complete local test suite.
- The official DecisionView now exposes semantic employee-pipeline counts and derives reachability
  from all official map houses, including printed starting houses that were previously omitted.
- The frozen development and calibration splits completed 12/12 games each (574 observations total)
  across four policy families and both seats. Both are bound to official ruleset
  `a171620e533a34f0c77133afac1d239a02c7600978486d09a77a20ead95d0b5e`; collection and model
  selection fail if rulesets differ. The 24-game promotion split remains unopened.
- Independent calibration selected lambda 10/0.1/0.1 for early/middle/late. Raw weighted
  accuracy/log loss is 0.469/0.692, 0.636/0.626 and 0.786/0.512 respectively.
- The predeclared 0.55 accuracy and 0.69 log-loss gate rejects early value estimates. The exported
  scorer returns zero there and continues to expose middle/late estimates only. This is deliberate
  abstention, not a claim that early strategy is solved.
- Next: wire the gated scorer into an experimental leaf evaluator, freeze multi-horizon cutoff and
  root-reversal diagnostics, and only then open the one-shot promotion holdout.

## Promotion boundary

V2 must beat v1 and weak baselines on a new paired terminal holdout with no legality, privacy,
completion, reproducibility or P95 regression. Feature-label fit, early-turn accuracy and a better
development loss are diagnostics only.
