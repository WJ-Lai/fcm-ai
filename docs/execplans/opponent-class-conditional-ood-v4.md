# Opponent class-conditional OOD v4 execution plan

## Objective

Test whether predicted-class-specific public-event NLL thresholds recover valid belief coverage without
reducing accepted accuracy. This is a calibration experiment, not a search-policy change.

## Frozen design

- Base likelihood model, temporal features, four-policy population, 160-command horizon and public-only
  observations are unchanged from iterations 10–11.
- Freeze scalar temperature `3` and confidence abstention threshold `0.8627888116824795` from iteration
  11. They may not be refitted after the new validation data is observed.
- Change exactly one variable: replace the single global OOD mean-NLL threshold with one threshold for
  each **predicted** model. Fit each threshold at the linearly interpolated 95th percentile of iteration
  10's old calibration rows assigned to that predicted model. Actual labels must not choose a threshold
  at inference time.
- Record threshold sample counts and fail closed if any declared model has no calibration rows.
- Evaluate once on six fresh four-player, seat-rotated prefixes named
  `opponent-calibration-validation2-00..05`. Iteration 11 validation and the promotion holdout are not
  used for fitting or selection.

## Frozen validation gates

- all-policy Top-1 at least 75%;
- calibrated log loss no worse than uncalibrated;
- five-bin expected calibration error at most 0.15;
- selective coverage at least 50%, and selective accepted accuracy at least 90%;
- promotion holdout remains sealed and no hidden/private state is persisted.

Passing permits an information-set consistency test. It does not authorize live rollout/search use.

## Iteration 12 outcome

- Six fresh prefixes / 24 balanced seat samples completed at exactly 160 commands under the frozen
  ruleset; no prior validation or promotion-holdout seed was reused.
- Predicted-class thresholds recovered selective coverage to 12/24 (50%) with 12/12 accepted
  predictions correct. Top-1 was 23/24 and five-bin ECE was 0.081.
- The frozen temperature `3` was not stable across this block: raw log loss was `0.0947`, while
  temperature-scaled log loss worsened to `0.1649`. The predeclared log-loss gate failed, so the
  experiment is rejected despite the OOD improvement.
- Do not choose temperature `1` from this consumed block and retest on it. Next replace single-block
  temperature fitting with a predeclared block-robust calibration protocol using consumed blocks as
  development only, then evaluate once on multiple fresh blocks. Beliefs remain disconnected.
