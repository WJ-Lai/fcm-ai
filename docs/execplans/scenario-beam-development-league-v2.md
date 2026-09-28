# ScenarioBeam development puncture v2

## Question

Before paying for a large league, does a single ScenarioBeam intervention improve a complete game,
and do the declared one-second and three-second budgets exit safely?

## Frozen design

- Two fresh development seeds, both agent seats, official built-in opponent.
- Arms: static, Beam 1000 ms, Beam 3000 ms; 12 games total.
- Beam may intervene only at the first non-simultaneous working-day decision with multiple static
  candidates. All later decisions use the same deterministic policy as control.
- Two matched belief samples, official-opponent probability one, common Beam limits otherwise.
- Maximum 500 commands; require Game Over, zero violations, legal fallback and sealed promotion data.

## Result

All 12 games reached Game Over with zero violations. Static won 4/4, mean $517.5. The 1000 ms arm
timed out and fell back in 4/4, changed no action, won 4/4 and had P95 1079.9 ms. The 3000 ms arm
completed in 4/4, changed the same hire to skip in 4/4, won 0/4 and averaged $38.75.

## Decision

Reject the current Beam for playing strength and stop expansion. The result isolates one first-turn
intervention, is seat-paired, and reproduces the smoke-test ranking error at terminal scale. It is a
development failure, not a promotion comparison. Diagnose horizon/cutoff instability and require a
safety gate before another terminal league.
