# How an agent uses this knowledge base

This answers a specific question: **once the wiki exists, how does a model actually call it
during a game?**

Short answer: **the wiki is plain markdown on disk — there is no service to run and no API key.**
An agent reads it with whatever file/search tools it already has. Below are the four integration
options, from simplest to most elaborate, with the trade-offs stated honestly.

---

## First, an important distinction: pattern vs. product

There are two different things called "llmwiki":

| | What it is | What this repo does |
|---|---|---|
| **The LLM Wiki *pattern*** | Karpathy's idea: compile sources into interlinked markdown so knowledge compounds instead of being re-derived per query | ✅ **This repo implements this.** `SCHEMA.md` + `raw/` + `wiki/` + `index.md` + `log.md` |
| **`lucasastorian/llmwiki` *the application*** | A specific Node/Python app: web UI, Chrome extension, SQLite FTS index, MCP server, Postgres/S3 hosted mode | ❌ **Not used.** We borrowed its conventions (including its `guide` tool's page structure and frontmatter fields) but did not install or run it |

**Why we didn't install the app:** it is designed for *humans collecting documents* — a browser
clipper, an upload UI, nightly autonomous synthesis. Our need is narrower: a **small, fixed,
high-precision rule corpus** that an agent queries mid-game and that stays verifiable. The app
would add a runtime, an index to rebuild, and a Postgres/SQLite layer — all of which can drift
out of sync with the markdown that is supposed to be the source of truth.

**If you want the app anyway**, it is compatible: point `llmwiki open <dir>` at this repository and
it will index `raw/` and treat `wiki/` as the compiled layer. The `wiki/overview.md` hub and the
frontmatter fields (`title`, `description`, `date`/`updated`, `tags`) already match its `guide`
contract. Nothing here blocks adopting it later.

---

## Option 1 — Read the files directly (simplest, recommended to start)

The agent already has file-reading tools. No server, no index, no network.

```
1. Read wiki/overview.md            # once per game: orientation + high-risk rules
2. When a rule question arises:
     read wiki/references/<page>.md  # dense lookup tables, small enough to read whole
   or search across wiki/ for a term
3. Never act on a remembered rule — read it.
```

Works with: any agent that can read files (Claude Code, Codex, Hermes, a plain script).

**Pros:** zero infrastructure, the markdown is the single source of truth, nothing to keep in sync.
**Cons:** the agent must decide *what* to read; on a large wiki it can miss the relevant page.

## Option 2 — CLI query tool (recommended default)

`scripts/ask.py` gives a search interface over the same files. Still no server, no dependencies.

```bash
python3 scripts/ask.py "how is unit price computed"
python3 scripts/ask.py "can I fire a busy marketeer"
python3 scripts/ask.py --page milestones-overview      # whole page
python3 scripts/ask.py "coffee route" --json           # machine-readable
```

Key behaviours built for agent use:

- Returns the **matching section**, not the whole page — keeps context small.
- Reports the page's declared `confidence` alongside the answer.
- **Refuses off-domain questions.** Below a score threshold it prints
  `No confident match … This knowledge base does not appear to cover that question` and exits
  non-zero, instead of returning a weak match that looks like an answer. This was added after
  adversarial testing showed "pokemon type chart" matching a page on the incidental word "type".

Expose it to a model as a single tool:

```python
ask(query: str) -> {
    "covered": bool,          # False ⇒ the wiki does not cover this; do NOT act on it
    "best_score": float,
    "results": [{"title", "path", "confidence", "snippet"}],
    "weak_matches": [...]     # explicitly NOT answers
}
```

> ⚠️ **Honour the `covered` flag.** An agent that treats a `covered: false` result as an answer
> reintroduces exactly the hallucination risk the threshold exists to prevent.

## Option 3 — MCP server (for MCP-capable clients)

If the agent speaks MCP, wrap the same two operations as tools. The llmwiki app exposes a
`guide`/`search`/`read` shape; ours is deliberately smaller:

| Tool | Wraps | Purpose |
|---|---|---|
| `fcm_rules_search` | `scripts/ask.py --json` | find the relevant section |
| `fcm_rules_read` | read a `wiki/**/*.md` path | read a whole reference page |
| `fcm_rules_list` | `scripts/ask.py --list` | enumerate pages |

**Not implemented here** — the repo ships the query layer, not a server, because Options 1 and 2
already cover the in-game need and an MCP server is one more process to keep alive. If you want it,
the natural home is the same MCP server that already talks to the game API (see
[`../src/README.md`](../src/README.md)), so the agent has one connection for both "what are the
rules" and "what can I do".

## Option 4 — Embed in the system prompt (small pages only)

`wiki/references/*` are dense; the highest-value ones can be pasted directly into a system prompt:

| Page | Size | Worth inlining? |
|---|---|---|
| `milestones-overview.md` | ~8.7 KB | ⚠️ large, but highest value |
| `employees-overview.md` | ~7.3 KB | ⚠️ large |
| `wiki/overview.md` | ~5.2 KB | ✅ yes — orientation + traps |

**Recommended:** inline `wiki/overview.md` (it carries the high-risk cases in ~5 KB) and query the
rest. See [`agent-system-prompt.md`](agent-system-prompt.md) for a ready-made prompt.

---

## Which option should you use?

```
In-game rule lookup during play?          → Option 2 (ask.py), fall back to Option 1
MCP-capable client, want one connection?  → Option 3 (wrap ask.py; add to the game MCP server)
Want the least moving parts?              → Option 1 (just read the files)
Small context budget, want orientation?   → Option 4 (inline overview.md) + Option 2 for detail
```

## Design rule that matters more than the transport

**The wiki holds the rules; the game API holds legality.** Never let the wiki's content be treated
as a list of legal moves, and never let the API be treated as a rules oracle. Keeping those apart
is what stops an agent from inventing a move that "the rules allow" but the engine will reject —
and vice versa. See [`../src/README.md`](../src/README.md) for the API side.

## Keeping the wiki honest

Whatever transport you choose, the content guarantees come from the test suite, not the transport:

```bash
python3 -m pytest tests/ -q     # quote fidelity, citation ranges, corpus sanity, calibration
python3 scripts/lint.py         # links, orphans, frontmatter, tags, secrets, index coverage
```

`tests/test_content_integrity.py` is adversarial by design: it tries to *falsify* the wiki
(do the "verbatim" quotes actually exist in the source? do cited pages exist? does an off-domain
query get refused?). Run it before trusting a new page.
