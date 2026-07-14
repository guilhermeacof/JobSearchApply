import { describe, test, expect } from "bun:test";
import {
  mapCard,
  mapDetail,
  htmlToText,
  normalizeId,
  slugify,
  parseSearchResponse,
  parseDetailResponse,
  withinDays,
  jobUrl,
  type RawVacancy,
} from "../src/helpers";

const sample: RawVacancy = {
  id: "pgB7MzjNbT",
  title: "Desenvolvedor Javascript - Automação e Integrações",
  companyName: "COOPERCARD",
  slug: "coopercard",
  state: { name: "Paraná", code: "PR" },
  city: { name: "Maringá", state_id: 18 } as RawVacancy["city"],
  homeOffice: false,
  jobType: "presencial",
  createdAt: "2026-07-14",
  redirectLink: "https://coopercard.solides.jobs/vacancies/pgB7MzjNbT?origem=portal",
  salary: { type: "range", initialRange: 5000, finalRange: 8000, negotiable: false },
  hardSkills: [{ name: "JavaScript" }, { name: "Node.js" }],
  benefits: [{ name: "Vale Refeição" }],
  recruitmentContractType: [{ name: "CLT" }],
  seniority: [{ name: "Pleno" }],
  description: "<h2>Vaga</h2><p>Atuar com automação</p><ul><li>Node</li><li>Caf&#233; incluso</li></ul>",
};

describe("mapCard", () => {
  test("maps core fields and builds a canonical portal URL", () => {
    const c = mapCard(sample);
    expect(c.id).toBe("pgB7MzjNbT");
    expect(c.title).toBe("Desenvolvedor Javascript - Automação e Integrações");
    expect(c.company).toBe("COOPERCARD");
    expect(c.url).toBe(
      "https://vagas.solides.com.br/vaga/pgB7MzjNbT/desenvolvedor-javascript-automacao-e-integracoes",
    );
    expect(c.date).toBe("2026-07-14");
    expect(c.salary).toBe("R$ 5.000,00 a R$ 8.000,00");
  });

  test("location combines city/state code and modality", () => {
    expect(mapCard(sample).location).toBe("Maringá - PR · Presencial");
  });

  test("home office renders as Remoto", () => {
    const c = mapCard({ ...sample, homeOffice: true });
    expect(c.location).toBe("Maringá - PR · Remoto");
  });

  test("missing values become null, never omitted", () => {
    const c = mapCard({ id: "abc123" });
    expect(c.title).toBeNull();
    expect(c.company).toBeNull();
    expect(c.location).toBeNull();
    expect(c.date).toBeNull();
    expect(c.salary).toBeNull();
    for (const key of ["id", "title", "company", "location", "date", "url"]) {
      expect(key in c).toBe(true);
    }
  });

  test("negotiable salary renders as 'A combinar'", () => {
    const c = mapCard({ ...sample, salary: { negotiable: true } });
    expect(c.salary).toBe("A combinar");
  });
});

describe("mapDetail", () => {
  test("strips HTML and joins named lists", () => {
    const d = mapDetail(sample);
    expect(d.description).toContain("Atuar com automação");
    expect(d.description).toContain("Café incluso");
    expect(d.description).not.toContain("<");
    expect(d.requirements).toBe("JavaScript\nNode.js");
    expect(d.benefits).toBe("Vale Refeição");
    expect(d.contractType).toBe("CLT");
    expect(d.seniority).toBe("Pleno");
    expect(d.applyUrl).toBe("https://coopercard.solides.jobs/vacancies/pgB7MzjNbT?origem=portal");
  });
});

describe("htmlToText", () => {
  test("decodes numeric entities", () => {
    expect(htmlToText("Caf&#233;")).toBe("Café");
  });
  test("returns null for empty/undefined input", () => {
    expect(htmlToText(null)).toBeNull();
    expect(htmlToText("")).toBeNull();
  });
});

describe("slugify", () => {
  test("normalizes accents and spaces", () => {
    expect(slugify("Análise de Testes (QA)")).toBe("analise-de-testes-qa");
  });
  test("falls back to 'vaga' when empty", () => {
    expect(slugify(null)).toBe("vaga");
    expect(slugify("!!!")).toBe("vaga");
  });
});

describe("jobUrl", () => {
  test("builds /vaga/<id>/<slug>", () => {
    expect(jobUrl("abc123", "QA Senior")).toBe("https://vagas.solides.com.br/vaga/abc123/qa-senior");
  });
});

describe("normalizeId", () => {
  test("accepts a bare alphanumeric id", () => {
    expect(normalizeId("pgB7MzjNbT")).toBe("pgB7MzjNbT");
  });
  test("extracts id from a portal /vaga/ URL", () => {
    expect(normalizeId("https://vagas.solides.com.br/vaga/pgB7MzjNbT/desenvolvedor")).toBe("pgB7MzjNbT");
  });
  test("extracts id from a company /vacancies/ URL", () => {
    expect(normalizeId("https://coopercard.solides.jobs/vacancies/pgB7MzjNbT?origem=portal")).toBe("pgB7MzjNbT");
  });
  test("returns null when there is no id", () => {
    expect(normalizeId("!!")).toBeNull();
  });
});

describe("parseSearchResponse", () => {
  test("normalizes vacancies and pagination", () => {
    const r = parseSearchResponse({
      success: true,
      data: { count: 1024, totalPages: 103, currentPage: 1, data: [sample] },
    });
    expect(r.vacancies).toHaveLength(1);
    expect(r.pagination.total).toBe(1024);
    expect(r.pagination.total_pages).toBe(103);
  });
  test("tolerates a missing payload", () => {
    const r = parseSearchResponse(null);
    expect(r.vacancies).toEqual([]);
    expect(r.pagination.total).toBeNull();
  });
});

describe("parseDetailResponse", () => {
  test("unwraps the data key", () => {
    const r = parseDetailResponse({ success: true, data: sample });
    expect(r?.id).toBe("pgB7MzjNbT");
  });
  test("returns null for empty payload", () => {
    expect(parseDetailResponse(null)).toBeNull();
  });
});

describe("withinDays", () => {
  test("keeps recent, drops old", () => {
    const recent = mapCard({ ...sample, id: "r1", createdAt: new Date().toISOString().slice(0, 10) });
    const old = mapCard({ ...sample, id: "o1", createdAt: "2000-01-01" });
    const kept = withinDays([recent, old], 7);
    expect(kept.map((c) => c.id)).toEqual(["r1"]);
  });
  test("days=9999 keeps everything", () => {
    const old = mapCard({ ...sample, id: "o1", createdAt: "2000-01-01" });
    expect(withinDays([old], 9999)).toHaveLength(1);
  });
});
