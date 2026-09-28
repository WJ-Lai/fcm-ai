# Opponent temporal calibration v2 execution plan

## Single change

Replace unordered public event histograms with the same unigrams plus adjacent within-seat public
event transitions. All policies, engine, seeds, seat rotations, 160-command horizon, likelihood
model, smoothing, OOD method and pass gates remain identical to iteration 9.

Transition features are derived only after events become public. They contain event codes, not
payloads, snapshots, identities or hidden simultaneous choices. The v1 report remains immutable.

## Decision

- Promote the representation for further calibration only if calibration Top-1 is at least 75%
  and human OOD rate is at least 50%.
- Even if both gates pass, do not connect it to search until information-set consistency and
  held-out sensitivity tests pass.
- If it fails, reject event-only opponent identification and add public state/action context rather
  than tuning thresholds on the same calibration split.

## Iteration 10 outcome

- All 12 frozen prefixes exactly reproduced the v1 unigram counts; v2 added only bounded public
  within-seat event sequences and adjacent transition features.
- Calibration Top-1 improved from 17/24 (70.8%) to 22/24 (91.7%), log loss from 0.477 to 0.296 and
  Brier score from 0.303 to 0.159. Human OOD increased from 82/120 (68.3%) to 102/120 (85%). Both
  predeclared representation-selection gates passed.
- The two remaining errors are seeded-random trajectories classified as safe-first. All 24 known
  samples landed in the 0.8–1.0 confidence bin with mean confidence 0.981 but only 0.917 accuracy.
- Result: promote the temporal representation to an independent probability-calibration stage,
  not to live belief updates or search. Temperature/abstention fitting must use the current
  calibration split and be evaluated on newly frozen validation seeds.
