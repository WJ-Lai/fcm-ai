# Action-conditioned terminal regret v1

Status: experiment iteration 1

## Fixed research question

Can an action-conditioned model rank legal candidates from the same FCM root more accurately than
the current state-winner value model when correctness is defined by deterministic official-engine
completion to Game Over?

Primary metric: disjoint calibration-root Top-1 accuracy. The historical state-value puncture is
3/12 (25%), but iteration 1 will also recompute its comparator on exactly the new calibration roots.

## Iteration 1 hypothesis

The post-action acting-seat-versus-opponent semantic feature vector contains enough information for
a root-grouped pairwise logistic model to rank three bounded legal candidates better than the
state-winner model. This changes one variable: the learning target becomes within-root terminal
margin preference. Candidate generation, continuation policy, engine, candidate cap and root
subphases stay fixed.

## Frozen puncture protocol

- Development and calibration use disjoint declared seeds; promotion roots are predeclared but
  sealed.
- Each split contains one deterministic two-player trajectory and the first middle-game roots in
  hiring, marketing and production with at least two candidates.
- Keep up to three diversity-prefiltered candidates per root, with at least two decisive options.
- Apply each candidate in an isolated official clone, extract only semantic DecisionView v2
  features after the action, then run the same deterministic external policy against the official
  built-in opponent to Game Over. Built-in randomness is seeded by continuation step so branches
  receive the same reproducible opponent process.
- Store no snapshots, legal actions, credentials, raw moves or hidden simultaneous buffers; retain
  only hashes, feature vectors, public metadata and terminal outcomes.
- Pairwise training rows compare candidates only inside the same root and give every root equal
  total weight.

## TDD and research loop

1. RED/GREEN: strict action-regret dataset validation and equal-root pair generation.
2. RED/GREEN: deterministic ranking audit with Top-1, mean terminal regret and state-value baseline.
3. Collect the development puncture, fit L2 pairwise models, and choose regularization only on the
   calibration puncture.
4. Log iteration metric and conclusion to `experiments.jsonl`; do not merge an experiment that does
   not improve independent Top-1 without safety regressions.
5. If iteration 1 is promising, freeze more seeds before adding one new feature family. If not,
   back off and inspect collisions before increasing model complexity.

## Safety and non-claims

The terminal label is conditional on one deterministic continuation policy, not perfect-play Q.
This puncture tests whether the representation can learn adjacent-action consequences at all. It
cannot promote a live policy, and it does not open the 24-game terminal promotion holdout.

## Iteration 1 result

The hypothesis was rejected on the disjoint calibration puncture.

- Development: 3 roots, 7 pairwise comparisons.
- Calibration: 3 roots, 5 pairwise comparisons.
- Static candidate order: 2/3 root Top-1, mean terminal regret $3.33.
- Frozen state-value v2: 2/3 root Top-1, mean terminal regret $3.33.
- Every tested action-regret regularization value: 2/3 root Top-1, mean terminal regret
  $3.33. Lambda 1 had the lowest calibration pairwise log loss (0.5115), but no Top-1 gain.
- Promotion holdout remained sealed and the learned model was not integrated.

The decisive representation counterexample is the production root. In both splits, choosing the
production candidate instead of the fallback changes exactly one semantic feature:
`inventoryTotal += 3`. Under the frozen continuation, that identical local delta improves terminal
margin by $76 in development but reduces it by $10 in calibration. A linear score over absolute
post-action features cancels the shared root context during within-root comparison, so it cannot
represent this sign change. This is not evidence that more epochs or weaker regularization will fix
the model.

Marketing also exposes a smaller collision: two spatially different demand placements have an
identical semantic feature vector. Their terminal margins differ by only $2 in development and tie
in calibration, so this is recorded but is not the next optimization target.

The first collection attempt used deterministic policies for both seats. It was discarded before
model fitting because one calibration branch exceeded the frozen 700-command completion bound and
one root exposed only two candidates. The protocol was narrowed to the official built-in opponent
and an explicit two-to-three candidate bound rather than accepting partial labels or silently
raising the limit.

## Iteration 2 gate

The next experiment may add exactly one action-context interaction family. It must make the
production comparison context-sensitive without opening the promotion holdout or adding raw/private
state. Before choosing the interaction, inspect which observed root-context fields distinguish the
opposite-sign production examples. If no defensible feature is available, expand development and
calibration roots before increasing model capacity.

