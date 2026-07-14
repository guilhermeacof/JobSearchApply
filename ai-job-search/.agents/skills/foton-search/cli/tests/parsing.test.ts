import { describe, test, expect } from "bun:test";
import {
  parseJobCards,
  parseJobDetail,
  normalizeSlug,
  htmlToText,
  fold,
  COMPANY,
} from "../src/helpers";

// Two real-shaped accordion cards from /vagas/: one hybrid, one remote, plus a
// non-vacancy accordion (no "Ver vaga completa" link) that must be ignored.
const LISTING_HTML = `
<div class="uc_ac_box ">
  <div class="uc-heading uc_trigger">
    <em class="ue_heading_title">Analista de Teste (h&#237;brido S&#227;o Paulo/SP) </em>
  </div>
  <div class="uc_content" >
    <div class="ue_post_text">Modalidade de trabalho: H&#237;brido (S&#227;o Paulo/SP)

Todas as nossas vagas s&#227;o extensivas a Pessoas com Defici&#234;ncia (PcD).</div>
    <a href="https://www.foton.la/analista-de-teste-hibrido-sao-paulo-sp/" class="uc_btn uc_more_btn">Ver vaga completa</a>
  </div>
</div>
<div class="uc_ac_box ">
  <div class="uc-heading uc_trigger">
    <em class="ue_heading_title">Engenheiro de Dados (remoto) </em>
  </div>
  <div class="uc_content" >
    <div class="ue_post_text">Modalidade de trabalho: Home Office em qualquer cidade do Brasil.

Todas as nossas vagas s&#227;o extensivas a Pessoas com Defici&#234;ncia (PcD).</div>
    <a href="https://www.foton.la/engenheiro-de-dados-remoto/" class="uc_btn uc_more_btn">Ver vaga completa</a>
  </div>
</div>
<div class="uc_ac_box ">
  <div class="uc-heading uc_trigger">
    <em class="ue_heading_title">Uma pergunta frequente?</em>
  </div>
  <div class="uc_content" >
    <div class="ue_post_text">Resposta sem link de vaga.</div>
  </div>
</div>
`;

describe("parseJobCards", () => {
  const cards = parseJobCards(LISTING_HTML);

  test("keeps only real vacancy cards (with a Ver vaga completa link)", () => {
    expect(cards).toHaveLength(2);
  });

  test("maps title, slug id, canonical url and fixed company", () => {
    const c = cards[0];
    expect(c.id).toBe("analista-de-teste-hibrido-sao-paulo-sp");
    expect(c.title).toBe("Analista de Teste (híbrido São Paulo/SP)");
    expect(c.url).toBe("https://www.foton.la/analista-de-teste-hibrido-sao-paulo-sp/");
    expect(c.company).toBe(COMPANY);
    for (const key of ["id", "title", "company", "location", "date", "url"]) {
      expect(key in c).toBe(true);
    }
  });

  test("derives hybrid model and location from the modalidade line", () => {
    const c = cards[0];
    expect(c.hybrid).toBe(true);
    expect(c.remote).toBe(false);
    expect(c.model).toBe("Híbrido");
    expect(c.location).toContain("São Paulo");
  });

  test("derives remote model for home-office cards", () => {
    const c = cards[1];
    expect(c.remote).toBe(true);
    expect(c.hybrid).toBe(false);
    expect(c.model).toBe("Remoto");
  });

  test("date is always null (listing exposes no posting date)", () => {
    expect(cards.every((c) => c.date === null)).toBe(true);
  });
});

const DETAIL_HTML = `
<h1 class="elementor-heading-title elementor-size-default">Analista de Teste (h&#237;brido S&#227;o Paulo/SP)</h1>
<div class="elementor-element elementor-widget elementor-widget-theme-post-content" data-widget_type="theme-post-content.default">
  <div class="elementor-widget-container">
    <p class="wp-block-paragraph"><strong>Modalidade de trabalho:</strong> H&#237;brido (S&#227;o Paulo/SP)</p>
    <p class="wp-block-paragraph">Requisitos e Qualifica&#231;&#245;es:</p>
    <p class="wp-block-paragraph">Gradua&#231;&#227;o completa na &#225;rea de TI.</p>
  </div>
</div>
<div class="elementor-element elementor-widget elementor-widget-divider" data-widget_type="divider.default">
  <div class="elementor-widget-container"></div>
</div>
`;

describe("parseJobDetail", () => {
  const job = parseJobDetail(DETAIL_HTML, "analista-de-teste-hibrido-sao-paulo-sp");

  test("extracts the title from the heading", () => {
    expect(job.title).toBe("Analista de Teste (híbrido São Paulo/SP)");
  });

  test("extracts a clean, tag-free description with entities decoded", () => {
    expect(job.description).toContain("Modalidade de trabalho");
    expect(job.description).toContain("Graduação completa na área de TI");
    expect(job.description).not.toContain("<");
    expect(job.description).not.toContain("divider");
  });

  test("company is fixed and url is canonical", () => {
    expect(job.company).toBe(COMPANY);
    expect(job.url).toBe("https://www.foton.la/analista-de-teste-hibrido-sao-paulo-sp/");
  });
});

describe("normalizeSlug", () => {
  test("accepts a bare slug", () => {
    expect(normalizeSlug("analista-de-testes")).toBe("analista-de-testes");
  });
  test("extracts the slug from a full URL", () => {
    expect(normalizeSlug("https://www.foton.la/engenheiro-de-dados-remoto/")).toBe(
      "engenheiro-de-dados-remoto",
    );
  });
  test("returns null for an unusable input", () => {
    expect(normalizeSlug("???")).toBeNull();
  });
});

describe("htmlToText / fold", () => {
  test("htmlToText decodes hex entities and strips tags", () => {
    expect(htmlToText("<p>Caf&#233; &#xE9; bom</p>")).toBe("Café é bom");
  });
  test("htmlToText returns null for empty input", () => {
    expect(htmlToText("")).toBeNull();
  });
  test("fold is accent- and case-insensitive", () => {
    expect(fold("São Paulo")).toBe("sao paulo");
  });
});
