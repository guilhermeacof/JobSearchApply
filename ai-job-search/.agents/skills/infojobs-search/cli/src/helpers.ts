// Data source: InfoJobs Brasil public search + detail pages (server-rendered HTML).
// No authentication is required to LIST or VIEW public vacancies. The search
// results page is a flat list of job cards; the detail page carries a JSON-LD
// `JobPosting` block plus a visible description body. Both are parsed with regex
// (chunked, per-card) — a full DOM parser is unnecessary and adds a dependency.

export const ORIGIN = "https://www.infojobs.com.br"

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
  company: string | null
  location: string | null
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  applyUrl: string | null
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
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

/**
 * Slugify a term for InfoJobs' "pretty" search URLs: lowercase, strip accents,
 * collapse anything non-alphanumeric to single hyphens. "São Paulo" -> "sao-paulo",
 * "analista qa" -> "analista-qa".
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Normalize InfoJobs' "2026/07/08 12:03:06" timestamp to ISO "2026-07-08". */
function normalizeCardDate(raw: string): string | null {
  const m = raw.match(/(\d{4})[/-](\d{2})[/-](\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/**
 * Parse the search results page: a flat list of job cards, each opening with
 * `<div id="vacancy<id>" ...>`. We split on that marker and parse each chunk
 * independently so one malformed card cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/id="vacancy(?=\d)/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/^(\d+)/)
    if (!idMatch) continue
    const id = idMatch[1]

    const hrefMatch = chunk.match(/data-href="([^"]+)"/i)
    const url = hrefMatch
      ? ORIGIN + decodeHtmlEntities(hrefMatch[1])
      : `${ORIGIN}/vaga-de-vaga__${id}.aspx`

    const titleMatch = chunk.match(/js_vacancyTitle[^>]*>([\s\S]*?)<\/h2>/i)
    const title = titleMatch ? clean(titleMatch[1]) || null : null
    if (!title) continue

    // Company: link to /empresa-...aspx. The verified-badge tooltip embeds angle
    // brackets in its attributes (and even a nested </a>), so cut the capture at
    // the tooltip's onclick span before cleaning to avoid leaking tooltip text.
    let company: string | null = null
    const coMatch = chunk.match(
      /href="https:\/\/www\.infojobs\.com\.br\/empresa-[^"]+"[^>]*>([\s\S]*?)<\/a>/i,
    )
    if (coMatch) {
      const raw = coMatch[1].split(/<span[^>]*onclick/i)[0]
      company = clean(raw) || null
    }

    // Location: the div whose class is exactly "mb-8", text before the hidden
    // distance span.
    const locMatch = chunk.match(/class="mb-8">\s*([^<]+)/i)
    const location = locMatch ? decodeHtmlEntities(locMatch[1]).trim() || null : null

    // Posting date: hidden js_date carries the full timestamp.
    const dateMatch = chunk.match(/class="js_date" data-value="([^"]+)"/i)
    const date = dateMatch ? normalizeCardDate(dateMatch[1]) : null

    results.push({ id, title, company, location, date, url })
  }

  return results
}

interface RawLdPlace {
  address?: {
    addressLocality?: string | null
    addressRegion?: string | null
    addressCountry?: string | null
  } | null
}

interface RawLdJobPosting {
  title?: string | null
  description?: string | null
  datePosted?: string | null
  employmentType?: string | null
  hiringOrganization?: { name?: string | null } | string | null
  jobLocation?: RawLdPlace | RawLdPlace[] | null
}

function ldLocation(job: RawLdJobPosting): string | null {
  const loc = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation
  const addr = loc?.address
  if (!addr) return null
  const place = [addr.addressLocality, addr.addressRegion]
    .filter((p) => p && String(p).trim())
    .join(" - ")
  return place || null
}

/**
 * Parse a single job detail page. Prefers the JSON-LD `JobPosting` block for
 * structured fields; falls back to the visible description body when that is
 * richer than the JSON-LD summary.
 */
export function parseJobDetail(html: string, id: string): JobDetail {
  let ld: RawLdJobPosting | null = null
  const ldBlocks = html.match(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )
  if (ldBlocks) {
    for (const block of ldBlocks) {
      const body = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "")
      try {
        const parsed = JSON.parse(body)
        const nodes = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.["@graph"])
            ? parsed["@graph"]
            : [parsed]
        for (const node of nodes) {
          if (node && node["@type"] === "JobPosting") {
            ld = node as RawLdJobPosting
            break
          }
        }
      } catch {
        // ignore malformed JSON-LD block
      }
      if (ld) break
    }
  }

  const org =
    ld && typeof ld.hiringOrganization === "object"
      ? ld.hiringOrganization?.name ?? null
      : (ld?.hiringOrganization as string | null) ?? null

  // Visible free-text description body.
  const bodyMatch = html.match(
    /<p class="[^"]*white-space-pre-line[^"]*">([\s\S]*?)<\/p>/i,
  )
  const bodyText = bodyMatch ? htmlToText(bodyMatch[1]) : null
  const ldText = ld?.description ? htmlToText(ld.description) : null
  // Prefer whichever description carries more content.
  let description = bodyText
  if (ldText && (!bodyText || ldText.length > bodyText.length)) description = ldText

  const applyMatch = html.match(/href="([^"]*(?:candidat|aplicar)[^"]*)"/i)
  const applyUrl = applyMatch
    ? (applyMatch[1].startsWith("http") ? applyMatch[1] : ORIGIN + applyMatch[1])
    : null

  const date = ld?.datePosted ? (ld.datePosted.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null) : null

  return {
    id,
    title: ld?.title ? clean(ld.title) : null,
    company: org ? clean(org) : null,
    location: ldLocation(ld ?? {}),
    date,
    url: `${ORIGIN}/vaga-de-vaga__${id}.aspx`,
    description,
    employmentType: ld?.employmentType ? clean(ld.employmentType) : null,
    applyUrl,
  }
}

/** Extract a numeric vacancy id from a bare id, a detail URL, or a slug. */
export function normalizeId(input: string): string | null {
  const bare = input.match(/^\d{3,}$/)
  if (bare) return input
  const fromUrl = input.match(/__(\d{3,})/)
  if (fromUrl) return fromUrl[1]
  const anyNum = input.match(/(\d{4,})/)
  return anyNum ? anyNum[1] : null
}

/** Filter cards to those posted within `days` (client-side; no age URL param). */
export function withinDays(cards: JobCard[], days: number): JobCard[] {
  if (!days || days <= 0 || days >= 9999) return cards
  const cutoff = Date.now() - days * 86400_000
  return cards.filter((c) => {
    if (!c.date) return true
    const t = Date.parse(c.date)
    return isNaN(t) ? true : t >= cutoff
  })
}
