# FCM AI execution backlog

Updated: 2026-09-27

This is ordered by dependency, not excitement. A stage may start only after its exit gate passes.
The official OBG FCM JavaScript remains the sole rule and transition authority.

## P0 — stabilize the platform

- [x] **P0.1 Rebase the Agent branch onto upstream `d6cf592`.**
  - Why: upstream is five commits ahead and contains an FCM sales-resolution fix.
  - Depends on: current Agent work safely committed to the owner's fork.
  - Done when: conflicts are resolved without replacing upstream rules; full regression and a
    human/two-Agent game pass.
- [x] **P0.2 Make Vue runtime delivery explicit.**
  - Why: setup scripts install dependencies but do not build `main.js/main.css`.
  - Depends on: P0.1.
  - Done when: a clean build produces only expected tracked runtime changes and a fresh deployment
    displays Agent names correctly.
- [x] **P0.3 Close Agent/API rule-parity gaps found in game 69.**
  - Why: an Agent could directly hire employees that the human UI only permits through training,
    and the legal-action response advertised an internal action name that public input rejects.
  - Depends on: P0.1.
  - Done when: hire candidates and execution both use official `HIREABLE_EMPLOYEES`; public legal
    actions expose `end_turn`; adversarial bypass tests and a real acceptance game pass.

## P1 — freeze observations and build the fast evaluation loop

- [x] **P1.1 Define versioned `DecisionView`, trajectory and result schemas.**
  - Why: heuristics, search, LLMs and learned policies need the same stable meaning.
  - Depends on: P0.
  - Done when: every field is classified as public observation, seat-private observation,
    official-engine derivation or belief; unknown fields fail closed.
- [x] **P1.2 Capture seeded fixtures for every base-game decision phase.**
  - Why: live games alone are slow and irreproducible.
  - Depends on: P1.1.
  - Done when: setup, reserve, restructure, order, all working-day subphases, payday, cleanup and
    game-over fixtures load deterministically and contain no Token/private opponent choice.
- [x] **P1.3 Extract a fast cloneable base-game environment from the official JS engine.**
  - Why: HTTP/Django/SQLite is suitable for acceptance but too slow for benchmark leagues,
    candidate evaluation or learning.
  - Depends on: P1.1–P1.2.
  - Done when: `reset/observe/legal/step/clone` is deterministic, keeps seat-private observations
    hidden and matches online transitions on every phase fixture.
- [ ] **P1.4 Build the benchmark harness and weak baselines.**
  - Why: “finished a game” is not an intelligence metric.
  - Depends on: P1.3.
  - Done when: random, first-legal and built-in OBG policies run across fixed seeds/seats and report
    completion, violations, rank, money, latency and seat bias.
  - Current: deterministic `safe-first-legal-v1`, seeded `random-legal-v1` and a JSON benchmark
    runner are implemented. The legacy 1v1 OBG policy now runs through a dedicated seeded offline
    adapter; its source has a separate `policyHash`, and normal external-seat steps suppress its
    implicit browser auto-run without changing online behavior. A four-game, two-map paired-seat
    smoke league completed 4/4 with zero violations, but seat 0 won all four games. This is evidence
    that seat swapping is mandatory, not evidence that either policy is stronger. A statistically
    useful multi-seed league and confidence-bounded report remain before this gate closes.
- [ ] **P1.5 Add a safe human-trajectory import and review pipeline.**
  - Why: strong human examples can reveal strategic abstractions and calibrate opponent models.
  - Depends on: P1.1 and explicit provenance/consent rules.
  - Done when: imports contain only seat-visible observations, public actions and outcomes; private
    simultaneous choices, credentials and unlicensed prose are rejected.
  - Current: strict consent/provenance/license validation, content-hashed pending records and
    explicit three-attestation approval are implemented. Cross-seat observations, unadvertised
    actions, beliefs, temporary choices and free text fail closed. A trusted live-human UI exporter
    and the first consented sample remain; prose reports are intentionally not accepted as traces.

## P2 — deterministic decision support

- [x] **P2.1 Add side-effect-free official-engine dinner projection.**
  - Why: sales forecasting is the highest-value bridge from rules to strategy.
  - Depends on: P1 fixtures.
  - Done when: projected suppliers, ranking, goods consumed and earnings match actual dinner on
    base-game fixtures; projection never mutates the source snapshot.
