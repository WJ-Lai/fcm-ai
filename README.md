# fcm-ai

**Tools for building an AI that plays [Food Chain Magnate](https://boardgamegeek.com/boardgame/175914/food-chain-magnate).**

Two parts:

1. **`wiki/` — the rulebook as an agent-queryable knowledge base.** The official FCM rulebook
   compiled into interlinked markdown, every claim cited to a page number, so a model can look up
   a rule mid-game instead of hallucinating one. Built on the
   [LLM Wiki](https://github.com/lucasastorian/llmwiki) pattern (Karpathy's
   [LLM Wiki concept](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)).
2. **`src/` — an agent client and policy code for the
   [OnlineBoardGamers](https://www.onlineboardgamers.com/) Agent API.** Policy experiments import
   the cloneable official-engine environment from the sibling OBG server checkout, so online play
   and reproducible offline evaluation use the same rules authority.

## Why a wiki instead of RAG

FCM is unusually strict about ordering and edge cases. The rulebook itself warns:

> *"Food Chain Magnate is a highly unforgiving game. If you make a mistake, it can be very hard
> or even impossible to get back on track."* — base rules, p.14

A model asked "how is unit price computed?" will confidently produce a *nearly* right answer.
The dangerous misrememberings are systematic, not random:

| Commonly believed | Actually |
|---|---|
| Marketing bonuses raise your price | Bonuses affect **income**, never **unit price** — they don't win you houses |
| Garden doubles your sale | Garden doubles **unit price only**; bonuses are added after |
| A milestone you didn't take last turn is still available | Claimed once → **removed in phase 7**, gone forever |
| Hiring a card lets you use it | New hires go **on the beach**; they act next turn |
| I can fire a busy marketeer | Normally **cannot** |
| Overfilling the structure just wastes cards | **All non-CEO cards go to the beach**; you play with the CEO alone |

Each of these is corrected on a page, with the exact rulebook sentence and page number, so the
answer is **checkable** rather than plausible.

## Layout

```
fcm-ai/
├── SCHEMA.md              # conventions + tag taxonomy the wiki obeys
├── TODOS.md               # dependency-ordered AI implementation and promotion gates
├── index.md               # content catalog — read this first
├── log.md                 # append-only action log
├── raw/                   # Layer 1: immutable source material
│   └── rules/
│       ├── fcm-base-rules-eng-v4.pdf        # official rulebook (md5 409b9718…)
│       ├── fcm-base-rules-eng-v4.txt        # extracted text, sha256 in frontmatter
│       ├── fcm-ketchup-expansion-rules.pdf  # official expansion (md5 65d0538a…)
│       └── fcm-ketchup-expansion-rules.txt
├── fixtures/base-v1/      # seeded official-engine snapshots for every base decision phase
├── wiki/                  # Layer 2: agent-maintained pages
│   ├── overview.md        # hub page + the 11 most-misremembered rules
│   ├── concepts/          # mechanics (sales, salary, structure, marketing, expansion modules)
│   ├── references/        # fast lookups (milestones, employees, actions, setup, expansion)
│   └── playbooks/         # rules-as-procedure (milestone racing)
├── scripts/
│   ├── ask.py             # query the wiki from the CLI (no deps, no API key)
│   ├── card.py            # look up any employee/milestone card by name (EN or 中文)
│   ├── extract_cards.py   # regenerate card data from the game engine
│   ├── verify_sources.py  # audit every card's provenance against the rulebooks
│   ├── probe_api.py       # live read-only probe verifying the wire mapping (needs token)
│   ├── check_wire_drift.py# offline: wiki page ↔ wire-format.json ↔ engine source
│   ├── lint.py            # link/orphan/frontmatter/tag/secret/index checks
│   ├── run_offline_benchmark.mjs # seeded official-engine policy benchmark
│   └── extract_rules.py   # regenerate raw/*.txt from the PDFs (repairs PDF artifacts)
├── src/                   # Agent API client + deterministic weak baseline
├── tests/                 # adversarial content, contract and engine-fixture tests
└── docs/
    ├── agent-integration.md     # how an agent calls this wiki (4 options, trade-offs)
    ├── agent-system-prompt.md   # drop-in prompt for a game-playing agent
    ├── fcm-ai-architecture.md   # strategy-capable AI design, MCP gap audit, RL roadmap
    ├── policy-contracts.md      # strict DecisionView / trajectory / result boundary
    └── legal.md
```

## Querying the wiki

No build step, no index, no dependencies — it reads the markdown directly so the wiki stays the
single source of truth.

```bash
python3 scripts/ask.py "how is unit price computed"
python3 scripts/ask.py "can I fire a busy marketeer"
python3 scripts/ask.py "does a garden double the bonus"
python3 scripts/ask.py --list                     # all pages
python3 scripts/ask.py --page milestones-overview # full page
python3 scripts/ask.py "freezer" --json           # for programmatic use
```

**Card lookup** — exact text for any of the 94 employee/milestone cards, EN or 中文,
sourced from the game engine itself:

```bash
python3 scripts/card.py "Errand Boy"      # exact card lookup
python3 scripts/card.py "跑腿伙计"          # Chinese name works too
python3 scripts/card.py --expansion        # list the 22 expansion-only cards
python3 scripts/card.py --milestones       # all 40 milestones
python3 scripts/card.py --search "drink"   # full-text over card text
```

Off-domain queries are **refused with a non-zero exit code** rather than answered with an
irrelevant card — a query must share a meaningful term with the card set.

Output includes the **matched section** (not the whole page), the page path, and the page's
declared `confidence`, so the agent can see whether it's reading a verified rule or a judgment
call.

## Using it from an agent

1. Read [`wiki/overview.md`](wiki/overview.md) once per game — it carries the orientation and the
   high-risk rules.
2. During play, query `scripts/ask.py` (or read `wiki/references/*` directly — they're small and
   dense) whenever a rule decision is being made.
3. Never act on an FCM rule the agent "remembers" — the wiki exists precisely because that
   memory is unreliable.

**Full write-up of the integration options** (direct file reads / CLI tool / MCP server / system
prompt inlining, with trade-offs) → [`docs/agent-integration.md`](docs/agent-integration.md).
A ready-to-use prompt → [`docs/agent-system-prompt.md`](docs/agent-system-prompt.md).

To build an Agent that does more than select legal moves, read
[`docs/fcm-ai-architecture.md`](docs/fcm-ai-architecture.md). It explains why the current MCP is a
control layer rather than a winning policy, and lays out the recommended deterministic planner,
LLM, search and reinforcement-learning roadmap.

> 📌 **Note on "llmwiki".** This repo implements the LLM Wiki *pattern* (Karpathy's) and follows
> the `lucasastorian/llmwiki` conventions — `SCHEMA.md` / `raw/` / `wiki/` / `index.md` / `log.md`,
> and its `guide` frontmatter contract. It does **not** install or run the llmwiki *application*
> (web UI, Chrome extension, SQLite FTS index, MCP server). The wiki is plain markdown: no service,
> no index to rebuild, no API key. See `docs/agent-integration.md` for why, and for how to adopt
> the app later if you want it.

## Tests and lint

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -q  # 104 tests, stdlib only
python3 scripts/lint.py         # links / orphans / frontmatter / tags / secrets / index
node --test src/baselines.test.mjs
node scripts/run_offline_benchmark.mjs --players 2 --episodes 1 --max-commands 250
node scripts/run_offline_benchmark.mjs --policy random-legal --players 2 --episodes 1 --max-commands 500
```

`tests/test_content_integrity.py` is **adversarial** — it tries to falsify the wiki rather than
confirm it:

- Do the blockquoted "verbatim" rules **actually exist** in the raw source?
- Are the **cited page numbers** real, and does the citation parse at all?
- Is the extracted corpus free of PDF breakage (`Th e`, `Aft er`) that would confuse a model?
- Does an **off-domain** query ("pokemon type chart") get **refused** instead of answered?
- Are unverifiable claims honestly marked rather than stated as fact?

This suite earned its keep: it caught a missing `/FCM/agent/v1/games/create/` assumption, a
spread-page citation mismatch, and a real quote-fidelity problem during development.

## Provenance & accuracy

- Every rules claim carries a citation like `(base rules, p.11)` pointing into `raw/rules/`.
- Each page declares `confidence: high | medium | low` and `verified_against: base | ketchup`.
- `raw/` is **immutable**. Corrections go into wiki pages, never into sources.
- **Known gap:** per-card supply counts (how many copies of each employee card exist) are a
  *graphic* in the PDF and are **not** reliably text-extractable. They are marked `unverified`
  rather than guessed — if a decision depends on card scarcity, check the physical set.
- **Not yet compiled:** the Ketchup expansion rulebook is staged in `raw/` but has no wiki pages
  yet.

Two published errata-worthy ambiguities are tracked rather than silently resolved — see the
"Known gaps" section of [`index.md`](index.md).

## License

MIT — see [LICENSE](LICENSE). The rulebook PDFs in `raw/` are the property of **Splotter Spellen**
and are included as reference material only; see
[docs/legal.md](docs/legal.md).
