import { describe, expect, test } from "bun:test";
import {
  buildLocation,
  cleanDescription,
  normalizeId,
  toCard,
  workplaceTypeParam,
  type GupyJob,
} from "../src/helpers";

const baseJob: GupyJob = {
  id: 11617787,
  name: "QA Senior",
  careerPageName: "Gauge",
  careerPageUrl: "https://gaugecarreiras.gupy.io/x",
  description: "<p>Descri&ccedil;&atilde;o da vaga</p><ul><li>Item um</li></ul>",
  type: "vacancy_type_effective",
  publishedDate: "2026-07-10T20:14:30.253Z",
  applicationDeadline: "2026-07-13",
  isRemoteWork: true,
  city: "",
  state: "",
  country: "Brasil",
  workplaceType: "remote",
  jobUrl: "https://gaugecarreiras.gupy.io/job/eyJqb2JJZCI6MTE2MTc3ODcsInNvdXJjZSI6Imd1cHlfcG9ydGFsIn0",
};

describe("toCard", () => {
  test("mapeia os campos da API para o contrato da skill de portal", () => {
    const card = toCard(baseJob);
    expect(card.id).toBe("11617787");
    expect(card.title).toBe("QA Senior");
    expect(card.company).toBe("Gauge");
    expect(card.location).toBe("Remoto (Brasil)");
    expect(card.date).toBe("2026-07-10");
    expect(card.url).toContain("gupy.io/job/");
  });
});

describe("buildLocation", () => {
  test("vaga presencial junta cidade e estado", () => {
    const loc = buildLocation({
      ...baseJob,
      isRemoteWork: false,
      workplaceType: "on-site",
      city: "São Paulo",
      state: "São Paulo",
    });
    expect(loc).toBe("São Paulo, São Paulo");
  });

  test("campos de localização vazios resultam em null", () => {
    const loc = buildLocation({ ...baseJob, isRemoteWork: false, workplaceType: "on-site", country: "" });
    expect(loc).toBeNull();
  });
});

describe("cleanDescription", () => {
  test("remove tags, decodifica entidades, preserva quebras de bloco", () => {
    const text = cleanDescription(baseJob.description as string);
    expect(text).toContain("Descrição da vaga");
    expect(text).toContain("Item um");
    expect(text).not.toContain("<p>");
  });
});

describe("normalizeId", () => {
  test("aceita um id numérico puro", () => {
    expect(normalizeId("11617787")).toBe("11617787");
  });

  test("decodifica o segmento base64 de uma URL de vaga da Gupy", () => {
    expect(normalizeId(baseJob.jobUrl as string)).toBe("11617787");
  });

  test("rejeita entrada inválida", () => {
    expect(normalizeId("not-a-job-id")).toBeNull();
  });
});

describe("workplaceTypeParam", () => {
  test("mapeia onsite para on-site", () => {
    expect(workplaceTypeParam("onsite")).toBe("on-site");
    expect(workplaceTypeParam("remote")).toBe("remote");
    expect(workplaceTypeParam(undefined)).toBeNull();
  });
});
