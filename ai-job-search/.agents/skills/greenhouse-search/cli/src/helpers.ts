// Data source: Greenhouse Job Board public API (`boards-api.greenhouse.io/v1`),
// the same JSON API that powers Greenhouse-hosted careers pages. No authentication
// required. Greenhouse is per-company: each company has its own board identified by a
// "board token", so this skill iterates over a registry of tokens (see companies.ts)
// and aggregates the results.

export const API_BASE = "https://boards-api.greenhouse.io/v1/boards"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Fetch JSON with exponential backoff on 429/5xx. Returns `null` on a 404
 * (rather than throwing) so callers can treat "not found" / "no such board" as
 * an empty result.
 */
export async function jsonFetch(url: string): Promise<unknown | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
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
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.json()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  /** `<token>:<jobId>` so `detail` can locate the right board. */
  id: string
  title: string | null
  company: string | null
  location: string | null
  date: string | null
  url: string
  department: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points (e.g. emoji) decode
 * correctly, and drops out-of-range values instead of throwing.
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

/**
 * Strip HTML down to readable text, preserving paragraph/line breaks.
 * Greenhouse returns the `content` field as *entity-escaped* HTML (e.g.
 * `&lt;p&gt;...`), so we decode entities first to reveal the tags, strip them,
 * then decode any remaining inner entities.
 */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null
  let s = String(html)
  if (s.includes("&lt;") || s.includes("&gt;")) s = decodeHtmlEntities(s)
  const withBreaks = s
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

interface RawNamed {
  name?: string | null
}

export interface RawGhJob {
  id?: number | string
  title?: string | null
  updated_at?: string | null
  absolute_url?: string | null
  location?: RawNamed | null
  content?: string | null
  company_name?: string | null
  departments?: RawNamed[] | null
  offices?: RawNamed[] | null
}

function firstName(items: RawNamed[] | null | undefined): string | null {
  if (!Array.isArray(items)) return null
  for (const it of items) {
    const n = it?.name && String(it.name).trim()
    if (n) return n
  }
  return null
}

/** Map a raw Greenhouse job to the shared JobCard shape. */
export function mapCard(o: RawGhJob, token: string, company: string): JobCard {
  const jobId = o.id != null ? String(o.id) : ""
  return {
    id: jobId ? `${token}:${jobId}` : token,
    title: o.title ? String(o.title) : null,
    company: company || o.company_name || null,
    location: (o.location?.name && String(o.location.name).trim()) || null,
    date: o.updated_at ?? null,
    url:
      (o.absolute_url && String(o.absolute_url).trim()) ||
      `https://job-boards.greenhouse.io/${token}`,
    department: firstName(o.departments) ?? firstName(o.offices),
  }
}

/** Map a raw Greenhouse job to the full JobDetail shape. */
export function mapDetail(o: RawGhJob, token: string, company: string): JobDetail {
  return {
    ...mapCard(o, token, company),
    description: htmlToText(o.content),
  }
}

export interface JobsResponse {
  jobs: RawGhJob[]
}

/** Normalize the board `/jobs` payload into a predictable shape. */
export function parseJobsResponse(payload: unknown): JobsResponse {
  const obj = (payload ?? {}) as Record<string, unknown>
  const jobs = Array.isArray(obj.jobs) ? (obj.jobs as RawGhJob[]) : []
  return { jobs }
}

/** Strip diacritics and lowercase for accent-insensitive matching. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

/**
 * Client-side title filter. Splits the query into terms (all must match, AND).
 * Short terms (<= 3 chars, e.g. "qa") match on word boundaries so "qa" does not
 * hit "qualidade"; longer terms match as substrings.
 */
export function matchesQuery(title: string | null, query: string | undefined): boolean {
  if (!query) return true
  if (!title) return false
  const hay = normalize(title)
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  return terms.every((term) => {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    if (term.length <= 3) {
      return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(hay)
    }
    return hay.includes(term)
  })
}

/** Client-side location filter (accent-insensitive substring). */
export function matchesLocation(location: string | null, loc: string | undefined): boolean {
  if (!loc) return true
  if (!location) return false
  return normalize(location).includes(normalize(loc))
}

/** Filter cards to those updated within `days` (client-side; on `updated_at`). */
export function withinDays(cards: JobCard[], days: number): JobCard[] {
  if (!days || days <= 0 || days >= 9999) return cards
  const cutoff = Date.now() - days * 86400_000
  return cards.filter((c) => {
    if (!c.date) return true
    const t = Date.parse(c.date)
    return isNaN(t) ? true : t >= cutoff
  })
}

export interface ParsedId {
  token: string
  id: string
}

/**
 * Extract `{ token, id }` from a `<token>:<jobId>` string or a Greenhouse job URL
 * (`.../<token>/jobs/<id>` on job-boards.greenhouse.io or boards.greenhouse.io).
 */
export function normalizeId(input: string): ParsedId | null {
  const pair = input.match(/^([A-Za-z0-9_-]+):(\d{3,})$/)
  if (pair) return { token: pair[1], id: pair[2] }
  const url = input.match(/greenhouse\.io\/([A-Za-z0-9_-]+)\/jobs\/(\d{3,})/)
  if (url) return { token: url[1], id: url[2] }
  return null
}
