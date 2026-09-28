# FCM AI execution backlog

Updated: 2026-09-28

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
- [x] **P1.4 Build the benchmark harness and weak baselines.**
  - Why: “finished a game” is not an intelligence metric.
  - Depends on: P1.3.
  - Done when: random, first-legal and built-in OBG policies run across fixed seeds/seats and report
    completion, violations, rank, money, latency and seat bias.
  - Current: deterministic `safe-first-legal-v1`, seeded `random-legal-v1` and a JSON benchmark
    runner are implemented. The legacy 1v1 OBG policy now runs through a dedicated seeded offline
    adapter; its source has a separate `policyHash`, and normal external-seat steps suppress its
    implicit browser auto-run without changing online behavior. A four-game, two-map paired-seat
    smoke league completed 4/4 with zero violations. A subsequent 10-seed/20-game paired-seat run
    completed 20/20 with zero violations: official built-in AI placed first 13/20 (65%, Wilson 95%
    CI 43.3–81.9%) versus safe-first 7/20 (35%, 18.1–56.7%); seat 0 also placed first 13/20.
    The harness now reports first-place and completion confidence intervals and supports disjoint
    seed shards. The final 50-seed/100-game paired-seat league completed 100/100 with zero
    violations: official built-in AI placed first 68/100 (68%, Wilson 95% CI 58.3–76.3%) versus
    safe-first 32/100 (32%, 23.7–41.7%). Seat 0 placed first 54/100 (44.3–63.4%) versus seat 1
    46/100 (36.6–55.7%), so the prior four-game seat signal did not persist. Random, first-legal
    and built-in policies are reproducible, and this gate is closed.
- [ ] **P1.5 Add a safe human-trajectory import and review pipeline.**
  - Why: strong human examples can reveal strategic abstractions and calibrate opponent models.
  - Depends on: P1.1 and explicit provenance/consent rules.
  - Done when: imports contain only seat-visible observations, public actions and outcomes; private
    simultaneous choices, credentials and unlicensed prose are rejected.
  - Current: strict consent/provenance/license validation, content-hashed pending records and
    explicit three-attestation approval are implemented. Cross-seat observations, unadvertised
    actions, beliefs, temporary choices and free text fail closed. A trusted live-human UI exporter
    and the first consented sample remain; prose reports are intentionally not accepted as traces.
    The public-ended-game ladder is complete at 2 -> 10 -> 50 -> 100 current-format base games.
    The 100-game corpus contains 14,078 seat-scoped decision observations, including 5,339
    simultaneous decisions that all use the public pre-choice frame. Player names, timestamps,
    embedded history, reserve cards and transient engine context are removed. All observations
    contain every current MCP field/legal action and pass pinned-engine projection parity. The
    current official action layer exactly replays 10,001 labels. Another 3,541 production/payday
    records are outcome/value-only because public history omits routes or paid resource identities;
    536 legacy labels are quarantined into five tested engine-drift classes. No pending or
    unclassified label enters behavior cloning. The remaining P1.5 work is a trusted live-human UI
    exporter and the first explicitly consented seat export; public replays do not substitute for it.

## P2 — deterministic decision support

- [x] **P2.1 Add side-effect-free official-engine dinner projection.**
  - Why: sales forecasting is the highest-value bridge from rules to strategy.
  - Depends on: P1 fixtures.
  - Done when: projected suppliers, ranking, goods consumed and earnings match actual dinner on
    base-game fixtures; projection never mutates the source snapshot.
- [x] **P2.2 Decode company structure and economic capacity.**
  - Why: a flat employee array is technically complete but poor decision input.
  - Depends on: P1 schema.
  - Done when: hierarchy, free slots, salary, recruiting, training, production, marketing and price
    agree with official functions for every fixture.
  - Evidence: `state.decisionSupport.economyPlayers` delegates every rules-sensitive value to the
    loaded official player/rules/controller modules and fails closed when one is absent. All 35
    phase fixtures verify CEO/shared subordinate slots, free slots, salary, effective price and
    recruiting/training/production/marketing capacity are present and structurally valid.
- [x] **P2.3 Add milestone and market-threat features.**
  - Why: long-term FCM strategy revolves around races and contested demand.
  - Depends on: P2.1–P2.2.
  - Done when: the view identifies currently claimable milestones and house competition without
    reading hidden simultaneous choices.
  - Evidence: `state.decisionSupport.strategicThreats` reports official open/shared/closed milestone
    windows plus sorted, per-house fulfillment tiers and eligible suppliers using official demand,
    reachability, inventory, price and tie-break inputs. The scope explicitly excludes sequential
    inventory consumption and delegates exact winner resolution to `projectDinner`. Delegation,
    non-mutation, fail-closed and all 35 phase-fixture checks pass.

## P3 — first measurable strategy AI

- [x] **P3.1 Generate bounded legal candidates by phase.**
  - Why: primitive JSON choices create an unmanageable combinatorial problem.
  - Depends on: P2.
  - Done when: each phase has a deterministic expansion budget, duplicate/dominance pruning,
    top-K diversity per strategic intent and a safe legal fallback; one-turn macros meet a measured
    latency budget before multi-turn composition is enabled.
  - Evidence: `generateCandidates` uses fixed total/per-intent budgets, action-sequence deduplication,
    phase-local macros and a legal fallback. A two-seed official-clone audit executed 1,280 generated
    candidates with zero rejected actions at about 0.049 ms generation time per candidate.
