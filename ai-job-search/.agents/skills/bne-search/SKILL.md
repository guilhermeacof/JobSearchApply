---
name: bne-search
version: 1.0.0
description: >
  Use this skill to search job listings on BNE — Banco Nacional de Empregos
  (bne.com.br), one of the largest Brazilian job boards, covering roles across every
  sector and region of Brazil. Invoke when the user wants to find jobs / vacancies in
  Brazil on BNE, look up a specific BNE posting, or scrape BNE openings. Trigger
  phrases (EN): find a job on BNE, search BNE jobs, jobs in Brazil, Brazilian job
  board, vagas Brasil, look up this BNE posting. Gatilhos (PT): buscar vagas no BNE,
  vagas de emprego no Banco Nacional de Empregos, procurar emprego no BNE, vagas Brasil,
  ver esta vaga do BNE, vaga de desenvolvedor, vaga de analista, vaga de QA.
context: fork
allowed-tools: Bash(bun run skills/bne-search/cli/src/cli.ts *)
---

# BNE Search Skill

Search live job listings from **BNE — Banco Nacional de Empregos** (https://www.bne.com.br),
a large, general-purpose Brazilian job board (jobs in every sector, all over Brazil). The
search-results page is **server-rendered HTML**, so this skill scrapes the job cards
directly and resolves each posting's full data from BNE's own public `GetJobCard` fragment
endpoint. **Zero runtime dependencies** — it runs with just `bun`.

## ⚠️ Uso pessoal

Isto consome as páginas públicas do BNE (`/vagas-de-emprego/`, permitidas pelo `robots.txt`).
**Mantenha o volume baixo e não use para coleta em massa ou fins comerciais.** Por padrão,
`search` faz uma requisição por resultado exibido para resolver URL/empresa/salário/data —
use `--limit` (e `--no-detail` quando só quiser um levantamento rápido). Use por sua conta
e responsabilidade.

## When to use this skill

- Search BNE openings by keyword (cargo, tecnologia, skill)
- Filter by city (`-l`) and paginate (`--page`)
- Get the full description of a specific BNE posting (`detail`)

## Commands

### Search job listings

```bash
bun run skills/bne-search/cli/src/cli.ts search [-q "<termo>"] [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (cargo, skill, tecnologia). Recommended.
- `--location <text>` / `-l <text>` — filter by city (e.g. `Brasília`, `São Paulo`). Appended
  to the keyword slug as `-em-<cidade>`.
- `--jobage <days>` — posted within N days. BNE only exposes a **relative** date
  ("há 13 horas", "há 2 dias"), so this is a client-side filter parsed from that text;
  postings with no date shown are kept.
- `--page <n>` — page number (1-indexed).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side). Also caps how many
  detail requests are made.
- `--no-detail` — skip per-result enrichment: one request total, much faster, but
  `url` / `salary` / `date` come back `null` (`id` / `title` / `company` / `location`
  still populated from the listing page).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run skills/bne-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job id from `search` results (e.g. `6085020`). You may also pass a full
`https://www.bne.com.br/vaga-de-emprego-na-area-.../<slug>/<id>` URL. Returns the full
description, company, location, salary, posting date and canonical URL.

## Usage examples

```bash
# QA / test roles, first 5, as a table
bun run skills/bne-search/cli/src/cli.ts search -q "analista qa" --limit 5 --format table

# Developer roles in Brasília
bun run skills/bne-search/cli/src/cli.ts search -q "desenvolvedor" -l "Brasília" --format table

# Automation-testing roles posted in the last 7 days
bun run skills/bne-search/cli/src/cli.ts search -q "automação de testes" --jobage 7 --format table

# Fast keyword scan without per-result requests
bun run skills/bne-search/cli/src/cli.ts search -q "qualidade" --no-detail --limit 10 --format table

# Full details for a specific posting
bun run skills/bne-search/cli/src/cli.ts detail 6085020 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

JSON search output is `{ "meta": { count, page, query, location }, "results": [...] }`.
Each result has at least `id`, `title`, `company`, `location`, `date`, `url` (missing values
are `null`, never omitted), plus `salary`, `type`, `remote`.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process
exits with code `1`.

## Notes

- Data source: BNE public server-rendered pages under `/vagas-de-emprego/`
  (allowed by `robots.txt`, which disallows only `/api/`, `/WebServices/`, `/curriculo`).
  No credentials required.
- The listing card exposes `id`, `title`, `company`, `location` and a remote flag, **but not
  the canonical URL, salary or date** — those come from the site's own
  `/vagas-de-emprego/GetJobCard?id=<id>` fragment. `search` calls it once per emitted result
  by default; `--no-detail` turns this off.
- `--location` works by appending `-em-<cidade>` to the keyword path; result relevance
  depends on BNE's own matching (very effective for single-word roles like `desenvolvedor`).
- `date` is a **relative** Portuguese string (e.g. `há 13 horas`), not ISO 8601, and is
  sometimes absent (`null`). `--jobage` parses it client-side.
- `company` is `Confidencial` for confidential postings (BNE's own label).
- Applying to a vaga requires login on the BNE site, so no `applyUrl` is emitted.
- BNE rate-limits under load; the CLI retries 429/5xx with exponential backoff. Keep volume
  low (see personal-use note above).
- Data source verified live 2026-07-13.
