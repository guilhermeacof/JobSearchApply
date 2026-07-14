import {
  API_BASE,
  jsonFetch,
  mapDetail,
  normalizeId,
  writeError,
  type RawGhJob,
} from "../helpers.js"
import { companyNameFor } from "../companies.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const parsed = normalizeId(opts.id)
  if (!parsed) {
    writeError(
      `Could not parse a "<token>:<id>" or Greenhouse URL from "${opts.id}"`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const payload = await jsonFetch(
      `${API_BASE}/${parsed.token}/jobs/${parsed.id}?questions=false`,
    )
    if (!payload) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = mapDetail(payload as RawGhJob, parsed.token, companyNameFor(parsed.token))

    if (opts.format === "plain") {
      const lines = [
        job.title || "(sem título)",
        `${job.company || "—"} · ${job.location || "—"}`,
        job.department ? `Área: ${job.department}` : "",
        job.date ? `Atualizada: ${job.date}` : "",
        "",
        job.description || "(sem descrição)",
        "",
        `URL: ${job.url}`,
        `id: ${job.id}`,
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
