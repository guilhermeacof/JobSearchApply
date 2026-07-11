import { describe, expect, test } from "bun:test";
import { normalizeId, parseJobCards, parseJobDetail, slugify, toIsoDate } from "../src/helpers";

const SAMPLE_CARD = `
<ul>
<li class="vaga odd ">
  <header class="clearfix">
    <div class="informacoes-header">
      <h2 class="cargo">
        <a class="link-detalhes-vaga" data-id-vaga="2823863" title="Analista de Testes Jr." id="v2823863" href="/vagas/v2823863/analista-de-testes-jr">
            <mark>Analista</mark> de <mark>Testes</mark> Jr.
</a>      </h2>
      <span class="emprVaga">
          TO Brasil Consultoria em Tecnologia da Informa&ccedil;&atilde;o
      </span>
      <div class="nivelQtdVagas">
          <span class="nivelVaga">
            J&uacute;nior/Trainee
          </span>
      </div>
    </div>
  </header>
  <div class="detalhes">
    <p>Descri&ccedil;&atilde;o: Requisitos Obrigat&oacute;rios...</p>
  </div>
    <footer>
          <div class="vaga-local">
            <i class="bx bx-map"></i>
            Tabo&atilde;o da Serra / SP
              <div class="tooltip-place" role="tooltip">
                <div class="tooltip-text">tooltip noise</div>
              </div>
          </div>
          <span class="data-publicacao"><i class="bx bx-time-five"></i>03/07/2026</span>
    </footer>
</li>
</ul>
`;

describe("parseJobCards", () => {
  test("extrai todos os campos do contrato a partir de um card", () => {
    const cards = parseJobCards(SAMPLE_CARD);
    expect(cards.length).toBe(1);
    const c = cards[0];
    expect(c.id).toBe("2823863");
    expect(c.title).toBe("Analista de Testes Jr.");
    expect(c.company).toBe("TO Brasil Consultoria em Tecnologia da Informação");
    expect(c.location).toBe("Taboão da Serra / SP");
    expect(c.location).not.toContain("tooltip");
    expect(c.date).toBe("2026-07-03");
    expect(c.url).toBe("https://www.vagas.com.br/vagas/v2823863/analista-de-testes-jr");
    expect(c.level).toBe("Júnior/Trainee");
  });

  test("um card malformado não quebra os demais", () => {
    const broken = SAMPLE_CARD.replace("</ul>", '<li class="vaga even ">garbage</li></ul>');
    expect(parseJobCards(broken).length).toBe(1);
  });
});

const SAMPLE_DETAIL = `
<article>
  <h1 class="job-shortdescription__title">Analista de Testes S&ecirc;nior</h1>
  <h2 class="job-shortdescription__company">TO Brasil</h2>
  <li class="job-hierarchylist__item job-hierarchylist__item--level" aria-label="S&ecirc;nior"></li>
  <div class="info-localizacao">S&atilde;o Paulo / SP<div class="tooltip">noise</div></div>
  <span>Publicada em 03/07/2026</span>
  <div data-testid="JobDescription"><p>Requisitos:</p><ul><li>Cypress</li><li>Selenium</li></ul></div>
  <section class="outras-vagas">unrelated</section>
</article>
`;

describe("parseJobDetail", () => {
  test("extrai todos os campos de uma página de detalhe", () => {
    const d = parseJobDetail(SAMPLE_DETAIL, "2823863", "https://www.vagas.com.br/vagas/v2823863/x");
    expect(d.title).toBe("Analista de Testes Sênior");
    expect(d.company).toBe("TO Brasil");
    expect(d.level).toBe("Sênior");
    expect(d.location).toBe("São Paulo / SP");
    expect(d.date).toBe("2026-07-03");
    expect(d.description).toContain("Requisitos:");
    expect(d.description).toContain("Selenium");
    expect(d.description).not.toContain("unrelated");
  });

  test("a descrição sobrevive quando nenhum <section> a segue", () => {
    const noSection = SAMPLE_DETAIL.replace(/<section[\s\S]*?<\/section>/, "");
    const d = parseJobDetail(noSection, "1", "https://example.test");
    expect(d.description).toContain("Cypress");
  });
});

describe("slugify", () => {
  test("remove acentos e espaços no formato esperado pelo vagas.com.br", () => {
    expect(slugify("Analista de Testes")).toBe("analista-de-testes");
    expect(slugify("automação de testes")).toBe("automacao-de-testes");
    expect(slugify("QA Sênior")).toBe("qa-senior");
  });
});

describe("toIsoDate", () => {
  test("converte DD/MM/YYYY para YYYY-MM-DD", () => {
    expect(toIsoDate("03/07/2026")).toBe("2026-07-03");
    expect(toIsoDate("garbage")).toBeNull();
  });
});

describe("normalizeId", () => {
  test("aceita as formas pura, com prefixo v e URL", () => {
    expect(normalizeId("2823863")).toBe("2823863");
    expect(normalizeId("v2823863")).toBe("2823863");
    expect(normalizeId("https://www.vagas.com.br/vagas/v2823863/analista-de-testes-jr")).toBe("2823863");
    expect(normalizeId("not-an-id")).toBeNull();
  });
});
