# RHEA novelty-preserving mutation v5

Repair the failure isolated by iteration 30 without changing the official fixture or planner budget.
For each elite, enumerate all one-gene mutations, rotate their order with the seeded RNG, and reject
keys already present in the next population or completed evaluation cache. Permit a duplicate only
when no unused one-step mutation exists.

The unit contract reproduces the prior bad evolution seed and now requires three unique genomes and
six common-sample evaluations. The repeated official puncture passes 8/8 times: two generations,
three unique genomes, six scenario evaluations, no fallback, and 1713.93ms P95 under the external
three-second cap. Both roots are evaluated and the correct static hire remains selected.

This promotes the mutation and throughput mechanism only. Freeze it now. The next experiment should
collect disjoint development roots and compare static, equal-budget Beam and RHEA using paired
terminal continuations; the promotion holdout remains sealed.