- [ ] **P3.1b Raise strategic candidate coverage before adding deeper search.**
  - Why: legal candidates are not useful if the generator systematically omits realistic complete
    turns. On 10 public human games, only 175/494 (35.4%) exact working-day choices were offered;
    recruiting was 74/233, training 77/153, marketing 4/62 and restaurant actions 0/10. Among the
    offered working-day actions, the static evaluator put only 16.0% Top-1 and 52.0% Top-3.
  - Scope: replace hand-picked one-action templates with bounded phase-local sequence beams for
    repeated hire/train/marketing/build/restaurant operations. Keep the official action layer as
    legality oracle and measure candidate recall separately from ranking quality.
  - Done when: discrete hire/train batch recall reaches >=75% without exceeding 32 candidates or
    the latency budget, then holds on untouched games. Spatial marketing/build/restaurant choices
    use task-specific equivalence/value labels rather than requiring the exact human square. Report
    every subphase separately so high-volume hiring cannot hide missing action families.
  - Current: manifest-level exclusion tests corrected an earlier cumulative-corpus mistake:
    `pilot-50` contains `pilot-10`, so games 1–50 are now proposal training and games 51–100 are the
    frozen final test. A versioned, provenance-tested repeated-pattern prior plus source-diverse
    length-aware generation clears the discrete gate under the 32-candidate cap. Training-corpus
    hire/train pattern coverage is 1093/1337 (81.8%) and 672/891 (75.4%); final-test coverage is
    1013/1260 (80.4%) and 656/825 (79.5%). Exact final-test coverage is 837/1260 and 615/825.
    Pattern equivalence remains an order-insensitive proposal diagnostic, not a substitute for
    official consequence validation. The official two-seed audit executed 2,145 candidates with
    zero rejected actions at about 0.037 ms generation time per candidate.
    Campaign-aware marketing quotas raised strict effect-equivalent coverage from 22/62 to 29/62
    on development games and from 78/208 to 109/208 on the disjoint 40-game validation slice;
    its enumerated validation ceiling is 138/208. Multi-marketing batches and missing placements
    remain open, so P3.1b is not yet complete.
    A bounded multi-marketing spike added semantic batch matching and tested pair macros plus every
    finite duration. It produced no additional development matches and diluted bounded coverage to
    24–26/62, so the production generator was restored. Batch diagnostics remain; a future attempt
    needs a learned/versioned proposal rather than a wider Cartesian enumeration.
    Build exact coverage rose
    45→86/147 and official public-consequence coverage is 103/147 (70.1%); winner consequence
    coverage is 67/94 (71.3%). Restaurant exact coordinates cover only 12/85, but official
    consequence equivalence covers 82/85 (96.5%) and 32/33 winner decisions. Marketing effect
    equivalence is now 138/270 (51.1%) across the 50 training games. Ranking quality remains poor as coverage grows, so
    evaluator promotion stays blocked.
- [x] **P3.2 Implement persistent `GameMemory`.**
  - Why: plans, opponent hypotheses and prediction errors must survive LLM/tool calls.
  - Depends on: P1 schemas.
  - Done when: memory is versioned, bounded, contains confidence labels and can be rebuilt from a
    trajectory without storing credentials.
  - Evidence: `fcm.game-memory.v1` bounds plans, beliefs, errors and decisions; rejects credential
    keys/text; and is byte-for-byte rebuildable from its event stream in tests.
- [x] **P3.2b Upgrade memory into a reactive strategic plan graph.**
  - Why: `GameMemory v1` remembers a coarse intent but cannot represent “hire now so a trained
    capability is active by turn 3,” deadline slack, sunk commitments, repair paths or plan
    invalidation. A continuity bonus is not long-horizon planning.
  - Scope: add typed goals and capabilities, prerequisite edges, earliest activation and target
    turns, slack, committed/reusable assets, expected payoff/confidence, repair/fallback options and
    public-event invalidation rules. Compile these records into candidate priorities/features while
    reserving an off-plan/opportunity candidate quota; never duplicate official legality or
    transitions.
  - Done when: fixed causal fixtures prove that the planner preserves a necessary turn-1 enabler
    for a turn-3 goal, detects an impossible/missed deadline, repairs a partially reusable plan and
    still offers a valuable off-plan pivot. Memory rebuilds byte-for-byte from the event stream
    without hidden-state fields.
  - Evidence: `fcm.game-memory.v2` is implemented alongside v1 with explicit migration; nine v2
    causal/adversarial tests cover zero-slack activation, missed/impossible prerequisites, reusable
    repair, off-plan opportunity retention, public invalidation, cycle rejection, deterministic
    rebuild and private-state rejection. Candidate budgeting reserves a critical plan intent and an
    off-plan candidate under a two-slot stress case; ranking consumes the auditable feature without
    inventing actions. Full Node 110, Python 109 and documentation lint pass.
