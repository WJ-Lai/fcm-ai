# ScenarioBeam information-set audit v2

## Objective

Run the actual `ScenarioBeam v1` production adapter—not a proxy policy—against the two official
paired hidden-world fixtures before allowing it into budget or terminal-strength experiments.

## Frozen protocol

- Official reserve-card and restructuring fixtures remain unchanged.
- Each pair has identical public snapshot, DecisionView and legal candidate ids but different
  trusted hidden submissions.
- Reuse 16 outer belief seeds in both worlds; each planner call receives two matched inner seeds.
- Maximum permitted pairwise total variation and per-seed mismatch are both zero.
- Replace the planner environment with a clone guard: a live simultaneous root must safely decline
  before cloning or inspecting trusted state.
- Persist only public ids, counts and metrics. Keep the promotion holdout sealed.

## Result

Both boundaries passed. Reserve exposed four legal static candidates and restructuring two. Each
produced zero mismatch and zero total variation. Every call stopped with `root-simultaneous`, no
clone was attempted, no private payload was persisted, and the report reproduced byte-for-byte.

This closes P3.3e for ScenarioBeam v1 only. A later planner that actively searches live hidden
boundaries must repeat the gate; this result does not promote playing strength.
