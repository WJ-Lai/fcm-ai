# RHEA budget baseline v3

Calibrate the smallest official-engine RHEA configuration under external one- and three-second
deadlines before comparing playing strength. Freeze the root, candidates, opponent belief, two common
samples, public leaf evaluator, population two, horizon two and one generation. Reserve 20% internal
headroom and repeat each tier eight times.

Both tiers complete 8/8 runs without fallback and evaluate both legal roots. The one-second P95 and
maximum are 995.95ms; the three-second P95 and maximum are 1096.87ms. The selected action is the
static hire in every run at score 40.4. This establishes executable throughput only: the single root
is neither a strength league nor promotion evidence.

The one-second tier is already on the boundary and must remain unchanged. The next isolated
experiment uses only the three-second tier and enables a second evolutionary generation, with the
evaluation cap increased solely to permit that generation. Candidates, belief samples, horizon,
evaluator and promotion holdout remain frozen.
