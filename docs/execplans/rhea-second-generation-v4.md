# RHEA second-generation puncture v4

Change only the three-second baseline from one to two generations, increasing the evaluation cap only
to permit the extra generation. Keep the official root, candidates, two common belief samples,
population, horizon, evaluator, evolution seed and promotion holdout frozen. Require the second
generation to add at least one novel genome; merely reevaluating cached elites is not exploration.

The puncture is rejected. All eight runs stay within the deadline and report two completed
generations, but each remains at two unique genomes and four scenario evaluations. The mutation of
the sole elite collides with a previously evaluated genome, so the entire second population is served
from cache. The low latency is therefore misleading.

Next add one optimizer contract: when unused genotype space exists, offspring must differ from the
parent and from already evaluated genomes, using bounded deterministic enumeration after seeded
random attempts collide. Then repeat this exact fixture before any terminal comparison.
