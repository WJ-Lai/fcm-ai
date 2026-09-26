# Legal notes

## The rulebook PDFs in `raw/`

The `raw/rules/*.pdf` files are **official rulebooks published by Splotter Spellen**, the publisher
of *Food Chain Magnate*. They are **not** covered by this repository's MIT license.

They are included here as **reference material** for a personal, non-commercial project: the wiki
pages cite specific pages, and a reader needs the source to verify a citation. This is a
fair-use-style inclusion for commentary and interoperability, not a redistribution claim.

If you fork this repository for anything public-facing or commercial, **remove `raw/*.pdf`** and
obtain the rulebooks yourself (they ship with the game, and Splotter publishes them on their site
and on BoardGameGeek). The extracted `.txt` files are derived from those PDFs and should be
treated under the same terms.

## Game content and names

*Food Chain Magnate* and the names of its cards (employees, milestones, campaigns) are the
intellectual property of Splotter Spellen. This project is **unaffiliated with and unendorsed by
Splotter Spellen**.

The wiki pages describe rules in original prose with short quotations for precision. Quotations
are attributed and page-cited.

## OnlineBoardGamers

The Agent API client in `src/` targets
[OnlineBoardGamers-Server](https://github.com/DodgerB85/OnlineBoardGamers-Server), which is
distributed under a **Source Available** license — not a standard open-source license:

- ✅ personal use, submitting pull requests
- ❌ commercial use, public hosting (without the author's permission)

This repository does **not** vendor or redistribute OBG code; the client talks to an API over
HTTP. If you run an OBG server yourself, comply with that project's license separately. Credentials
for the Agent API are **yours** and must never be committed.

## This repository's own license

MIT applies to: the wiki pages, `scripts/`, `src/`, and documentation. See [../LICENSE](../LICENSE).
