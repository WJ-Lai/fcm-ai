# Opponent block-robust calibration v5 execution plan

## Objective

Replace the unstable single-block temperature fit with a conservative calibration rule that must
work on every consumed development block, then perform one final assessment on three untouched
blocks. This remains a belief-calibration experiment, not live policy integration.

## Frozen development rule

- The temporal likelihood model, predicted-class OOD thresholds, population, horizon and public-only
  observation contract remain unchanged.
- Treat the old calibration split and iterations 11–12 validation splits as three consumed
  development blocks. Their labels may tune this experiment but can never validate it again.
- Search the original temperature grid and confidence thresholds induced by those blocks.
- A candidate must achieve at least 50% coverage and 90% accepted accuracy **in every block**.
  When enabled, calibrated log loss must be no worse than raw log loss in every block.
- Select by maximum worst-block coverage, then mean coverage, then aggregate log loss, then the
  smallest temperature/threshold. This deterministic ordering is frozen before new collection.
- Predicted-class OOD thresholds remain the old-calibration 95th percentiles and never use the true
  label at inference time.

## Fresh validation

- Collect 18 new four-player 160-command prefixes, divided in advance into three consecutive
  six-game blocks.
- Every block independently requires Top-1 ≥75%, ECE ≤0.15, selective coverage ≥50%, accepted
  accuracy ≥90%, and calibrated log loss no worse than raw.
- Aggregate metrics are reported but cannot rescue a failed block.
- Promotion holdout remains sealed; no private engine state is stored.

Passing advances to information-set policy consistency only. It does not connect beliefs to search.

## Iteration 13 outcome

- The frozen fitter selected identity temperature `1` and confidence threshold `0.8189`; its worst
  consumed-development-block coverage was 58.3%, with every block at least 90% accepted accuracy.
- Eighteen fresh prefixes produced three predeclared six-game / 24-seat blocks. Top-1 was 24/24,
  23/24 and 22/24; coverage was 17/24, 19/24 and 15/24; accepted accuracy was 17/17, 18/19 and 15/15.
- Per-block ECE was 0.030, 0.031 and 0.059. Identity scaling makes log-loss non-inferiority exact;
  every other frozen gate passed independently in every block.
- Iteration 13 passes. Freeze this calibration artifact and advance only to information-set policy
  consistency. Promotion holdout remains sealed and belief-driven search remains disabled.
