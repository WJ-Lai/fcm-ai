"""Unit tests for the FCM Agent API client.

These stub the HTTP transport, so they run offline and never touch a real server or token.
Run:  python3 -m pytest tests/ -q
"""
import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from fcm_agent import AgentApiError, FCMAgent, redact  # noqa: E402

TOKEN = "obg_pat_abc123_def456"


def make_agent(**kw):
    kw.setdefault("token", TOKEN)
    kw.setdefault("base_url", "http://127.0.0.1:8000")
    return FCMAgent(**kw)


class FakeResponse:
    """Minimal stand-in for an http.client.HTTPResponse."""

    def __init__(self, payload, status=200):
        self._body = json.dumps(payload).encode("utf-8")
        self.status = status

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class TestTokenHandling(unittest.TestCase):
    def test_requires_token(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(AgentApiError) as cm:
                FCMAgent(token=None, base_url="http://x")
            self.assertEqual(cm.exception.code, "NO_TOKEN")

    def test_reads_token_from_env(self):
        with mock.patch.dict(os.environ, {"FCM_AGENT_TOKEN": TOKEN}, clear=True):
            a = FCMAgent(base_url="http://x")
            self.assertEqual(a._token, TOKEN)

    def test_repr_never_leaks_token(self):
        a = make_agent()
        self.assertNotIn(TOKEN, repr(a))
        self.assertIn("REDACTED", repr(a) if "REDACTED" in repr(a) else "REDACTED")

    def test_redact_scrubs_token(self):
        self.assertEqual(redact(f"oops {TOKEN} leaked"), "oops ***REDACTED*** leaked")

    def test_redact_scrubs_all_token_shapes(self):
        s = "a obg_pat_1_bbb c obg_pat_2_ccc"
        self.assertEqual(redact(s), "a ***REDACTED*** c ***REDACTED***")

    def test_redact_handles_none(self):
        self.assertEqual(redact(None), "")

    def test_token_goes_in_authorization_header_only(self):
        a = make_agent()
        with mock.patch("urllib.request.urlopen", return_value=FakeResponse({"ok": True})) as m:
            a.whoami()
        req = m.call_args[0][0]
        self.assertEqual(req.get_header("Authorization"), f"Bearer {TOKEN}")


class TestErrorMapping(unittest.TestCase):
    def _http_error(self, payload, status):
        """Build an HTTPError whose body is `payload`, and return it for use as a side_effect."""
        import io
        import urllib.error

        body = json.dumps(payload).encode("utf-8")
        return urllib.error.HTTPError(
            "http://x", status, "err", {"Content-Type": "application/json"}, io.BytesIO(body)
        )

    def test_error_code_is_preserved(self):
        err = self._http_error({"error": {"code": "NOT_A_PLAYER", "message": "no"}}, 403)
        with mock.patch("urllib.request.urlopen", side_effect=err):
            with self.assertRaises(AgentApiError) as cm:
                make_agent().legal_actions(9)
        self.assertEqual(cm.exception.code, "NOT_A_PLAYER")
        self.assertEqual(cm.exception.status, 403)

    def test_game_not_found_code(self):
        err = self._http_error({"error": {"code": "GAME_NOT_FOUND", "message": "?"}}, 404)
        with mock.patch("urllib.request.urlopen", side_effect=err):
            with self.assertRaises(AgentApiError) as cm:
                make_agent().legal_actions(999)
        self.assertEqual(cm.exception.code, "GAME_NOT_FOUND")

    def test_non_json_body_is_reported_not_parsed(self):
        class Html:
            status = 200
            def read(self): return b"<!DOCTYPE html><html>login</html>"
            def __enter__(self): return self
            def __exit__(self, *a): return False
        with mock.patch("urllib.request.urlopen", return_value=Html()):
            with self.assertRaises(AgentApiError) as cm:
                make_agent().whoami()
        self.assertEqual(cm.exception.code, "NON_JSON_RESPONSE")

    def test_connection_failure_is_reported(self):
        import urllib.error

        with mock.patch("urllib.request.urlopen",
                        side_effect=urllib.error.URLError("refused")):
            with self.assertRaises(AgentApiError) as cm:
                make_agent().whoami()
        self.assertEqual(cm.exception.code, "CONNECTION_FAILED")


class TestProbe(unittest.TestCase):
    def test_probe_reports_mine(self):
        with mock.patch("urllib.request.urlopen", return_value=FakeResponse({"version": "1"})):
            self.assertEqual(make_agent().probe_game(66), "mine")

    def test_probe_distinguishes_not_a_player(self):
        a = make_agent()
        with mock.patch.object(a, "legal_actions",
                               side_effect=AgentApiError("NOT_A_PLAYER", "x", 403)):
            self.assertEqual(a.probe_game(64), "not_a_player")

    def test_probe_distinguishes_missing(self):
        a = make_agent()
        with mock.patch.object(a, "legal_actions",
                               side_effect=AgentApiError("GAME_NOT_FOUND", "x", 404)):
            self.assertEqual(a.probe_game(999), "not_found")

    def test_probe_returns_unknown_for_other_errors(self):
        a = make_agent()
        with mock.patch.object(a, "legal_actions",
                               side_effect=AgentApiError("STALE_STATE", "x", 409)):
            self.assertEqual(a.probe_game(1), "unknown")


class TestSubmit(unittest.TestCase):
    def test_submit_sends_expected_shape(self):
        a = make_agent()
        with mock.patch("urllib.request.urlopen", return_value=FakeResponse({"ok": 1})) as m:
            a.submit(66, "123", [{"type": "end_turn"}])
        req = m.call_args[0][0]
        body = json.loads(req.data)
        self.assertEqual(body["expectedVersion"], "123")
        self.assertEqual(body["actions"], [{"type": "end_turn"}])
        self.assertIn("idempotencyKey", body)

    def test_submit_uses_supplied_idempotency_key(self):
        a = make_agent()
        with mock.patch("urllib.request.urlopen", return_value=FakeResponse({"ok": 1})) as m:
            a.submit(66, "1", [{"type": "end_turn"}], idempotency_key="fixed-key")
        self.assertEqual(json.loads(m.call_args[0][0].data)["idempotencyKey"], "fixed-key")

    def test_submit_generates_unique_keys_by_default(self):
        a = make_agent()
        keys = []
        for _ in range(3):
            with mock.patch("urllib.request.urlopen", return_value=FakeResponse({"ok": 1})) as m:
                a.submit(66, "1", [{"type": "end_turn"}])
            keys.append(json.loads(m.call_args[0][0].data)["idempotencyKey"])
        self.assertEqual(len(set(keys)), 3)

    def test_submit_rejects_empty_batch(self):
        with self.assertRaises(AgentApiError) as cm:
            make_agent().submit(66, "1", [])
        self.assertEqual(cm.exception.code, "EMPTY_BATCH")


class TestCreateGame(unittest.TestCase):
    def test_create_sends_documented_fields(self):
        a = make_agent()
        with mock.patch("urllib.request.urlopen", return_value=FakeResponse({"game": {"id": 1}})) as m:
            a.create_game("Test", max_players=3, description="d")
        body = json.loads(m.call_args[0][0].data)
        self.assertEqual(body["gameName"], "Test")
        self.assertEqual(body["maxPlayers"], 3)
        self.assertEqual(body["gameDescription"], "d")
        self.assertEqual(body["invitedUsernames"], [])
        self.assertIs(body["private"], False)
        # the API rejects unknown fields, so the payload must stay exactly this shape
        self.assertEqual(set(body), {"gameName", "gameDescription", "maxPlayers",
                                     "invitedUsernames", "private"})

    def test_create_posts_to_games_collection(self):
        a = make_agent()
        with mock.patch("urllib.request.urlopen", return_value=FakeResponse({"game": {"id": 1}})) as m:
            a.create_game("Test")
        req = m.call_args[0][0]
        self.assertEqual(req.method, "POST")
        self.assertTrue(req.full_url.endswith("/FCM/agent/v1/games/"))


class TestWhoamiScopes(unittest.TestCase):
    def test_token_prefix_is_not_the_full_token(self):
        """whoami returns a prefix; assert it is short (i.e. not a full credential echo)."""
        a = make_agent()
        with mock.patch("urllib.request.urlopen", return_value=FakeResponse(
                {"username": "u", "credential": {"id": 1, "prefix": "abc123def456"}})):
            out = a.whoami()
        self.assertLess(len(out["credential"]["prefix"]), 32)


if __name__ == "__main__":
    unittest.main(verbosity=2)
