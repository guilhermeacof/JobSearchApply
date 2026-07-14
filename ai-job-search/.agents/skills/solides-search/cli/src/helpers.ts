// Data source: Sólides public jobs API gateway (`apigw.solides.com.br/jobs/v3`), the
// same endpoint the vagas.solides.com.br Next.js front-end calls (discovered in its
// `_app` JS bundle). No authentication required for the public board.
//
// The listings page is a client-rendered Next.js app whose `__NEXT_DATA__` ships empty
// pageProps — the job data arrives via XHR to this JSON API, so there is no
// server-rendered HTML to scrape. This is a MULTI-COMPANY board: it aggregates jobs from
// every company that runs its careers site on Sólides, so `companyName` is per-vacancy.

export const API_BASE = "https://apigw.solides.com.br/jobs/v3"
export const SEARCH_PATH = "/portal-vacancies-new"
export const DETAIL_PATH = "/portal-vacancy"
export const SITE_BASE = "https://vagas.solides.com.br"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Fetch JSON with exponential backoff on 429/5xx. Returns `null` on a 404
 * (rather than throwing) so callers can treat "not found" as an empty result.
 */
export async function jsonFetch(url: string): Promise<unknown | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        Origin: SITE_BASE,
        Referer: SITE_BASE + "/",
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
  id: string
  title: string | null
  company: string | null
  location: string | null
  date: string | null
  url: string
  salary: string | null
  type: string | null
  remote: boolean | null
  slug: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  requirements: string | null
  benefits: string | null
  shift: string | null
  seniority: string | null
  contractType: string | null
  applyUrl: string | null
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
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
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

interface NamedItem {
  name?: string | null
  level?: string | null
}

interface Place {
  name?: string | null
  code?: string | null
}

interface SalaryObj {
  type?: string | null
  showRangeToApplicant?: boolean | null
  initialRange?: number | string | null
  finalRange?: number | string | null
  negotiable?: boolean | null
}

export interface RawVacancy {
  id?: string | number
  title?: string | null
  description?: string | null
  companyName?: string | null
  slug?: string | null
  state?: Place | null
  city?: Place | null
  homeOffice?: boolean | null
  jobType?: string | null
  redirectLink?: string | null
  salary?: SalaryObj | null
  seniority?: NamedItem[] | null
  recruitmentContractType?: NamedItem[] | null
  hardSkills?: NamedItem[] | null
  benefits?: NamedItem[] | null
  shift?: NamedItem[] | null
  createdAt?: string | null
}

/** Turn a title into the slug segment the portal's `/vaga/<id>/<slug>` route expects. */
export function slugify(text: string | null | undefined): string {
  if (!text) return "vaga"
  const s = String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return s || "vaga"
}

/** Human-readable location from city/state plus the remote/on-site modality. */
function formatLocation(o: RawVacancy): string | null {
  const bits: string[] = []
  const place = [o.city?.name, o.state?.code || o.state?.name]
    .filter((p) => p && String(p).trim())
    .join(" - ")
  if (place) bits.push(place)
  if (o.homeOffice) bits.push("Remoto")
  else if (o.jobType && String(o.jobType).trim()) {
    const jt = String(o.jobType).toLowerCase()
    const label =
      jt === "presencial" ? "Presencial" :
      jt === "hibrido" || jt === "híbrido" ? "Híbrido" :
      jt === "remoto" || jt === "home office" ? "Remoto" :
      String(o.jobType)
    bits.push(label)
  }
  return bits.length ? bits.join(" · ") : null
}

