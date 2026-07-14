# Sólides Board API Reference

The public Sólides jobs board (https://vagas.solides.com.br) is a **multi-company** board
that aggregates openings from every company running its careers site on Sólides. The site
is a client-rendered **Next.js** app (`buildId` seen: `4cQSm0nyxnpKJxasn-fAy`) whose
`<script id="__NEXT_DATA__">` ships **empty** `pageProps` — the job data is fetched via XHR
after load. This skill therefore uses the same public JSON API gateway the front-end calls,
discovered in the `_app` JS chunk as `baseURL:"https://apigw.solides.com.br/jobs/v3"`.

> Personal use only — keep volume low; the CLI backs off on 429/5xx.

`robots.txt` allows `/` for `User-agent: *` (only Googlebot has narrow `/nogooglebot/` and
`/empresa/*$` restrictions); the API host and the `/vaga/...` detail paths are not disallowed.

## Search

```
GET https://apigw.solides.com.br/jobs/v3/portal-vacancies-new
```

Send a browser `User-Agent` plus `Origin: https://vagas.solides.com.br` (the front-end's
XHR does; the endpoint answers 200 without an Authorization token for the public board).

Query params (passed through from the Next.js route as `params:q`):

| Param | Meaning | Example |
|-------|---------|---------|
| `title` | Free-text keyword filter on the job **title** | `desenvolvedor`, `analista de testes`, `qa` |
| `locations` | Location filter, **`Cidade - UF`** label; comma-separated for multiple | `São Paulo - SP`, `Brasília - DF` |
| `occupationAreas` | Área de atuação slug | `tecnologia`, `administrativo`, `marketing`, `comercial` |
| `page` | Page number (1-indexed) | `1`, `2`, … |

Notes:
- `perPage` is accepted but **ignored** — the server always returns 10 vacancies/page.
- A bare UF (`locations=SP`) returns 0 results; the value must be the exact `Cidade - UF`
  label the board's `/portal-location-new` autocomplete emits.
- `homeOffice=true` does **not** filter (server ignores it); modality is exposed per-record
  via `homeOffice` / `jobType` instead.

Response body:

```jsonc
{
  "success": true,
  "errors": [],
  "data": {
    "totalPages": 103,
    "currentPage": 1,
    "count": 1024,
    "data": [
      {
        "id": "pgB7MzjNbT",
        "title": "Desenvolvedor Javascript - Automação e Integrações",
        "description": "<h1>...</h1>",             // HTML, present in the list too
        "companyName": "COOPERCARD",               // per-vacancy company
        "companyLogo": null,
        "slug": "coopercard",
        "state": { "name": "Paraná", "code": "PR" },
        "city":  { "name": "Maringá", "state_id": 18 },
        "homeOffice": false,
        "jobType": "presencial",                   // presencial | hibrido | ...
        "type": "externa",
        "redirectLink": "https://coopercard.solides.jobs/vacancies/pgB7MzjNbT?origem=portal",
        "salary": { "type": "...", "initialRange": 5000, "finalRange": 8000, "negotiable": false },
        "seniority": [ { "name": "Pleno" } ],
        "recruitmentContractType": [ { "name": "CLT" } ],
        "hardSkills": [ { "name": "JavaScript" } ],
        "benefits": [ { "name": "Vale Refeição" } ],
        "shift": [ { "name": "De segunda a sexta ..." } ],
        "createdAt": "2026-07-14"
      }
    ]
  }
}
```

Field mapping to the shared JobCard contract:

| Contract field | Source |
|----------------|--------|
| `id` | `id` (alphanumeric string, e.g. `pgB7MzjNbT`) |
| `title` | `title` (trimmed) |
| `company` | `companyName` |
| `location` | `city.name` + `state.code` + modality (`homeOffice`→"Remoto" / `jobType`) |
| `date` | `createdAt` (`YYYY-MM-DD`) |
| `url` | `https://vagas.solides.com.br/vaga/<id>/<slug-of-title>` |
| `salary` | derived from `salary` object (range → "R$ x a R$ y", `negotiable` → "A combinar") |
| `type` | `jobType` |
| `remote` | `homeOffice` |

There is **no posting-age parameter**; `--jobage` is applied client-side on `createdAt`.

## Detail

```
GET https://apigw.solides.com.br/jobs/v3/portal-vacancy/<id>
```

Returns a single vacancy wrapped under a `data` key (same field shape as a list item):

```jsonc
{ "success": true, "errors": [], "data": { "id": "pgB7MzjNbT", "title": "...", "description": "<html>...", "hardSkills": [...], "benefits": [...], "redirectLink": "...", ... } }
```

The CLI strips tags / decodes entities in `description`, joins the `hardSkills`, `benefits`
and `shift` name-lists into readable text, and exposes `redirectLink` as `applyUrl`.

## Canonical URLs

- **Portal detail page:** `https://vagas.solides.com.br/vaga/<id>/<title-slug>` (HTTP 200).
  The route is `/vaga/[vacancy_id]/[vacancy_title]`; any slug segment resolves, but the
  bare `/vaga/<id>` (no slug) returns 404, so the CLI always appends a slug.
- **Company apply page (`redirectLink`):** `https://<empresa>.solides.jobs/vacancies/<id>?origem=portal`.

## Other endpoints (not used by this skill, noted for maintainers)

- `GET /jobs/v3/portal-location-new?location=<City>` → `{ data: [ { name: "Cidade - UF" } ] }`
  autocomplete; the source of valid `locations` labels. Param must be UTF-8; a mojibake
  value fails a server-side regex (HTTP 400).
- `GET /jobs/v3/portal-vacancy/bookmarks?userId=...`, `.../portal-vacancy/bookmark` (POST) —
  authenticated bookmark features (token required).

## Notes

- No authentication required for search/detail on the public board.
- Page size fixed at 10 (`perPage` ignored).
- Base URL and endpoint paths discovered in `_next/static/chunks/pages/_app-*.js`.
- Data source verified live 2026-07-14.
