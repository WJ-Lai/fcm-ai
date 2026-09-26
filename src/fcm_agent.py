#!/usr/bin/env python3
"""
fcm_agent.py — a minimal client for the OnlineBoardGamers FCM Agent API (protocol fcm-agent-v1).

Design notes
------------
* **Zero dependencies** (stdlib only) so it can run anywhere the agent runs.
* **Token never logged.** It is read from the environment and only ever placed in the
  Authorization header. Any accidental echo goes through redact().
* **The server is the rules authority.** legal_actions() is the only source of what may be
  submitted; this client deliberately does NOT hardcode the game's legal moves. FCM rules live in
  the wiki; legality lives in the API. Keeping those separate is what stops the agent from
  inventing moves.
* **Version + idempotency.** The API uses optimistic concurrency (expectedVersion) and idempotent
  submission (a client-supplied UUID). submit() requires both explicitly so a caller cannot
  accidentally retry a stale or duplicated command.

Protocol reference
------------------
The server self-describes at GET /FCM/agent/v1/bootstrap/. If anything here disagrees with that
endpoint, the endpoint wins — re-read it before debugging.

    GET  {base}/FCM/agent/v1/whoami/
    GET  {base}/FCM/agent/v1/games/
    POST {base}/FCM/agent/v1/games/                      # create (needs fcm:games:create)
    GET  {base}/FCM/agent/v1/games/{id}/actions/         # legal actions + state + version
    GET  {base}/FCM/agent/v1/games/{id}/snapshot/
    POST {base}/FCM/agent/v1/games/{id}/join/
    POST {base}/FCM/agent/v1/games/{id}/actions/         # {expectedVersion, idempotencyKey, actions}
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid

DEFAULT_BASE = "http://127.0.0.1:8000"
TOKEN_ENV = "FCM_AGENT_TOKEN"
BASE_ENV = "FCM_BASE_URL"

_TOKEN_RE = re.compile(r"obg_pat_[A-Za-z0-9_\-]+")


class AgentApiError(RuntimeError):
    """An error returned by the Agent API, with the server's error code preserved."""

    def __init__(self, code: str, message: str, status: int | None = None, payload=None):
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message
        self.status = status
        self.payload = payload


def redact(text: str) -> str:
    """Strip anything that looks like an agent token. Use on any string before logging."""
    return _TOKEN_RE.sub("***REDACTED***", text or "")


