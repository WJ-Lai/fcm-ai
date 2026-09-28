# Fixed official-rollout tactical suite

Status: complete

## Goal

Replace the dynamic two-subphase rollout probe with 12–20 frozen tactical cases spanning at least
two deterministic seeds and three working-day subphases. Every label is produced by exhaustive
same-horizon scoring in isolated official-engine clones and then frozen before bounded evaluation.

## Sources

- Eleven content-hashed `base-v1` official-engine phase fixtures across recruiting, training,
  marketing, production and building.
- Two reproducible `rollout-spike` seeded states reached through an exact safe-first command count.

## Gates

- Frozen source and oracle identities do not drift.
- At least 12 cases, two generated seeds and three working-day subphases.
- Bounded rollout Top-1 >=80%, Top-3 >=95%, zero illegal choices and local P95 <=3 seconds.
- Simultaneous/private mutations remain policy-invariant under existing metamorphic tests.

## Procedure

1. Run discovery to compute exhaustive oracle labels from the declared sources.
2. Freeze source digests, oracle Top-1 and Top-3 in the manifest.
3. Re-run in audit mode; discovery is never accepted as promotion evidence.
4. Run full repository tests and update P3.3a only if every gate passes.

Audit mode passes all gates on 13 frozen cases: five working-day subphases, three source identities,
two generated seeds, Top-1/Top-3 13/13, zero illegal selections and local P95 1.31 seconds. Raw
compressed seeded snapshots were rejected as source identities after a non-semantic internal field
proved process-variable; the already-audited seat-visible strategic projection digest is stable.