## Iteration 2 hypothesis and frozen change

Iteration 2 changes only the number of predeclared development and calibration seeds from one to
four per split. It keeps the v2 semantic representation, pairwise learner, candidate limit,
root phases, continuation policy and metrics unchanged. This provides 12 roots per split and tests
whether iteration 1's apparent production sign reversal is stable enough to justify an explicit
interaction feature. The two promotion seeds are separate and remain sealed.

Acceptance is not defined as beating the original three-root number. This iteration succeeds as a
measurement experiment if every declared branch completes, privacy/ruleset validation passes, and
the enlarged disjoint calibration reveals a reproducible error class. The unchanged model remains
non-promotable unless it independently improves Top-1 and regret.

## Iteration 2 result

The measurement experiment completed, and the unchanged model was rejected more decisively.

- Development and calibration each completed 4 seeds, 12 roots and 32 candidates on ruleset
  `a171620e...`; they produced 26 decisive pairwise comparisons per split.
- Candidate continuations all reached Game Over in 96–441 commands. Development P50/max was
  190/434 and calibration P50/max was 264/441; no label was produced by truncation.
- Static order, state-value v2 and every action-regret regularization value all selected 5/12
  calibration roots correctly (41.7%), with mean terminal regret $255.58 and worst regret $832.
- The selected lambda changed to 10 on log loss, but root choices did not change. More tuning cannot
  repair the missing conditional information.
- The 26 calibration comparisons collapse to only seven unique feature-delta vectors. Every one of
  the seven receives contradictory terminal labels in different roots. Even an oracle that picks
  the majority label separately for each exact context-free delta is capped at 58.3% weighted
  pairwise accuracy on calibration. Across both splits, all 52 rows belong to conflicting deltas.
- Promotion remained sealed. The learned model remains disconnected from live play.

This establishes two separate risks. First, a context-free linear action delta is not identifiable:
shared root state cancels from a pairwise score. Second, one deterministic full-game continuation is
a potentially high-variance label for a local action: the same production delta can change terminal
margin by hundreds of dollars in either direction. Iteration 3 must test label stability under a
small, predeclared continuation-policy population before choosing a bilinear interaction, tree or
neural model. Adding capacity before that test would fit continuation noise.

## Iteration 3 hypothesis and frozen change

Iteration 3 changes only continuation sampling. It freezes four production roots selected before
execution: one positive and one negative baseline preference from each of development and
calibration. Each original candidate is completed under three paired built-in-opponent seed streams;
sample zero must reproduce iteration 2 terminal margins exactly. Root snapshots, candidates, the
acting-seat deterministic policy, engine, 700-command bound and promotion seal remain fixed.

Primary diagnostic: fraction of roots whose terminal-optimal candidate is identical under all three
continuations. A flip means the original single continuation is not a stable local-action label; it
does not mean either action is intrinsically bad. With only three samples this is a puncture, not a
converged expectation estimate. If flips occur, iteration 4 must establish a sequential sampling
and confidence rule before fitting action-context interactions.

## Iteration 3 result

The single-continuation label hypothesis was rejected.

- All four roots reconstructed the same strategic projection and candidate IDs. Sample zero also
  reproduced every iteration 2 candidate terminal margin exactly. An initial attempt correctly
  failed because the raw engine snapshot digest was not reproducible; no output was retained. Root
  identity now uses the canonical strategic projection, candidate set and baseline outcome checks.
- Zero of four roots kept the same terminal-optimal candidate across three continuation samples.
  Every root split 2–1 between production and fallback, for mean sample agreement 66.7%.
- Paired terminal-margin differences (production minus fallback) ranged from -$848 to +$735. The
  four sample-zero signs were therefore not robust local-action targets.
- The three-sample means happened to preserve the original preference sign on all four selected
  roots, but three samples are far too few for a confidence or convergence claim.
- Promotion remained sealed; no model or policy was integrated.

Iteration 4 must define a paired common-random-number estimator over a versioned continuation-policy
population. It should sample sequentially to a predeclared maximum, report the mean action advantage,
standard error/confidence interval and sign stability, and abstain when uncertainty remains high.
Only roots with stable out-of-sample preference targets may train an action-context model. The same
stability audit must later cover hiring and marketing rather than generalizing from production.

