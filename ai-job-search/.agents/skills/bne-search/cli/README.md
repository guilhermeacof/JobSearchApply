# bne-cli

CLI for searching jobs on **BNE — Banco Nacional de Empregos** (https://www.bne.com.br), a
large general-purpose Brazilian job board.

**Data source**: BNE public server-rendered pages — `/vagas-de-emprego/<slug>` (listing) and
`/vagas-de-emprego/GetJobCard?id=<id>` (single-job HTML fragment, used for `detail` and to
enrich search results).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch` + regex HTML parsing). `bun install` is optional
and only pulls dev type defs.

> The listing page is server-rendered HTML, so the cards are scraped directly. The canonical
> URL, salary and date of each posting come from BNE's own `GetJobCard` fragment.
> **Personal use only** — keep volume low, no bulk/commercial use.

## Installation

```bash
cd .agents/skills/bne-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# QA roles, first 5
bun run src/cli.ts search -q "analista qa" --limit 5 --format table

# Developer roles in Brasília
bun run src/cli.ts search -q "desenvolvedor" -l "Brasília" --format table

# Fast keyword scan (single request, no per-result enrichment)
bun run src/cli.ts search -q "qualidade" --no-detail --limit 10 --format table

# Full detail for one job
bun run src/cli.ts detail 6085020 --format plain
```

See `../SKILL.md` for the full flag reference and the personal-use note, and
`../url-reference.md` for the endpoints and HTML anchors.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (cargo / tecnologia / skill). |
| `--location` | `-l` | Filter by city (`Brasília`, `São Paulo`) — appended to the slug as `-em-<cidade>`. |
| `--jobage` | | Posted within N days (client-side filter on the relative date text). |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Cap results emitted (also caps detail requests). |
| `--no-detail` | | One request total; `url`/`salary`/`date` come back `null`. |
| `--format` | | `json` \| `table` \| `plain`. |

## Notes

- By default `search` makes **one `GetJobCard` request per emitted result** to resolve the
  canonical URL, company and salary — use `--limit` (and `--no-detail` for a quick scan) to
  keep volume low.
- `date` is BNE's relative Portuguese string (e.g. `há 13 horas`), sometimes absent.
