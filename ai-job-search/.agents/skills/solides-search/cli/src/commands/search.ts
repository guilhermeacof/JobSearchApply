import {
  API_BASE,
  SEARCH_PATH,
  jsonFetch,
  parseSearchResponse,
  mapCard,
  withinDays,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  occupationArea?: string
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("title", opts.query)
  if (opts.location) params.set("locations", opts.location)
  if (opts.occupationArea) params.set("occupationAreas", opts.occupationArea)
  params.set("page", String(opts.page))
  return `${API_BASE}${SEARCH_PATH}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "Nenhum resultado."
  const rows = cards.map((c) => {
    const id = (c.id || "").slice(0, 12).padEnd(12)
    const title = (c.title || "").slice(0, 38).padEnd(38)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 24).padEnd(24)
    const date = (c.date || "—").slice(0, 10)
    return `${id} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(12) +
    " " +
    "TITLE".padEnd(38) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(24) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const payload = await jsonFetch(buildUrl(opts))
    const parsed = parseSearchResponse(payload)
    let cards = parsed.vacancies.map(mapCard)
    cards = withinDays(cards, opts.jobage)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.salary || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              page: opts.page,
              total: parsed.pagination.total,
              total_pages: parsed.pagination.total_pages,
              per_page: 10,
            },
            results: cards,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