- [x] **P3.2c Freeze long-horizon and reactive promotion fixtures.**
  - Why: plan/arbitration weights fitted before independent examples exist will encode anecdotes
    and make every later comparison circular.
  - Scope: causal long-horizon cases cover delayed employee activation, milestone preparation,
    salary runway, restaurant/network expansion and bank horizon. Reactive adversarial cases cover
    genuine expiring opportunities, bait, milestone closure, reusable sunk assets, one-phase
    deviations and repeated unchanged observations.
  - Done when: labels distinguish plan feasibility from desirability, use only public/seat-visible
    inputs and are frozen before arbitration parameters are fitted.
  - Evidence: `fixtures/strategy-v1/manifest.json` contains 15 immutable cases across six evaluation
    axes and six working-day subphases. Every source official-engine fixture is content-hashed;
    labels separately encode legality, feasibility and desirability. Three abstraction pairs require
    different preferred choices, while hidden reserve-card mutations require identical policy input
    and preference. Validators reject private fields and impossible preferred candidates.
- [x] **P3.2d Audit strategic-abstraction fidelity before deeper search.**
  - Why: a compact `DecisionView`, plan capability or macro can map strategically different raw
    states to the same feature vector. Search then becomes confidently wrong because it cannot see
    the distinction, regardless of depth.
  - Scope: build adversarial raw-state pairs for restaurant blocking, sequential dinner inventory,
    salary timing, milestone closure, bank horizon and reusable commitments. Report
    raw-to-abstract collisions by schema/model version and include every strategy-relevant field in
    trusted cache keys.
  - Done when: paired states that need different preferred macros are distinguishable, equivalent
    states remain stable under irrelevant raw mutations, and no cache entry crosses a material
    abstraction boundary. If the gate fails, enrich the abstraction before expanding search.
  - Evidence: `fcm.strategic-abstraction.v1` conservatively retains the complete public strategic
    view and plan commitments while excluding text/version noise and private engine buffers.
    `fixtures/abstraction-v1/manifest.json` freezes six material pairs plus one invariance pair;
    `audit_strategic_abstraction.mjs` reports 7/7 passed, 0 collisions and 0 irrelevant leaks.
    Trusted cache keys fail closed without an internal SHA256 snapshot digest and vary across all
    seven required identity dimensions. Compression is deliberately deferred until held-out
    collision evidence exists. Full Node 113, Python 109 and documentation lint pass.
- [x] **P3.3a Prove official-clone consequence evaluation in a bounded spike.**
  - Why: the first static evaluator completed games but could not distinguish demand it would sell
    from demand donated to a closer opponent. More static weight tuning cannot recover missing
    consequences.
  - Depends on: P3.1b–P3.2 and the official offline environment.
  - Scope: prefilter at most six diverse candidates; execute them only in isolated official-engine
    clones; use phase-specific horizons; never advance a simultaneous boundary from an opponent's
    hidden submitted move. Unknown opponent choices are versioned beliefs, never observations.
  - Budgets: one-ply by default, maximum 24 official transitions, 3-second local deadline and a
    static legal fallback on timeout/error. Cache keys include ruleset, internal snapshot digest,
    seat, candidate, horizon and opponent-model version; cache contents never leave the planner.
  - Done when: 12–20 fixed tactical cases spanning at least two seeds and three working-day
    subphases achieve >=80% oracle Top-1 and >=95% Top-3, hidden-state metamorphic tests are
    invariant, every selected action is legal, and local P95 is <=3 seconds. Dynamic cases drawn
    from one self-play path are calibration evidence, not the fixed promotion suite.
  - Evidence: `fixtures/rollout-v1/manifest.json` freezes 13 source-projection digests and exhaustive
    same-horizon oracle labels from 11 official phase fixtures plus two reproducible generated seeds.
    Audit mode covers working-day subphases 1/2/3/4/5, selects legally in 13/13 cases, achieves
    Top-1 13/13 and Top-3 13/13 with local P95 1.31 s, and fails on any source/oracle drift. Existing
    simultaneous hidden-state metamorphic tests remain invariant. Discovery mode is explicitly not
    accepted as promotion evidence. This promotes the bounded clone mechanism, not the evaluator.
  - Historical failure retained: the earlier dynamic suite sampled only subphases 1/4 because
    safe-first trajectories never created training/marketing choices. Merely increasing seeds to 20
    reproduced the same two-subphase ceiling; the fixed official-fixture suite repaired coverage.
    A paired full game then scored $10 against the built-in AI's $498 versus $35/$493 for the static
    policy on the same seed. It made 34 hires, no marketing, and changed 43/66 eligible decisions.
    This falsifies the current short-horizon score as a terminal strategy oracle; P3.3b calibration,
    leaf-cutoff diagnostics and held-out leagues remain mandatory before deeper search promotion.
    Official public spatial consequence labels now exist for build/open/move actions and pass a
    bounded build→restaurant engine probe (19/10 candidates, 13/3 distinct effects and zero source
    mutation). A naive current-distance build score was rejected:
    on the 10-game development slice its effect Top-3 fell from 12/27 to 1/27, including 9/22→1/22
    for eventual winners. Long-horizon blocking, demand order and expansion space therefore need
    independently labelled fixtures or search; the rejected score is not shipped.
