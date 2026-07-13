import { test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

interface SearchResult {
  meta: { count: number; page: number };
  results: Array<{
    id: string;
    title: string | null;
    company: string | null;
    location: string | null;
    date: string | null;
    url: string | null;
  }>;
}

// Live smoke tests. These hit BNE's public pages, so keep the volume tiny.

test("search returns real results with id/title/url", async () => {
  const res = await runCLI(["search", "-q", "desenvolvedor", "--limit", "3", "--format", "json"]);
  const data = parseJSON<SearchResult>(res);
  expect(res.exitCode).toBe(0);
  expect(data.results.length).toBeGreaterThan(0);
  const first = data.results[0];
  expect(first.id).toMatch(/^\d+$/);
  expect(first.title && first.title.length).toBeGreaterThan(0);
  // With enrichment (default), each emitted result resolves a canonical BNE URL.
  expect(first.url).toContain("bne.com.br");
}, 30000);

test("--no-detail fast path still returns titled results", async () => {
  const res = await runCLI(["search", "-q", "analista", "--limit", "3", "--no-detail", "--format", "json"]);
  const data = parseJSON<SearchResult>(res);
  expect(res.exitCode).toBe(0);
  expect(data.results.length).toBeGreaterThan(0);
  expect(data.results[0].id).toMatch(/^\d+$/);
}, 30000);

test("detail returns a job for an id taken from search", async () => {
  const s = await runCLI(["search", "-q", "desenvolvedor", "--limit", "1", "--no-detail", "--format", "json"]);
  const data = parseJSON<SearchResult>(s);
  const id = data.results[0].id;
  const res = await runCLI(["detail", id, "--format", "json"]);
  const job = parseJSON<{ id: string; title: string | null; url: string | null }>(res);
  expect(res.exitCode).toBe(0);
  expect(job.id).toBe(id);
  expect(job.url).toContain("bne.com.br");
}, 30000);

test("missing detail id exits 1 with a JSON error on stderr", async () => {
  const res = await runCLI(["detail"]);
  expect(res.exitCode).toBe(1);
  expect(res.stdout).toBe("");
  const err = JSON.parse(res.stderr);
  expect(err.code).toBe("NO_ID");
}, 30000);

test("unknown command exits 1 with a JSON error on stderr", async () => {
  const res = await runCLI(["frobnicate"]);
  expect(res.exitCode).toBe(1);
  const err = JSON.parse(res.stderr);
  expect(err.code).toBe("BAD_CMD");
}, 30000);
