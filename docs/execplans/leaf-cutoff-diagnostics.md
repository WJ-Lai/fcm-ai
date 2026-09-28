# Leaf value and cutoff diagnostics

Status: in progress

## Goal

Determine whether the gated terminal-value v2 signal is useful at actual search leaves before it is
allowed to change root choices. Separate three questions that aggregate accuracy hides: how far a
leaf is from the realized end of its trajectory, whether value-sign reversals move toward the real
winner, and whether additional official transitions improve or degrade root decisions.

## Safety boundary

- Use only completed development/calibration trajectories and official clone environments.
- Treat realized remaining turns as a retrospective diagnostic, not information available online.
- An uncalibrated phase must abstain; zero is a tie that preserves the pre-existing legal fallback.
- Keep the production strategy unchanged and the 24-game promotion holdout sealed.
- Bind reports to ruleset, feature, evaluator, candidate-generator and fixture versions.

## TDD slices

1. RED: temporal-cutoff audit reports equal-game-weighted accuracy, log loss and abstention for
   far/medium/near/boundary leaves.
2. RED: sign reversals are classified as toward-outcome or away-from-outcome, ignoring abstentions.
3. GREEN: implement the pure audit over frozen pairwise rows and generate the calibration report.
4. RED/GREEN: add an experimental leaf scorer that evaluates both seats from one seat-safe
   DecisionView and preserves static ordering when the phase abstains.
5. RED/GREEN: run identical root candidates at fixed/randomized official-transition cutoffs and
   compare each root recommendation with terminal completion where affordable.
6. REFACTOR: freeze diagnostics and thresholds before any one-shot promotion league is opened.

## Temporal calibration checkpoint (2026-09-28)

The first retrospective audit uses the development-only calibration model on the disjoint 12-game
calibration split; it deliberately does not score calibration data with the model later refitted on
development plus calibration. Across 293 observations, equal-game-weighted accuracy/log loss is:

- early: 0.500/0.693 with 100% abstention;
- middle: 0.611/0.678;
- late: 0.797/0.496;
- far/medium/near/boundary realized remaining-turn buckets: 0.652/0.659,
  0.806/0.378, 0.861/0.274 and 1.000/0.186 respectively.

There are 12 non-abstaining sign reversals: 9 toward the terminal winner and 3 away. This supports
continuing the experiment but is not yet a search-cutoff result: trajectory time passing changes the
position as well as the observation horizon. The next slice must hold each root position and
candidate set fixed while varying only official-transition cutoff.

## Fixed-root puncture (2026-09-28)

Three reproducible middle-game roots freeze hiring, marketing and production candidate sets. Each
root keeps three diversity-prefiltered legal candidates, scores them after 0/2/5/11 official
transitions under one deterministic continuation policy, and then completes every branch to Game
Over. Results are deliberately negative:

- only 3/12 cutoff recommendations match the terminal-best candidate;
- hiring misses at every cutoff (terminal margin $235 chosen versus $255 oracle);
- production misses at every cutoff ($235 versus $240);
- marketing is correct at 0/2/11 but cutoff 5 reverses away from the oracle and selects a -$230
  branch over the +$235 branch, a $465 terminal-margin error;
- aggregate reversals are one toward-oracle and one away-from-oracle, so more transitions are not
  monotonic evidence of a better decision.

The puncture passes legality/completion and preserves source isolation, but it rejects immediate v2
leaf integration. Aggregate terminal-winner prediction and near-boundary accuracy are insufficient
for adjacent-action ranking. The next model must learn action-conditioned value deltas or regret,
then repeat this exact fixed-root suite plus broader seeds/subphases before any policy integration.

## Exit gate

Middle/late value estimates may enter an experimental planner only if calibration remains above the
frozen gate across remaining-horizon buckets and deeper cutoffs do not systematically increase
away-from-outcome reversals. This does not promote the policy; terminal paired-seat lift is still
required.
