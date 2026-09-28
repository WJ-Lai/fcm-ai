# RHEA terminal bake-off v6

Compare static, three-second ScenarioBeam and three-second novelty-preserving RHEA on two fresh
development seeds and both seats. Each planner may alter only the first eligible working-day decision;
all later agent actions use static. Arms share public belief samples and opponent random streams, then
run the official environment to Game Over. The promotion holdout remains sealed.

All 12 games complete without violation or fallback. Static and RHEA are identical game-by-game:
2/4 first places and mean money $226.25. Beam changes all four roots to the skip candidate, scores 0/4
first places and mean money $61.25. Planner P95 is 1619.96ms for Beam and 1756.62ms for RHEA, both
inside the external three-second cap.

Current Beam is rejected for strength. RHEA is the safer challenger but is not promoted: it changes
zero static decisions and therefore supplies no evidence of terminal lift. Next scan later disjoint
development decisions for non-static RHEA interventions and terminally audit every one. Do not spend
more compute on homogeneous first-turn roots and do not open the promotion holdout.
