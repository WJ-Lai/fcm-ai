# Strategic abstraction fidelity audit

Status: complete

## Goal

Freeze and execute adversarial state pairs for restaurant blocking, sequential inventory, salary
timing, milestone closure, bank horizon and reusable commitments. Material pairs must produce
different abstraction/cache keys; irrelevant public text/version changes and hidden-state mutations
must not alter policy input.

## Approach

- Start with a conservative canonical projection of all seat-visible strategic fields.
- Exclude only explicit text/transport noise (`history`, `chat`, display names and update version).
- Keep plan commitments in the projection, but never include private engine buffers.
- Require the trusted cache key to include ruleset, internal snapshot digest, seat, candidate,
  horizon, evaluator version and belief version.
- Report collisions instead of silently accepting them.

## TDD gate

1. RED: six material fixture pairs collide because no abstraction implementation exists.
2. GREEN: every material pair separates, while irrelevant and hidden mutations remain invariant.
3. RED/GREEN: cache-key dimensions each invalidate the key and malformed dimensions fail closed.
4. Run full tests, lint and a machine-readable audit report before updating P3.2d.

The frozen audit now passes 7/7 pairs: six material boundaries are distinct and one irrelevant/
private mutation pair is invariant. Cache dimensions are independently covered. Full repository
verification passes 113 Node tests, 109 Python tests and documentation lint.
