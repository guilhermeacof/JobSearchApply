import { test, expect } from "bun:test"
import { runCLI, parseJSON } from "./helpers"

interface SearchResult {
  meta: { count: number; page: number }
  results: Array<{
    id: string
    title: string | null
    company: string | null
    location: string | null
    date: string | null
    url: string
  }>
}

test("search returns real results with populated id/title/url", async () => {
  const res = await runCLI(["search", "-q", "analista qa", "--limit", "5"])
  expect(res.exitCode).toBe(0)
  const data = parseJSON<SearchResult>(res)
  expect(Array.isArray(data.results)).toBe(true)
  expect(data.results.length).toBeGreaterThan(0)
  const first = data.results[0]
  expect(first.id).toMatch(/^\d+$/)
  expect(first.title && first.title.length).toBeGreaterThan(0)
  expect(first.url).toContain("infojobs.com.br")
}, 30000)

test("meta.count matches results length", async () => {
  const res = await runCLI(["search", "-q", "analista qa", "--limit", "3"])
  const data = parseJSON<SearchResult>(res)
  expect(data.meta.count).toBe(data.results.length)
  expect(data.results.length).toBeLessThanOrEqual(3)
}, 30000)

test("detail returns a description for a live posting", async () => {
  const search = await runCLI(["search", "-q", "analista qa", "--limit", "5"])
  const data = parseJSON<SearchResult>(search)
  const id = data.results[0]?.id
  expect(id).toBeTruthy()
  const res = await runCLI(["detail", id, "--format", "plain"])
  expect(res.exitCode).toBe(0)
  expect(res.stdout.length).toBeGreaterThan(20)
}, 30000)

test("missing detail id exits 1 with JSON error on stderr", async () => {
  const res = await runCLI(["detail"])
  expect(res.exitCode).toBe(1)
  expect(res.stdout).toBe("")
  const err = JSON.parse(res.stderr)
  expect(err.code).toBe("NO_ID")
}, 15000)

test("bad --jobage value exits 1 with JSON error on stderr", async () => {
  const res = await runCLI(["search", "-q", "qa", "--jobage", "abc"])
  expect(res.exitCode).toBe(1)
  const err = JSON.parse(res.stderr)
  expect(err.code).toBe("BAD_ARG")
}, 15000)
