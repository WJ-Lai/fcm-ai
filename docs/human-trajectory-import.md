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
