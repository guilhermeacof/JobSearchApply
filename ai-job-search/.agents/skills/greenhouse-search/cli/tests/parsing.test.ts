import { describe, test, expect } from "bun:test";
import {
  mapCard,
  mapDetail,
  htmlToText,
  normalizeId,
  parseJobsResponse,
  matchesQuery,
  matchesLocation,
  withinDays,
  type RawGhJob,
} from "../src/helpers";

const sample: RawGhJob = {
  id: 5461719004,
  title: "Analista de QA Sênior",
  updated_at: "2026-06-03T14:02:13-04:00",
  absolute_url: "https://job-boards.greenhouse.io/vtex/jobs/5461719004",
  location: { name: "São Paulo, Brasil" },
  departments: [{ name: "Engineering" }],
  offices: [{ name: "Remote BR" }],
  content:
    "&lt;p&gt;Sobre a vaga&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Node&lt;/li&gt;&lt;li&gt;Caf&#233; &amp; ch&#225;&lt;/li&gt;&lt;/ul&gt;",
};

describe("mapCard", () => {
  test("builds a namespaced id and maps core fields", () => {
    const c = mapCard(sample, "vtex", "VTEX");
    expect(c.id).toBe("vtex:5461719004");
    expect(c.title).toBe("Analista de QA Sênior");
    expect(c.company).toBe("VTEX");
    expect(c.location).toBe("São Paulo, Brasil");
    expect(c.date).toBe("2026-06-03T14:02:13-04:00");
    expect(c.url).toBe("https://job-boards.greenhouse.io/vtex/jobs/5461719004");
    expect(c.department).toBe("Engineering");
  });

  test("falls back to offices when departments empty", () => {
    const c = mapCard({ ...sample, departments: [] }, "vtex", "VTEX");
    expect(c.department).toBe("Remote BR");
  });

  test("missing values become null, never omitted", () => {
    const c = mapCard({ id: 1 }, "nubank", "Nubank");
    expect(c.title).toBeNull();
    expect(c.location).toBeNull();
    expect(c.date).toBeNull();
    for (const key of ["id", "title", "company", "location", "date", "url"]) {
      expect(key in c).toBe(true);
    }
  });
});

describe("htmlToText", () => {
  test("decodes entity-escaped Greenhouse HTML into readable text", () => {
    const t = mapDetail(sample, "vtex", "VTEX").description!;
    expect(t).toContain("Sobre a vaga");
    expect(t).toContain("Café & chá");
    expect(t).not.toContain("<");
    expect(t).not.toContain("&lt;");
  });

  test("returns null for empty/undefined input", () => {
    expect(htmlToText(null)).toBeNull();
    expect(htmlToText("")).toBeNull();
  });
});

describe("normalizeId", () => {
  test("parses <token>:<id>", () => {
    expect(normalizeId("nubank:1234567")).toEqual({ token: "nubank", id: "1234567" });
  });
  test("parses a Greenhouse job URL", () => {
    expect(normalizeId("https://job-boards.greenhouse.io/vtex/jobs/5461719004")).toEqual({
      token: "vtex",
      id: "5461719004",
    });
  });
  test("returns null when unparseable", () => {
    expect(normalizeId("not-an-id")).toBeNull();
  });
});

describe("matchesQuery", () => {
  test("short term 'qa' matches as a whole word, not inside 'qualidade'", () => {
    expect(matchesQuery("Analista de QA", "qa")).toBe(true);
    expect(matchesQuery("Analista de Qualidade", "qa")).toBe(false);
  });
  test("longer term matches as accent-insensitive substring", () => {
    expect(matchesQuery("Desenvolvedor Back-End", "desenvolvedor")).toBe(true);
    expect(matchesQuery("Engenheiro de Software", "engenheiro")).toBe(true);
  });
  test("all terms must match (AND)", () => {
    expect(matchesQuery("Analista de Testes Sênior", "analista testes")).toBe(true);
    expect(matchesQuery("Analista Financeiro", "analista testes")).toBe(false);
  });
  test("empty query matches everything", () => {
    expect(matchesQuery("qualquer coisa", undefined)).toBe(true);
  });
});

describe("matchesLocation", () => {
  test("accent-insensitive substring", () => {
    expect(matchesLocation("São Paulo, Brasil", "sao paulo")).toBe(true);
    expect(matchesLocation("Belo Horizonte, MG", "rio")).toBe(false);
  });
});

describe("parseJobsResponse", () => {
  test("normalizes jobs array", () => {
    expect(parseJobsResponse({ jobs: [sample] }).jobs).toHaveLength(1);
  });
  test("tolerates a missing payload", () => {
    expect(parseJobsResponse(null).jobs).toEqual([]);
  });
});

describe("withinDays", () => {
  test("keeps recent, drops old", () => {
    const recent = mapCard({ ...sample, id: 1, updated_at: new Date().toISOString() }, "x", "X");
    const old = mapCard({ ...sample, id: 2, updated_at: "2000-01-01T00:00:00-03:00" }, "x", "X");
    const kept = withinDays([recent, old], 7);
    expect(kept.map((c) => c.id)).toEqual(["x:1"]);
  });
  test("days=9999 keeps everything", () => {
    const old = mapCard({ ...sample, id: 2, updated_at: "2000-01-01T00:00:00-03:00" }, "x", "X");
    expect(withinDays([old], 9999)).toHaveLength(1);
  });
});
