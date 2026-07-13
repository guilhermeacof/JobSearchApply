# infojobs-cli

Zero-dependency `bun` CLI that searches **InfoJobs Brasil** (`https://www.infojobs.com.br`)
by reading its public server-rendered search and detail pages. No authentication, no API key,
no browser — just `bun` + `fetch` + chunked regex parsing.

## Setup

```bash
cd .agents/skills/infojobs-search/cli
bun install      # pulls dev types only (typescript, @types/bun) — no runtime deps
bun run typecheck
```

## Usage

```bash
# Search (default JSON output)
bun run src/cli.ts search -q "analista qa" --limit 5 --format table
bun run src/cli.ts search -q "qa" -l "São Paulo" --jobage 7 --format table

# Detail by id or URL
bun run src/cli.ts detail 11794540 --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for the endpoints and
HTML parsing anchors.

## Contract

- Commands: `search` and `detail <id|url>`.
- Flags: `--query/-q`, `--location/-l`, `--jobage <days>`, `--page <n>`, `--limit/-n`,
  `--format json|table|plain` (default `json`).
- Search JSON: `{ "meta": { count, page }, "results": [{ id, title, company, location, date, url }] }`
  (missing values are `null`).
- Errors → stderr as `{ "error", "code" }`, exit code `1`.
- 429/5xx are retried with exponential backoff.

## Tests

```bash
bun run test   # live smoke tests: search returns real results, detail works, error paths exit 1
```

## Notes

- Location filtering is via InfoJobs' URL path (`-em-<state>`); state names work best.
- `--jobage` is a client-side filter (the search URL has no age parameter).
- **Personal use only** — keep request volume low; do not use for bulk/commercial scraping.
