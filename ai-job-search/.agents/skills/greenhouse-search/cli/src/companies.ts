// Registry of Brazilian companies that publish jobs on Greenhouse (each company
// hosts its own board, identified by a "board token"). `search` iterates over this
// list, fetches each board's jobs, and aggregates the results.
//
// HOW TO ADD A COMPANY
//   1. Find the board token. It appears in the company's careers URL, e.g.
//      https://job-boards.greenhouse.io/<token>  ->  token = "vtex".
//   2. Confirm the token is live and returns jobs:
//        curl "https://boards-api.greenhouse.io/v1/boards/<token>/jobs" | head
//      and read the display name from:
//        curl "https://boards-api.greenhouse.io/v1/boards/<token>"   ->  { "name": ... }
//   3. Add a { token, nome } entry below. `nome` is the human-readable company name
//      shown as `company` in results (edit it to taste — it need not match the board's
//      own name field).
//
// Only include tokens that actually return jobs from boards-api.greenhouse.io.

export interface Company {
  /** Greenhouse board token (the `<token>` in boards-api URLs). */
  token: string
  /** Human-readable company name shown as `company` in results. */
  nome: string
}

/** Seed registry of Brazilian companies (all tokens verified live on boards-api). */
export const COMPANIES: Company[] = [
  { token: "inter", nome: "Banco Inter" },
  { token: "zupinnovation", nome: "Zup Innovation" },
  { token: "nubank", nome: "Nubank" },
  { token: "quintoandar", nome: "QuintoAndar" },
  { token: "gympass", nome: "Wellhub (Gympass)" },
  { token: "vtex", nome: "VTEX" },
  { token: "ebanx", nome: "EBANX" },
  { token: "stone", nome: "Stone" },
  { token: "c6bank", nome: "C6 Bank" },
  { token: "rdstation", nome: "RD Station" },
]

/** Look up a registry entry by token (case-insensitive). */
export function findCompany(token: string): Company | undefined {
  const t = token.toLowerCase()
  return COMPANIES.find((c) => c.token.toLowerCase() === t)
}

/** Resolve a display name for a token, falling back to the token itself. */
export function companyNameFor(token: string): string {
  return findCompany(token)?.nome ?? token
}
