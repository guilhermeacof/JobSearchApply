# Fóton Informática Careers Page — HTML Reference

Fóton Informática (https://www.foton.la) publishes its own openings on
`https://www.foton.la/vagas/`. The site is **WordPress + Elementor**. This is a
**single-company** data source — every vacancy belongs to Fóton Informática.

> Personal use only — keep volume low; the CLI backs off on 429/5xx.

## Why HTML scraping (no API)

- The `/vagas/` listing is **server-rendered**: all open vacancies are present in the raw
  HTML returned to a plain `GET` (no JS execution needed).
- There is **no jobs API**: `wp-json` exposes no vaga post type (`/wp-json/wp/v2/vagas`
  and similar return 404). So the CLI scrapes the HTML rather than calling an API.
- Page is served as UTF-8 (`Content-Type: text/html; charset=UTF-8`).

## Search — listing page

```
GET https://www.foton.la/vagas/
```

Send a browser `User-Agent`. The response contains one Elementor "Ultimate" accordion
box per opening. HTML anchors (all parsed with chunked regex, one card at a time):

| Field | Anchor | Notes |
|-------|--------|-------|
| card boundary | `class="uc_ac_box` | split the page on this; each chunk is one accordion |
| is-a-vacancy | `href="<url>" ... class="...uc_more_btn..."` | the "Ver vaga completa" link. Chunks **without** it are plain accordions (FAQ etc.) and are skipped |
| `url` | the `uc_more_btn` `href` | e.g. `https://www.foton.la/analista-de-teste-hibrido-sao-paulo-sp/` |
| `id` | URL **slug** | last path segment of the url, e.g. `analista-de-teste-hibrido-sao-paulo-sp` |
| `title` | `class="ue_heading_title">…</em>` | visible card title, includes the model parenthetical, e.g. "Analista de Teste (híbrido São Paulo/SP)" |
| modalidade | `class="ue_post_text">…</div>` | first line "Modalidade de trabalho: <X>" up to the standard "Todas as nossas vagas…" (PcD) sentinel |

Field mapping to the shared JobCard contract:

| Contract field | Source |
|----------------|--------|
| `id` | URL slug |
| `title` | `ue_heading_title` text |
| `company` | constant `"Fóton Informática"` |
| `location` | modalidade text ("Modalidade de trabalho: …"), fallback = title parenthetical |
| `date` | always `null` — the listing has **no** posting date |
| `url` | `https://www.foton.la/<slug>/` |
| `model` / `remote` / `hybrid` | derived from the modalidade text: `hibrido` → Híbrido; `home office`/`remoto` → Remoto |

There is **no posting-age parameter** and no date at all; `--jobage` is a no-op.
`--query`/`--location` are applied **client-side** (the whole listing is one page).
Pagination is client-side too (20 results/page over the filtered list).

## Detail — vaga slug page

```
GET https://www.foton.la/<slug>/
```

Also server-rendered. Anchors:

| Field | Anchor |
|-------|--------|
| `title` | `<h1 ... heading-title ...>…</h1>` (falls back to any `<h1>`) |
| `description` | the Elementor post-content widget: locate `data-widget_type="theme-post-content…"`, then the following `<div class="elementor-widget-container">`; the description is everything from that container's opening `>` up to the next `<div class="elementor-element` (the trailing divider/related widgets). The post body is plain WordPress-block HTML (`<p class="wp-block-paragraph">…`) with no nested Elementor widgets, so this slice is clean. |

The description HTML is stripped to text (tags removed, entities decoded, paragraph/line
breaks preserved). `company` is the constant, `url` is the canonical slug URL, `date` is
`null`.

## Notes

- No authentication required.
- `robots.txt`: standard WordPress (`Disallow: /wp-admin/` except `admin-ajax.php`); the
  `/vagas/` and slug paths are not disallowed.
- Slugs encode model + city/UF (e.g. `-hibrido-sao-paulo-sp`, `-remoto`), but the visible
  card text is preferred for `location`.
- Data source verified live 2026-07-14 (15 open vacancies on `/vagas/`).