- [ ] **P3.3b Calibrate the explainable evaluator and strategy profiles.**
  - Why: this creates the first meaningful opponent and training-data generator.
  - Depends on: P3.3a.
  - Done when: score breakdowns are auditable and a frozen policy completes every game and beats
    random/first-legal across held-out paired seeds without increasing invalid actions.
  - Current: the auditable evaluator and balanced/growth/cash profiles exist, but are not promoted.
    An initial four-game paired official-AI smoke test finished without violations but lost 0-4;
    corrections raised mean cash from $5 to $37.75 but still lost 0-4. A paired safe-first trial
    also lost every completed game and one game exceeded the 500-command ceiling. This falsifies
    static one-step scoring as sufficient. The first terminal-calibration puncture now adds six
    completed two-player games and 94 seat-safe turn observations. Game-level macro leader accuracy
    is only 65.7% for balanced/growth and 67.5% for cash; balanced and growth make identical ranking
    decisions, early turn accuracy is 47.2%, 13/18 early states are ties and decisive early calls are
    only 2/5. The inspected three-game diagnostic holdout is consumed and cannot be reused for
    promotion. Terminal-value v2 now replaces the invalid generic capacity sum with explicit
    semantic employee-pipeline, market, reachability, payroll and spatial features. A frozen
    12-development/12-calibration/24-promotion protocol balances four weak policy families and both
    seats. Development and calibration completed 24/24 games with 574 observations. Independent
    calibration selected per-phase regularization: early scored 46.9% weighted accuracy and 0.692
    log loss and is rejected/forced to abstain; middle scored 63.6%/0.626 and late 78.6%/0.512.
    The 24-game promotion holdout remains sealed. Next freeze the gated evaluator inside leaf/cutoff
    diagnostics, then open the promotion holdout exactly once only after policy and thresholds stop
    changing. Do not expose a remote simulation API yet.
- [ ] **P3.3c Freeze leaf-value and search-cutoff diagnostics.**
  - Why: a deeper search can become worse when a biased leaf evaluator rewards unfinished engines,
    excess staff or demand donated to opponents. More depth is not evidence of better planning.
  - Depends on: P3.3b and completed-game outcomes.
  - Scope: score the same root candidates at multiple fixed and randomized horizons; compare with
    terminal completion where affordable; stratify calibration by phase, player count and remaining
    bank horizon; report reversal and error rates rather than only aggregate score correlation.
  - Done when: the frozen evaluator is calibrated on held-out outcomes, justified root-choice
    reversals correlate with terminal improvement, and additional compute does not systematically
    reduce tactical-suite or league performance.
  - Current: the development-only phase model has been audited on the disjoint 12-game calibration
    trajectories without refit leakage. Equal-game accuracy/log loss is early 0.500/0.693 (100%
    abstention), middle 0.611/0.678 and late 0.797/0.496. Far/medium/near/boundary realized-horizon
    accuracy is 0.652/0.806/0.861/1.000; 9/12 sign reversals move toward the terminal winner and
    3/12 move away. This is retrospective temporal calibration only. Fixed-root multi-cutoff
    official-clone diagnostics remain required before P3.3c can close. The first fixed-root puncture
    now holds three middle-game hiring/marketing/production roots and three legal candidates constant
    while varying 0/2/5/11 official transitions, then completes all nine branches to Game Over. Only
    3/12 recommendations match the terminal oracle. Hiring and production miss at every cutoff;
    marketing temporarily reverses at cutoff 5 from a +$235 oracle branch to -$230, then reverses
    back at cutoff 11. Immediate v2 planner integration is rejected. Next train/evaluate
    action-conditioned value deltas or regret on broader frozen roots rather than relying on
    aggregate state-winner classification. That broader action-regret puncture is now complete:
    12 development and 12 disjoint calibration roots produced 32 candidates per split. Static,
    state-value v2 and every tested regret model all score 5/12 calibration Top-1 with $255.58 mean
    regret. All seven exact calibration feature-delta patterns have contradictory labels, capping a
    context-free delta oracle at 58.3% weighted pairwise accuracy. The model is rejected and remains
    disconnected. Next freeze a small multi-continuation label-stability puncture; if terminal
    action preferences are stable enough, add one bounded action-delta × observed-root-context
    feature family and re-evaluate without opening promotion.
    The next production-only stability puncture is complete: four fixed roots, two candidates and
    three paired built-in-opponent continuations per candidate reproduced all baseline labels at
    sample zero, but the terminal-optimal action flipped in 4/4 roots; paired action advantages span
    -$848 to +$735. Single-continuation regret labels are therefore rejected. Next implement a
    versioned paired sequential estimator (mean advantage, uncertainty/confidence, maximum samples,
    abstention), then repeat stability checks for hiring and marketing before fitting interactions.
    The estimator core is now complete and passes its first gate: exact paired terminal-rank sign
    tests at predeclared 3/7/15 stages spend total alpha 0.05 and correct for multiple candidates.
    Existing three-sample data selects 0/4 roots and requests more samples for 4/4; all p-values are
    1.0 and cash-advantage standard errors are $264–$441. Next resume the same roots to seven samples
    without recomputing the verified first three, then either select or continue to the maximum.
    Seven-sample continuation is now complete with every first-three prefix unchanged. It still
    selects 0/4 and advances 4/4 to sample 15; p-values are 0.375–1.0 versus alpha 0.02, while one
    cash mean reverses from -$215.67 to +$10. Next resume only samples 7–14, then freeze selected vs
    max-sample-abstained outcomes without any cash/static fallback.
    The frozen maximum is complete: all prior prefixes are unchanged, 120/120 candidate
    continuations reach Game Over, 0/4 roots are selected and 4/4 are `abstain-max-samples`.
    Final p-values are 0.289–1.0, terminal-rank ties occur in 4–10/15 samples per root and cash
    standard errors remain $107–$139. Exclude these production roots from supervised labels. Next
    run the three-sample first gate on frozen hiring/marketing roots and begin P3.3d's versioned
    opponent-policy population; do not enlarge the production maximum after observing the result.
    The hiring/marketing puncture now reconstructs 4 roots × 3 candidates and sample-zero outcomes,
    but formal selection is 0/4 and naive cash-winner stability only 1/4. Adversarial testing found
    three-candidate stages 3 and 7 mathematically unreachable after Bonferroni correction; the
    estimator now skips directly to reachable stage 15. Defer the resulting 144 extra continuations
    until P3.3d defines a useful multi-archetype opponent population instead of one weak built-in AI.
