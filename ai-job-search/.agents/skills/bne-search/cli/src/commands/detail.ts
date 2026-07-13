import {
  htmlFetch,
  parseDetailFragment,
  detailUrl,
  normalizeId,
  writeError,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Não foi possível extrair um id de vaga de "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(detailUrl(id))
    if (!html || !/link-vaga|descricao__vaga/i.test(html)) {
      writeError("Vaga não encontrada", "NOT_FOUND")
      return 1
    }
    const job = parseDetailFragment(html, { id })

    if (opts.format === "plain") {
      const lines = [
        job.title || "(sem título)",
        `${job.company || "—"} · ${job.location || "—"}`,
        job.salary ? `Salário: ${job.salary}` : "",
        job.date ? `Publicada: ${job.date}` : "",
        job.remote ? "Regime: Home Office" : "",
        "",
        job.description || "(sem descrição)",
        "",
        job.url ? `URL: ${job.url}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
