import { describe, expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

interface SearchResponse {
  meta: { count: number; page: number };
  results: Array<{
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    date: string | null;
    url: string;
  }>;
}

describe("smoke test ao vivo do vagas-search", () => {
  test("search retorna resultados com os campos obrigatórios", async () => {
    const result = await runCLI(["search", "-q", "analista de testes", "--limit", "5"]);
    expect(result.exitCode).toBe(0);
    const body = parseJSON<SearchResponse>(result);
    expect(body.meta.count).toBeGreaterThanOrEqual(1);
    for (const job of body.results) {
      expect(job.id).toBeTruthy();
      expect(job.title).toBeTruthy();
      expect(job.url).toMatch(/^https:\/\/www\.vagas\.com\.br\//);
    }
  });
});