- [x] **P3.3d Add versioned opponent-belief sampling.**
  - Why: future dinner outcomes depend on unrevealed simultaneous choices and opponent reactions.
  - Depends on: P1.1 observation provenance, P3.2 and validated public-replay/self-play traces. A
    consented human trace improves calibration but is not a hard dependency for the first model.
  - Done when: `observed`, official-engine `derived` and model `believed` fields are impossible to
    confuse; every belief records model id, confidence and sample count; and hidden-state mutation
    cannot change a recommendation except through an explicitly sampled public-history model.
  - Current: population v1 freezes deterministic, safe-first, seeded-random and official-built-in
    archetypes. Its fail-closed contract separates `observed`/`derived`/`believed`, binds updates to
    a public-history digest, records model id/confidence/sample count, rejects private fields and
    delegates official AI to the environment adapter. Two 4,096-sample mechanical audits are
    deterministic with 0.0137 maximum probability error. This completes the sampler contract, but
    the hand-set priors are deliberately labelled uncalibrated. Next fit/evaluate weights and OOD
    thresholds on public traces plus independent self-play, then run sensitivity against held-out
    opponent identities before connecting the population to rollout labels or search. The first
    12-game/48-seat public-event-histogram puncture failed its frozen identification gate at 17/24
    (70.8%) Top-1 despite flagging 82/120 human prefixes as OOD; it also over-mapped humans to the
    official AI. Keep it disconnected. Next change only the public feature representation to
    bounded event transitions plus phase/action context on the same splits and gates. The temporal
    v2 puncture passed those representation gates: 22/24 (91.7%) Top-1, 0.296 log loss, 0.159 Brier
    and 102/120 (85%) human OOD. However mean confidence was 0.981 with two errors, so probabilities
    are overconfident. Next fit temperature/abstention on the existing calibration split and evaluate
    once on newly frozen validation seeds; do not connect v2 beliefs to rollout/search before that.
    Iteration 11 did so: temperature 3 improved new-seed log loss 0.439→0.264, ECE reached 0.055,
    Top-1 was 21/24 and accepted accuracy 10/11. It still failed because coverage was 11/24 (45.8%)
    versus the frozen 50% gate; a global OOD threshold rejected six correct style-specific samples.
    The validation block is consumed. Next change only to class-conditional OOD thresholds fitted on
    old calibration data and evaluate on another fresh seed block; keep beliefs disconnected.
    Iteration 12 completed that test: predicted-class thresholds recovered 12/24 (50%) coverage with
    12/12 accepted correct, 23/24 Top-1 and 0.081 ECE, but frozen temperature 3 worsened log loss
    0.0947→0.1649 on the second fresh block. The result is rejected. Both validation blocks are now
    consumed. Next predeclare a block-robust calibration fitter over consumed development blocks and
    assess it once on multiple untouched blocks with per-block gates; do not choose temperature 1
    post hoc or connect beliefs to search. Iteration 13 completed that independent check: the frozen
    worst-block fitter selected identity temperature 1 and threshold 0.8189, then all three fresh
    six-game blocks passed independently (Top-1 24/24, 23/24, 22/24; coverage 17/24, 19/24, 15/24;
    accepted correct 17/17, 18/19, 15/15; ECE 0.030–0.059). Calibration v5 is frozen. Advance to
    P3.3e information-set consistency before any rollout/search connection.
- [x] **P3.3e Enforce information-set policy consistency.**
  - Why: ordinary determinization can create strategy fusion—the planner chooses mutually
    incompatible actions in different sampled hidden worlds and behaves as if it knew which world
    was real.
  - Depends on: P3.3d.
  - Scope: construct states with identical acting-seat observations but different private opponent
    buffers/reserve choices; run repeated seeded belief samples; compare returned candidate
    distributions, not only a single top action.
  - Done when: hidden-state mutations outside the actor's information set do not alter the policy
    distribution beyond declared sampling tolerance, no private simulator field reaches features or
    cache outputs, and failing planners are rejected rather than patched with more weight tuning.
  - Current: audit primitive v1 is complete. It validates equal public digests/legal candidates,
    reuses identical frozen belief samples, measures both per-seed mismatch and pairwise total
    variation, omits trusted-world payloads from reports, and adversarially detects a private-reserve
    leak at total variation 1 while a public-only policy scores 0. P3.3e remains open until official-
    engine paired hidden-world fixtures and the actual belief-aware planner pass this gate. The first
    authentic fixture now passes: official reserve-card envelopes differed while public snapshots
    and DecisionViews matched; 16 matched belief seeds × 3 candidates produced mismatch 0 and TV 0,
    with a byte-reproducible sanitized report. A second authentic fixture corrects the earlier plan:
    working day is sequential, so the relevant hidden boundary is restructuring. Opponent active-vs-
    beach assignments differed while actor-visible state remained equal; 16 matched seeds × 2
    candidates again produced mismatch 0 and TV 0. Its frozen fixture clock prevents display-time
    sorting from making reconstructions nondeterministic. Iteration 19 then audited the actual
    `ScenarioBeam v1` adapter on both official paired-world fixtures. Across 16 outer matched seeds,
    reserve produced four legal candidates and restructuring two; both had per-seed mismatch 0 and
    TV 0. The planner reported `root-simultaneous`, attempted no clone, and selected the same static
    public candidate in every hidden world. The report is byte-reproducible and private-payload-free.
    This closes P3.3e for ScenarioBeam v1; any later planner that searches rather than safely
    declining these boundaries (including P4.1c) must pass the gate independently.
