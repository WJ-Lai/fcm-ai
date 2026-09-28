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
