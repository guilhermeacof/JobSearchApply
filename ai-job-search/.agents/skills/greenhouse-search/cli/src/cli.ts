#!/usr/bin/env bun
// Self-contained CLI for searching jobs across Greenhouse-hosted company boards.
// Greenhouse is per-company: each company has its own board identified by a "board
// token". This CLI iterates over a registry of Brazilian companies (see companies.ts),
// fetches each board's jobs from the public Greenhouse Job Board API
// (boards-api.greenhouse.io/v1), and aggregates the results. No auth, no API key, and
// zero runtime dependencies — it runs anywhere `bun` is available.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { COMPANIES } from "./companies.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = {
    q: "query",
    l: "location",
    c: "company",
    n: "limit",
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `greenhouse-search — busca de vagas em empresas no Greenhouse (Brasil)

Percorre um registro de ${COMPANIES.length} empresas BR (Inter, Nubank, QuintoAndar, VTEX,
Zup, Wellhub/Gympass, EBANX, Stone, C6 Bank, RD Station) e agrega as vagas de cada board.

USAGE
  bun run src/cli.ts search [-q "<termo>"] [flags]
  bun run src/cli.ts detail <token:id | url> [--format json|plain]

SEARCH FLAGS
  --query, -q <texto>     Palavras-chave sobre o título (client-side). Termos curtos
                          como "qa" casam por palavra inteira. Recomendado.
  --location, -l <texto>  Filtra por localização (client-side), ex.: "São Paulo", "Remoto".
  --company, -c <token>   Restringe a UMA empresa pelo board token, ex.: "nubank".
  --jobage <dias>         Atualizadas nos últimos N dias (client-side sobre updated_at).
  --page <n>              Página 1-indexada (usa --limit como tamanho de página). Default 1.
  --limit, -n <n>         Tamanho da página / limite de resultados (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "qa" --limit 8 --format table
  bun run src/cli.ts search -q "desenvolvedor" --limit 10 --format table
  bun run src/cli.ts search -q "analista de testes" --format table
  bun run src/cli.ts search -c "nubank" -q "engineer" --format table
  bun run src/cli.ts detail nubank:1234567 --format plain

Uso pessoal — dados via API pública do Greenhouse (boards-api.greenhouse.io); 1 request
por empresa por busca. Mantenha o volume baixo.
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        process.stderr.write(
          JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) +
            "\n",
        )
        return null
      }
      return val
    }

    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      flags.jobage = String(v)
    }
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      flags.page = String(v)
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      company: typeof flags.company === "string" ? flags.company : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : 9999,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(
        JSON.stringify({ error: "detail requires a <token:id|url>", code: "NO_ID" }) + "\n",
      )
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main().then((code) => process.exit(code))
