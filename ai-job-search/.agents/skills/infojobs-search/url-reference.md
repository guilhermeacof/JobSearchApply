# InfoJobs Brasil — endpoint & parsing reference

Data source: **server-rendered public HTML** at `https://www.infojobs.com.br`. No API, no
authentication. This file records the endpoints, parameters, and HTML anchors the CLI relies
on — update it here first when InfoJobs changes its markup.

## Access / robots.txt

- `https://www.infojobs.com.br/robots.txt` does **not** disallow the search or detail paths.
  It only blocks static legal pages, CV-viewing pages, `*.ashx`, and personal areas.
- Listing and viewing public vacancies requires **no login**. (Login is only needed to apply.)

## Search

### URL (pretty form — used by the CLI)

```
https://www.infojobs.com.br/vagas-de-emprego-<termo-slug>[-em-<local-slug>].aspx?Page=<n>
```

- `<termo-slug>` — keyword, slugified: lowercased, accents stripped (NFD), non-alphanumeric
  → `-`. e.g. `analista qa` → `analista-qa`.
- `-em-<local-slug>` — optional location, slugified. State names work best, e.g.
  `São Paulo` → `sao-paulo`, `Rio de Janeiro` → `rio-de-janeiro`, `Minas Gerais` → `minas-gerais`.
  A state URL returns vacancies in all its cities.
- `Page` — pagination, **capital P**, 1-indexed. Omitted for page 1. (Lowercase `page` is
  silently ignored.)

### Equivalent legacy form

`https://www.infojobs.com.br/empregos.aspx?palabra=<termo>` also works (keyword only), and is
what the site's canonical/search entry points map to. The CLI uses the pretty form because it
also carries location.

### Parameters that DO NOT work

- `provincia`, `poblacion`, `estado`, `cidade` query params — ignored; location must be in the
  URL path (`-em-<local>`).
- No posting-age parameter exists — `--jobage` is a **client-side** filter on the parsed date.

### Result card anchors

Each vacancy card opens with:

```html
<div id="vacancy11794540" data-id="11794540"
     class="... js_vacancyLoad js_rowCard js_cardLink"
     data-href="/vaga-de-analista-testes-qa-em-rio-janeiro__11794540.aspx">
```

The CLI splits the page on `id="vacancy` (each chunk begins with the numeric id) and parses
each chunk independently. Per-card anchors:

| Field    | Anchor (regex target) |
|----------|-----------------------|
| `id`     | digits immediately after `id="vacancy` |
| `url`    | `data-href="([^"]+)"` (prepend origin `https://www.infojobs.com.br`) |
| `title`  | `js_vacancyTitle[^>]*>(…)</h2>` |
| `company`| `href="https://www.infojobs.com.br/empresa-…"[^>]*>(…)</a>` — **cut the capture at the first `<span … onclick`** before cleaning: the "verified company" badge tooltip embeds angle brackets (and a nested `</a>`) inside its `data-bs-title`/`title` attributes, which otherwise leak "Este selo indica…" into the name. Confidential postings have no `empresa-` link → `company = null`. |
| `location`| `class="mb-8">\s*([^<]+)` — text before the hidden `js_divUserVagaDistance` span. Class is exactly `mb-8` (the salary/details row uses a longer class string). |
| `date`   | `class="js_date" data-value="([^"]+)"` → `"2026/07/08 12:03:06"`, normalized to `2026-07-08`. |

~20 cards per page.

## Detail

### URL

```
https://www.infojobs.com.br/vaga-de-<qualquer-slug>__<id>.aspx
```

The slug segment is **ignored** — only the numeric `<id>` resolves the posting. The CLI
therefore builds `…/vaga-de-vaga__<id>.aspx` from a bare id. `normalizeId` accepts a bare id,
a full detail URL (extracts the `__<id>` group), or any string containing a 4+ digit run.

### Field sources

Primary source is the **JSON-LD `JobPosting`** block:

```html
<script type="application/ld+json"> { "@type": "JobPosting", "title": …,
  "description": "<html>", "datePosted": "2026-07-08T12:03:06…",
  "employmentType": "Jornada completa",
  "hiringOrganization": { "name": "…" },
  "jobLocation": { "address": { "addressLocality": …, "addressRegion": … } } } </script>
```

| Field           | Source |
|-----------------|--------|
| `title`         | JSON-LD `title` |
| `company`       | JSON-LD `hiringOrganization.name` |
| `location`      | JSON-LD `jobLocation.address` → `locality - region` |
| `date`          | JSON-LD `datePosted` (date part) |
| `employmentType`| JSON-LD `employmentType` |
| `description`   | JSON-LD `description` (HTML → text) **or** the visible body `<p class="… white-space-pre-line">…</p>`, whichever is longer |
| `applyUrl`      | first `href` containing `candidat`/`aplicar` (absolutized) |

## Fetching

- Browser `User-Agent`, `Accept-Language: pt-BR`.
- Exponential backoff with jitter on `429`/`5xx` (max 6 retries); `""` on `404`.