/** Compact free-text salary from the structured salary object; null when not disclosed. */
function formatSalary(s: SalaryObj | null | undefined): string | null {
  if (!s) return null
  if (s.negotiable) return "A combinar"
  const fmt = (v: number | string | null | undefined): string | null => {
    if (v == null || v === "" || Number(v) <= 0) return null
    const n = Number(v)
    if (isNaN(n)) return String(v)
    return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  const lo = fmt(s.initialRange)
  const hi = fmt(s.finalRange)
  if (lo && hi && lo !== hi) return `${lo} a ${hi}`
  return lo || hi || null
}

/** Join an array of {name} items into readable multi-line text. */
function namedList(items: NamedItem[] | null | undefined): string | null {
  if (!Array.isArray(items) || items.length === 0) return null
  const names = items.map((i) => i?.name && String(i.name).trim()).filter(Boolean)
  return names.length ? names.map((n) => htmlToText(n as string) ?? n).join("\n") : null
}

/** Canonical portal URL: `/vaga/<id>/<slug>` (the bare `/vaga/<id>` 404s). */
export function jobUrl(id: string, slugSource: string | null | undefined): string {
  if (!id) return SITE_BASE
  return `${SITE_BASE}/vaga/${id}/${slugify(slugSource)}`
}

/** Map a raw API vacancy to the shared JobCard shape. */
export function mapCard(o: RawVacancy): JobCard {
  const id = o.id != null ? String(o.id) : ""
  return {
    id,
    title: o.title ? String(o.title).trim() : null,
    company: o.companyName ? String(o.companyName).trim() : null,
    location: formatLocation(o),
    date: o.createdAt ?? null,
    url: jobUrl(id, o.title),
    salary: formatSalary(o.salary),
    type: o.jobType ? String(o.jobType) : null,
    remote: o.homeOffice ?? null,
    slug: o.slug ? String(o.slug) : null,
  }
}

/** Map a raw API vacancy to the full JobDetail shape. */
export function mapDetail(o: RawVacancy): JobDetail {
  const contract = namedList(o.recruitmentContractType)
  const seniority = namedList(o.seniority)
  return {
    ...mapCard(o),
    description: htmlToText(o.description),
    requirements: namedList(o.hardSkills),
    benefits: namedList(o.benefits),
    shift: namedList(o.shift),
    seniority,
    contractType: contract,
    applyUrl: (o.redirectLink && String(o.redirectLink).trim()) || null,
  }
}

export interface Pagination {
  total: number | null
  total_pages: number | null
  current_page: number | null
}

export interface SearchResponse {
  vacancies: RawVacancy[]
  pagination: Pagination
}

/** Normalize the search API payload (`{success, data:{count,totalPages,currentPage,data:[]}}`). */
export function parseSearchResponse(payload: unknown): SearchResponse {
  const root = (payload ?? {}) as Record<string, unknown>
  const data = (root.data ?? {}) as Record<string, unknown>
  const vacancies = Array.isArray(data.data) ? (data.data as RawVacancy[]) : []
  return {
    vacancies,
    pagination: {
      total: typeof data.count === "number" ? data.count : null,
      total_pages: typeof data.totalPages === "number" ? data.totalPages : null,
      current_page: typeof data.currentPage === "number" ? data.currentPage : null,
    },
  }
}

/** Unwrap the single-vacancy detail payload (`{success, data:{...}}`). */
export function parseDetailResponse(payload: unknown): RawVacancy | null {
  if (!payload || typeof payload !== "object") return null
  const root = payload as Record<string, unknown>
  const data = root.data
  if (data && typeof data === "object" && !Array.isArray(data)) return data as RawVacancy
  return root as RawVacancy
}

/** Extract the alphanumeric vacancy id from a raw id or a portal/company URL. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  // .../vaga/<id>/<slug>  or  .../vacancies/<id>?...
  const url = trimmed.match(/(?:\/vaga\/|\/vacancies\/)([A-Za-z0-9]{6,})/)
  if (url) return url[1]
  // bare id: Sólides ids are short alphanumeric tokens (e.g. pgB7MzjNbT)
  const bare = trimmed.match(/^[A-Za-z0-9]{6,}$/)
  if (bare) return trimmed
  return null
}

/** Filter cards to those posted within `days` (client-side; API has no age param). */
export function withinDays(cards: JobCard[], days: number): JobCard[] {
  if (!days || days <= 0 || days >= 9999) return cards
  const cutoff = Date.now() - days * 86400_000
  return cards.filter((c) => {
    if (!c.date) return true
    const t = Date.parse(c.date)
    return isNaN(t) ? true : t >= cutoff
  })
}
