---
name: solides-search
version: 1.0.0
description: >
  Use this skill to search job listings on the public Sólides jobs board
  (vagas.solides.com.br), a Brazilian multi-company board that aggregates openings from
  many companies that run their careers site on Sólides. Invoke when the user wants to
  find jobs / vacancies in Brazil on Sólides, look up a specific Sólides posting, or
  scrape Sólides openings. Trigger phrases (EN): find a job on Sólides, search Solides
  jobs, jobs in Brazil, companies using Sólides, look up this Sólides posting. Gatilhos
  (PT): buscar vagas na Sólides, vagas no vagas.solides.com.br, vagas Brasil, empresas
  que usam Solides, procurar emprego na Sólides, ver esta vaga da Sólides, vaga de
  desenvolvedor, vaga de analista de testes, vaga de QA.
context: fork
allowed-tools: Bash(bun run skills/solides-search/cli/src/cli.ts *)
---

# Sólides Board Search Skill

Search live job listings from the **public Sólides jobs board** (`vagas.solides.com.br`).
This is a **multi-company** board: it aggregates openings from every company that runs its
careers site on Sólides, so each vacancy carries its own `company`. It talks to the same
public JSON API gateway the site's front-end calls (`apigw.solides.com.br/jobs/v3`) — no
authentication, no API key, and **zero runtime dependencies**: it runs with just `bun`.

> The board is a client-rendered Next.js app whose `__NEXT_DATA__` ships empty pageProps —
> the job data arrives via XHR from this JSON API, so no HTML scraping or headless browser
> is involved.

## ⚠️ Uso pessoal

Isto consome a API pública da Sólides da mesma forma que o site faz. **Mantenha o volume
baixo e não use para coleta em massa ou fins comerciais.** Use por sua conta e
responsabilidade. `robots.txt` permite `/` para todos os agentes.

## When to use this skill

- Search the Sólides board by keyword (cargo, tecnologia, skill) across many companies
- Filter by location (`Cidade - UF`), área de atuação, or posting recency
- Get the full description of a specific Sólides posting

## Commands

### Search job listings

```bash
bun run skills/solides-search/cli/src/cli.ts search [-q "<termo>"] [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search matched against the **job title** (cargo,
  tecnologia, skill). Recommended (e.g. `desenvolvedor`, `analista de testes`, `qa`).
- `--location <text>` / `-l <text>` — location filter, **`Cidade - UF`** format
  (e.g. `São Paulo - SP`, `Brasília - DF`). A bare UF like `SP` does not match — use the
  full `Cidade - UF` string. Comma-separate multiple cities.
- `--area <slug>` / `-a <slug>` — área de atuação: `tecnologia`, `administrativo`,
  `marketing`, `comercial`, `producao`, `recursos-humanos`, `juridico`, `primeiro-emprego`, etc.
- `--jobage <days>` — posted within N days (client-side filter on `createdAt`; the API has
  no age parameter). Omit for all postings.
- `--page <n>` — page number (1-indexed, 10 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run skills/solides-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the alphanumeric vacancy id from `search` results (e.g. `pgB7MzjNbT`). You may also
pass a full portal URL (`https://vagas.solides.com.br/vaga/<id>/<slug>`) or a company apply
URL (`https://<empresa>.solides.jobs/vacancies/<id>?...`). Returns the full description,
required skills, benefits, shift, contract type, and apply link.

## Usage examples

```bash
# Developer roles, first 5, as a table
bun run skills/solides-search/cli/src/cli.ts search -q "desenvolvedor" --limit 5 --format table

# QA / test roles in São Paulo
bun run skills/solides-search/cli/src/cli.ts search -q "analista de testes" -l "São Paulo - SP" --format table

# QA roles posted in the last 7 days
bun run skills/solides-search/cli/src/cli.ts search -q "qa" --jobage 7 --format table

# Tech-area openings in Brasília
bun run skills/solides-search/cli/src/cli.ts search -a "tecnologia" -l "Brasília - DF" --format table

# Full details for a specific posting
bun run skills/solides-search/cli/src/cli.ts detail pgB7MzjNbT --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

JSON search output is `{ "meta": { count, page, total, total_pages, per_page }, "results": [...] }`.
Each result has at least `id`, `title`, `company`, `location`, `date`, `url` (missing values
are `null`, never omitted), plus `salary`, `type`, `remote`, `slug`.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process
exits with code `1`.

## Notes

- Data source: Sólides public jobs API gateway (`apigw.solides.com.br/jobs/v3`) — no credentials required.
- Multi-company board: the `company` field is per-vacancy (`companyName` in the API).
- Page size is fixed server-side at **10** results/page (`perPage` is ignored); use `--page` to walk pages.
- `--query` filters the **title** field (param `title`). A whole-string free-text query works
  (e.g. `analista de testes` returns matches), unlike a single-token-only board.
- `--location` uses the `locations` param and needs the exact `Cidade - UF` label the board
  uses (from its `/portal-location-new` autocomplete); a bare UF returns 0.
- `--jobage` is applied client-side (on `createdAt`) because the API has no age filter.
- The canonical portal URL is `/vaga/<id>/<slug>`; the `applyUrl` in `detail` is the
  company's own `*.solides.jobs` careers page.
- The API rate-limits under load; the CLI retries 429/5xx with exponential backoff. Keep
  volume low (see personal-use note above).
