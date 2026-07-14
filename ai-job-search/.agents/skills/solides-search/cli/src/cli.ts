#!/usr/bin/env bun
// Self-contained CLI for searching the public Sólides jobs board (vagas.solides.com.br),
// a MULTI-COMPANY board aggregating openings from every company that hosts its careers
// site on Sólides. No external CLI framework and zero runtime dependencies, so it runs
// anywhere `bun` is available with nothing but the repo clone.
//
// The board is a client-rendered Next.js app; this CLI talks to the same public JSON API
// gateway the site's front-end calls (`apigw.solides.com.br/jobs/v3`), so no HTML
// scraping or headless browser is needed.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = {
    q: "query",
    l: "location",
    a: "area",
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

const HELP = `solides-cli — busca no board público de vagas da Sólides (vagas.solides.com.br)

Board multi-empresa: agrega vagas de muitas empresas que usam a Sólides no Brasil.

USAGE
  bun run src/cli.ts search [-q "<termo>"] [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <texto>     Palavras-chave do título da vaga (cargo, skill). Recomendado.
  --location, -l <texto>  Localização no formato "Cidade - UF", ex.: "São Paulo - SP".
  --area, -a <slug>       Área de atuação, ex.: "tecnologia", "administrativo", "marketing".
  --jobage <dias>         Publicadas nos últimos N dias (filtro client-side por data). Default: todas.
  --page <n>              Página 1-indexada (10 resultados/página). Default 1.
  --limit, -n <n>         Limita o total de resultados exibidos (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "desenvolvedor" --limit 5 --format table
  bun run src/cli.ts search -q "analista de testes" -l "São Paulo - SP" --format table
  bun run src/cli.ts search -q "qa" --jobage 7 --format table
  bun run src/cli.ts detail pgB7MzjNbT --format plain

Uso pessoal — dados da Sólides via API pública; mantenha o volume baixo.
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
        process.stderr.write(JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n")
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
      occupationArea: typeof flags.area === "string" ? flags.area : undefined,
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
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
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
