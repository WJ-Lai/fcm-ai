# Expanded horizon-agreement scan v8

Use two fresh seeds, both seats and the first 12 eligible decisions per trajectory so every path
reaches at least turn 4. Keep depth 3, the depth-1 probe, headroom, candidates, evaluator and beliefs
unchanged from v7.

All four trajectories complete with zero violations. Across 48 decisions, nine horizon agreements
repeat static, four disagreements block the known bad skip and 35 deep searches are incomplete.
No non-static action is accepted, hence no terminal intervention can show lift.

Reject exact horizon agreement as a strength-producing Beam policy. Retain it as a safety diagnostic
and proceed to the equal-budget RHEA challenger specified by P4.1b. Do not open promotion holdout.
