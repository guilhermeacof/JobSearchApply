// Data source: Fóton Informática's own careers page (https://www.foton.la/vagas/).
// The site is WordPress + Elementor and the listing is SERVER-RENDERED: every open
// vacancy is in the HTML as an accordion card (`uc_ac_box`) linking to a top-level
// slug page (e.g. /analista-de-teste-hibrido-sao-paulo-sp/). There is no jobs API
// (wp-json exposes no vaga post type), so we scrape the HTML with chunked regex —
// each card is parsed independently so one malformed card cannot break the rest.
// The company is always "Fóton Informática" — this is a single-company skill.

export const LISTING_URL = "https://www.foton.la/vagas/"
export const SITE_BASE = "https://www.foton.la"
export const COMPANY = "Fóton Informática"

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

export interface JobCard {
  id: string
  title: string | null
  company: string
  location: string | null
  date: string | null
  url: string
  model: string | null
  remote: boolean | null
  hybrid: boolean | null
}

export interface JobDetail extends JobCard {
  description: string | null
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points decode correctly, and
 * drops out-of-range values instead of throwing.
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
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** Strip HTML down to readable text, preserving paragraph/line breaks. */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null
  const withBreaks = String(html)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h[1-6]|tr)>/gi, "\n")
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

/** Strip diacritics and lowercase for accent-insensitive matching. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/** Extract the slug from a Fóton vaga URL, or accept a bare slug. */
export function normalizeSlug(input: string): string | null {
  const trimmed = input.trim()
  const m = trimmed.match(/foton\.la\/([a-z0-9][a-z0-9-]*)\/?(?:[?#]|$)/i)
  if (m) return m[1]
  const bare = trimmed.match(/^[a-z0-9][a-z0-9-]*$/i)
  if (bare) return trimmed.replace(/\/+$/, "")
  return null
}

/**
 * Derive a human-readable work model / location from the card modalidade text
 * (or the title parenthetical as a fallback), plus remote/hybrid booleans.
 */
function deriveModel(modalidade: string | null): {
  location: string | null
  model: string | null
  remote: boolean | null
  hybrid: boolean | null
} {
  if (!modalidade) return { location: null, model: null, remote: null, hybrid: null }
  // Keep the location compact: stop at the first sentence break, and hard-cap length
  // (some catch-all cards carry a long modalidade paragraph).
  let txt = modalidade.split(/(?<=\.)\s|(?:\s*Principais áreas)/i)[0]
  if (txt.length > 100) txt = txt.slice(0, 100).replace(/\s+\S*$/, "") + "…"
  txt = txt.replace(/\.*\s*$/, "").trim()
  const f = fold(txt)
  const hybrid = f.includes("hibrido")
  const remote = !hybrid && (f.includes("home office") || f.includes("remoto"))
  let model: string | null = null
  if (hybrid) model = "Híbrido"
  else if (remote) model = "Remoto"
  return { location: txt || null, model, remote, hybrid }
}

/**
 * Parse the /vagas/ listing into job cards. The page renders each opening as an
 * Elementor Ultimate accordion `uc_ac_box`; the ones that are real vacancies
 * carry a "Ver vaga completa" link (`uc_more_btn`) pointing at the vaga's slug
 * page. We split on the box marker and parse each chunk independently.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/class="uc_ac_box/).slice(1)

  for (const chunk of chunks) {
    const linkMatch = chunk.match(
      /href="([^"]+)"[^>]*class="[^"]*uc_more_btn[^"]*"/i,
    )
    if (!linkMatch) continue // not a vacancy card (e.g. a plain FAQ accordion)
    const url = decodeHtmlEntities(linkMatch[1]).split(/[?#]/)[0]
    const slug = normalizeSlug(url)
    if (!slug) continue

    const titleMatch = chunk.match(/class="ue_heading_title"[^>]*>([\s\S]*?)<\/em>/i)
    const title = titleMatch ? clean(titleMatch[1]) || null : null

    const snipMatch = chunk.match(/class="ue_post_text"[^>]*>([\s\S]*?)<\/div>/i)
    const snippet = snipMatch ? clean(snipMatch[1]) : ""

    // Modalidade line: "Modalidade de trabalho: <X>" up to the standard PcD sentinel.
    let modalidade: string | null = null
    const modMatch = snippet.match(
      /modalidade de trabalho:\s*(.*?)(?:\s*todas as nossas|\s*requisitos|$)/i,
    )
    if (modMatch && modMatch[1].trim()) modalidade = modMatch[1].trim()
    // Fallback: the parenthetical in the title, e.g. "Analista de Teste (híbrido São Paulo/SP)".
    if (!modalidade && title) {
      const paren = title.match(/\(([^)]+)\)\s*$/)
      if (paren) modalidade = paren[1].trim()
    }

    const { location, model, remote, hybrid } = deriveModel(modalidade)

    results.push({
      id: slug,
      title,
      company: COMPANY,
      location,
      date: null,
      url: `${SITE_BASE}/${slug}/`,
      model,
      remote,
      hybrid,
    })
  }

  return results
}

/**
 * Parse a single vaga page (slug page — also server-rendered). The full
 * description lives in the Elementor "theme-post-content" widget; the post body
 * is plain WordPress-block HTML (no nested elementor widgets), so we slice from
 * the widget container up to the next elementor element and strip to text.
 */
export function parseJobDetail(html: string, slug: string): JobDetail {
  let title: string | null = null
  const h1 = html.match(/<h1[^>]*heading-title[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1) title = clean(h1[1]) || null
  if (!title) {
    const anyH1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    if (anyH1) title = clean(anyH1[1]) || null
  }

  let description: string | null = null
  const widgetIdx = html.search(/data-widget_type="theme-post-content/i)
  if (widgetIdx !== -1) {
    const containerIdx = html.indexOf("elementor-widget-container", widgetIdx)
    if (containerIdx !== -1) {
      const start = html.indexOf(">", containerIdx) + 1
      const nextEl = html.indexOf('<div class="elementor-element', start)
      const end = nextEl === -1 ? html.length : nextEl
      description = htmlToText(html.slice(start, end))
    }
  }

  // Work model from the description's modalidade line.
  let modalidade: string | null = null
  if (description) {
    const modMatch = description.match(/modalidade de trabalho:\s*(.*)/i)
    if (modMatch && modMatch[1].trim()) modalidade = modMatch[1].trim()
  }
  if (!modalidade && title) {
    const paren = title.match(/\(([^)]+)\)\s*$/)
    if (paren) modalidade = paren[1].trim()
  }
  const { location, model, remote, hybrid } = deriveModel(modalidade)

  return {
    id: slug,
    title,
    company: COMPANY,
    location,
    date: null,
    url: `${SITE_BASE}/${slug}/`,
    model,
    remote,
    hybrid,
    description,
  }
}
