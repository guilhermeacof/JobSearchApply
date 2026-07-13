#!/usr/bin/env bun
// Self-contained CLI for searching jobs on BNE — Banco Nacional de Empregos
// (https://www.bne.com.br), a Brazilian job board. No external CLI framework and zero
// runtime dependencies, so it runs anywhere `bun` is available with nothing but the
// repo clone.
//
// The search-results page (`/vagas-de-emprego/<slug>`) is server-rendered HTML, so we
// scrape the job cards directly. A job's full data (canonical URL, company, salary,
// description) comes from the site's own `/vagas-de-emprego/GetJobCard?id=<id>` HTML
// fragment endpoint — the same one the front-end uses — on a robots-allowed path.

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
    n: "limit",
  }
  const boolFlags = new Set(["no-detail", "help", "h"])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (boolFlags.has(key) || next === undefined || next.startsWith("-")) {
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

const HELP = `bne-cli — busca de vagas no BNE (Banco Nacional de Empregos, Brasil)

USAGE
  bun run src/cli.ts search [-q "<termo>"] [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <texto>     Palavras-chave (cargo, skill, tecnologia). Recomendado.
  --location, -l <texto>  Filtra por cidade (ex.: "Brasília", "São Paulo").
  --jobage <dias>         Publicadas nos últimos N dias (filtro client-side pela data
                          relativa da vaga; vagas sem data são mantidas). Default: todas.
  --page <n>              Página 1-indexada. Default 1.
  --limit, -n <n>         Limita o total de resultados exibidos (client-side).
  --no-detail             Não resolve URL/empresa/salário/data por vaga (1 só requisição,
                          bem mais rápido, porém url/salary/date ficam null).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "analista qa" --limit 5 --format table
  bun run src/cli.ts search -q "desenvolvedor" -l "Brasília" --format table
  bun run src/cli.ts search -q "qa" --no-detail --format table
  bun run src/cli.ts detail 6085020 --format plain

Uso pessoal — dados públicos do BNE (páginas /vagas-de-emprego/). Mantenha o volume baixo:
por padrão, 'search' faz uma requisição por resultado exibido — use --limit.
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
          JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n",
        )
        return null
      }
      return val
    }

    for (const name of ["jobage", "page", "limit"]) {
      if (flags[name] !== undefined) {
        const v = parseIntFlag(name, flags[name])
        if (v === null) return 1
        flags[name] = String(v)
      }
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : 9999,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      noDetail: flags["no-detail"] === true,
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
