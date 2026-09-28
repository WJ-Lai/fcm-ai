# Official information-set reserve audit v2

## Objective

Run the independent information-set audit against the real official offline engine at a genuine
hidden simultaneous boundary.

## Frozen protocol

- Generate one seeded three-player base game and use official legal actions to reach reserve-card
  selection.
- Clone it into two trusted worlds. In each world, the same two opponent seats submit legal reserve
  choices, but the hidden choice envelopes differ. Leave the acting seat unresolved.
- Require byte-equivalent public snapshots and structurally equal acting-seat DecisionViews before
  planning. Normalize display-only history timestamps when hashing the information set; retain all
  decision-relevant public fields. The private simultaneous envelopes are never serialized.
- Use the frozen opponent-population prior and 16 unique seeds. Run the current official rollout
  policy with at most three candidates/transitions and zero allowed total variation.
- Persist only engine/ruleset identifiers, public equality markers and the sanitized audit report.

This validates the current rollout at one authentic boundary. P3.3e remains open until additional
hidden boundaries and the eventual belief-aware planner pass.

## Iteration 15 outcome

- Official legal transitions created two worlds whose hidden simultaneous envelopes differed while
  their actor-visible DecisionViews and public snapshots were exactly equal.
- Across 16 identical belief seeds and three legal reserve-card candidates, the current official
  rollout selected the same candidate for every seed: mismatch rate 0 and total variation 0.
- The sanitized report is byte-reproducible across reruns after normalizing display-only history
  timestamps, contains no private envelopes, and binds to ruleset
  `a171620e…d0b5e`.
- The authentic reserve boundary passes. P3.3e remains open for a working-day hidden submission
  boundary and the eventual belief-aware planner.
