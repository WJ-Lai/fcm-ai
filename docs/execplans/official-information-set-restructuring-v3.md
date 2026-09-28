# Official information-set restructuring audit v3

## Objective

Extend the authentic information-set audit from reserve cards to company restructuring, the first
simultaneous boundary whose hidden submission changes working-day capabilities.

## Correction to the prior plan

The base-game working day is sequential, not a simultaneous hidden-submission phase. The previous
wording "working-day hidden submission" was therefore incorrect. The relevant boundary is phase 3
restructuring: each player privately commits active employees and beach employees before the
official engine resolves all submissions.

## Frozen protocol

- Generate one seeded three-player base game and use only advertised official actions to reach the
  first restructuring phase.
- Clone it into two trusted worlds. In both worlds, the same two opponent seats submit and leave the
  actor unresolved. In one world they place their recruiting girl; in the other they leave her on
  the beach.
- Require different private move envelopes but exactly equal public snapshots and acting-seat
  DecisionViews before planning.
- Freeze the fixture clock because the official UI stores display timestamps and sorts simultaneous
  history by them; wall-clock scheduling must not reorder an otherwise identical reconstruction.
- Run the current official rollout policy over the identical actor candidates with 16 matched
  belief seeds and zero permitted total variation.
- Persist no move envelopes, employee assignments, trusted worlds, or pre-move payloads.
- Keep the promotion holdout sealed.

## Failure criterion

The experiment fails if the worlds are distinguishable through the public interface, the actor's
candidate set differs, any matched seed recommends a different candidate, any private payload is
serialized, or repeated generation changes the report bytes.

## Next gate

Passing this fixture validates the current policy at two authentic simultaneous boundaries. It does
not complete P3.3e: the eventual belief-sampled planner itself must pass the same audit, and payday
or cleanup needs a later fixture only if uncertainty-aware search is enabled there.

## Iteration 16 outcome

- Official transitions created two restructuring worlds with different private opponent employee
  assignments but exactly equal public snapshots, actor DecisionViews and actor candidates.
- Across 16 matched belief seeds and two candidates, the rollout recommendation had mismatch rate 0
  and maximum pairwise total variation 0.
- The first reproduction attempt exposed wall-clock-dependent ordering of simultaneous display
  history. Freezing the fixture clock removed that nondeterminism; two complete reruns now produce
  the same report hash.
- The report contains no private assignment/envelope fields and the promotion holdout stayed sealed.
- P3.3e remains open for the actual belief-sampled planner rather than being declared complete from
  fixture-only evidence.
