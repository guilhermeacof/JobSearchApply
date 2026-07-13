# BNE (Banco Nacional de Empregos) Reference

BNE (https://www.bne.com.br) is a large Brazilian job board. Unlike SPA-based boards, its
search-results page is **server-rendered HTML** — the job cards are present in the raw
response — so this skill scrapes them with chunked regex. A single posting's full data is
loaded by the site's front-end from a public HTML-fragment endpoint (`GetJobCard`), which
this skill also uses for `detail` and to enrich search results.

> Personal use only — keep volume low; the CLI backs off on 429/5xx.

## robots.txt

`Disallow: /WebServices/`, `/api/`, `/curriculo`, `/utm_`, `/agents/meta-externalagent`,
`/events-global-api.bne.com.br/`. The paths this skill uses — `/vagas-de-emprego/<slug>`
and `/vagas-de-emprego/GetJobCard` — are **not** disallowed. (Note `GetJobCard` lives under
the allowed `/vagas-de-emprego/` prefix, not under `/api/`.)

## Search (server-rendered listing)

```
GET https://www.bne.com.br/vagas-de-emprego/<slug>?Page=<n>
```

- `<slug>` = the keyword, BNE-slugified (lowercase, diacritics stripped, non-alphanumerics
  to `-`). E.g. `analista qa` → `analista-qa`.
- **Location** is folded into the slug: append `-em-<cidade-slug>`, e.g.
  `desenvolvedor-em-brasilia`. (The `?CityName=` query parameter observed in the page JS
  301-redirects to a generic listing when requested via a plain GET, so the path form is
  used instead.)
- `Page` (capital P) is the 1-indexed page parameter (from the page's `getUrlRedirect`
  JS: `"Page=" + hiddenPage`). `?pagina=` / `?p=` do **not** paginate.

Send a browser `User-Agent` and `X-Requested-With: XMLHttpRequest`.

### Per-card anchors

Each opening is a `<div class="card--list--vagas" ...>` block (parse by splitting on that
class; SVG icons are stripped first because their inline `<path d="...">` data pollutes
regex). Fields inside a card:

| Contract field | Anchor |
|----------------|--------|
| `id` | `data-job-id="(\d+)"` on `card--list--vagas` (also `id="job-<id>"` on the wrapping `<section>`) |
| `title` | `<h2><strong> … </strong>` in `job__card__header` |
| `remote` | presence of `class="is-home-office"` / the text `Home Office` |
| — | inside `<div class="info__vaga">` there are several `<h3>` in order: **[cargo, empresa, (regime), cidade / UF]** |
| `company` | the first `<h3>` after the cargo that is not the city and not a regime word |
| `location` | the `<h3>` matching `… / UF` (e.g. `São Paulo / SP`, `Centro, Curitiba / PR`) |

The card does **not** contain the canonical URL, salary, or posting date — those require
the `GetJobCard` fragment below.

## Detail / enrichment (GetJobCard fragment)

```
GET https://www.bne.com.br/vagas-de-emprego/GetJobCard?id=<id>&viewOrigin=JobList&isVip=false&isAuthenticated=false&daysAfterRegister=0
```

Returns an HTML fragment for a single job. Anchors:

| Contract field | Anchor |
|----------------|--------|
| `url` | `<a class="link-vaga" href="/vaga-de-emprego-na-area-.../<slug>/<id>">` → prefix with `https://www.bne.com.br` |
| `title` | `<h2>` inside the `link-vaga` anchor |
| `company` | `<strong>Empresa:</strong><span …>VALUE</span>` (`Confidencial` when withheld) |
| `salary` | `<strong>Salário:</strong><span …>VALUE</span>` (e.g. `a combinar`) |
| `location` | `<strong>Local:</strong><span …>VALUE</span>` (city only, no UF — the card's `… / UF` is richer, so search prefers it) |
| `date` | `<p …>Publicada há 13 horas</p>` — **relative** text, sometimes absent |
| `description` | `<div class="job__info descricao__vaga …">` → drop the `Descrição Geral` `<h2>`, keep the `<p>` body; line breaks are encoded as `&#xA;` |

Labels are stored as `<strong class="core__vip__text-color">` with the value in the next
`<span class="core__vip__text-grey">`.

## Notes

- No authentication required for listing or reading a vaga. Applying requires login
  (`SendCVJob` / `applyVacancy` buttons) — the skill does not emit an apply URL.
- Legacy `/vagas/<id>` returns a generic ASP.NET WebForms listing (the id is ignored) — it
  is **not** a per-job detail page; use the canonical `link-vaga` URL from `GetJobCard`.
- HTML entities are hex/decimal numeric references (`&#xE9;` = é, `&#xA;` = newline); the
  CLI decodes them.
- Data source verified live 2026-07-13 (search + GetJobCard).
