# Greenhouse Job Board API Reference

Greenhouse is a widely used ATS. Many Brazilian tech/fintech companies host their public
careers page on Greenhouse and expose a **public, unauthenticated JSON API** at
`boards-api.greenhouse.io/v1`. Greenhouse is **per-company**: every company has its own
"board" identified by a **board token** (the `<token>` segment in
`https://job-boards.greenhouse.io/<token>`). This skill keeps a registry of tokens and
aggregates across them.

> Personal use only — one request per company per search; the CLI backs off on 429/5xx.

## Company registry

Stored in `cli/src/companies.ts` as `{ token, nome }[]`. `nome` is the display name shown
as `company` in results. Seed tokens (all verified live, BR):

| token | nome | approx. jobs |
|-------|------|-------------|
| `inter` | Banco Inter | ~486 |
| `zupinnovation` | Zup Innovation | ~66 |
| `nubank` | Nubank | ~104 |
| `quintoandar` | QuintoAndar | ~190 |
| `gympass` | Wellhub (Gympass) | ~93 |
| `vtex` | VTEX | ~81 |
| `ebanx` | EBANX | ~90 |
| `stone` | Stone | ~778 |
| `c6bank` | C6 Bank | ~154 |
| `rdstation` | RD Station | ~16 |

To add a company: find the token in its careers URL, confirm it returns jobs, then add a
`{ token, nome }` entry.

## List jobs for a board

```
GET https://boards-api.greenhouse.io/v1/boards/<token>/jobs?content=true
```

`content=true` includes the full HTML description with each job (avoids a second request
for `detail`-style data). Response:

```jsonc
{
  "jobs": [
    {
      "id": 5461719004,
      "title": "Analista de QA Sênior",
      "updated_at": "2026-06-03T14:02:13-04:00",
      "absolute_url": "https://job-boards.greenhouse.io/vtex/jobs/5461719004",
      "location": { "name": "Rio de Janeiro; São Paulo" },
      "content": "&lt;p&gt;...&lt;/p&gt;",       // entity-escaped HTML
      "company_name": "VTEX",
      "departments": [ { "name": "Engineering" } ],
      "offices": [ { "name": "Remote BR" } ]
    }
  ],
  "meta": { "total": 81 }
}
```

## Board (company) name

```
GET https://boards-api.greenhouse.io/v1/boards/<token>   ->   { "name": "...", ... }
```

Used when **adding** a company to the registry to read its display name. The skill itself
does not call this at search time — it uses the registry `nome`, keeping searches to one
request per company.

## Job detail

```
GET https://boards-api.greenhouse.io/v1/boards/<token>/jobs/<id>?questions=false
```

Returns a single job with the same field shape as a list entry, including `content` (the
full HTML description). `questions=false` omits the application form questions.

## Field mapping to the shared JobCard contract

| Contract field | Source |
|----------------|--------|
| `id` | `"<token>:" + id` (so `detail` can find the board) |
| `title` | `title` |
| `company` | registry `nome` for the token (falls back to `company_name`) |
| `location` | `location.name` |
| `date` | `updated_at` (ISO 8601) |
| `url` | `absolute_url` |
| `department` | first `departments[].name`, else first `offices[].name` |
| `description` (detail) | `content`, entity-decoded + tags stripped |

## Filtering & pagination

The board `/jobs` endpoint returns **all** jobs for a company and has **no** query,
location, or age parameters. Therefore:

- `--query` — client-side over `title`. Terms `<= 3` chars (e.g. `qa`) match on word
  boundaries; longer terms are accent-insensitive substrings; multiple terms are AND-ed.
- `--location` — client-side accent-insensitive substring over `location.name`.
- `--jobage` — client-side, on `updated_at`.
- `--page` / `--limit` — client-side over the aggregated, date-sorted list (`--limit` is
  the page size; results are sorted newest-first by `updated_at`).

## Notes

- No authentication required; no API key.
- `content` is **entity-escaped** HTML (`&lt;p&gt;`), so it is decoded once to reveal
  tags, stripped, then decoded again for inner entities.
- Some boards use `job-boards.greenhouse.io`, others `boards.greenhouse.io`; `normalizeId`
  accepts both URL hosts.
- Data source and seed tokens verified live 2026-07-14.
