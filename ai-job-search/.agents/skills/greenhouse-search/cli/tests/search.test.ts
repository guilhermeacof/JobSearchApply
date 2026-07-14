import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

// Mock every board fetch so the aggregation logic can be tested offline. Each board
// returns two jobs; the query "qa" should keep only the QA one.
function boardResponse(token: string) {
  return new Response(
    JSON.stringify({
      jobs: [
        {
          id: `${token}100`,
          title: "Analista de QA",
          updated_at: new Date().toISOString(),
          absolute_url: `https://job-boards.greenhouse.io/${token}/jobs/${token}100`,
          location: { name: "São Paulo, Brasil" },
        },
        {
          id: `${token}200`,
          title: "Analista de Qualidade",
          updated_at: new Date().toISOString(),
          absolute_url: `https://job-boards.greenhouse.io/${token}/jobs/${token}200`,
          location: { name: "Remoto, Brasil" },
        },
      ],
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

describe("runSearch (aggregation)", () => {
  test("aggregates across the registry and filters by query", async () => {
    globalThis.fetch = (async (url: string) => {
      const token = String(url).match(/boards\/([^/]+)\/jobs/)?.[1] ?? "x";
      return boardResponse(token);
    }) as typeof fetch;
    const get = captureStdout();

    const code = await runSearch({ query: "qa", jobage: 9999, page: 1, format: "json" });

    expect(code).toBe(0);
    const out = JSON.parse(get());
    // One QA job per registry company; multiple companies queried.
    expect(out.meta.companies).toBeGreaterThan(1);
    expect(out.results.length).toBe(out.meta.companies);
    for (const r of out.results) {
      expect(r.title).toBe("Analista de QA");
      expect(r.id).toMatch(/^[a-z0-9]+:/);
      for (const key of ["id", "title", "company", "location", "date", "url"]) {
        expect(key in r).toBe(true);
      }
    }
  });

  test("-c restricts to a single board", async () => {
    globalThis.fetch = (async (url: string) => {
      const token = String(url).match(/boards\/([^/]+)\/jobs/)?.[1] ?? "x";
      return boardResponse(token);
    }) as typeof fetch;
    const get = captureStdout();

    const code = await runSearch({ company: "nubank", query: "qa", jobage: 9999, page: 1, format: "json" });

    expect(code).toBe(0);
    const out = JSON.parse(get());
    expect(out.meta.companies).toBe(1);
    expect(out.results[0].id.startsWith("nubank:")).toBe(true);
    expect(out.results[0].company).toBe("Nubank");
  });

  test("--limit acts as page size", async () => {
    globalThis.fetch = (async (url: string) => {
      const token = String(url).match(/boards\/([^/]+)\/jobs/)?.[1] ?? "x";
      return boardResponse(token);
    }) as typeof fetch;
    const get = captureStdout();

    const code = await runSearch({ query: "qa", jobage: 9999, page: 1, limit: 3, format: "json" });

    expect(code).toBe(0);
    const out = JSON.parse(get());
    expect(out.results.length).toBe(3);
    expect(out.meta.total).toBeGreaterThanOrEqual(3);
  });
});
