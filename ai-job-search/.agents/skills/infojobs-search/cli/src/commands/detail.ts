import {
  ORIGIN,
  htmlFetch,
  parseJobDetail,
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
    // The slug segment is ignored by InfoJobs — only the numeric id matters.
    const html = await htmlFetch(`${ORIGIN}/vaga-de-vaga__${id}.aspx`)
    if (!html) {
      writeError("Vaga não encontrada", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id)
    if (!job.title && !job.description) {
      writeError("Vaga não encontrada ou expirada", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title || "(sem título)",
        `${job.company || "—"} · ${job.location || "—"} · ${job.date || "—"}`,
        job.employmentType ? `Regime: ${job.employmentType}` : "",
        "",
        job.description || "(sem descrição)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Candidatar: ${job.applyUrl}` : "",
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