- [ ] **P2.2 Decode company structure and economic capacity.**
  - Why: a flat employee array is technically complete but poor decision input.
  - Depends on: P1 schema.
  - Done when: hierarchy, free slots, salary, recruiting, training, production, marketing and price
    agree with official functions for every fixture.
- [ ] **P2.3 Add milestone and market-threat features.**
  - Why: long-term FCM strategy revolves around races and contested demand.
  - Depends on: P2.1–P2.2.
  - Done when: the view identifies currently claimable milestones and house competition without
    reading hidden simultaneous choices.

## P3 — first measurable strategy AI

- [ ] **P3.1 Generate bounded legal candidates by phase.**
  - Why: primitive JSON choices create an unmanageable combinatorial problem.
  - Depends on: P2.
  - Done when: each phase has a deterministic expansion budget, duplicate/dominance pruning,
    top-K diversity per strategic intent and a safe legal fallback; one-turn macros meet a measured
    latency budget before multi-turn composition is enabled.
- [ ] **P3.2 Implement persistent `GameMemory`.**
  - Why: plans, opponent hypotheses and prediction errors must survive LLM/tool calls.
  - Depends on: P1 schemas.
  - Done when: memory is versioned, bounded, contains confidence labels and can be rebuilt from a
    trajectory without storing credentials.
- [ ] **P3.3 Implement explainable heuristic evaluators and strategy profiles.**
  - Why: this creates the first meaningful opponent and training-data generator.
  - Depends on: P3.1–P3.2.
  - Done when: score breakdowns are auditable and the policy beats random/first-legal across the
    fixed league without increasing invalid actions.

## P4 — search and opponent beliefs

- [ ] **P4.1 Add beam search, then evaluate whether MCTS is justified.**
  - Why: search should prove value before adding more infrastructure.
  - Depends on: P1.3 and P3.
  - Done when: held-out league rank improves within a defined decision-time budget.
- [ ] **P4.2 Add versioned opponent-belief sampling.**
  - Why: future dinner outcomes depend on unrevealed simultaneous choices and opponent reactions.
  - Depends on: P1.5 and P3.2.
  - Done when: `observed`, official-engine `derived` and model `believed` fields are impossible to
    confuse, and every belief records model id, confidence and sample count.

## P5 — hybrid LLM policy

- [ ] **P5.1 Add phase-routed decision cards and strict candidate selection.**
  - Why: proactive context fixes “the model did not know what to ask,” while candidate ids prevent
    invented actions.
  - Depends on: P3.
  - Done when: the LLM can return only a validated candidate id plus bounded memory updates.
- [ ] **P5.2 Evaluate LLM value, not eloquence.**
  - Why: fluent explanations can hide worse moves.
  - Depends on: P1.4 and P5.1.
  - Done when: paired-seat/seed A/B tests on deterministic near-ties show a statistically meaningful
    held-out win/rank lift after accounting for latency and cost; otherwise remove the LLM selector.

## P6 — learning and expansions

- [ ] **P6.1 Train imitation/value models from validated trajectories.**
  - Depends on: P4.
- [ ] **P6.2 Evaluate PPO as one masked hierarchical baseline.**
  - Depends on: P1.3, a policy league and stable terminal metrics.
  - Done when: terminal-only PPO is compared with potential-difference shaping from a frozen,
    held-out-calibrated evaluator, while promotion still uses raw win/rank metrics.
- [ ] **P6.3 Add population self-play and promotion gates.**
  - Depends on: P6.1 or P6.2.
- [ ] **P6.4 Add expansions one module at a time.**
  - Depends on: base-game parity and benchmarks; every module needs its own observation/action tests.

## Explicitly not in the first implementation

- Rewriting FCM in Python: duplicates the rule authority and creates silent drift.
- Training PPO through live Django/SQLite games: far too slow and couples learning to production.
- Giving the policy hidden simultaneous choices: produces a cheating Agent, not stronger play.
- Supporting every expansion before the base benchmark: multiplies unknowns before evaluation works.
- Letting an LLM emit arbitrary action JSON: violates the candidate/validator safety boundary.
- Porting official map or rule algorithms into Python: duplicates rule authority; Python may only
  orchestrate versioned JS-engine outputs.
