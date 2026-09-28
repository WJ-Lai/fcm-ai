# Opponent calibration v1 execution plan

## Question

Can a model trained only on public action-history events distinguish the four frozen opponent
archetypes on disjoint official-engine games, and can it flag real human trajectories that do not
look like any weak archetype?

## Predeclared protocol

- Generate 12 four-player base-game prefixes: six development seeds and six disjoint calibration
  seeds. Freeze each prefix at 160 public command boundaries so the model must identify styles
  during play rather than from terminal information.
- Each game contains exactly one deterministic-balanced, safe-first, seeded-random and official
  built-in seat; rotate seats across seeds.
- Store per-seat public event-code counts only. Do not persist snapshots, private buffers, reserve
  choices before reveal, credentials or arbitrary player text.
- Fit a Laplace-smoothed multinomial likelihood model on development games.
- Freeze the OOD negative-log-likelihood threshold from known-policy calibration trajectories.
- Report calibration Top-1, log loss, Brier score, confusion matrix, confidence bins and human-corpus
  OOD rate. Human public replays have no archetype label and are never scored as correct/incorrect.
- Keep the promotion holdout sealed and do not connect the classifier to live search in this step.

## Stop conditions

- Any engine error, prefix shorter than the frozen horizon, private field, split overlap or ruleset
  drift fails the run.
- If the official built-in cannot be represented by public event history, reject this feature family.
- If known-policy calibration is poor, keep uniform/frozen priors and redesign features.
- If human histories are confidently forced into weak archetypes, treat it as failed OOD behavior.

## Iteration 9 outcome

- Collected 12/12 official-engine prefixes and 48/48 seat samples at exactly 160 public commands,
  balanced six-per-archetype in each disjoint split. All samples share ruleset hash
  `a171620e…d95d0b5e`; no private snapshots or unrevealed choices are stored.
- Public event histograms reached 17/24 (70.8%) calibration Top-1, below the frozen 75% gate.
  Deterministic-balanced was confused with official built-in in 3/6 cases; seeded-random was
  confused with deterministic/safe-first in 3/6.
- The frozen OOD threshold rejected 82/120 (68.3%) comparable human prefixes, above the 50% gate,
  but the remaining predictions were overconfident and 89/120 mapped to official built-in.
- Overall result: rejected. Histogram counts discard order and state context needed to distinguish
  policies. They remain a safe baseline, but cannot update live beliefs or search.
- Next experiment changes only the public feature representation to bounded event transitions and
  phase/action context; splits, seeds, policies, horizons, model family and gates remain frozen.
