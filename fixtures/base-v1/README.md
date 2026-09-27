# Base-game engine fixtures v1

These JSON files are deterministic policy/engine test inputs. Most were captured from a complete
three-seat Agent API game (seed `1:17974`); phases that the simple acceptance policy skipped
were produced by `scripts/complete_engine_fixtures.mjs` after loading a captured snapshot into the
official OBG JavaScript engine.

Synthetic fixtures change only phase-local context and employee holdings needed to expose the
training, house-building or restaurant-opening decision. They do not provide expected rule
outcomes computed by a second implementation: legal actions are calculated by the official engine
and every fixture is loaded back through that engine by `scripts/verify_engine_fixtures.mjs`.

All fixtures:

- pin the official ruleset SHA-256;
- clear chat and simultaneous `moveData`;
- contain no Agent Token or account password;
- bind expected phase, subphase, seat, source version and legal action types;
- must leave the input snapshot byte-for-byte unchanged during inspection.

Regenerate skipped phase fixtures:

```bash
node scripts/complete_engine_fixtures.mjs \
  --server /path/to/OnlineBoardGamers-Server \
  --fixtures fixtures/base-v1
```

Verify every fixture against a server checkout:

```bash
node scripts/verify_engine_fixtures.mjs \
  --server /path/to/OnlineBoardGamers-Server \
  --fixtures fixtures/base-v1
```
