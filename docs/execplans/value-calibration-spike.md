# Terminal-value calibration spike

Status: puncture complete; evaluator calibration remains open

## Goal

Measure whether the current explainable evaluator ranks positions in the same direction as future
terminal results before changing any weights. Build a deterministic, seat-safe calibration report
with a development/holdout seed split, phase strata and explicit promotion boundaries.

## Non-goals

- Do not promote a policy from evaluator self-agreement or development-seed tuning.
- Do not expose raw official-engine snapshots, hidden simultaneous choices or credentials.
- Do not treat human action matching as a value label.
- Do not add deeper search until terminal calibration and leaf-cutoff diagnostics pass.

## TDD slices

1. RED: terminal targets preserve ties, rank ordering and normalized money margins.
2. RED: calibration metrics report leader accuracy and pairwise concordance without counting tied
   terminal pairs as wins or silently accepting malformed seat sets.
3. RED: reports stratify early/middle/late observations, keep development and holdout seeds disjoint,
   and reject private or unknown provenance.
4. GREEN: implement the smallest pure audit module satisfying those contracts.
5. GREEN: add a deterministic official-engine collector that samples only seat-scoped
   `DecisionView` inputs and attaches terminal labels after game completion.
6. REFACTOR: run a small puncture test over multiple policies/seats, record the failure profile,
   then decide which evaluator features are justified. Weight fitting may use development seeds only;
   holdout is one-shot evidence.

## Promotion boundary

This spike can validate the corpus and metrics, but P3.3b remains open until a frozen evaluator
completes every held-out game, beats random/first-legal in paired terminal rank/win metrics, and
introduces no legality, privacy, reproducibility or latency regression.

## Puncture result

Six two-player base games (three development, three diagnostic holdout) completed with 94 sampled
turn boundaries. Every prediction was computed separately from that seat's `DecisionView`; terminal
money was attached only after Game Over. Reports now expose both turn-level diagnostics and
game-level macro averages so repeated turns cannot masquerade as independent games.

Balanced/growth had identical ordering throughout (game-macro leader accuracy 65.7%); cash reached
67.5% by changing only two late-turn directions. Early accuracy was 47.2%, with 13/18 positions tied
and only 2/5 decisive early calls correct. This is a useful failure localization, not a promotion:
the policy population is weak, the sample has only six 2-player games, and the inspected diagnostic
holdout is now consumed. The next calibration dataset must use fresh frozen seeds and preserve a new
one-shot terminal holdout.
