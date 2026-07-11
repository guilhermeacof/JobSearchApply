---
name: vagas-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Brazil on
  Vagas.com.br, one of Brazil's oldest and largest job boards. Invoke for open
  positions, vacancies, and hiring across any sector or role in the Brazilian
  market. Trigger phrases: find a job in Brazil, Brazilian jobs, Vagas.com,
  vagas, vagas de emprego, buscar vagas, emprego, oportunidades, "vagas de X",
  processo seletivo, oportunidade de emprego.
context: fork
allowed-tools: Bash(bun run .agents/skills/vagas-search/cli/src/cli.ts *)
---

# Vagas.com.br Search Skill

Search live job listings from **Vagas.com.br**'s public search pages — one of Brazil's
most traditional job boards. No authentication, no API key, and **zero runtime
dependencies** — it runs with just `bun`.

## ⚠️ Personal use only

This uses Vagas.com.br's public pages. The site's robots.txt allows general access but
blocks AI crawlers and signals `ai-train=no`, so **keep volume low and don't use it
commercially or for bulk data collection.** Run it on your own responsibility.

## When to use this skill

- Search for job openings in Brazil by keyword (job title, skill, role)
- Filter by recency (posted within N days)
- Get the full description and seniority level of a specific posting

## Commands

### Search job listings

```bash
bun run .agents/skills/vagas-search/cli/src/cli.ts search --query "<termo>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** The search term, slugified into the
  URL (`"analista de testes"` → `/vagas-de-analista-de-testes`). There is no separate
  location parameter — to scope by city, include it in the query:
  `-q "analista de testes sao paulo"`.
- `--jobage <days>` — posted within N days. **Client-side filter** on the card date.
- `--page <n>` — page number (1-indexed, ~20 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/vagas-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job ID from `search` results (e.g. `2823863` or `v2823863`). You may also
pass a full detail URL (`https://www.vagas.com.br/vagas/v2823863/...`). Returns the full
description, seniority level, location, and publication date.

## Usage examples

```bash
# QA / test analyst roles
bun run .agents/skills/vagas-search/cli/src/cli.ts search -q "analista de testes" --format table

# Senior QA, last 14 days
bun run .agents/skills/vagas-search/cli/src/cli.ts search -q "qa senior" --jobage 14 --format table

# Test analyst roles in São Paulo (city goes inside the query)
bun run .agents/skills/vagas-search/cli/src/cli.ts search -q "analista de testes sao paulo" --format table

# Page 2 of test automation roles
bun run .agents/skills/vagas-search/cli/src/cli.ts search -q "automacao de testes" --page 2 --format table

# Full details for a specific job
bun run .agents/skills/vagas-search/cli/src/cli.ts detail 2823863 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- The site serves **ISO-8859-1**, not UTF-8 — the CLI decodes the charset from the
  Content-Type header, so accented Portuguese text comes out clean.
- Search results also carry `level` (seniority, e.g. "Júnior/Trainee", "Sênior") and a
  short `snippet` beyond the standard contract fields — useful for pre-filtering
  before calling `detail`.
- Remote jobs show location `"100% Home Office"`; hybrid ones may say e.g.
  `"Híbrido (São Paulo)"`.
- There is no server-side date filter or location parameter; `--jobage` filters
  client-side and location goes inside the query term.
- Keep volume low; the CLI retries 429/5xx with exponential backoff.
