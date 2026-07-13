import {
  SEARCH_PATH,
  htmlFetch,
  parseSearchCards,
  parseDetailFragment,
  detailUrl,
  slugify,
  withinDays,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage: number
  page: number
  limit?: number
  noDetail: boolean
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts): string {
  let slug = opts.query ? slugify(opts.query) : ""
  if (opts.location) {
    const loc = slugify(opts.location)
    slug = slug ? `${slug}-em-${loc}` : `-em-${loc}`
  }
  const base = slug ? `${SEARCH_PATH}/${slug}` : SEARCH_PATH
  return `${base}?Page=${opts.page}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "Nenhum resultado."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 24).padEnd(24)
    const date = (c.date || "—").slice(0, 16)
    return `${c.id.padEnd(9)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(9) +
    " " +
    "TITLE".padEnd(40) +
    " " +
    "COMPANY".padEnd(24) +
    " " +
    "LOCATION".padEnd(24) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    const raw = parseSearchCards(html)

    // Apply the client-side cap first so we only make detail requests for what we emit.
    const capped = opts.limit !== undefined && opts.limit >= 0 ? raw.slice(0, opts.limit) : raw

    let cards: JobCard[]
    if (opts.noDetail) {
      // Fast path: single request. URL / salary / date are not on the listing page.
      cards = capped.map((r) => ({
        id: r.id,
        title: r.title,
        company: r.company,
        location: r.location,
        date: null,
        url: null,
        salary: null,
        type: null,
        remote: r.remote,
      }))
    } else {
      // Resolve canonical URL, company, salary and date via one GetJobCard request each.
      cards = []
      for (const r of capped) {
        try {
          const frag = await htmlFetch(detailUrl(r.id))
          const d = parseDetailFragment(frag, {
            id: r.id,
            title: r.title,
            location: r.location,
            remote: r.remote,
          })
          cards.push({
            id: d.id,
            title: d.title,
            company: d.company || r.company,
            location: d.location,
            date: d.date,
            url: d.url,
            salary: d.salary,
            type: d.type,
            remote: d.remote,
          })
        } catch {
          // A failed enrichment shouldn't drop the result — emit what the card gave us.
          cards.push({
            id: r.id,
            title: r.title,
            company: r.company,
            location: r.location,
            date: null,
            url: null,
            salary: null,
            type: null,
            remote: r.remote,
          })
        }
      }
      cards = withinDays(cards, opts.jobage)
    }

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title || "—"}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.salary || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url || "—"}`,
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
              query: opts.query ?? null,
              location: opts.location ?? null,
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
