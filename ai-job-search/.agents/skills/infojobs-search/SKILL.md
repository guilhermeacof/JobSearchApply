---
name: infojobs-search
version: 1.0.0
description: >
  Use this skill to search job listings on InfoJobs Brasil (infojobs.com.br), one of
  the largest general job boards in Brazil, covering roles across every sector and
  region. Invoke when the user wants to find jobs / vacancies in Brazil on InfoJobs,
  filter by state or city, or look up a specific InfoJobs posting. Trigger phrases
  (EN): find a job on InfoJobs, search InfoJobs jobs, jobs in Brazil, look up this
  InfoJobs posting, vacancies Brazil. Gatilhos (PT): buscar vagas no InfoJobs, vagas
  Brasil, procurar emprego no InfoJobs, vagas de emprego no Brasil, ver esta vaga do
  InfoJobs, vaga de analista, vaga de QA, vaga de qualidade, vagas em São Paulo.
context: fork
allowed-tools: Bash(bun run skills/infojobs-search/cli/src/cli.ts *)
---

# InfoJobs Brasil Search Skill

Search live job listings from **InfoJobs Brasil** (`https://www.infojobs.com.br`), one of
the largest general-purpose job boards in Brazil. Unlike niche tech boards, InfoJobs covers
roles across every sector (industry, retail, health, admin, TI, etc.) and every state.

It reads InfoJobs' **server-rendered public pages** (search results and posting detail) and
parses them with chunked regex — no authentication, no API key, no headless browser, and
**zero runtime dependencies**: it runs with just `bun`.

> Listing and viewing public vacancies on InfoJobs requires **no login**. `robots.txt`
> does not disallow the search (`/vagas-de-emprego-*.aspx`, `/empregos.aspx`) or the
> detail (`/vaga-de-*__<id>.aspx`) paths.

## ⚠️ Uso pessoal

Isto lê as páginas públicas do InfoJobs Brasil da mesma forma que um navegador. **Mantenha o
volume baixo e não use para coleta em massa ou fins comerciais.** Use por sua conta e
responsabilidade.

## When to use this skill

- Search InfoJobs Brasil openings by keyword (cargo, tecnologia, skill)
- Filter by location (estado or cidade)
- Filter by posting recency
- Get the full description of a specific InfoJobs posting

## Commands

### Search job listings

```bash
bun run skills/infojobs-search/cli/src/cli.ts search [-q "<termo>"] [flags]
```

Key flags:
- `--query <texto>` / `-q <texto>` — keyword search (cargo, tecnologia, skill). Recommended.
- `--location <texto>` / `-l <texto>` — filter by location. Use a **state or city name**
  (e.g. `"São Paulo"`, `"Rio de Janeiro"`, `"Minas Gerais"`). Accents/casing don't matter —
  the term is slugified into InfoJobs' URL.
- `--jobage <dias>` — posted within N days (client-side filter on the posting date; InfoJobs'
  search URL has no age parameter). Omit for all postings.
- `--page <n>` — page number (1-indexed, ~20 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run skills/infojobs-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric vacancy id from `search` results (e.g. `11794540`). You may also pass a
full `https://www.infojobs.com.br/vaga-de-<slug>__<id>.aspx` URL. Returns the full description,
employment type (regime), company, location, posting date, and apply link.

## Usage examples

```bash
# QA / test analyst roles, first 5, as a table
bun run skills/infojobs-search/cli/src/cli.ts search -q "analista qa" --limit 5 --format table

# QA roles in São Paulo
bun run skills/infojobs-search/cli/src/cli.ts search -q "qa" -l "São Paulo" --format table

# Test roles posted in the last 7 days
bun run skills/infojobs-search/cli/src/cli.ts search -q "testes" --jobage 7 --format table

# Automation roles in Rio de Janeiro, page 2
bun run skills/infojobs-search/cli/src/cli.ts search -q "automação de testes" -l "Rio de Janeiro" --page 2 --format table

# Full details for a specific posting
bun run skills/infojobs-search/cli/src/cli.ts detail 11794540 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

JSON search output is `{ "meta": { count, page }, "results": [...] }`. Each result has at
least `id`, `title`, `company`, `location`, `date`, `url` (missing values are `null`, never
omitted).

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process
exits with code `1`.

## Notes

- Data source: InfoJobs Brasil public server-rendered HTML — no credentials required.
- Search URL is the "pretty" form `/vagas-de-emprego-<termo>[-em-<local>].aspx`; the keyword
  and location are slugified (lowercased, accents stripped, spaces → hyphens).
- Pagination uses the `Page` query parameter (capital `P`; lowercase `page` is ignored).
- `--location` only works via this URL path form. `provincia`/`poblacion` query params are
  ignored by the site. State names work best (a state URL returns all cities in it).
- `--jobage` is applied client-side (on the posting date) because the search URL has no age
  filter. Each card carries a full hidden timestamp, normalized to an ISO date.
- **Confidential postings** (empresa confidencial) have no company link on the card, so
  `company` comes back `null` — expected, not a parse failure.
- Page size is ~20 results per page.
- `detail` reads the posting's JSON-LD `JobPosting` block for structured fields plus the
  visible description body; the slug in the detail URL is ignored (only the numeric id matters).
- The site may rate-limit under load; the CLI retries 429/5xx with exponential backoff. Keep
  volume low (see personal-use note above).
