# Rollout Policy Population v1 — execution plan

## Purpose

Freeze the policies that control every decision after a forced root candidate. Counterfactual
targets estimate a value only under those continuation policies; mixing “one deviation then static,”
repeated search and different opponent populations under one label is forbidden.

## Contract

- The target actor policy is invoked again at every later actor decision. The first target policy is
  a bounded RHEA replanner with deterministic static fallback at simultaneous/weak-belief boundaries.
- Counterfactual collection samples opponent seats independently from one explicit frozen
  continuation mixture using common random streams. The same per-seat model samples and policy
  seeds are reused across every candidate in one root/sample comparison. This designed experiment
  distribution is deliberately separate from an online opponent belief inferred from match history;
  calling the former "calibrated" would give the target the wrong semantics.
- Deterministic-replan and safe-first policies remain diagnostic controls; they are not silently
  pooled with the target policy.
- The official built-in policy is an environment adapter and is valid only for an actual `FcmAI`
  seat. It is never emulated through copied action logic.
- Every eventual target stores population/scenario/actor/continuation-distribution versions, root id,
  sample stream and candidate id. Dataset validation rejects mixed provenance.

## Gates

1. Strict manifest validation, stable ids and exact option schemas.
2. Adversarial rejection of hidden/private fields, unbounded search, missing replanning mode,
   mutable policies and official-AI misuse.
3. Deterministic dispatch tests for diagnostic policies and injected search-policy identity.
4. Official-engine smoke on reconstructed 2- and 3-player roots, including consecutive actor
   replanning, per-seat opponent sampling and explicit fallback metrics, before terminal collection.
5. Freeze a three-stream puncture protocol before generating any candidate terminal labels.

This stage freezes semantics and execution, not policy strength. RHEA remains experimental until
the later action-value and league gates demonstrate terminal improvement.
