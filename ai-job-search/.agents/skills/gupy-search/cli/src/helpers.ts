// Fonte de dados: API do portal público de vagas da Gupy (employability-portal.gupy.io).
// A Gupy é o maior ATS do Brasil; seu portal agrega vagas de todas as páginas de
// carreiras de empresas hospedadas na Gupy. A API retorna JSON limpo — sem necessidade
// de parsing de HTML. Não exige autenticação.

export const API_URL = "https://employability-portal.gupy.io/api/v1/jobs"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

/** Busca JSON com backoff exponencial em 429/5xx. Retorna null em caso de 404. */
export async function jsonFetch(url: string): Promise<unknown | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Requisição falhou: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Requisição falhou: ${response.status} ${response.statusText}`)
    }
    return response.json()
  }
  throw new Error("Requisição falhou após o número máximo de tentativas")
}

/** Objeto bruto de vaga conforme retornado pela API do portal da Gupy. */
export interface GupyJob {
  id: number
  name: string
  careerPageName: string | null
  careerPageUrl: string | null
  description: string | null
  type: string | null
  publishedDate: string | null
  applicationDeadline: string | null
  isRemoteWork: boolean
  city: string | null
  state: string | null
  country: string | null
  workplaceType: string | null
  jobUrl: string | null
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  workplaceType: string | null
  deadline: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  companyPageUrl: string | null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

// Entidades nomeadas Latin-1 (texto em português as usa intensamente: ç, ã, é, ...).
// As entidades nomeadas mapeiam para os code points Unicode 192-255 em ordem fixa.
const LATIN1_NAMES =
  "Agrave,Aacute,Acirc,Atilde,Auml,Aring,AElig,Ccedil,Egrave,Eacute,Ecirc,Euml," +
  "Igrave,Iacute,Icirc,Iuml,ETH,Ntilde,Ograve,Oacute,Ocirc,Otilde,Ouml,times," +
  "Oslash,Ugrave,Uacute,Ucirc,Uuml,Yacute,THORN,szlig,agrave,aacute,acirc,atilde," +
  "auml,aring,aelig,ccedil,egrave,eacute,ecirc,euml,igrave,iacute,icirc,iuml,eth," +
  "ntilde,ograve,oacute,ocirc,otilde,ouml,divide,oslash,ugrave,uacute,ucirc,uuml," +
  "yacute,thorn,yuml"
const NAMED_ENTITIES: Record<string, string> = Object.fromEntries(
  LATIN1_NAMES.split(",").map((name, i) => [name, String.fromCodePoint(192 + i)]),
)

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m)
    .replace(/&amp;/g, "&")
}

/** Descrições podem conter HTML embutido; preserva quebras de bloco como quebras de linha. */
export function cleanDescription(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Monta uma localização legível a partir de city/state/country da API + flag de remoto. */
export function buildLocation(job: GupyJob): string | null {
  const parts = [job.city, job.state].filter((p) => p && p.trim()).map((p) => (p as string).trim())
  const place = parts.join(", ") || (job.country && job.country.trim()) || ""
  if (job.workplaceType === "remote" || job.isRemoteWork) {
    return place ? `Remoto (${place})` : "Remoto"
  }
  return place || null
}

export function toCard(job: GupyJob): JobCard {
  return {
    id: String(job.id),
    title: job.name,
    company: job.careerPageName || null,
    location: buildLocation(job),
    date: job.publishedDate ? job.publishedDate.slice(0, 10) : null,
    // Fallback: o portal não tem página por ID, então usamos um link de busca pelo título.
    url: job.jobUrl || `https://portal.gupy.io/job-search/term=${encodeURIComponent(job.name)}`,
    workplaceType: job.workplaceType || null,
    deadline: job.applicationDeadline || null,
  }
}

export function toDetail(job: GupyJob): JobDetail {
  return {
    ...toCard(job),
    description: job.description ? cleanDescription(job.description) : null,
    employmentType: job.type ? job.type.replace(/^vacancy_type_/, "") : null,
    companyPageUrl: job.careerPageUrl || null,
  }
}

/**
 * Aceita um ID numérico de vaga ou uma URL de vaga da Gupy. URLs de vaga da Gupy
 * terminam em um segmento base64 codificando {"jobId":<n>,...} — decodificamos
 * esse segmento para recuperar o ID.
 */
export function normalizeId(input: string): string | null {
  if (/^\d+$/.test(input)) return input
  const segment = input.split("/").filter(Boolean).pop()
  if (!segment) return null
  try {
    const decoded = JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/")))
    if (decoded && typeof decoded.jobId === "number") return String(decoded.jobId)
  } catch {
    // não é um segmento base64 de URL da Gupy — segue adiante
  }
  return null
}

/** Mapeia a flag --remote do CLI para o parâmetro workplaceType da Gupy. */
export function workplaceTypeParam(mode: string | undefined): string | null {
  switch ((mode || "").toLowerCase()) {
    case "remote":
      return "remote"
    case "hybrid":
      return "hybrid"
    case "onsite":
    case "on-site":
      return "on-site"
    default:
      return null
  }
}

/** Filtro client-side por idade da publicação (a API não tem filtro de data no servidor). */
export function withinJobage(card: JobCard, days: number): boolean {
  if (!days || days <= 0 || days >= 9999) return true
  if (!card.date) return true
  const posted = Date.parse(card.date)
  if (isNaN(posted)) return true
  return Date.now() - posted <= days * 86400000
}