## Iteration 4 hypothesis and frozen change

Iteration 4 changes only the decision rule over continuation samples. The paired outcomes remain
unchanged. A versioned sequential protocol spends family-wise alpha 0.05 at predeclared sample
stages 3/7/15 using exact two-sided paired sign tests. At a stage, one candidate is selected only if
it significantly beats every alternative after stage-wise Bonferroni correction; otherwise the
estimator requests the next stage or abstains at the maximum. Terminal-rank utility is primary;
cash-margin mean and standard error plus a Wilson interval over decisive paired wins are diagnostic.

The iteration-3 three-sample dataset is the first input. The expected safe result is zero coverage
and four requests for more samples, not a forced recommendation. This validates the estimator's
fail-closed semantics before spending compute on stages 7 and 15.

## Iteration 4 result

The fail-closed estimator hypothesis passed.

- All 4/4 roots returned `needs-more-samples`; coverage is 0 rather than a forced action label.
- At three samples, each exact paired sign test has p-value 1.0. Three roots contain one positive,
  one negative and one terminal-rank tie; the fourth contains one negative and two ties.
- Mean cash-margin advantages range from -$215.67 to +$172, but their standard errors range from
  $264.17 to $441.05. These diagnostics correctly do not override terminal-rank uncertainty.
- The versioned protocol spends family-wise alpha exactly 0.05 across stages 3/7/15. It applies a
  per-stage Bonferroni correction when more than two candidates are compared.
- Promotion remained sealed and no action label was exported for training.

Iteration 5 changes only the available paired sample count from three to seven on the same four
roots. It must resume samples 3–6 without recomputing or overwriting the verified first three.

The collector therefore refuses to overwrite an existing report unless `--resume` is explicit,
validates the full frozen root/candidate set, copies prior arrays without mutation, computes only
the missing sample indices, and atomically replaces the report only after all branches pass.

## Iteration 5 result

The seven-sample stage produced no false certainty.

- All 4 roots and 8 candidates retained their first three margins and command counts exactly; only
  sample indices 3–6 were executed. The completed report records `resumedFromSampleCount: 3`.
- The estimator selected 0/4 roots and sent 4/4 to the predeclared 15-sample maximum. Stage-seven
  p-values are 0.6875, 1.0, 0.375 and 1.0 versus alpha 0.02.
- Decisive terminal-rank comparisons remain sparse because both actions often produce the same
  win/loss result against the opponent: the four roots contain only 6, 3, 5 and 3 decisive pairs.
- Cash diagnostics remain unstable. For example, development root 00 changes from a -$215.67
  three-sample mean production advantage to +$10 at seven samples. Standard errors are still
  $156.97–$213.34 at stage seven.
- Promotion remained sealed and no label was exported.

Iteration 6 changes only sample availability from seven to the frozen maximum of fifteen. At the
maximum, every unresolved root must become an explicit `abstain-max-samples`; the estimator may not
fall back to cash sign or static order to fabricate a training label.

As in iteration 5, collection must preserve the seven-sample prefix exactly, compute only indices
7–14 and replace the report atomically after all 64 new candidate continuations finish.

## Iteration 6 result

The frozen maximum closed all four production roots as abstentions.

- The seven-sample prefix was preserved exactly. Across 4 roots × 2 candidates × 15 samples, all
  120 candidate continuations reached Game Over within the existing command bound.
- The estimator selected 0/4 and returned `abstain-max-samples` for 4/4. Final p-values are
  0.5488, 0.4531, 0.2891 and 1.0 against alpha 0.025.
- Terminal rank is frequently insensitive to the local production choice under this opponent
  population: 4, 8, 7 and 10 of 15 paired samples are ties at the four roots.
- Cash-margin standard errors fall with more samples but remain $107.07–$139.27. Their signs are
  recorded only as diagnostics and do not create labels.
- Promotion remained sealed. These four roots are excluded from supervised action-preference
  training under continuation population v1.

This completes the production label-stability puncture. The next bounded experiment should apply
the same three-sample first gate to frozen hiring and marketing roots. In parallel, P3.3d must define
a versioned opponent-policy population; repeatedly sampling one weak built-in policy cannot by
itself establish action value against realistic external agents. Do not increase the production
maximum post hoc.
