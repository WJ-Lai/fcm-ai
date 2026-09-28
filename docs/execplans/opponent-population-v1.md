# Opponent population v1 execution plan

## Objective

Freeze a small, reproducible population of materially different opponent policies and expose a
public-history-only belief sampler. This is infrastructure for uncertainty-aware rollout; it does
not claim that the initial weights are calibrated.

## Contracts

- The manifest is versioned, immutable input with unique model ids and normalized prior weights.
- Policy input has three explicit partitions: `observed`, `derived`, and `believed`.
- Beliefs contain the population version, model id, confidence, sample count and OOD status.
- Only public history and seat-visible observations may update model weights.
- Sampling is deterministic for a seed and never inspects an engine snapshot or private opponent
  choice.
- External policies receive only the legal seat view. The official built-in policy is represented
  by an environment-adapter directive and is never asked to fabricate an action.

## TDD and adversarial checks

1. RED: validate manifest coverage, provenance separation, deterministic sampling and policy
   dispatch.
2. RED: reject private engine fields, credential-shaped fields, duplicate ids, unnormalised weights
   and malformed confidence/sample metadata.
3. GREEN: implement the minimum validator, updater, sampler and dispatcher.
4. Metamorphic check: private-state mutations cannot alter a belief or sampled model; an explicit
   public-history update can.
5. Run all Node/Python/lint suites, freeze an experiment report, update SPEC/TODO, commit and push.

## Non-goals

- No use of the sealed promotion holdout.
- No learned calibration claim from four hand-set priors.
- No direct coupling to search until sensitivity and information-set consistency gates pass.

## Iteration 8 outcome

- Frozen four archetypes: deterministic balanced, safe-first, seeded-random and official built-in.
- The official built-in emits an environment-adapter directive; the other three dispatch through
  legal seat views only.
- Belief updates bind the updater id and source public-history digest. Unknown/private/sensitive
  fields fail closed, and every sampled component records model id, confidence and sample count.
- A 4,096-sample prior audit and a 4,096-sample explicitly updated audit were deterministic. The
  maximum absolute sampling error was 0.0137 and the public update changed the distribution.
- This passes the mechanical contract/sampler gate. It does **not** calibrate the hand-set priors;
  empirical trajectory calibration and OOD thresholds remain before search integration.
