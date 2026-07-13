// Data source: BNE — Banco Nacional de Empregos (https://www.bne.com.br), a
// Brazilian job board. The public search page `/vagas-de-emprego/<slug>` is
// server-rendered HTML: each job is a `card--list--vagas` block. We parse it with
// regex (the markup is shallow and stable; splitting into per-card chunks means one
// malformed card can't break the rest). The site's own front-end loads a job's full
// data from `/vagas-de-emprego/GetJobCard?id=<id>` (an HTML fragment on the same
// public, robots-allowed path); we use that endpoint for `detail` and to resolve each
// search result's canonical URL, company and salary. No authentication, zero runtime
// dependencies — runs with just `bun`.

export const SEARCH_PATH = "https://www.bne.com.br/vagas-de-emprego"
export const DETAIL_ENDPOINT = "https://www.bne.com.br/vagas-de-emprego/GetJobCard"
export const SITE_BASE = "https://www.bne.com.br"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "X-Requested-With": "XMLHttpRequest",
      },
      redirect: "follow",
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points (e.g. emoji, U+1F600)
 * decode correctly, and drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Numeric character references: decimal (&#233;) and hexadecimal (&#xE9;).
    // BNE encodes accents this way, and encodes line breaks as &#xA;.
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

/** Strip all SVG blocks (BNE cards embed large inline icons that pollute regex). */
function stripSvg(html: string): string {
  return html.replace(/<svg[\s\S]*?<\/svg>/gi, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ")
}

/** Collapse a chunk of inline HTML into a single readable line. */
function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ").trim()
}

/** Strip HTML down to readable text, preserving paragraph/line breaks. */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null
  const withBreaks = stripSvg(String(html))
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
  const text = decodeHtmlEntities(stripTags(withBreaks))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

/**
 * BNE-style slug: lowercase, strip diacritics, non-alphanumerics to hyphens.
 * "Análise QA" -> "analise-qa"; used to build the `/vagas-de-emprego/<slug>` path.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export interface JobCard {
  id: string
  title: string | null
  company: string | null
  location: string | null
  date: string | null
  url: string | null
  salary: string | null
  type: string | null
  remote: boolean | null
}

export interface JobDetail extends JobCard {
  description: string | null
  applyUrl: string | null
}

const REGIME_WORDS = /^(home\s*office|presencial|h[ií]brido|remoto|hibrido)$/i

/** A raw job card parsed from the server-rendered search-results page. */
export interface RawCard {
  id: string
  title: string | null
  company: string | null
  location: string | null
  remote: boolean | null
}

/**
 * Parse the search-results page. Each opening is a `card--list--vagas` block; we
 * split on that class and parse each chunk independently. Inside `info__vaga` the
 * headings appear in the order [cargo, empresa, (regime), cidade / UF].
 */
export function parseSearchCards(html: string): RawCard[] {
  const results: RawCard[] = []
  const page = stripSvg(html)
  const chunks = page.split(/class="card--list--vagas"/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/data-job-id="(\d+)"/)
    if (!idMatch) continue
    const id = idMatch[1]

    const titleMatch = chunk.match(/<h2>\s*<strong>([\s\S]*?)<\/strong>/i)
    const title = titleMatch ? clean(titleMatch[1]) || null : null

    const remote = /class="is-home-office"/i.test(chunk) || /Home Office/i.test(chunk)

    const h3s = [...chunk.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)]
      .map((m) => clean(m[1]))
      .filter((t) => t.length > 0)

    // City: an h3 that ends in "/ UF" (e.g. "São Paulo / SP", "Centro, Curitiba / PR").
    const cityIdx = h3s.map((t) => /\/\s*[A-Z]{2}\b/.test(t)).lastIndexOf(true)
    const location = cityIdx >= 0 ? h3s[cityIdx] : h3s.length ? h3s[h3s.length - 1] : null

    // Company: first heading after the cargo that is neither the city nor a regime tag.
    let company: string | null = null
    for (let i = 1; i < h3s.length; i++) {
      if (i === cityIdx) continue
      if (REGIME_WORDS.test(h3s[i])) continue
      company = h3s[i]
      break
    }

    results.push({ id, title, company, location, remote })
  }
  return results
}

