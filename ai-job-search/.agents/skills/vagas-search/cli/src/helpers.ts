// Fonte de dados: páginas públicas de busca do Vagas.com.br (https://www.vagas.com.br/vagas-de-<termo>).
// A busca retorna uma lista HTML de cards de vagas; o detail retorna o HTML de uma única vaga.
// Fazemos o parse de ambos com regex (o markup é raso e estável) e dividimos os resultados
// em chunks por card, de modo que um card malformado não quebre os demais.
//
// O site serve ISO-8859-1 (Latin-1), não UTF-8 — as respostas são decodificadas a partir
// dos bytes com o charset extraído do header Content-Type (fallback: ISO-8859-1).

export const BASE_URL = "https://www.vagas.com.br"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

/** Busca o HTML com backoff exponencial em 429/5xx, decodificando o charset Latin-1 do site. Retorna "" em caso de 404. */
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
        throw new Error(`Requisição falhou: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Requisição falhou: ${response.status} ${response.statusText}`)
    }
    const contentType = response.headers.get("content-type") || ""
    const charsetMatch = contentType.match(/charset=([\w-]+)/i)
    const charset = charsetMatch ? charsetMatch[1].toLowerCase() : "iso-8859-1"
    const bytes = await response.arrayBuffer()
    try {
      return new TextDecoder(charset).decode(bytes)
    } catch {
      return new TextDecoder("iso-8859-1").decode(bytes)
    }
  }
  throw new Error("Requisição falhou após o número máximo de tentativas")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  level: string | null
  snippet: string | null
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  level: string | null
  description: string | null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

// Entidades nomeadas Latin-1 (texto em português usa muito: ç, ã, é, ...).
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

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** Converte um termo de busca em slug no formato esperado pelas URLs do vagas.com.br: "Analista de Testes" -> "analista-de-testes". */
export function slugify(term: string): string {
  return term
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Converte as datas DD/MM/YYYY do site para o formato ISO YYYY-MM-DD. */
export function toIsoDate(brDate: string): string | null {
  const m = brDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/**
 * Faz o parse da página de resultados de busca: um <li class="vaga odd|even"> por vaga.
 * Os chunks são parseados de forma independente, então um card malformado não quebra os demais.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<li[^>]*class="vaga (?:odd|even)[^"]*"/).slice(1)

  for (const chunk of chunks) {
    const link = chunk.match(
      /class="link-detalhes-vaga"[^>]*data-id-vaga="(\d+)"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    )
    if (!link) continue
    const id = link[1]
    const url = link[2].startsWith("http") ? link[2] : `${BASE_URL}${link[2]}`
    const title = clean(link[3])
    if (!title) continue

    const companyMatch = chunk.match(/class="emprVaga"[^>]*>([\s\S]*?)<\/span>/i)
    const company = companyMatch ? clean(companyMatch[1]) || null : null

    const levelMatch = chunk.match(/class="nivelVaga"[^>]*>([\s\S]*?)<\/span>/i)
    const level = levelMatch ? clean(levelMatch[1]) || null : null

    // O texto da localização fica entre o ícone e o <div> (opcional) do tooltip.
    const locMatch = chunk.match(/class="vaga-local"[^>]*>([\s\S]*?)<(?:div|\/div)/i)
    const location = locMatch ? clean(locMatch[1]) || null : null

    const dateMatch = chunk.match(/class="data-publicacao"[^>]*>([\s\S]*?)<\/span>/i)
    const date = dateMatch ? toIsoDate(clean(dateMatch[1])) : null

    const snippetMatch = chunk.match(/class="detalhes"[^>]*>\s*<p>([\s\S]*?)<\/p>/i)
    const snippet = snippetMatch ? clean(snippetMatch[1]) || null : null

    results.push({ id, title, company, location, date, url, level, snippet })
  }

  return results
}

/** Faz o parse da página de detalhe de uma única vaga. */
export function parseJobDetail(html: string, id: string, url: string): JobDetail {
  const titleMatch = html.match(/class="job-shortdescription__title"[^>]*>([\s\S]*?)<\/h1>/i)
  const title = titleMatch ? clean(titleMatch[1]) : "(untitled)"

  const companyMatch = html.match(/class="job-shortdescription__company"[^>]*>([\s\S]*?)<\/h2>/i)
  const company = companyMatch ? clean(companyMatch[1]) || null : null

  const levelMatch = html.match(/job-hierarchylist__item--level"[^>]*aria-label="([^"]+)"/i)
  const level = levelMatch ? decodeHtmlEntities(levelMatch[1]).trim() || null : null

  const locMatch = html.match(/class="info-localizacao"[^>]*>([\s\S]*?)<(?:div|\/div)/i)
  const location = locMatch ? clean(locMatch[1]) || null : null

  const dateMatch = html.match(/Publicada em\s*(\d{2}\/\d{2}\/\d{4})/i)
  const date = dateMatch ? toIsoDate(dateMatch[1]) : null

  // Bloco de descrição rica. Preserva quebras de parágrafo/linha como newlines.
  let description: string | null = null
  // Captura até o próximo bloco irmão; usa o fim do documento como fallback para que
  // uma mudança de markup depois da descrição não a descarte silenciosamente.
  const desc = html.match(
    /data-testid="JobDescription"[^>]*>([\s\S]*?)(?:<section|<\/article|<footer|$)/i,
  )
  if (desc) {
    const withBreaks = desc[1]
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    description =
      decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim() || null
  }

  return { id, title, company, location, date, url, level, description }
}

/** Aceita um ID de vaga puro ("2823863"), um ID com prefixo v ("v2823863") ou a URL completa de detalhe. */
export function normalizeId(input: string): string | null {
  const url = input.match(/\/vagas\/v(\d+)/)
  if (url) return url[1]
  const prefixed = input.match(/^v(\d+)$/)
  if (prefixed) return prefixed[1]
  const bare = input.match(/^\d+$/)
  if (bare) return input
  return null
}

/** Filtro client-side de idade da publicação (o site não tem parâmetro de filtro por data). */
export function withinJobage(card: JobCard, days: number): boolean {
  if (!days || days <= 0 || days >= 9999) return true
  if (!card.date) return true
  const posted = Date.parse(card.date)
  if (isNaN(posted)) return true
  return Date.now() - posted <= days * 86400000
}
