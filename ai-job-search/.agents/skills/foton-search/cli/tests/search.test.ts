import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

interface SearchOutput {
  meta: { count: number; page: number; total: number | null };
  results: Array<{
    id: string;
    title: string | null;
    company: string;
    location: string | null;
    date: string | null;
    url: string;
  }>;
}

// Live smoke tests against Fóton's public /vagas/ page. The listing is a single
// server-rendered page, so an unfiltered search returns every open vacancy.
describe("foton search (live)", () => {
  test("unfiltered search returns real vacancies with populated id/title/url", async () => {
    const res = await runCLI(["search", "--limit", "10", "--format", "json"]);
    const out = parseJSON<SearchOutput>(res);
    expect(out.results.length).toBeGreaterThan(0);
    const r = out.results[0];
    expect(r.id.length).toBeGreaterThan(0);
    expect(r.title && r.title.length).toBeGreaterThan(0);
    expect(r.url).toContain("https://www.foton.la/");
    expect(r.company).toBe("Fóton Informática");
  }, 30000);

  test("query filters client-side and finds the teste role", async () => {
    const res = await runCLI(["search", "-q", "teste", "--format", "json"]);
    const out = parseJSON<SearchOutput>(res);
    expect(out.results.length).toBeGreaterThan(0);
    expect(
      out.results.every((r) => (r.title || "").toLowerCase().includes("test")),
    ).toBe(true);
  }, 30000);
});
