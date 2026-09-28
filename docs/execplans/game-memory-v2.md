# GameMemory v2 reactive plan graph

Status: complete

## Goal

Add a schema-versioned, event-rebuildable strategic plan graph that can represent delayed
capabilities, prerequisite timing, deadline slack, commitments, repair/fallback paths and public
invalidation without duplicating official FCM legality. Keep `fcm.game-memory.v1` readable only
through an explicit migration path; never silently reinterpret it as v2.

## Non-goals

- Do not implement the continue/repair/deviate/pivot/abandon value arbiter in this step.
- Do not hard-code a complete FCM strategy catalogue into memory.
- Do not infer legality or simulate transitions outside the official engine.
- Do not let hidden engine state, credentials or unbounded histories enter persisted memory.

## TDD slices

1. RED: prove a turn-1 enabler remains the critical capability for a turn-3 goal and that advancing
   time reduces slack deterministically.
2. RED: prove missed deadlines and impossible prerequisites make a plan infeasible.
3. RED: prove a repair can retain reusable commitments while recording stranded ones.
4. RED: prove tactical/off-plan candidate metadata remains visible instead of being suppressed by
   the active plan.
5. RED: prove byte-for-byte event rebuild, explicit v1 migration and rejection of hidden/private
   fields.
6. GREEN: implement the smallest typed graph, timing analysis, event reducer and candidate feature
   compiler that satisfy those behaviors.
7. REFACTOR: freeze deterministic ordering/bounds, run all Node/Python/lint and official-candidate
   audits, update SPEC/TODO evidence, then commit and push.

All RED cases failed for their intended missing behavior before implementation. GREEN and REFACTOR
now pass 110 Node tests, 109 Python tests and documentation lint. The official-candidate audit is
recorded separately in the final verification because it executes the unchanged no-memory path.

## Data boundary

- Plan nodes describe capabilities and timing, not concrete legal actions.
- Every assumption has `observed`, `derived` or `believed` provenance.
- Invalidation events must be public identifiers supplied through the event stream.
- Candidate annotations are non-authoritative features; official legal actions remain the only
  executable vocabulary.

## Completion gate

- Causal tests cover delayed activation, deadline failure, reusable repair, opportunity retention,
  deterministic rebuild, v1 migration and private-state rejection.
- Existing policy, replay, simulator and candidate tests remain green.
- The strategy fixture manifest remains unchanged and all source hashes validate.
