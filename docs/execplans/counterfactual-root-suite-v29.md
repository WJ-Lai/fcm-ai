# Counterfactual Root Suite v1 — execution plan

## Purpose

Replace intervention-selected action-pair roots with a frozen, outcome-blind sample of ordinary
FCM decisions. This artifact is a sampling frame for the later action-value puncture; it is not a
strategy result and contains no terminal labels.

## System model

- **Input:** fixed official-engine seeds, player count, seat-visible `DecisionView`, deterministic
  discovery policy and versioned candidate generator.
- **State:** official engine snapshot kept only inside the trusted scanner; the persisted report
  stores public projections, hashes, reconstruction coordinates and bounded candidate identities.
- **Output:** exactly 24 roots satisfying preregistered player-count, phase, action-family, seat and
  map-diversity constraints.
- **Disturbances:** games may end early, action families may be unavailable under the discovery
  policy, simultaneous submissions may reorder actors, and one seed may dominate the pool.
- **Feedback:** first run disjoint exploratory seeds to measure availability; freeze different
  collection seeds and quotas; rerun twice byte-for-byte; adversarial tests reject outcome fields,
  private payloads, quota drift, duplicate identities and post-outcome selection.

## Sequence

1. Implement and adversarially test a root-suite protocol/report validator, public action-family
   classifier and deterministic quota selector.
2. Add a scanner over official-engine games. It must never calculate or persist terminal results,
   and every selected root must have 2–6 diverse legal candidates.
3. Use explicitly disposable exploratory seeds only to measure attainable strata.
4. Freeze collection seeds, quotas, discovery-policy version and exact engine/candidate versions.
5. Generate the 24-root report twice and require identical bytes and identity digests.
6. Audit official reconstruction, seat-visible provenance, 2/3-player balance, phase/action-family
   balance, map/seed/seat diversity and absence of terminal/private fields.
7. Update `SPEC.md`, `TODOS.md` and `experiments.jsonl`; run the complete Node/Python/lint suite.

## Non-goals

- No terminal continuations or candidate preference labels.
- No use of RHEA interventions, static-vs-alternate disagreement or eventual winners for selection.
- No policy promotion and no opening of the promotion holdout.
- No claim that the discovery policy itself is representative of strong human play; that limitation
  is measured and will be addressed by Rollout Policy Population v1.

## Stop conditions

- If the static discovery policy cannot expose required action families, do not relax quotas after
  seeing labels. Add a separately versioned discovery archetype or revise the protocol before any
  terminal sampling.
- If a root cannot be reconstructed from seed/player count/decision index with the same public and
  candidate digests, reject the suite.
- If a persisted report contains terminal money/rank, raw snapshot/gameData/moveData, hidden state
  or credentials, reject the suite.

## Availability revision record

Experiment 55 froze seven collection games and 24 exact slots before scanning. The selector
correctly rejected the suite because three exact slots were absent: two-player late training,
two-player late turn-order and three-player late training for their assigned seed/seat. The scan
contained 892 otherwise eligible public roots and read no terminal outcome fields. No result report
was produced.

Experiment 56 is a new protocol with new collection seeds. It preserves 24 roots, 18/6 player-count
balance, 8/8/8 phase balance, all seats, seven maps and all six action families. It changes only
fragile late-phase training/turn-order assignments to strata repeatedly observed in the outcome-
blind exploration and availability scans. Experiment 55's failed games are now exploration-only
evidence and cannot enter Experiment 56.
