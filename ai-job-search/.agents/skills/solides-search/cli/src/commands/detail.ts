import {
  API_BASE,
  DETAIL_PATH,
  jsonFetch,
  mapDetail,
  normalizeId,
  parseDetailResponse,
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
    const payload = await jsonFetch(`${API_BASE}${DETAIL_PATH}/${id}`)
    const raw = parseDetailResponse(payload)
    if (!raw || raw.id == null) {
      writeError("Vaga não encontrada", "NOT_FOUND")
      return 1
    }
    const job = mapDetail(raw)

    if (opts.format === "plain") {
      const lines = [
        job.title || "(sem título)",
        `${job.company || "—"} · ${job.location || "—"}`,
        job.salary ? `Salário: ${job.salary}` : "",
        job.contractType ? `Contrato: ${job.contractType}` : "",
        job.seniority ? `Senioridade: ${job.seniority}` : "",
        job.shift ? `Jornada: ${job.shift}` : "",
        "",
        job.description || "(sem descrição)",
        job.requirements ? `\nRequisitos / Skills:\n${job.requirements}` : "",
        job.benefits ? `\nBenefícios:\n${job.benefits}` : "",
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
