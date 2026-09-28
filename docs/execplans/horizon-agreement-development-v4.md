# Horizon-agreement safety gate v4

The prior puncture seeded the official opponent with the arm id, so its 4/4 versus 0/4 magnitude was
not paired. This corrected protocol shares player names, game ids and opponent seeds across arms and
adds resumable per-game checkpoints.

The single policy change is an agreement gate: a cheap depth-1 probe and target-depth search must
select the same root before search may override static. All 16 games complete with zero violations.
Static wins 2/4 at mean $261.75; ungated 3000 ms Beam changes hire to skip, wins 1/4 and averages
$153.75. Both gated arms abstain 4/4 and reproduce static terminal rank and both players' money
exactly. Three-second maximum latency is 2.91s; one-second maximum is 1.12s and fails its cap.

Promote the rule only as an experimental safety control, not as stronger play. Add deadline headroom
and find disjoint positions where agreement accepts a terminally beneficial change. Keep the
promotion holdout sealed.
