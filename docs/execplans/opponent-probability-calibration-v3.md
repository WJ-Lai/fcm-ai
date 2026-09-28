# Opponent probability calibration v3 execution plan

## Objective

Calibrate the promoted temporal opponent representation without changing its features or classifier,
then evaluate once on six newly frozen official-engine seeds.

## Frozen design

- Base model/data: iteration 10 development and calibration splits, digest
  `b2587f64…db8a132`.
- Fit exactly one scalar temperature on iteration 10's calibration split from the predeclared grid
  `[0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8]` by log loss.
- Fit one confidence abstention threshold by maximum coverage subject to at least 95% calibration
  selective accuracy and 25% coverage. OOD rejection remains independent and takes precedence.
- Evaluate once on six new four-player, seat-rotated, 160-command prefixes. Do not refit after
  looking at validation results.
- No feature, policy, seed reuse, likelihood count, smoothing or OOD-method change.

## Validation gates

- all-policy Top-1 at least 75%;
- calibrated log loss no worse than uncalibrated on the new validation set;
- five-bin expected calibration error at most 0.15;
- selective coverage at least 50% with accepted accuracy at least 90%;
- promotion holdout remains sealed and no hidden/private state is persisted.

Passing these gates advances the belief model to information-set consistency testing only. It does
not authorize live rollout/search integration.

## Iteration 11 outcome

- Six new prefixes / 24 balanced seat samples completed at the frozen 160-command horizon under the
  same ruleset. No old seed or promotion holdout was used.
- Calibration selected temperature `3` and confidence threshold `0.8628`. On new seeds, Top-1 was
  21/24 (87.5%), log loss improved from 0.439 to 0.264, Brier from 0.250 to 0.158, and ECE was 0.055.
- Accepted accuracy was 10/11 (90.9%), but accepted coverage was only 11/24 (45.8%), missing the
  frozen 50% gate by one sample. Overall result is rejected.
- Diagnosis: the global OOD NLL threshold rejected six validation samples, all correctly classified,
  disproportionately from deterministic/official styles. Do not relax it post hoc. Next test one
  change—class-conditional OOD thresholds fitted on old calibration data—and evaluate on fresh seeds.
