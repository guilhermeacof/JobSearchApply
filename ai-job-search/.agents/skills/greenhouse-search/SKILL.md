---
name: greenhouse-search
version: 1.0.0
description: >
  Use this skill to search job listings across Brazilian companies that host their
  careers on Greenhouse (per-company ATS boards), aggregated into one search. Invoke
  when the user wants to find jobs / vacancies at companies like Inter, Nubank,
  QuintoAndar, VTEX, Zup, Wellhub/Gympass, EBANX, Stone, C6 Bank or RD Station, or to
  look up a specific Greenhouse posting. Trigger phrases (EN): find jobs on Greenhouse,
  search Greenhouse boards, jobs at Nubank / Inter / VTEX / QuintoAndar / Gympass,
  Brazilian tech company jobs. Gatilhos (PT): buscar vagas no Greenhouse, vagas no
  Nubank, vagas no Banco Inter, vagas na VTEX, vagas na QuintoAndar, vagas na Zup,
  vagas na Wellhub/Gympass, vaga de desenvolvedor, vaga de QA, analista de testes.
context: fork
allowed-tools: Bash(bun run skills/greenhouse-search/cli/src/cli.ts *)
---

# Greenhouse Search Skill

Search live job listings across **Brazilian companies hosted on Greenhouse**. Greenhouse
is a per-company ATS: each company has its own "board" identified by a **board token**.
This skill keeps a **registry** of company tokens (see `cli/src/companies.ts`), fetches
each company's jobs from the public Greenhouse Job Board API
(`boards-api.greenhouse.io/v1`), and **aggregates** them into a single search — no
authentication, no API key, and **zero runtime dependencies**: it runs with just `bun`.

Seed registry (all tokens verified live): **Banco Inter**, **Zup Innovation**,
**Nubank**, **QuintoAndar**, **Wellhub/Gympass**, **VTEX**, **EBANX**, **Stone**,
**C6 Bank**, **RD Station**.

## ⚠️ Uso pessoal

Isto consome a API pública do Greenhouse da mesma forma que os sites de carreira fazem.
Cada busca faz **1 request por empresa** do registro. **Mantenha o volume baixo e não use
para coleta em massa ou fins comerciais.** Use por sua conta e responsabilidade.

## When to use this skill

- Search openings across many Brazilian companies on Greenhouse by keyword (cargo, skill)
- Restrict to a single company by board token (`-c nubank`)
- Filter by location or posting recency
- Get the full description of a specific Greenhouse posting

## Commands

### Search job listings

```bash
bun run skills/greenhouse-search/cli/src/cli.ts search [-q "<termo>"] [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search over the **title** (client-side).
  Short terms like `qa` match as a whole word (they won't hit "qualidade"); longer terms
  match as accent-insensitive substrings. Multiple terms are AND-ed.
- `--location <text>` / `-l <text>` — filter by location (client-side substring), e.g.
  `"São Paulo"`, `"Remoto"`, `"MG"`.
- `--company <token>` / `-c <token>` — restrict to ONE company by board token, e.g.
  `nubank`, `inter`, `vtex`.
- `--jobage <days>` — updated within N days (client-side, on `updated_at`).
- `--page <n>` — page number (1-indexed); uses `--limit` as the page size.
- `--limit <n>` / `-n <n>` — page size / cap on results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run skills/greenhouse-search/cli/src/cli.ts detail <token:id | url> [--format json|plain]
```

`id` uses the `<token>:<jobId>` form from `search` results (e.g. `nubank:1234567`). You
may also pass a full Greenhouse job URL
(`https://job-boards.greenhouse.io/<token>/jobs/<id>`). Returns the full description as
clean text.

## Usage examples

```bash
# QA roles across all companies, first 8, as a table
bun run skills/greenhouse-search/cli/src/cli.ts search -q "qa" --limit 8 --format table

# Developer roles
bun run skills/greenhouse-search/cli/src/cli.ts search -q "desenvolvedor" --limit 10 --format table

# Test analyst roles
bun run skills/greenhouse-search/cli/src/cli.ts search -q "analista de testes" --format table

# Only Nubank, engineering roles
bun run skills/greenhouse-search/cli/src/cli.ts search -c "nubank" -q "engineer" --format table

# Remote roles updated in the last 14 days
bun run skills/greenhouse-search/cli/src/cli.ts search -l "Remoto" --jobage 14 --format table

# Full details for a specific posting
bun run skills/greenhouse-search/cli/src/cli.ts detail nubank:1234567 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

JSON search output is `{ "meta": { count, page, total, companies }, "results": [...] }`
where `companies` is the number of boards queried. Each result has at least `id`,
`title`, `company`, `location`, `date`, `url` (missing values are `null`, never omitted),
plus `department`. `id` is `<token>:<jobId>` so it can be passed straight to `detail`.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Adding more companies

Edit `cli/src/companies.ts` and add a `{ token, nome }` entry. To find and confirm a
token:

```bash
# The token is the <token> in a careers URL: job-boards.greenhouse.io/<token>
curl "https://boards-api.greenhouse.io/v1/boards/<token>/jobs" | head   # must return jobs
curl "https://boards-api.greenhouse.io/v1/boards/<token>"               # -> { "name": ... }
```

Only add tokens that actually return jobs from `boards-api.greenhouse.io`. See
`url-reference.md` for the full API documentation.

## Notes

- Data source: Greenhouse Job Board public API — no credentials required.
- **Per-company aggregation:** one HTTP request per registry company per search. Keep the
  registry a reasonable size (see personal-use note).
- `company` in results is the display name from the registry (`nome`), not a network call.
- Greenhouse has **no server-side keyword/location/age filter** on the board `/jobs`
  endpoint, so `--query`, `--location`, and `--jobage` are all applied client-side.
- The `content` field arrives as entity-escaped HTML; the CLI decodes and strips it into
  readable text for `detail`.
- A dead or renamed board token is skipped silently rather than failing the whole search.
- The API rate-limits under load; the CLI retries 429/5xx with exponential backoff.
