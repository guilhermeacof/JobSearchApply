import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

function apiResponse() {
  return new Response(
    JSON.stringify({
      success: true,
      errors: [],
      data: {
        count: 43,
        totalPages: 5,
        currentPage: 1,
        data: [
          {
            id: "pgB7MzjNbT",
            title: "Analista de Testes",
            companyName: "SGI SISTEMAS LTDA",
            slug: "sgi",
            state: { name: "Santa Catarina", code: "SC" },
            city: { name: "Chapecó" },
            homeOffice: false,
            jobType: "presencial",
            createdAt: new Date().toISOString().slice(0, 10),
            salary: { negotiable: true },
          },
        ],
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
});

function captureStdout(): () => string {
  let stdout = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  return () => stdout;
}

describe("runSearch", () => {
  test("--limit 0 emits zero results", async () => {
    globalThis.fetch = (async () => apiResponse()) as typeof fetch;
    const get = captureStdout();

    const code = await runSearch({ jobage: 9999, page: 1, limit: 0, format: "json" });

    expect(code).toBe(0);
    expect(JSON.parse(get()).results).toHaveLength(0);
  });

  test("maps a result into the shared contract shape", async () => {
    globalThis.fetch = (async () => apiResponse()) as typeof fetch;
    const get = captureStdout();

    const code = await runSearch({ jobage: 9999, page: 1, format: "json" });

    expect(code).toBe(0);
    const out = JSON.parse(get());
    expect(out.meta.count).toBe(1);
    expect(out.meta.total).toBe(43);
    const r = out.results[0];
    expect(r.id).toBe("pgB7MzjNbT");
    expect(r.title).toBe("Analista de Testes");
    expect(r.company).toBe("SGI SISTEMAS LTDA");
    expect(r.url).toBe("https://vagas.solides.com.br/vaga/pgB7MzjNbT/analista-de-testes");
    for (const key of ["id", "title", "company", "location", "date", "url"]) {
      expect(key in r).toBe(true);
    }
  });
});
