# `src/` — Agent API client

`fcm_agent.py` is a dependency-free client for the **OnlineBoardGamers FCM Agent API**
(`fcm-agent-v1`). It is the bridge between the rules knowledge base in `../wiki/` and an actual
game: the wiki says *what the rules are*, this client asks the server *what is legal right now*.

That separation is deliberate and load-bearing:

| Question | Authority |
|---|---|
| "How is unit price computed?" | **`../wiki/`** — the rulebook |
| "What may I submit right now?" | **the API** — `legal_actions()` |
| "Did my action land?" | **the API** — re-read state after submitting |

The client never hardcodes FCM legality. If it did, a wiki/rules/engine disagreement would
silently become a wrong move rather than a visible error.

## Design decisions

- **Token handling.** Read from `$FCM_AGENT_TOKEN`, used only in the `Authorization: Bearer`
  header, and never printed — `redact()` scrubs `obg_pat_…` from any output, and `__repr__` is
  redacted so an accidental `print(agent)` or traceback cannot leak it.
- **Errors.** The server returns `{"error": {"code", "message"}}`. Those become `AgentApiError`
  with the code preserved, because `code` is the useful part — it says *which layer* refused:
  - `NOT_A_PLAYER` → the game exists, this identity is just not seated (→ `join`)
  - `GAME_NOT_FOUND` → wrong id
  - `STALE_STATE` → someone moved first; re-fetch actions and use the new version
  - `ILLEGAL_ACTION` → the engine refused; re-read `legal_actions`
- **Non-JSON responses raise.** An HTML body means a login redirect or a Django error page. That
  is reported as `NON_JSON_RESPONSE` rather than being parsed into nonsense.
- **Proxies are stripped** in the CLI path — `http_proxy`/`https_proxy` routinely break
  `127.0.0.1` calls, and the resulting 502 looks like a dead server.

## Usage

```bash
export FCM_AGENT_TOKEN='obg_pat_...'      # never commit this
export FCM_BASE_URL='http://127.0.0.1:8000'

python3 src/fcm_agent.py bootstrap        # self-describing entry point
python3 src/fcm_agent.py whoami           # identity + scopes
python3 src/fcm_agent.py games            # games visible to this identity
python3 src/fcm_agent.py probe 66         # mine / not_a_player / not_found
python3 src/fcm_agent.py actions 66       # legal actions + state + version
python3 src/fcm_agent.py join 66
python3 src/fcm_agent.py submit 66 <version> '[{"type":"..."}]' [--key <uuid>]
```

As a library:

```python
from fcm_agent import FCMAgent, AgentApiError

agent = FCMAgent()                        # token from env
snap = agent.legal_actions(66)
ver  = snap["version"]
acts = snap["legalActions"]["actions"]

# act only on what the engine offered
agent.submit(66, ver, [{"type": "place_restaurant", "index": 2844, "rotation": 0}])
```

## Operational gotchas (learned against a live server)

1. **`list_games` returning `[]` does not mean there are no games.** ACTIVE games are visible only
   to participants. Use `probe_game(id)`: `NOT_A_PLAYER` proves the game exists.
2. **`bootstrap` is an HTTP endpoint, not a CLI subcommand.** Read it first — it returns the
   protocol version, your scopes, the 4-step workflow, and the server's own rule list.
3. **`expectedVersion` must be fresh.** Take it from the most recent `legal_actions()` call.
   Reusing an older value earns `STALE_STATE`.
4. **Idempotency key = retry key.** For an uncertain POST, retry with the *same* key and body.
   For a genuinely new decision, use a new UUID.
5. **An empty `startingMap` right after creating a game is normal**, not a corrupted game. The
   client generates the map on the first move and the server backfills it.
6. **A 3-player game does not start until the 3rd player joins.** Until then `phase` stays 0.

## Verification

```bash
python3 -m pytest tests/ -q      # unit tests, no server required
```

The unit tests stub the transport, so they run offline. Live behaviour was verified manually
against a running server (see `../log.md` for what was exercised and when).
