import { API_URL, jsonFetch, normalizeId, toDetail, writeError, type GupyJob } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Não foi possível extrair um ID de vaga de "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    // Hoje o endpoint retorna o objeto da vaga sem envelope; toleramos também um
    // envelope {data: ...}, já que o endpoint de busca usa um.
    const body = (await jsonFetch(`${API_URL}/${id}`)) as
      | (GupyJob & { data?: never })
      | { data: GupyJob }
      | null
    const raw = body && "data" in body && body.data ? body.data : (body as GupyJob | null)
    if (!raw || !raw.id) {
      writeError("Vaga não encontrada", "NOT_FOUND")
      return 1
    }
    const job = toDetail(raw)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.workplaceType ? `Workplace: ${job.workplaceType}` : "",
        job.deadline ? `Deadline: ${job.deadline}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
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
