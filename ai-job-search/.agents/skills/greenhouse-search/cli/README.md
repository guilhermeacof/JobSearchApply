# greenhouse-cli

CLI for searching jobs across **Brazilian companies hosted on Greenhouse**. Greenhouse is
a per-company ATS: each company has its own board (a "board token"). This CLI iterates
over a registry of tokens (`src/companies.ts`) and **aggregates** the jobs.

**Data source**: Greenhouse Job Board public API (`boards-api.greenhouse.io/v1` — list per
board, and detail per job).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> Each search makes **one request per company** in the registry. **Personal use only** —
> keep volume low, no bulk/commercial use.

## Installation

```bash
cd .agents/skills/greenhouse-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Aggregate and search jobs across the company registry |
| `detail` | Fetch full detail for a single job (`<token>:<id>` or URL) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts
`--format json|plain`. All errors are written to **stderr** as
`{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# QA roles across all companies, first 8
bun run src/cli.ts search -q "qa" --limit 8 --format table

# Developer roles
bun run src/cli.ts search -q "desenvolvedor" --limit 10 --format table

# Only Nubank
bun run src/cli.ts search -c "nubank" -q "engineer" --format table

# Full detail for one job
bun run src/cli.ts detail nubank:1234567 --format plain
```

See `../SKILL.md` for the full flag reference and the personal-use note, and
`../url-reference.md` for the API endpoints, the company registry, and field mapping.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords over the title (client-side). Short terms like `qa` match whole-word. |
| `--location` | `-l` | Filter by location (client-side substring). |
| `--company` | `-c` | Restrict to one company by board token (e.g. `nubank`). |
| `--jobage` | | Updated within N days (client-side, on `updated_at`). |
| `--page` | | 1-indexed page (uses `--limit` as page size). |
| `--limit` | `-n` | Page size / cap on results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

## Adding a company

Edit `src/companies.ts`, add `{ token, nome }`. Confirm the token first:

```bash
curl "https://boards-api.greenhouse.io/v1/boards/<token>/jobs" | head   # must return jobs
curl "https://boards-api.greenhouse.io/v1/boards/<token>"               # -> { "name": ... }
```

## Tests

```bash
bun run typecheck
bun run test
```
