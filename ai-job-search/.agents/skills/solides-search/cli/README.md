# solides-cli

CLI for searching the **public Sólides jobs board** (`vagas.solides.com.br`) — a Brazilian
**multi-company** board that aggregates openings from every company that runs its careers
site on Sólides.

**Data source**: Sólides public JSON API gateway (`apigw.solides.com.br/jobs/v3/portal-vacancies-new` — list, and `/portal-vacancy/<id>` — detail).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> The board is a client-rendered Next.js app whose `__NEXT_DATA__` ships empty pageProps, so
> there is no server-rendered HTML to scrape. This CLI calls the same public JSON API the site
> itself uses. **Personal use only** — keep volume low, no bulk/commercial use.

## Installation

```bash
cd .agents/skills/solides-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings across all companies on the board |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Developer roles, first 5
bun run src/cli.ts search -q "desenvolvedor" --limit 5 --format table

# QA / test roles in São Paulo
bun run src/cli.ts search -q "analista de testes" -l "São Paulo - SP" --format table

# QA roles, last 7 days
bun run src/cli.ts search -q "qa" --jobage 7 --format table

# Full detail for one job
bun run src/cli.ts detail pgB7MzjNbT --format plain
```

See `../SKILL.md` for the full flag reference and the personal-use note, and
`../url-reference.md` for the API endpoints and field mapping.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords matched against the job **title** (cargo / tecnologia / skill). |
| `--location` | `-l` | Location filter, `Cidade - UF` format (e.g. `São Paulo - SP`). A bare UF does not match. |
| `--area` | `-a` | Área de atuação slug (`tecnologia`, `administrativo`, `marketing`, …). |
| `--jobage` | | Posted within N days (client-side filter on `createdAt`). |
| `--page` | | 1-indexed page (10 results/page; page size is fixed server-side). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
