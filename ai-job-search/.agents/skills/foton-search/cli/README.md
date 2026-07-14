# foton-cli

CLI for searching openings on **Fóton Informática**'s own careers page
(`https://www.foton.la/vagas/`). Single-company skill — the `company` field is always
"Fóton Informática".

**Data source**: server-rendered HTML of `/vagas/` (listing) and each vaga's slug page (detail).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch` + regex parsing). `bun install` is optional and only pulls dev type defs.

> The Fóton site is WordPress + Elementor. The `/vagas/` listing is fully server-rendered
> (every open vacancy is in the HTML as an accordion card), and there is **no jobs API**
> (`wp-json` exposes no vaga post type). This CLI therefore scrapes the HTML. **Personal
> use only** — keep volume low, no bulk/commercial use.

## Installation

```bash
cd .agents/skills/foton-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | List / filter Fóton openings |
| `detail` | Fetch full description for a single vaga (by slug or URL) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# All open vacancies as a table
bun run src/cli.ts search --limit 10 --format table

# QA / testing roles
bun run src/cli.ts search -q "teste" --format table

# Remote-only roles
bun run src/cli.ts search -l "remoto" --format table

# Full detail for one vaga
bun run src/cli.ts detail analista-de-teste-hibrido-sao-paulo-sp --format plain
```

See `../SKILL.md` for the full flag reference and the personal-use note, and
`../url-reference.md` for the HTML anchors and field mapping.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Filter (client-side) by keyword in the title/location. |
| `--location` | `-l` | Filter (client-side) by location/work model (e.g. `remoto`, `São Paulo`). |
| `--jobage` | | **Not supported** — the listing exposes no posting date. Accepted but ignored. |
| `--page` | | 1-indexed page (20 results/page, over the client-side-filtered list). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
