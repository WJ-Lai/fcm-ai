# Candidate coverage and independent fixture execution plan

Status: active — discrete proposal gate complete; marketing and fixtures remain

Updated: 2026-09-28

## Objective

Raise discrete hire/train pattern coverage toward the frozen 75% gate and improve marketing-effect
coverage without exceeding 32 candidates, then freeze independent tactical/strategic fixtures before
any deeper search work. Every generated candidate must remain executable by the official engine.

## Baseline and constraints

- The replay directories are cumulative. The enforced split is games 1–50 for proposal training and
  games 51–100 for one frozen final test; the earlier “untouched pilot-50” wording was incorrect.
- Training-corpus hire/train pattern coverage: 1093/1337 and 672/891.
- Disjoint final-50 hire/train exact/pattern coverage: 837/1013 of 1260 and 615/656 of 825.
- Marketing effect coverage before the current diversity pass: 100/270 on training games.
- Maximum policy-boundary candidate count: 32.
- Official OBG FCM JavaScript remains the only legality and transition authority.
- Public replay labels diagnose proposal coverage; they are not assumed to be optimal actions.

## Milestone 1 — diagnose the proposal ceiling

1. Re-run the 50-game audit and retain per-subphase missing-pattern histograms.
2. Classify misses into generation, pre-cap enumeration, diversity pruning and total-budget loss.
3. Add diagnostics that report whether the target pattern existed before and after each pruning
   boundary, without importing human target actions into production generation.

Exit: every missing hire/train pattern is assigned a stable failure class and coverage is
reproducible from the same corpus.

## Milestone 2 — test-first bounded proposal improvement

1. Add failing unit cases for the highest-volume failure classes.
2. Implement the smallest deterministic change: fair sequence enumeration, quota allocation or a
   versioned corpus-derived pattern prior that consumes only seat-visible context.
3. Preserve safe fallback, all advertised primitive families and explicit diversity.
4. Reject any change that improves aggregate recall by starving marketing/build/restaurant families
   or by leaking replay labels into runtime inputs.

Exit: unit tests pass; candidate count stays at or below 32; official-clone candidate execution has
zero invalid actions; disjoint final-50 hire/train pattern coverage reaches at least 75% or the
remaining irreducible blocker is quantified and recorded before changing the gate.

## Milestone 3 — marketing proposal coverage

1. Separate misses by good, campaign, duration, orientation and affected-house signature.
2. Add adversarial cases where prefix-only square selection misses a distinct house set.
3. Preserve affected-house diversity rather than exact-coordinate imitation.

Exit: marketing effect coverage improves on untouched games with no candidate-budget or legality
regression; exact coordinates remain diagnostic only.

## Milestone 4 — freeze independent fixtures

Create versioned, seat-visible fixtures before evaluator or planner tuning for:

- at least three working-day subphases;
- delayed employee activation and turn-3 prerequisite completion;
- salary runway and demand donation;
- genuine expiring opportunity versus attractive bait;
- restaurant blocking, sequential inventory and milestone closure abstraction pairs;
- hidden-state mutations with identical acting information sets;
- multiple search cutoffs for later leaf-value diagnostics.

Exit: fixture labels distinguish legality, feasibility and desirability; source states are immutable;
the suite is independent of the policy/evaluator it will test.

## Verification

```bash
node --test src/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py' -q
node scripts/audit_candidates.mjs --seeds 2
node scripts/audit_replay_observation_parity.mjs --captures data/public-replays/pilot-100 \
  --exclude-manifest data/public-replays/pilot-50/manifest.json
python3 scripts/lint.py
git diff --check
```

## Progress log

- [x] Architecture and promotion gates frozen in `SPEC.md`.
- [x] Reproduce and classify proposal misses before and after pruning.
- [x] Add red tests for dominant failure classes and cumulative-corpus leakage.
- [x] Implement bounded, versioned proposal priors and length/source diversity.
- [x] Re-run official-clone and disjoint final-50 coverage audits.
- [x] Add campaign-aware marketing quotas and validate 78/208 → 109/208 effect coverage.
- [ ] Add bounded multi-marketing batches and close the remaining generation ceiling.
- [ ] Freeze independent fixture suite.
