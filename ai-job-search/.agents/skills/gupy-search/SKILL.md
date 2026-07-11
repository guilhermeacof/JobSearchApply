---
name: gupy-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Brazil on Gupy
  (portal.gupy.io), Brazil's largest applicant tracking system — most large
  Brazilian companies post their openings there. Invoke for open positions,
  vacancies, and hiring across any sector or role in the Brazilian market.
  Trigger phrases: find a job in Brazil, Brazilian jobs, Gupy, vagas, vagas de
  emprego, buscar vagas, emprego, oportunidades, "vagas de X em <cidade>",
  processo seletivo, vaga remota.
context: fork
allowed-tools: Bash(bun run .agents/skills/gupy-search/cli/src/cli.ts *)
---

# Gupy Search Skill

Search live job listings from Gupy's public job portal (**portal.gupy.io**) — Brazil's
largest ATS, aggregating postings from every company career page hosted on Gupy.
Clean JSON API, no authentication, no API key, and **zero runtime dependencies** — it
runs with just `bun`.

## When to use this skill

- Search for job openings in Brazil by keyword, city, or workplace type
- Filter by recency (posted within N days) or remote/hybrid/onsite
- Get the full description, deadline, and employment type of a specific posting

## Commands

### Search job listings

```bash
bun run .agents/skills/gupy-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, role). Recommended. Portuguese terms work best: `"analista de testes"`, `"qa sênior"`, `"desenvolvedor java"`.
- `--location <city>` / `-l <city>` — filter by city, e.g. `"São Paulo"`, `"Belo Horizonte"`. Note: remote jobs usually have an empty city, so don't combine `-l` with `--remote remote`.
- `--remote <mode>` — `remote`, `hybrid`, or `onsite` (maps to Gupy's `workplaceType`).
- `--jobage <days>` — posted within N days. **Client-side filter** (the API has no server-side date filter), applied per page after fetching.
- `--page <n>` — page number (1-indexed, 10 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/gupy-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `11617787`). You may also pass a
full Gupy job URL (`https://<empresa>.gupy.io/job/<token>`) — the CLI decodes the job ID
from the URL token. Returns the full description, employment type, workplace type,
application deadline, and the company career-page link.

## Usage examples

```bash
# QA / test analyst roles, most recent first
bun run .agents/skills/gupy-search/cli/src/cli.ts search -q "analista de testes" --format table

# Senior QA, remote only, last 14 days
bun run .agents/skills/gupy-search/cli/src/cli.ts search -q "qa sênior" --remote remote --jobage 14 --format table

# Test automation roles in São Paulo
bun run .agents/skills/gupy-search/cli/src/cli.ts search -q "automação de testes" -l "São Paulo" --format table

# Hybrid QA roles, page 2
bun run .agents/skills/gupy-search/cli/src/cli.ts search -q "quality assurance" --remote hybrid --page 2 --format table

# Full details for a specific job
bun run .agents/skills/gupy-search/cli/src/cli.ts detail 11617787 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data comes from `employability-portal.gupy.io/api/v1/jobs` — the JSON API behind
  portal.gupy.io. `portal.gupy.io/robots.txt` allows all paths; no login required.
- The search response already includes the full description; `detail` fetches the same
  job by ID and returns it cleaned (tags stripped, entities decoded).
- The JSON `meta.total` field reports the portal-wide total for the query, useful for
  deciding whether to paginate.
- Search results also carry `workplaceType` (`remote`/`hybrid`/`on-site`) and `deadline`
  (application deadline, `YYYY-MM-DD`) beyond the standard contract fields.
- Unknown query parameters make the API return 400 — if you extend the CLI, verify new
  params live first.
- Keep volume low; the CLI retries 429/5xx with exponential backoff.
