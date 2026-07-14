import {
  API_BASE,
  jsonFetch,
  parseJobsResponse,
  mapCard,
  matchesQuery,
  matchesLocation,
  withinDays,
  writeError,
  type JobCard,
} from "../helpers.js"
import { COMPANIES, companyNameFor, findCompany, type Company } from "../companies.js"

export interface SearchOpts {
  query?: string
  location?: string
  company?: string
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

/** Fetch and map one company's board; returns [] on any per-board failure. */
async function fetchBoard(c: Company): Promise<JobCard[]> {
  try {
    const payload = await jsonFetch(`${API_BASE}/${c.token}/jobs?content=true`)
    if (!payload) return []
    return parseJobsResponse(payload).jobs.map((j) => mapCard(j, c.token, c.nome))
  } catch {
    return []
  }
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "Nenhum resultado."
  const rows = cards.map((c) => {
    const id = c.id.slice(0, 22).padEnd(22)
    const title = (c.title || "").slice(0, 36).padEnd(36)
    const company = (c.company || "—").slice(0, 18).padEnd(18)
    const loc = (c.location || "—").slice(0, 24).padEnd(24)
    const date = (c.date || "—").slice(0, 10)
    return `${id} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(22) +
    " " +
    "TITLE".padEnd(36) +
    " " +
    "COMPANY".padEnd(18) +
    " " +
    "LOCATION".padEnd(24) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    // Resolve which boards to query: one company (via -c) or the whole registry.
    let boards: Company[]
    if (opts.company) {
      boards = [{ token: opts.company, nome: companyNameFor(opts.company) }]
      if (!findCompany(opts.company)) {
        // Not in the registry — still allowed, but warn on stderr (non-fatal).
        process.stderr.write(
          JSON.stringify({
            error: `token "${opts.company}" is not in the registry; querying it anyway`,
            code: "UNKNOWN_TOKEN",
          }) + "\n",
        )
      }
    } else {
      boards = COMPANIES
    }

    // One request per board, aggregated. Per-board failures are swallowed so one
    // dead board cannot break the whole search.
    const perBoard = await Promise.all(boards.map(fetchBoard))
    let cards = perBoard.flat()

    // Client-side filters.
    cards = cards.filter(
      (c) => matchesQuery(c.title, opts.query) && matchesLocation(c.location, opts.location),
    )
    cards = withinDays(cards, opts.jobage)

    // Newest first (by updated_at) so aggregation across boards is ordered.
    cards.sort((a, b) => (Date.parse(b.date || "") || 0) - (Date.parse(a.date || "") || 0))

    const total = cards.length

    // Pagination is fully client-side: --limit is the page size, --page selects the slice.
    if (opts.limit !== undefined && opts.limit >= 0) {
      const start = (opts.page - 1) * opts.limit
      cards = cards.slice(start, start + opts.limit)
    }

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
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
              total,
              companies: boards.length,
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
