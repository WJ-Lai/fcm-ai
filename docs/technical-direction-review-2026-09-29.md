# FCM AI technical-direction review — 2026-09-29

## Verdict

The project is on the right **systems architecture** but has spent too much of its recent research
budget on the wrong **optimization loop**. The official-engine simulator, seat-safe observation
contract, legal candidate boundary, replay auditing, opponent-belief provenance, memory/plan graph,
reproducible experiments and terminal promotion gates are the correct foundation. They should be
kept.

The recent loop—discover one local RHEA intervention, sample that exact action pair to completion,
then search for a small public-feature rule—does not scale into a strong FCM policy. It produced
valuable falsification evidence, but continuing it would be local hypothesis mining rather than AI
development. Stop action-pair threshold experiments after iteration 52.

## What the evidence actually says

1. **Legality and simulation are no longer the primary problem.** Offline games complete, generated
   candidates execute through the official engine, and the latest audit executes 2,099 candidates
   with zero invalid actions at about 0.040 ms per candidate.
2. **The proposal set remains a real ceiling.** Hire/train proposal coverage is acceptable, while
   marketing effect coverage is materially lower. Iteration 53 shows the loss mechanism precisely:
   245 single-marketing labels are all representable by public legality, but the bounded generator
   offers 138; spatial selection loses 58, intermediate duration seven and pruning 42. A fixed-width
   effect-spread change improves the same independent 50-game slice from 127→138 bounded and
   170→187 enumerated without increasing the candidate cap. This is useful infrastructure, not
   evidence of stronger play.
3. **The current leaf/value signal is the central strength bottleneck.** The static evaluator lost
   its first official-AI smoke leagues. Scenario Beam made harmful skip overrides. Breadth-3 RHEA
   found both large positive and large negative terminal outcomes behind nearly identical +1.4 leaf
   margins. State-winner calibration abstains early and is only moderate in the middle game.
4. **Terminal labels from one deviation followed by a weak fixed policy are not a general action
   oracle.** Production roots flipped across continuation seeds. The training-action campaign used
   hundreds of terminal branches yet ended with a rejected unconditional rule and a rejected
   one-feature classifier. It estimates `Q` under one particular continuation policy, not the value
   of an action under repeated replanning or competent future play.
5. **The statistical safeguards work, but the experimental unit became too narrow.** The 3→7→15
   estimator prevented false deployment. However, iteration 54 also exposed a process defect: its
   preregistered marketing baseline used a 40-game denominator while validation used 50 games. The
   same-slice A/B still shows a descriptive improvement, but the declared gate is invalid. Future
   protocols must bind exact manifest hashes and derive denominators mechanically.
6. **Most strength evidence is still two-player and weak-opponent evidence.** The intended product
   includes human/AI mixed multiplayer and all-AI games. A policy that exploits or survives one
   built-in 1v1 continuation is not enough; opponent populations and 3–4 player rank outcomes must
   enter before any “strong AI” claim.

## Root causes of the weak results

- **Objective mismatch:** human-action recall and local leaf agreement were optimized more often
  than held-out terminal rank. Recall is necessary for search, but humans in public replays are not
  an optimal-policy oracle.
- **Continuation-policy mismatch:** counterfactual labels usually apply one changed action and then
  return the actor to the static policy. Long-range plans that require later coordinated choices are
  undervalued or misvalued.
- **Sparse/coarse target:** two-player terminal rank has many ties and low power; cash margin is much
  noisier and cannot silently replace rank. A learned model needs an explicitly frozen
  distributional/lexicographic target and uncertainty.
- **Narrow root selection:** intervention-triggered roots overrepresent places where the current
  evaluator already disagrees. They are useful bug probes but not a representative training or
  evaluation distribution.
- **Premature search bake-off:** Beam and RHEA were asked to optimize a weak leaf value and a narrow
  root set. More search cannot repair a biased value function or absent proposals.