function labelValue(html: string, label: string): string | null {
  const re = new RegExp(
    `<strong[^>]*>\\s*${label}\\s*:?\\s*<\\/strong>\\s*<span[^>]*>([\\s\\S]*?)<\\/span>`,
    "i",
  )
  const m = html.match(re)
  return m ? clean(m[1]) || null : null
}

/**
 * Parse a single job's GetJobCard HTML fragment into the full detail shape.
 * `fallback` carries the id and any fields already known from the search card.
 */
export function parseDetailFragment(
  htmlRaw: string,
  fallback: { id: string; title?: string | null; location?: string | null; remote?: boolean | null },
): JobDetail {
  const html = stripSvg(htmlRaw)

  const linkMatch = html.match(/class="link-vaga"\s+href="([^"]+)"/i)
  const href = linkMatch ? decodeHtmlEntities(linkMatch[1]) : null
  const url = href ? (href.startsWith("http") ? href : SITE_BASE + href) : null

  const titleMatch = html.match(/class="link-vaga"[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i)
  const title = (titleMatch ? clean(titleMatch[1]) : "") || fallback.title || null

  const company = labelValue(html, "Empresa")
  const salary = labelValue(html, "Sal[aá]rio")
  const localLabel = labelValue(html, "Local")
  const location = fallback.location || localLabel

  // Relative posting date, e.g. "Publicada há 13 horas" / "Publicada há 2 dias".
  const dateMatch = html.match(/Publicada\s*([\s\S]*?)<\/p>/i)
  const date = dateMatch ? clean(dateMatch[1]) || null : null

  const descMatch = html.match(/class="[^"]*descricao__vaga[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  let description: string | null = null
  if (descMatch) {
    // Drop the "Descrição Geral" heading, keep the body text with line breaks.
    const body = descMatch[1].replace(/<h\d[^>]*>[\s\S]*?<\/h\d>/i, "")
    description = htmlToText(body)
  }

  return {
    id: fallback.id,
    title,
    company,
    location,
    date,
    url,
    salary,
    type: null,
    remote: fallback.remote ?? null,
    description,
    applyUrl: null,
  }
}

/** Build the GetJobCard fragment URL for a job id. */
export function detailUrl(id: string): string {
  const params = new URLSearchParams({
    id,
    viewOrigin: "JobList",
    isVip: "false",
    isAuthenticated: "false",
    daysAfterRegister: "0",
  })
  return `${DETAIL_ENDPOINT}?${params.toString()}`
}

/** Extract a numeric job id from a bare id or a BNE job URL (id is the last path segment). */
export function normalizeId(input: string): string | null {
  const bare = input.match(/^\d{4,}$/)
  if (bare) return input
  const tail = input.match(/\/(\d{4,})(?:[/?#]|$)/)
  if (tail) return tail[1]
  const anyNum = input.match(/(\d{4,})/)
  return anyNum ? anyNum[1] : null
}

/**
 * Convert BNE's relative date text ("há 13 horas", "há 2 dias", "hoje", "ontem")
 * to an age in days, or null if it can't be parsed.
 */
export function relativeDays(dateText: string | null): number | null {
  if (!dateText) return null
  const t = dateText.toLowerCase()
  if (/\bhoje\b/.test(t) || /hora|minuto|segundo/.test(t)) return 0
  if (/\bontem\b/.test(t)) return 1
  const m = t.match(/(\d+)\s*(dia|semana|m[eê]s|mes|ano)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  const unit = m[2]
  if (unit.startsWith("dia")) return n
  if (unit.startsWith("semana")) return n * 7
  if (unit.startsWith("ano")) return n * 365
  return n * 30 // mês/meses
}

/** Filter cards to those posted within `days` (client-side, via the relative date text). */
export function withinDays(cards: JobCard[], days: number): JobCard[] {
  if (!days || days <= 0 || days >= 9999) return cards
  return cards.filter((c) => {
    const age = relativeDays(c.date)
    return age === null ? true : age <= days // keep unknown dates rather than dropping them
  })
}
