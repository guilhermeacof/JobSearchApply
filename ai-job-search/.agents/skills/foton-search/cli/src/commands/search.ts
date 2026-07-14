import {
  LISTING_URL,
  htmlFetch,
  parseJobCards,
  fold,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

const PAGE_SIZE = 20

function matchesQuery(c: JobCard, q: string): boolean {
  const needle = fold(q)
  const hay = fold([c.title, c.location].filter(Boolean).join(" "))
  return hay.includes(needle)
}

function matchesLocation(c: JobCard, loc: string): boolean {
  const needle = fold(loc)
  const hay = fold([c.location, c.model].filter(Boolean).join(" "))
  return hay.includes(needle)
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "Nenhum resultado."
  const rows = cards.map((c) => {
    const id = (c.id || "").slice(0, 34).padEnd(34)
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const loc = (c.location || "—").slice(0, 30).padEnd(30)
    return `${id} ${title} ${loc}`
  })
  const header =
    "ID (slug)".padEnd(34) + " " + "TITLE".padEnd(40) + " " + "LOCATION/MODEL"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(LISTING_URL)
    let cards = parseJobCards(html)

    if (opts.query) cards = cards.filter((c) => matchesQuery(c, opts.query!))
    if (opts.location) cards = cards.filter((c) => matchesLocation(c, opts.location!))

    const total = cards.length
    const total_pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const startIdx = (opts.page - 1) * PAGE_SIZE
    let pageCards = cards.slice(startIdx, startIdx + PAGE_SIZE)
    if (opts.limit !== undefined && opts.limit >= 0) pageCards = pageCards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(pageCards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        pageCards
          .map(
            (c) =>
              `${c.title || "(sem título)"}\n  ${c.company} · ${c.location || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: pageCards.length,
              page: opts.page,
              total,
              total_pages,
              per_page: PAGE_SIZE,
            },
            results: pageCards,
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