class FCMAgent:
    """Client for one Agent identity against one game server.

    The token is read from the environment by default and is never stored on the instance in
    plaintext-accessible form (it lives in the header dict, and __repr__ redacts).
    """

    def __init__(self, token: str | None = None, base_url: str | None = None, timeout: int = 30):
        token = token or os.environ.get(TOKEN_ENV)
        if not token:
            raise AgentApiError(
                "NO_TOKEN",
                f"No agent token. Set ${TOKEN_ENV} (an obg_pat_... value) or pass token=.",
            )
        self._token = token
        self.base = (base_url or os.environ.get(BASE_ENV) or DEFAULT_BASE).rstrip("/")
        self.timeout = timeout

    def __repr__(self) -> str:  # never leak the token via repr/logging
        return f"FCMAgent(base={self.base!r}, token=***)"

    # ---------------------------------------------------------------- transport

    def _request(self, method: str, path: str, body=None, *, raw: bool = False):
        url = path if path.startswith("http") else f"{self.base}{path}"
        data = None
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/json",
        }
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                text = resp.read().decode("utf-8", "replace")
                status = resp.status
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "replace")
            status = e.code
        except urllib.error.URLError as e:
            raise AgentApiError("CONNECTION_FAILED", f"Cannot reach {url}: {e.reason}") from e

        if raw:
            return status, text

        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            # The API returns JSON; an HTML body means we hit something else (a login
            # redirect or a Django error page). Surface that honestly rather than masking it.
            raise AgentApiError(
                "NON_JSON_RESPONSE",
                f"Expected JSON from {url} but got {text[:120]!r}. "
                "Check base URL and token validity.",
                status,
            )

        if status >= 400 or (isinstance(payload, dict) and "error" in payload):
            err = payload.get("error", {}) if isinstance(payload, dict) else {}
            raise AgentApiError(
                err.get("code", "HTTP_ERROR"),
                err.get("message", f"HTTP {status}"),
                status,
                payload,
            )
        return payload

    # ------------------------------------------------------------------ read API

    def bootstrap(self):
        """Self-describing entry point: protocol, identity, scopes, workflow, rules."""
        return self._request("GET", "/FCM/agent/v1/bootstrap/")

    def whoami(self):
        """Identity + scopes + credential id (no token)."""
        return self._request("GET", "/FCM/agent/v1/whoami/")

    def list_games(self):
        """Games visible to THIS identity.

        Caveat: only returns games this identity can see (ACTIVE games are participant-only).
        An empty list does NOT mean no games exist — use probe_game() to distinguish.
        """
        return self._request("GET", "/FCM/agent/v1/games/")

    def legal_actions(self, game_id: int):
        """Authoritative legal actions + state + version for this seat.

        This is the ONLY legitimate source of what may be submitted.
        """
        return self._request("GET", f"/FCM/agent/v1/games/{game_id}/actions/")

    def snapshot(self, game_id: int):
        return self._request("GET", f"/FCM/agent/v1/games/{game_id}/snapshot/")

    def probe_game(self, game_id: int):
        """Distinguish 'game does not exist' from 'exists but I am not a player'.

        Returns one of: 'mine', 'not_a_player', 'not_found', 'unknown'.
        """
        try:
            self.legal_actions(game_id)
            return "mine"
        except AgentApiError as e:
            if e.code == "NOT_A_PLAYER":
                return "not_a_player"
            if e.code == "GAME_NOT_FOUND":
                return "not_found"
            return "unknown"

    # ----------------------------------------------------------------- write API

    def create_game(self, name: str, max_players: int = 2, description: str = "",
                    invited_usernames=None, private: bool = False):
        """Create a game. Requires the fcm:games:create scope.

        NOTE: creation does not set startingMap — the client generates it on the first move and
        the server backfills it. An empty startingMap right after creation is NORMAL.
        """
        body = {
            "gameName": name,
            "gameDescription": description,
            "maxPlayers": max_players,
            "invitedUsernames": invited_usernames or [],
            "private": private,
        }
        return self._request("POST", "/FCM/agent/v1/games/", body)

    def join(self, game_id: int):
        """Join a game (idempotent)."""
        return self._request("POST", f"/FCM/agent/v1/games/{game_id}/join/", {})

    def submit(self, game_id: int, expected_version, actions, idempotency_key: str | None = None):
        """Submit one batch of actions.

        expected_version : the `version` from the most recent legal_actions() call. Required —
                           the API is optimistic-concurrency; a stale value yields STALE_STATE.
        actions          : list of action dicts copied from legal_actions. Never invent one.
        idempotency_key  : a UUID. If omitted a fresh one is generated; pass the SAME key when
                           retrying an uncertain identical request.

        Batch shape rules (enforced by the server, not here):
          * a turn-completing action must be the FINAL action in the batch
          * internal-only actions (e.g. finish_turn) are rejected; use the public equivalent
        """
        if not actions:
            raise AgentApiError("EMPTY_BATCH", "actions must be a non-empty list")
        key = idempotency_key or str(uuid.uuid4())
        body = {
            "expectedVersion": expected_version,
            "idempotencyKey": key,
            "actions": actions,
        }
        return self._request("POST", f"/FCM/agent/v1/games/{game_id}/actions/", body)


# --------------------------------------------------------------------------- CLI

def _main(argv):
    import argparse

    ap = argparse.ArgumentParser(description="FCM Agent API client")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("bootstrap", help="self-describing entry point")
    sub.add_parser("whoami", help="show identity and scopes")
    sub.add_parser("games", help="list visible games")

    p = sub.add_parser("actions", help="legal actions + state + version")
    p.add_argument("game_id", type=int)

    p = sub.add_parser("probe", help="is a game mine / not-a-player / missing")
    p.add_argument("game_id", type=int)

    p = sub.add_parser("join", help="join a game")
    p.add_argument("game_id", type=int)

    p = sub.add_parser("submit", help="submit a batch of actions")
    p.add_argument("game_id", type=int)
    p.add_argument("version", help="expectedVersion from the latest actions call")
    p.add_argument("actions_json", help="JSON array of actions")
    p.add_argument("--key", help="idempotency key (UUID); reuse it when retrying")

    args = ap.parse_args(argv)
    # Proxy env vars often break localhost calls; strip them for this process.
    for var in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"):
        os.environ.pop(var, None)

    try:
        agent = FCMAgent()
        if args.cmd == "bootstrap":
            out = agent.bootstrap()
        elif args.cmd == "whoami":
            out = agent.whoami()
        elif args.cmd == "games":
            out = agent.list_games()
        elif args.cmd == "actions":
            out = agent.legal_actions(args.game_id)
        elif args.cmd == "probe":
            out = {"gameID": args.game_id, "verdict": agent.probe_game(args.game_id)}
        elif args.cmd == "join":
            out = agent.join(args.game_id)
        elif args.cmd == "submit":
            out = agent.submit(args.game_id, args.version, json.loads(args.actions_json), args.key)
        else:
            ap.error("unknown command")
    except AgentApiError as e:
        print(redact(f"ERROR {e}"), file=sys.stderr)
        return 1

    print(redact(json.dumps(out, indent=2, ensure_ascii=False)))
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
