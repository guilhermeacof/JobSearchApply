// Preenche a tela de candidatura com as respostas salvas no Painel.
//
// REGRA QUE NÃO SE QUEBRA: esta extensão NUNCA clica em "Enviar"/"Candidatar-se".
// Ela preenche e para. Conferir e enviar é sempre da pessoa — candidatura é
// irreversível e sai no nome dela.
//
// O casamento pergunta↔campo é por semelhança de texto, então erra às vezes. Por isso
// o relatório mostra, campo a campo, o que foi preenchido e com base em qual pergunta,
// e lista o que ficou sem resposta. Preenchimento silencioso seria pior que nada: a
// pessoa enviaria sem saber que um campo foi preenchido com a resposta errada.

(() => {
  if (window.__painelPreencher) return;   // já injetado nesta aba: o gatilho é reusado

  // ---------- texto ----------
  const PALAVRAS_VAZIAS = new Set(["de","da","do","das","dos","e","a","o","as","os","um","uma","em","no","na",
    "qual","quais","sua","seu","suas","seus","voce","vc","com","para","por","que","tem","possui","favor",
    "informe","descreva","conte","nos","the","your","you","have","please","what","which","is","in","of","and"]);

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();

  const tokens = (s) => norm(s).split(" ").filter((t) => t && t.length > 1 && !PALAVRAS_VAZIAS.has(t));

  // Semelhança de Dice entre dois textos (0 a 1). Simples e previsível — o suficiente
  // para casar "Pretensão salarial (CLT)" com "Qual sua pretensão salarial?".
  function semelhanca(a, b) {
    const A = new Set(tokens(a)), B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let comuns = 0;
    for (const t of A) if (B.has(t)) comuns++;
    return (2 * comuns) / (A.size + B.size);
  }

  // ---------- achar os campos e seus rótulos ----------
  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };

  function rotuloDe(el) {
    const textoDe = (n) => (n ? String(n.innerText || n.textContent || "").replace(/\s+/g, " ").trim() : "");
    // O rótulo tem de ser procurado na raiz DO CAMPO, não no document: dentro de um
    // shadow root o <label for="..."> vive lá dentro e o document não o enxerga.
    const raiz = el.getRootNode();
    if (el.id && raiz.querySelector) {
      const l = raiz.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (textoDe(l)) return textoDe(l);
    }
    if (el.getAttribute("aria-labelledby")) {
      const t = el.getAttribute("aria-labelledby").split(/\s+/)
        .map((id) => textoDe(raiz.getElementById ? raiz.getElementById(id) : document.getElementById(id)))
        .filter(Boolean).join(" ");
      if (t) return t;
    }
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim();
    const pai = el.closest("label");
    if (textoDe(pai)) return textoDe(pai);
    const fs = el.closest("fieldset");
    if (fs && textoDe(fs.querySelector("legend"))) return textoDe(fs.querySelector("legend"));
    // Texto em volta do campo (padrão comum em formulários). Só serve se tiver TEXTO:
    // sem o teste de vazio, uma <div> sem texto devolvia "" — e o campo, ficando sem
    // rótulo, era descartado antes de tentar o name/placeholder. Era o que acontecia
    // com o telefone da InHire, que não tem <label>: o campo simplesmente sumia.
    const grupo = el.closest("div,section,li");
    if (grupo && textoDe(grupo) && textoDe(grupo).length < 300) return textoDe(grupo);
    // Dentro de shadow DOM o campo costuma estar sozinho na sua raiz, sem nada acima:
    // aí quem carrega o rótulo é o componente que hospeda o shadow (o host).
    const host = raiz.host;
    if (host) {
      const t = host.getAttribute("label") || textoDe(host);
      if (t && t.length < 300) return String(t).replace(/\s+/g, " ").trim();
    }
    // Sem rótulo nenhum na tela, o name do campo é a última pista ("phone", "email").
    return el.name || el.placeholder || "";
  }

  // Varre atravessando shadow roots. Sem isto a extensão fica CEGA nos ATS feitos com
  // web components: no formulário do SmartRecruiters, um querySelectorAll comum acha 1
  // campo (o upload) enquanto existem 15 — nome, e-mail, cidade, telefone, LinkedIn…
  function todosOsCampos(raiz, achados = []) {
    for (const el of raiz.querySelectorAll("*")) {
      if (el.matches("input, textarea, select")) achados.push(el);
      if (el.shadowRoot) todosOsCampos(el.shadowRoot, achados);
    }
    return achados;
  }

  function camposDaTela() {
    const nos = todosOsCampos(document);
    const grupos = new Map();   // radios do mesmo name viram UM campo
    const saida = [];
    for (const el of nos) {
      const tipo = (el.type || "").toLowerCase();
      if (["hidden", "submit", "button", "file", "image", "reset", "password", "search"].includes(tipo)) continue;
      if (el.disabled || el.readOnly || !visivel(el)) continue;
      if (tipo === "radio" || tipo === "checkbox") {
        const chave = el.name || rotuloDe(el);
        if (!chave) continue;
        if (!grupos.has(chave)) {
          const g = { tipo: "opcoes", nome: chave, opcoes: [], rotulo: "" };
          grupos.set(chave, g); saida.push(g);
        }
        const g = grupos.get(chave);
        g.opcoes.push({ el, texto: rotuloDe(el) });
        // O rótulo do grupo é a pergunta (legend/fieldset), não o texto de cada opção.
        const fs = el.closest("fieldset");
        if (fs) {
          const lg = fs.querySelector("legend");
          if (lg) g.rotulo = String(lg.innerText || "").replace(/\s+/g, " ").trim();
        }
        if (!g.rotulo) g.rotulo = chave;
        continue;
      }
      saida.push({ tipo: el.tagName === "SELECT" ? "select" : "texto", el, rotulo: rotuloDe(el) });
    }
    return saida.filter((c) => c.rotulo);
  }

  // ---------- escrever no campo ----------
  // React/Ember (LinkedIn, Gupy, SmartRecruiters…) ignoram el.value = x: eles guardam o
  // valor num estado interno e sobrescrevem na hora. É preciso chamar o setter nativo e
  // disparar os eventos na mão para o framework perceber a mudança.
  // composed: true é obrigatório por causa do shadow DOM: sem isso o evento morre na
  // borda do shadow e o web component que hospeda o campo (o <spl-form-field> do
  // SmartRecruiters, por exemplo) nunca fica sabendo que o valor mudou — o campo
  // parece preenchido na tela e chega vazio no envio.
  function avisar(el, nome) {
    el.dispatchEvent(new Event(nome, { bubbles: true, composed: true }));
  }

  function escrever(el, valor) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, valor);
    avisar(el, "input");
    avisar(el, "change");
  }

  const preenchido = (c) =>
    c.tipo === "opcoes" ? c.opcoes.some((o) => o.el.checked) : String(c.el.value || "").trim() !== "";

  function aplicar(campo, resposta) {
    if (campo.tipo === "texto") { escrever(campo.el, resposta); return resposta; }
    if (campo.tipo === "select") {
      const ops = [...campo.el.options];
      const alvo = ops.map((o) => ({ o, s: semelhanca(o.text, resposta) }))
        .sort((a, b) => b.s - a.s).find((x) => x.s >= 0.5);
      if (!alvo) return null;
      campo.el.value = alvo.o.value;
      avisar(campo.el, "change");
      return alvo.o.text;
    }
    if (campo.tipo === "opcoes") {
      // "Sim, aplico BDD…" → marca a opção "Sim". Senão, a opção mais parecida.
      const inicio = norm(resposta).split(" ")[0];
      let alvo = campo.opcoes.find((o) => norm(o.texto) === inicio);
      if (!alvo) {
        alvo = campo.opcoes.map((o) => ({ o, s: semelhanca(o.texto, resposta) }))
          .sort((a, b) => b.s - a.s).filter((x) => x.s >= 0.5).map((x) => x.o)[0];
      }
      if (!alvo) return null;
      alvo.el.click();
      return alvo.texto;
    }
    return null;
  }

  // ---------- preencher ----------
  const LIMITE = 0.45;   // abaixo disso o casamento é chute; melhor deixar em branco

  // Cada campo pega a SUA melhor resposta, e a mesma resposta pode servir a mais de um
  // campo. Antes uma resposta usada era bloqueada para as seguintes, o que quebrava o
  // caso mais comum de todos: "Email" e "Confirm your email" querem o mesmo valor, e o
  // segundo campo ficava vazio (ou pior, pegava uma resposta pior por descarte).
  function preencher(respostas) {
    const feitos = [], semResposta = [];
    for (const campo of camposDaTela()) {
      if (preenchido(campo)) continue;   // não sobrescreve o que o portal já trouxe
      const cand = respostas
        .map((r) => ({ r, s: semelhanca(campo.rotulo, r.pergunta) }))
        .filter((x) => x.r.resposta && x.s >= LIMITE)
        .sort((a, b) => b.s - a.s)[0];
      if (!cand) { semResposta.push(campo.rotulo); continue; }
      const escrito = aplicar(campo, cand.r.resposta);
      if (escrito == null) { semResposta.push(campo.rotulo); continue; }
      feitos.push({ campo: campo.rotulo, pergunta: cand.r.pergunta, valor: escrito, conf: cand.s });
    }
    return { feitos, semResposta };
  }

  // ---------- conversa com o painel ----------
  const pedir = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));

  // ---------- interface ----------
  const corta = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function caixa() {
    document.querySelectorAll(".pcx-relat").forEach((n) => n.remove());
    const cx = document.createElement("div");
    cx.className = "pcx-relat";
    document.body.appendChild(cx);
    return cx;
  }

  function pintar(cx, topo, corpo) {
    cx.innerHTML = '<div class="pcx-topo"><span>' + topo + '</span><button class="pcx-x" title="Fechar">✕</button></div>' + corpo;
    cx.querySelector(".pcx-x").addEventListener("click", () => cx.remove());
  }

  function relatorio(cx, res, fonte, comTroca) {
    const linhas = res.feitos.map((f) =>
      '<li><b>' + esc(corta(f.campo, 60)) + '</b><span>' + esc(corta(f.valor, 90)) + '</span>' +
      (f.conf < 0.7 ? '<i class="pcx-duvida">confira: casei com “' + esc(corta(f.pergunta, 45)) + '”</i>' : '') + '</li>').join("");
    // "Ficaram em branco", não "sem resposta salva": às vezes existe resposta, mas ela
    // não se aplica ao campo — típico de Sim/Não, onde só marco a opção se a resposta
    // começar com sim ou não. Chutar "Sim" a partir de um texto descritivo faria a
    // pessoa afirmar no formulário algo que a resposta dela talvez negue.
    const faltou = res.semResposta.length
      ? '<p class="pcx-faltou"><b>Ficaram em branco (' + res.semResposta.length + ') — responda você:</b> ' +
        esc(corta(res.semResposta.join(" · "), 220)) + '</p>' : "";
    pintar(cx, res.feitos.length ? "✅ " + res.feitos.length + " campo(s) preenchido(s)" : "Nada para preencher aqui",
      '<p class="pcx-fonte">' + fonte + '</p>' +
      (linhas ? '<ul class="pcx-lista">' + linhas + '</ul>' : "") + faltou +
      (comTroca ? '<p class="pcx-troca"><button class="pcx-outra">Não é esta vaga? Escolher outra</button></p>' : "") +
      '<p class="pcx-aviso">⚠ Confira tudo antes de enviar. <b>Eu não envio nada</b> — o clique em “Enviar” é seu.</p>');
    const outra = cx.querySelector(".pcx-outra");
    if (outra) outra.addEventListener("click", () => escolher(cx));
  }

  // Seletor manual. É o que salva o caso comum: o anúncio está num domínio (o radar
  // guarda a vaga do Serasa no LinkedIn) e o formulário noutro (SmartRecruiters, com
  // outro id). Sem isto, a extensão simplesmente desistiria nessas vagas.
  async function escolher(cx) {
    pintar(cx, "Qual é esta vaga?", '<p class="pcx-fonte">Carregando as suas vagas preparadas…</p>');
    const resp = await pedir({ tipo: "lista" });
    if (!resp || !resp.ok) return pintar(cx, "❌ Erro", '<p class="pcx-fonte">' + esc((resp && resp.erro) || "falhou") + "</p>");
    const vagas = (resp.d && resp.d.vagas) || [];
    if (!vagas.length) {
      return pintar(cx, "Nenhuma vaga preparada", '<p class="pcx-fonte">Você ainda não preparou respostas para nenhuma vaga. ' +
        'No Painel, marque a vaga e clique em <b>Preparar candidaturas</b>.</p>');
    }
    pintar(cx, "Qual é esta vaga?", '<p class="pcx-fonte">Não reconheci a página. Escolha a vaga e eu preencho com as respostas dela.</p>' +
      '<ul class="pcx-lista">' + vagas.map((v, i) =>
        '<li><button class="pcx-pick" data-i="' + i + '"><b>' + esc(corta(v.company || "(sem empresa)", 48)) + '</b>' +
        '<span>' + esc(corta(v.title || "", 60)) + ' · ' + v.campos + ' resposta(s)</span></button></li>').join("") + '</ul>');
    cx.querySelectorAll(".pcx-pick").forEach((b) => b.addEventListener("click", async () => {
      const v = vagas[+b.dataset.i];
      pintar(cx, "Preenchendo…", '<p class="pcx-fonte">' + esc(v.company) + "</p>");
      const r = await pedir({ tipo: "vaga", url: v.url });
      if (!r || !r.ok) return pintar(cx, "❌ Erro", '<p class="pcx-fonte">' + esc((r && r.erro) || "falhou") + "</p>");
      const campos = ((r.d && r.d.campos) || []).filter((c) => c.resposta);
      relatorio(cx, preencher(campos), "Respostas de: <b>" + esc(v.company) + "</b>" + (v.title ? " — " + esc(v.title) : "") +
        " (escolhida por você)", true);
    }));
  }

  async function preencherAgora() {
    const cx = caixa();
    pintar(cx, "Buscando as suas respostas…", '<p class="pcx-fonte">Falando com o Painel…</p>');
    const resp = await pedir({ tipo: "respostas", url: location.href, titulo: document.title });
    if (!resp || !resp.ok) {
      return pintar(cx, "❌ Não deu certo", '<p class="pcx-fonte">' + esc((resp && resp.erro) || "erro desconhecido") + "</p>");
    }
    const d = resp.d || {};
    const respostas = (d.campos || []).filter((c) => c.resposta);
    if (!respostas.length) {
      return pintar(cx, "Sem respostas salvas", '<p class="pcx-fonte">Não há nada preparado ainda. No Painel, marque a vaga e ' +
        'clique em <b>Preparar candidaturas</b>.</p>');
    }
    if (!d.achou) {
      // Preenche o que dá (cidade, pretensão, LinkedIn…) e oferece a escolha da vaga.
      const res = preencher(respostas);
      return relatorio(cx, res, "⚠ Não reconheci esta vaga — preenchi só os seus <b>dados padrão</b>. " +
        "As perguntas específicas desta vaga ficaram em branco.", true);
    }
    const comoAchou = d.casou === "id" ? " (reconhecida pelo id da vaga)"
      : d.casou === "titulo" ? " (reconhecida pelo título da página — confira se é ela mesma)" : "";
    relatorio(cx, preencher(respostas),
      "Respostas de: <b>" + esc(d.vaga.company || "") + "</b>" + (d.vaga.title ? " — " + esc(d.vaga.title) : "") + comoAchou, true);
  }

  window.__painelPreencher = preencherAgora;
})();