- **Missing policy iteration:** the project has rollout machinery and models, but not yet a closed
  loop where broader roots generate counterfactual data, a policy/value model is trained, that model
  guides search, and the resulting policy is evaluated against frozen historical opponents.

## Corrected architecture

Keep the existing layered design, but change the learning/evaluation center:

1. **Official engine and information boundary:** unchanged; the JavaScript engine remains the sole
   transition/legality authority and the policy sees only seat-visible observations.
2. **Strategic proposal layer:** phase-local bounded candidates plus plan-graph-derived options and
   an off-plan quota. Finish material single-action coverage, then stop optimizing imitation recall
   unless a measured search miss points back to proposals.
3. **Representative counterfactual dataset:** freeze roots by seed/seat/phase/action family—not by
   whether RHEA happened to intervene. Include early/middle/late, map diversity and 2- plus 3-player
   games. At each root evaluate a bounded diverse candidate set under common random numbers.
4. **Policy-consistent continuations:** after the root action, use a frozen rollout-policy
   population for all seats, including an actor policy that replans at every later decision. Record
   the continuation-policy version in every target. Never mix targets from different policies as if
   they estimate one `Q` function.
5. **Uncertainty-aware action value:** learn pairwise/distributional candidate value from root
   context × action delta. Split by whole game/seed/map; use group cross-validation and abstain out
   of distribution. Rank is primary; within-rank margin and bankruptcy/milestone outcomes may be
   auxiliary targets but cannot alter promotion criteria.
6. **Search and long-range planning:** use RHEA/scenario search only after the value model beats the
   static ranking on disjoint counterfactual roots. The typed plan graph supplies multi-turn
   commitments, deadlines and repair options; search chooses and revises them under receding
   horizons. HTN-like templates are proposals, not hard-coded truth.
7. **League evaluation:** compare static, built-in, scripted archetypes, frozen historical policies
   and the current candidate policy across paired seats and 2/3/4 players. Promote only on raw
   terminal rank/win lift, legality, privacy and latency. Retain older policies to detect cycling;
   consider PSRO only if cycling is measured.
8. **LLM and RL:** an LLM may summarize state, propose strategic intents or explain a selected
   candidate, but must not simulate consequences or emit arbitrary actions. Expert Iteration is the
   next learning method after a reliable search teacher. PPO remains later and optional; it is not
   the remedy for a weak dataset/value target.

## Revised execution order

1. Close the current marketing spread experiment as proposal infrastructure only; record the
   invalid preregistered gate and exact same-slice A/B. Defer intermediate durations and
   multi-marketing unless later search diagnostics prove they are blocking high-value actions.
2. Freeze `Counterfactual Root Suite v1`: representative roots across phase/action family/map/seat,
   initially 2-player plus a smaller 3-player stratum, selected before terminal outcomes.
3. Freeze `Rollout Policy Population v1`: static, built-in where valid, safe/scripted archetypes and
   at least one replanning actor policy. Define target provenance and common-random-number streams.
4. Collect a small puncture (for example 24 roots × up to 6 candidates × 3 continuations) and audit
   label stability, throughput, leakage and action-family balance before scaling.
5. Train/evaluate a bounded pairwise action-value baseline with grouped splits and calibrated
   abstention. Kill it if it cannot beat static candidate ordering on untouched roots.
6. Only then reconnect the value model to RHEA/Beam, run equal-budget ablations and open a genuinely
   untouched league holdout once.

## Stop rules

- No more post-hoc threshold/classifier experiments on the completed training-action roots.
- No strategy promotion from human imitation recall, evaluator agreement or own-cash-only results.
- No expensive 15-sample expansion of a root unless it belongs to a preregistered representative
  suite or a policy-promotion comparison.
- No new search algorithm until proposal recall and value ranking identify which component limits
  terminal performance.
- No claim of multiplayer strength from 1v1 data.

This is a course correction, not a rewrite. The hard engineering foundation is reusable; the next
stage must turn it into a representative, policy-consistent learning loop instead of continuing to
polish isolated action rules.