- [x] **P3.3f Add plan-health and opportunity arbitration.**
  - Why: reacting to every locally attractive move creates thrashing, while blindly following a
    plan misses real opponent mistakes.
  - Depends on: P3.2b–P3.2c and frozen P3.3b–P3.3d value and belief baselines.
  - Scope: compare `continue`, `repair`, `tactical deviation`, `pivot` and `abandon` using estimated
    terminal value, deadline/milestone risk, salary runway, switching cost, asset reuse, confidence
    and opportunity expiry. Use separate enter/exit thresholds plus cooldown/hysteresis. Trigger a
    strategic review on milestone closure, missed prerequisite, meaningful public opponent change,
    cash danger or high-impact uncertainty—not only on a hand-labelled “mistake.”
  - Done when: frozen adversarial cases exploit a genuine opportunity, ignore bait that destroys a
    higher-value commitment, make a tactical deviation without erasing the plan, pivot when the
    goal becomes infeasible and do not oscillate on unchanged observations.
  - Completed: `PlanArbitration v1` consumes an exact public evidence contract and compares all five
    modes with explicit switching/disruption costs, uncertainty, reusable assets, deadline/cash
    danger, enter/exit margins and a one-turn cooldown. The event reducer preserves the plan graph
    during tactical deviation, records auditable scores, makes pivot/abandon terminal until an
    explicit replacement plan is created, and feeds the selected relation into candidate priority
    without bypassing official legality. Ten adversarial tests cover opportunity, bait, repair,
    pivot, abandonment, low confidence, unchanged observations, cooldown, replay determinism,
    malformed/private inputs and resurrection attempts. P4 still must validate terminal lift.

## P4 — online-planner bake-off and component promotion

- [ ] **P4.1 Establish scenario beam as the equal-budget receding-horizon baseline.**
  - Why: one-seat shallow rollout cannot verify a multi-turn plan. Full primitive MCTS is also not
    a credible first answer to FCM's branching, delayed rewards, multiple opponents and hidden
    simultaneous choices.
  - Depends on: P3.3f.
  - Scope: search bounded strategic/turn macros, sample opponent responses from versioned beliefs,
    adapt depth to the active goal's deadline and bootstrap leaf values from a frozen calibrated
    evaluator. Trigger extra budget from decision impact and uncertainty, not merely from a named
    tactical event.
  - Done when: the planner is anytime, has deterministic one-second/three-second budgets and legal
    fallback, passes cutoff/abstraction/privacy suites, and produces the first held-out league
    baseline under a declared P95 deadline.
  - Current: `ScenarioBeam v1` contract is implemented. Ten contract/adversarial checks cover a
    multi-decision reversal, matched belief seeds, live/partial simultaneous fail-closed behavior,
    fresh internal simultaneous resolution without strategy fusion, official-AI adapters, weak/OOD
    belief fallback, deadline/transition fallback, stable ties and policy failure. A frozen official
    smoke reached actor depth 4 through restructuring using 20 transitions and 4/4 completed root
    scenarios with zero violations. It nevertheless replaced a turn-1 hire with skip (leaf score
    35.4 vs 39), so strength is explicitly unpromoted. Iteration 20 found a harmful hire→skip change,
    but its opponent seed accidentally included the arm id; its 4/4 versus 0/4 magnitude is not a
    valid paired estimate. Iteration 22 fixes player/game/opponent common randomness: static scores
    2/4 and mean $261.75; ungated three-second Beam scores 1/4 and mean $153.75.
    Iteration 21 isolates the horizon effect on the same root and matched samples: hire leads at actor
    depths 1–2, skip falsely leads at depths 3–5, and hire recovers at depth 6 before its delayed
    payoff appears at depths 7–8. Depth 8 costs about 5.38 seconds, so merely increasing the fixed
    horizon violates the target budget. Next test one conservative variable: require shallow/deep
    recommendation agreement before a completed search may override the static prior. That gate now
    restores both budget arms exactly to static money/rank in every paired game. A 20% cooperative-
    deadline headroom reduces measured maxima to 0.93s and 2.46s, so both tiers now meet their caps.
    P4.1 remains open until the gate accepts a beneficial change on disjoint development positions
    rather than always abstaining, followed by a declared held-out league. Iteration 24 scanned the
    first 24 eligible decisions on four disjoint trajectories: all 24 were `deep-incomplete` under
    the 2.4s internal envelope, so no change could be accepted. Next change only target depth 4→3;
    the known harmful root still disagrees with the depth-1 probe and remains blocked.
    Iteration 25 repeats the same roots at depth 3: 7 complete agreements all repeat static, 4
    disagreements block the bad skip, 13 remain incomplete and zero non-static changes are accepted.
    Depth 3 improves liveness but not policy value. Next scan later decisions and fresh trajectories
    before changing the gate itself.
    Iteration 26 expands to 48 decisions through turn 4 on fresh seeds: 9 agreements still repeat
    static, 4 disagreements block the same bad skip, 35 are incomplete and zero changes are accepted.
    Exact horizon agreement is retained only as a safety diagnostic; stop tuning it for strength and
    proceed to the equal-budget RHEA challenger under the same candidates/evaluator/beliefs.

