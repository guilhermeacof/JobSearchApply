---
name: foton-search
version: 1.0.0
description: >
  Use this skill to search open positions on the OWN careers page of Fóton Informática
  (foton.la/vagas), a Brazilian IT consultancy. Invoke when the user wants to find,
  list, or look up jobs at Fóton / Foton Informática, or read a specific Fóton vacancy.
  This is a single-company skill — every result's company is "Fóton Informática".
  Trigger phrases (EN): jobs at Fóton, Foton Informática openings, search Fóton careers,
  look up this Fóton vacancy, Fóton QA/dev/data jobs. Gatilhos (PT): vagas Fóton, vagas
  na Fóton Informática, buscar vagas da Fóton, oportunidades na Fóton, ver vaga da Fóton,
  vaga de teste/desenvolvedor/dados na Fóton.
context: fork
allowed-tools: Bash(bun run skills/foton-search/cli/src/cli.ts *)
---

# Fóton Informática Search Skill

Search live openings from **Fóton Informática**'s own careers page
(`https://www.foton.la/vagas/`). This is a **single-company** skill: the `company`
field is always "Fóton Informática". It scrapes the site's public, server-rendered HTML
— **zero runtime dependencies**, runs with just `bun`.

> The Fóton site is WordPress + Elementor. The `/vagas/` listing is fully server-rendered
> (every open vacancy is an accordion card in the HTML), and there is **no jobs API**
> (`wp-json` returns 404 for a vaga post type). This skill therefore scrapes the HTML of
> `/vagas/` for search and of each vaga's slug page for `detail`.

## ⚠️ Uso pessoal

Isto raspa a página pública de carreiras da Fóton. **Mantenha o volume baixo e não use
para coleta em massa ou fins comerciais.** Use por sua conta e responsabilidade.

## When to use this skill

- List all of Fóton Informática's open positions
- Filter those openings by keyword (cargo, tecnologia) or by location/work model
- Read the full description of a specific Fóton vaga

## Commands

### Search openings

```bash
bun run skills/foton-search/cli/src/cli.ts search [-q "<termo>"] [flags]
```

The listing is a **single page** with all open vacancies, so filtering happens
**client-side**:

- `--query <text>` / `-q <text>` — keyword filter over the title + location (accent- and
  case-insensitive). E.g. `teste`, `java`, `dados`, `designer`.
- `--location <text>` / `-l <text>` — filter by location / work model. E.g. `remoto`,
  `híbrido`, `São Paulo`.
- `--jobage <days>` — **not supported**: the listing exposes no posting date. The flag is
  accepted (for contract compatibility) but ignored.
- `--page <n>` — page number (1-indexed, 20 results per page over the filtered list).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run skills/foton-search/cli/src/cli.ts detail <slug|url> [--format json|plain]
```

`id` is the URL **slug** from `search` results (e.g. `analista-de-teste-hibrido-sao-paulo-sp`).
You may also pass a full `https://www.foton.la/<slug>/` URL. Returns the full description
(Elementor post-content block) as clean text.

## Usage examples

```bash
# Todas as vagas em aberto, como tabela
bun run skills/foton-search/cli/src/cli.ts search --limit 10 --format table

# Vagas de teste / QA
bun run skills/foton-search/cli/src/cli.ts search -q "teste" --format table

# Vagas de desenvolvimento Java
bun run skills/foton-search/cli/src/cli.ts search -q "java" --format table

# Somente vagas remotas
bun run skills/foton-search/cli/src/cli.ts search -l "remoto" --format table

# Detalhe completo de uma vaga (por slug)
bun run skills/foton-search/cli/src/cli.ts detail analista-de-teste-hibrido-sao-paulo-sp --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing slugs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

JSON search output is `{ "meta": { count, page, total, total_pages, per_page }, "results": [...] }`.
Each result has at least `id`, `title`, `company`, `location`, `date`, `url` (missing values
are `null`, never omitted), plus `model`, `remote`, `hybrid`. `company` is always
"Fóton Informática"; `date` is always `null` (see Notes).

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process
exits with code `1`.

## Notes

- Data source: `https://www.foton.la/vagas/` (server-rendered HTML) — no credentials required.
- Single company: the `company` field is always "Fóton Informática".
- `id` is the vaga's URL **slug** (not a numeric id). `detail` accepts a slug or a full URL.
- **No posting date**: the listing carries no publish date, so `date` is `null` and
  `--jobage` is a no-op (documented for contract compatibility).
- The slug often encodes the work model + city/UF (e.g. `...-hibrido-sao-paulo-sp`), but
  the skill prefers the visible card text ("Modalidade de trabalho: …") for `location`,
  falling back to the title's parenthetical. `remote`/`hybrid` booleans and a `model`
  label (`Remoto`/`Híbrido`) are derived from that text.
- `--query`/`--location` are applied **client-side** because the whole listing is one page.
- The CLI uses a browser User-Agent and backs off on 429/5xx. Keep volume low (see
  personal-use note above).
