# Information-set policy consistency audit v1

## Objective

Build the promotion gate that detects strategy fusion before calibrated opponent beliefs may enter
rollout/search.

## Contract

- Each audit case contains at least two trusted simulator worlds with the same public-observation
  digest and exactly the same legal candidate ids, but different private opponent buffers or choices.
- Reuse an identical, unique list of belief-sampling seeds in every world.
- Sample the frozen opponent belief from public evidence only, invoke the candidate recommender, and
  compare both per-seed choices and empirical candidate distributions across worlds.
- Report candidate ids/counts only. Trusted worlds and private values must never enter the report.
- Reject unequal public digests, unequal legal candidate sets, duplicate seeds, malformed beliefs,
  illegal candidate ids and non-finite tolerances.
- Base deterministic audit uses zero total-variation tolerance. A future stochastic planner may use
  a predeclared statistical tolerance, but may not select it after observing failures.

## Boundary

This iteration builds and adversarially tests the independent audit primitive. P3.3e remains open
until frozen official-engine hidden-world fixtures and the eventual belief-aware planner pass it.
