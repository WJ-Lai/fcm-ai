# Human trajectory import and review

Human games can improve playbooks and opponent models, but only after their data crosses an
explicit consent, visibility and review boundary. This pipeline does **not** scrape arbitrary game
reports or accept chat/reasoning prose.

## Boundary

An input package uses `fcm.human-import.v1` and contains exactly:

- `provenance`: `obg-seat-export`, UTC export time, a pseudonymous contributor id, game id and the
  one seat represented by the file;
- `consent`: explicit permission for `fcm-strategy-research` and training;
- `license`: an owner-supplied license id plus training/redistribution flags;
- one strict `fcm.trajectory.v1` record.

The validator requires every step, observation and provenance record to describe the same game,
ruleset and seat. Primitive action types must have appeared in that seat's legal-action view.
Opponent beliefs, temporary `ownPendingChoice`, credentials, raw game/move blobs, chat,
commentary, reasoning and cross-seat data are rejected. Unknown fields fail closed.

An `obg-seat-export` label is provenance supplied by the exporter, not a cryptographic signature.
The independent reviewer must still confirm the source and consent. Until OBG gains a signed,
seat-scoped exporter, do not treat a hand-written package as trusted merely because it validates.

## Two-stage workflow

Import creates a content-hashed **pending** record and refuses to overwrite an existing path:

```bash
python3 scripts/human_trajectory.py import human-export.json review/pending/game-63-seat-1.json
```

Approval writes a separate file. The reviewer must explicitly make all three attestations:

```bash
python3 scripts/human_trajectory.py approve \
  review/pending/game-63-seat-1.json \
  review/approved/game-63-seat-1.json \
  --reviewer reviewer-001 \
  --attest-seat-visibility \
  --attest-action-legality \
  --attest-consent
```

The package hash is recomputed during approval, so changing the pending payload invalidates it.
Approved records retain the original package, reviewer id, UTC review time and three attestations.
There is deliberately no free-text review note field.

## Remaining capture work

The safety gate is implemented; a trusted live-human exporter is not. Retrospective prose reports
cannot reconstruct exact per-step observations or prove what was hidden at decision time. The next
capture component should record a seat-scoped DecisionView immediately before a human submits a
normal UI action, then append the revealed action/outcome only after the authoritative transition.
It must never export owner cookies, Tokens, opponent move buffers or reserve choices before reveal.

## Public ended-game replay capture

Public replay research is a separate, lower-trust input path from the consented seat exporter
above. A successful download is **not** an approved `fcm.trajectory.v1` record. The capture tool:

- opens an ended public OBG game in the site's current client and asks the official Replay code to
  reconstruct every history event;
- requires one replay state per history event and the official end-game event (`26`) at the end;
- records ruleset options and map metadata, replaces player identities with `seat-N`, removes event
  timestamps, repeated embedded history, reserve-card storage and the entire transient runtime
  context;
- rejects credential-like content, incomplete games, count/digest drift and incompatible legacy
  metadata;
- writes `fcm.public-replay-capture.v1` files with status
  `quarantined-pending-engine-validation`.

Use a gated scale ladder: **2 -> 10 -> 50 -> 100**. Stop at each stage until every file passes a
fresh read-back audit and observed failure classes have regression coverage. Run:

```bash
node scripts/collect_public_replays.mjs \
  --games 35807,35732 \
  --max-games 2 \
  --delay-ms 1500 \
  --require-class base-standard \
  --output data/public-replays/pilot-2-parity-v2
node scripts/audit_public_replays.mjs data/public-replays/pilot-2-parity-v2
node scripts/audit_replay_observation_parity.mjs \
  --captures data/public-replays/pilot-2-parity-v2 \
  --server ../obg-server-fcm-agent-rebased
```

The local browser profile owns authentication cookies. The collector never accepts a password or
exports cookies. Capture files stay gitignored. Each audited decision observation is the current
MCP `getState()` plus seat-scoped `getLegalActions()`. Every simultaneous participant receives the
same public frame from before the first hidden submission. Chat is human-visible but deliberately
omitted because it is irrelevant to rules decisions and is an untrusted prompt-injection surface.
The audit rejects missing MCP fields and recursively rejects reserve cards, runtime context and
move buffers.

Public history is not a lossless action log. Production records producer ids and resulting totals
but not drink routes; payday records fired employees and only the number of food payments, not the
resource identities. Those decisions are permanently `outcome-only`: useful for state/value
learning, never for behavior cloning. All other labels remain
`candidate-pending-engine-replay`; a fail-closed code gate refuses behavior cloning until an exact
action has been executed successfully by the pinned official action layer.

The first trial exposed a real version boundary: game 6113 renders `startingMap` in a legacy scalar
format, leaving the current Replay client unable to initialize its history. It is rejected quickly
rather than coerced. An earlier two-game capture is superseded because its sanitizer left the
private reserve-card array at model index 19 intact; the strengthened validator now rejects it.
The canonical v2 recapture of games 35807 and 35732 is deterministic and anonymous, with 177 and
272 states. It contains 281 MCP decision boundaries: all pass observation parity, 214 are action
candidates awaiting engine replay and 67 are outcome-only. The 10-game gate remains closed.