- [ ] **P4.1b Implement RHEA as an equal-budget challenger.**
  - Why: rolling-horizon evolution may discover useful macro sequences that beam pruning loses in
    irregular, high-branching turns; its value must be measured rather than assumed.
  - Depends on: P4.1 contracts and the same frozen candidate/evaluator/belief versions.
  - Scope: mutate/crossover bounded macro sequences with deterministic seeds, repair every sequence
    through official legality, reuse the same leaf evaluator and compare at identical one-second and
    three-second wall-clock budgets.
  - Done when: beam and RHEA are compared on identical fixtures and held-out leagues with terminal
    rank/win, P95 latency, fallback, horizon sensitivity and seed variance. Retain the simpler
    planner unless RHEA provides reproducible terminal lift or materially better robustness.
  - Current: `RHEA v1` optimizer and official adapter are implemented. Contract tests cover seeded
    evolution, common samples, stronger-genome discovery, static ties, malformed budgets, non-finite
    or failed samples and deadline fallback. The official smoke completes two generations, five
    unique genomes and ten scenario evaluations with a byte-reproducible sanitized report, but
    selects the same known harmful skip at score 39. Mechanism passes; strength does not. Iteration
    28 passes both official reserve and restructuring pairs: 16 matched outer seeds yield mismatch 0,
    TV 0, no clone attempt and byte-reproducible sanitized reports. Iteration 29 establishes the
    minimum official-engine budget baseline: one- and three-second tiers each complete 8/8 runs,
    evaluate both root candidates, and never fall back. The one-second P95 is 995.95ms and therefore
    too close to the cap for more work; the three-second P95 is 1096.87ms and leaves capacity. Next
    changed only the three-second arm from one to two generations while retaining all other fixtures,
    beliefs, candidates, horizon and evaluator. All 8 runs reported two complete generations inside
    one second, but the second generation added zero novel genomes: every run remained at two unique
    genomes and four scenario evaluations. Iteration 30 is rejected as cached pseudo-progress. Next
    adds a tested novelty contract: seeded mutation rotates through every one-gene alternative and
    excludes both the parent population and the evaluated cache before accepting a child. Repeating
    the exact fixture in iteration 31 yields 8/8 real two-generation runs, three unique genomes, six
    scenario evaluations and 1.71s P95 under the three-second cap. The action remains the correct
    static hire. Next freeze this optimizer and compare Beam/RHEA/static on disjoint development
    roots with terminal continuations before opening any promotion holdout. Iteration 32 completes
    that first terminal bake-off on two new seeds × both seats: static and RHEA are exactly equal
    game-by-game (2/4 first places, mean $226.25), while Beam changes all four roots to skip and falls
    to 0/4 first places and mean $61.25. Planner P95s are 1.62s Beam and 1.76s RHEA, with zero
    violations/fallbacks. RHEA is safer than current Beam but still changes zero static decisions, so
    strength remains unproven. Next scan later disjoint roots for non-static RHEA interventions and
    terminally audit every intervention; do not expand homogeneous first-turn games or open holdout.
    Iteration 33 scans 32 decisions through turn 4 on two further seeds × both seats: 0 fallbacks,
    0 violations and maximum latency 1.81s, but still 0 non-static interventions. Root-score
    diagnostics reveal the cause: all 32 two-root sets contain the static action plus fallback/skip,
    never a meaningful same-intent alternative; static leads in 24 and ties in 8, with median margin
    1.4. Next change root breadth 2→3 with a breadth-first one-generation audit so the third root can
    represent a different hire/train/produce combination before spending budget on evolution.
    Iteration 34 repeats the identical 32 roots with exactly that breadth change. It exposes eight
    non-static same-intent choices and audits all eight to Game Over: 4 beneficial, 4 harmful, with
    money deltas from -$380 to +$378 and two rank improvements versus two rank regressions. Hire
    alternatives are 1/4 beneficial; train alternatives 3/4. All predicted advantages are about 1.4,
    so the leaf value cannot separate success from failure. Do not promote or deepen RHEA. Next freeze
    contradictory roots and run paired multi-continuation stability estimates before changing value
    features; single-continuation labels remain training-ineligible. Iteration 35 reconstructs one
    apparently beneficial and one harmful hire root and expands each candidate pair to three matched
    continuations. Sample zero reproduces exactly. On both roots static has one rank win, zero rank
    losses and two ties against the RHEA alternative; cash-advantage SE is $254/$223. The earlier
    `beneficial` label was only a same-rank cash result and flips tactical interpretation under new
    samples. Both roots correctly request seven samples. Resume only samples 3–6; never recompute the
    verified prefix or train from it yet. Iteration 36 preserves every verified prefix value and adds
    samples 3–6 only. Both roots now show static rank wins 2, alternate wins 0 and ties 5; p=0.5 at
    the reachable seven-sample stage. Cash-advantage SE falls to $139/$118 but remains orders above
    the +1.4 leaf margin. Both roots request the predeclared maximum 15 samples. Resume samples 7–14
    only and require stable strategic-projection identity; no interim rule change. Iteration 37
    preserves all seven samples and closes both roots at 15: static rank wins 5, alternate wins 0,
    ties 10 on each root, but exact p=0.0625 exceeds α=0.025, so both correctly become
    `abstain-max-samples`. Cash advantages remain noisy (mean $305/$278; SE $88/$104). Stop sampling
    these hire roots and exclude them from supervised labels. The directional evidence rejects this
    RHEA hire override online. Next apply the same staged puncture to contradictory training roots,
    which appeared 3/4 beneficial under one continuation. Iteration 38 reconstructs one previously
    `harmful` and one `beneficial` training root and collects three paired continuations. Sample zero
    reproduces exactly. On the first root all six branches rank first, while the alternate has higher
    cash in all three; on the second root the alternate has two rank wins, zero losses and one tie.
    Both request seven samples. The old own-cash-only harmful label is rejected; resume samples 3–6
    with rank primary and no policy change. Iteration 39 preserves the prefix and reaches seven. Root
    A ties rank 7/7 while the alternate improves mean margin by $102 (SE $37); root B gives alternate
    three rank wins, zero losses and four ties (p=0.25) with about $453 mean margin advantage. Neither
    is formally selected and both request 15. Resume samples 7–14 only; no phase-wide training gate.
    Iteration 40 closes the maximum: root A ties rank 15/15 and abstains despite +$138 mean alternate
    margin (SE $34); root B formally selects the alternate with 9 rank wins, 0 losses, 6 ties and
    p=0.003906. This is the first stable RHEA-derived action label, but only for one development root.
    Next compare seat-visible root-context features A vs B, predeclare one bounded interaction, and
    validate it on independent training roots before any online use. Iteration 41 completes that
    preregistration without private state: roots differ only in four public map-position features.
    The selected root has 0 exclusive houses and distance deficit 10; the abstained root has 4 and 2.
    Freeze the exact interaction `exclusive == 0 && deficit >= 10` for this candidate pair, abstain
    otherwise, and test only the two untouched seat-1 roots through staged 3 -> 7 -> 15 sampling.
    Do not reinterpret the threshold after viewing validation contexts or open promotion holdout.

- [ ] **P4.1c Evaluate belief-aware information-set search only where uncertainty warrants it.**
  - Why: hidden/simultaneous choices may justify ISMCTS/POMCP-style sampling, but naive MCTS or
    determinization risks strategy fusion and high compute cost.
  - Depends on: P3.3e and an observed performance gap at uncertain decision boundaries.
  - Scope: restrict the spike to hidden/simultaneous or high-impact/high-uncertainty nodes; compare
    against belief-sampled beam/RHEA at equal compute; consider progressive widening only after
    measured branching demands it.
  - Done when: information-set consistency remains intact and the specialist produces held-out
    terminal lift beyond its latency cost. Otherwise keep it research-only and retain the simpler
    receding-horizon planner.

- [ ] **P4.2 Run component ablations.**
  - Compare no memory vs plan graph, always-continue vs opportunity arbitration, no-search vs beam,
    beam vs RHEA, belief-sampled receding horizon vs information-set specialist, deterministic
    opponent vs belief population, and static horizon vs deadline-aware horizon.
  - Promote on paired-seat terminal rank/win plus calibration, plan-completion, pivot-regret and
    oscillation metrics; include 3–6 player third-party externality cases. Human action match is
    diagnostic only.

- [ ] **P4.3 Apply explicit algorithm promotion and kill criteria.**
  - Promote only on confidence-bounded held-out terminal rank/win lift with no legality, privacy,
    completion, reproducibility or P95-latency regression.
  - Defer or remove an algorithm that has no equal-budget lift, leaks hidden state, is unstable
    across seeds/evaluator versions/opponent populations, or improves shaped/development scores
    while worsening terminal outcomes.

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
  - Scope: use public/human trajectories as proposal/value priors, not unquestioned optimal labels;
    add Expert Iteration so useful search decisions can train a faster policy/value model and the
    learned prior can guide later search.
- [ ] **P6.2 Evaluate PPO as one masked hierarchical baseline.**
  - Depends on: P1.3, a policy league and stable terminal metrics.
  - Done when: terminal-only PPO is compared with potential-difference shaping from a frozen,
    held-out-calibrated evaluator, while promotion still uses raw win/rank metrics.
- [ ] **P6.3 Add population self-play and promotion gates.**
  - Depends on: P6.1 or P6.2.
  - Scope: maintain random, first-legal, built-in, scripted archetype, frozen historical and current
    policies across seats, maps and 2–6 player counts. Detect cycling and third-party exploitation.
    Evaluate PSRO/JPSRO-style population solvers only if a simpler frozen league remains cyclic or
    brittle; do not claim convergence from latest-policy self-play.
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
- Adopting a generic full-state HTN or GOAP framework: use a small typed prerequisite/capability
  graph first and expand only from measured missing expressiveness.
- Adding a behavior tree as a second legality/execution system: official legal enumeration,
  candidate validation and fail-closed submission already provide that layer.
- Treating handwritten Utility weights as a strategy oracle or “two to three turns of MCTS” as a
  guaranteed long-horizon solution.
