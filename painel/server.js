// Painel de Controle — servidor local para o workspace de candidaturas.
// Sem dependências externas: usa apenas módulos nativos do Node.
// Serve a interface e faz a ponte entre os botões e o Claude Code (headless).
//
// Uso: node server.js   (ou dê duplo-clique em "Abrir Painel.bat")

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

// Executável do Bun (usado para rodar as CLIs de busca). Instalação padrão no Windows.
const BUN_BIN = process.env.BUN_BIN ||
  (process.platform === "win32" ? path.join(os.homedir(), ".bun", "bin", "bun.exe") : "bun");

const PORT = 4599;
const HOST = "127.0.0.1";
const WORKSPACE = path.join(__dirname, "..", "ai-job-search");
const CONFIG_FILE = path.join(__dirname, "config.json");

// Cargo-alvo escolhido pelo usuário. É o que direciona a busca de vagas.
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch { return { cargo: "" }; }
}
function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ---------- Respostas de formulário (perguntas da Gupy etc.) ----------
// Guarda o que a pessoa digita para os campos que os sites pedem na hora de se
// candidatar (pretensão, última remuneração, disponibilidade e QUALQUER pergunta
// específica da vaga). Fica salvo para ela copiar e colar, e como registro.
const ANSWERS_FILE = path.join(WORKSPACE, "documents", "form_answers.json");

// Perguntas comuns já sugeridas (rótulos; a pessoa preenche os valores uma vez).
const CAMPOS_SUGERIDOS = [
  "Pretensão salarial (CLT)",
  "Pretensão salarial (PJ)",
  "Última remuneração",
  "Regime de contratação aceito (CLT/PJ)",
  "Modelo de trabalho (remoto/híbrido/presencial)",
  "Disponibilidade para início",
  "Cidade / Estado",
  "LinkedIn",
];

function camposSugeridos() {
  return CAMPOS_SUGERIDOS.map((pergunta) => ({ pergunta, resposta: "" }));
}

function readAnswers() {
  try {
    const j = JSON.parse(fs.readFileSync(ANSWERS_FILE, "utf8"));
    if (!Array.isArray(j.padrao)) j.padrao = camposSugeridos();
    if (!j.vagas || typeof j.vagas !== "object") j.vagas = {};
    return j;
  } catch {
    return { padrao: camposSugeridos(), vagas: {} };
  }
}
function writeAnswers(store) {
  fs.mkdirSync(path.dirname(ANSWERS_FILE), { recursive: true });
  fs.writeFileSync(ANSWERS_FILE, JSON.stringify(store, null, 2));
}

// Limpa e limita a lista de campos vinda do painel.
function sanitizeCampos(campos) {
  if (!Array.isArray(campos)) return [];
  return campos
    .map((c) => ({
      pergunta: String((c && c.pergunta) || "").slice(0, 200).trim(),
      resposta: String((c && c.resposta) || "").slice(0, 2000).trim(),
    }))
    .filter((c) => c.pergunta || c.resposta)
    .slice(0, 40);
}

// Escreve uma cópia legível (.md) das respostas de uma vaga, para registro/rastreabilidade.
function escreverSnapshotRespostas(vaga) {
  try {
    const dir = path.join(WORKSPACE, "documents", "respostas");
    fs.mkdirSync(dir, { recursive: true });
    const base = (vaga.company || "vaga") + " - " + (vaga.title || "");
    const safe = base.replace(/[^\w.\-() À-ÿ]/g, "_").slice(0, 120).trim() || "vaga";
    const linhas = [
      "# Respostas do formulário — " + (vaga.title || "") + (vaga.company ? " (" + vaga.company + ")" : ""),
      "",
      vaga.url ? "Vaga: " + vaga.url : "",
      "Atualizado em: " + new Date().toLocaleString("pt-BR"),
      "",
    ];
    for (const c of vaga.campos || []) {
      linhas.push("**" + c.pergunta + "**");
      linhas.push(c.resposta || "_(a preencher)_");
      linhas.push("");
    }
    fs.writeFileSync(path.join(dir, safe + ".md"), linhas.filter((l) => l !== undefined).join("\n"));
  } catch { /* registro é melhor-esforço; não quebra o salvamento */ }
}

// Caminho do executável do Claude Code — detectado dinamicamente, sem caminho fixo:
// 1) variável de ambiente CLAUDE_BIN, se definida;
// 2) o local padrão de instalação no Windows (%USERPROFILE%\.local\bin\claude.exe);
// 3) senão, "claude" pelo PATH.
const CLAUDE_BIN = process.env.CLAUDE_BIN || (() => {
  const guess = path.join(os.homedir(), ".local", "bin", "claude.exe");
  return process.platform === "win32" && fs.existsSync(guess) ? guess : "claude";
})();

// Modo de permissão para as execuções automáticas dos botões. Como o painel roda
// na máquina pessoal do usuário e sobre o próprio workspace, usamos o modo que
// dispensa as confirmações manuais — senão cada ação travaria pedindo permissão.
// O prompt NÃO vai aqui: é enviado pela entrada padrão (stdin) em runClaude, para
// evitar problemas de escape de aspas/acentos/quebras de linha no Windows.
const CLAUDE_ARGS = ["--print", "--permission-mode", "bypassPermissions"];

// ---------- Leitura do estado do workspace ----------

function parseCsvLine(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function readTracker() {
  const file = path.join(WORKSPACE, "job_search_tracker.csv");
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = parseCsvLine(l);
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] || ""));
    return row;
  });
}

// Todas as vagas do radar (menos descartadas/expiradas), com nota, gaps e flags.
function readAllJobs() {
  const file = path.join(WORKSPACE, "job_scraper", "seen_jobs.json");
  if (!fs.existsSync(file)) return [];
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return []; }
  const seen = data.seen || {};
  return Object.entries(seen)
    .map(([url, e]) => ({
      title: e.title, company: e.company, portal: e.portal, url,
      deadline: e.deadline || null, status: e.status,
      score: e.rank_score ?? null, verdict: e.rank_verdict || null,
      fit: e.fit || null, gaps: e.rank_notes || null,
      local: e.rank_location || null,   // PASS | FLAG | FAIL — motivo do descarte
      // Vetada por localização (ex.: híbrido fora do DF) — fica fora das "recomendadas".
      vetada: /excluded/i.test(e.rank_verdict || "") || e.rank_location === "FAIL",
    }))
    .filter((j) => j.status !== "skipped" && j.status !== "expired")
    // Ranqueadas primeiro (nota desc); não ranqueadas depois.
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

// Detecta se o currículo já foi enviado e se o perfil já foi montado.
function readProfileState() {
  const cvDir = path.join(WORKSPACE, "documents", "cv");
  let cvFiles = [];
  try {
    cvFiles = fs.readdirSync(cvDir).filter((f) => f !== ".gitkeep" && !f.startsWith("."));
  } catch {}
  let claude = "";
  try { claude = fs.readFileSync(path.join(WORKSPACE, "CLAUDE.md"), "utf8"); } catch {}
  return {
    cvEnviado: cvFiles.length > 0,
    cvNome: cvFiles[0] || null,
    // O CLAUDE.md ainda tem o token [YOUR_NAME] enquanto o /setup não rodou.
    perfilPronto: claude.length > 0 && !claude.includes("[YOUR_NAME]"),
  };
}

// Normaliza texto para comparar empresa/vaga (minúsculas, sem acento/pontuação).
function norm(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// Marca cada vaga como "já inscrita" cruzando com o tracker de candidaturas.
// Casamento principal: URL idêntica. Reforço: mesma empresa + título contido.
function markApplied(jobs, tracker) {
  const urls = new Set(tracker.map((r) => (r.source || "").trim()).filter(Boolean));
  const pares = tracker.map((r) => ({ c: norm(r.company), t: norm(r.role) })).filter((p) => p.c);
  return jobs.map((j) => {
    const jc = norm(j.company), jt = norm(j.title);
    const aplicada = urls.has((j.url || "").trim()) ||
      pares.some((p) => p.c === jc && p.t && jt && (jt.includes(p.t) || p.t.includes(jt)));
    return { ...j, aplicada };
  });
}

function buildState() {
  const tracker = readTracker();
  const all = markApplied(readAllJobs(), tracker);
  // Contadores honestos: "avaliadas" é quem TEM nota (inclusive as vetadas). Antes o
  // painel rotulava "já avaliadas" mostrando só as recomendadas — as vetadas sumiam.
  const avaliadas = all.filter((j) => j.score != null);
  const recomendadas = avaliadas.filter((j) => !j.vetada);
  const descartadas = avaliadas.filter((j) => j.vetada);
  const naFila = all.filter((j) => j.score == null); // nunca avaliadas
  const hoje = new Date("2026-07-11T12:00:00"); // data do workspace
  const urgentes = recomendadas.filter((j) => {
    if (!j.deadline) return false;
    const d = Math.round((new Date(j.deadline + "T12:00:00") - hoje) / 864e5);
    return d >= 0 && d <= 7;
  });
  // Por que cada grupo ficou desse tamanho — vira o texto que aparece ao passar o mouse.
  // Contado dos dados reais, não escrito à mão, para nunca descrever algo que mudou.
  const porLocal = (js, v) => js.filter((j) => j.local === v).length;
  const banda = (j) =>
    j.score >= 75 ? "strong" : j.score >= 60 ? "good" : j.score >= 45 ? "moderate"
      : j.score >= 30 ? "weak" : "poor";
  const bandas = (js) => js.reduce((a, j) => ((a[banda(j)] = (a[banda(j)] || 0) + 1), a), {});

  return {
    perfil: readProfileState(),
    cargo: readConfig().cargo || "",
    resumo: {
      totalVagas: all.length,
      avaliadas: avaliadas.length,        // com nota (recomendadas + descartadas)
      recomendadas: recomendadas.length,
      descartadas: descartadas.length,    // avaliadas, mas vetadas (ex.: localização)
      naFila: naFila.length,              // ainda sem nota
      candidaturas: tracker.length,
      urgentes: urgentes.length,
      // Detalhe dos motivos (para o tooltip dos cards).
      motivos: {
        descarte: {
          localizacao: porLocal(descartadas, "FAIL"),
          veto: descartadas.filter((j) => /excluded/i.test(j.verdict || "") && j.local !== "FAIL").length,
        },
        recomendadas: {
          pass: porLocal(recomendadas, "PASS"),
          flag: porLocal(recomendadas, "FLAG"),
          semLocal: recomendadas.filter((j) => !j.local).length,
          bandas: bandas(recomendadas),
        },
      },
    },
    candidaturas: tracker.map((r) => ({
      empresa: r.company, vaga: r.role, status: r.status,
      data: r.date, score: r.fit_rating,
    })),
    aplicadasUrls: tracker.map((r) => (r.source || "").trim()).filter(Boolean),
    // TODAS as vagas (a interface filtra: recomendadas / todas / nota mínima).
    vagas: all,
  };
}

// ---------- Ponte com o Claude Code (streaming via SSE) ----------

// Diz se a pasta do projeto está autorizada (confiável) no Claude Code.
// Se não conseguir checar, assume que sim para não atrapalhar.
function projetoConfiavel() {
  try {
    const cfgPath = path.join(os.homedir(), ".claude.json");
    const root = path.join(__dirname, "..");
    const bs = root, fw = root.replace(/\\/g, "/");
    const j = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    const pr = j.projects || {};
    return [bs, fw, bs[0].toLowerCase() + bs.slice(1), fw[0].toLowerCase() + fw.slice(1)]
      .some((k) => pr[k] && pr[k].hasTrustDialogAccepted === true);
  } catch { return true; }
}

function runClaude(prompt, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event, data) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  send("status", "Iniciando o Claude…");

  let child;
  try {
    child = spawn(CLAUDE_BIN, CLAUDE_ARGS, {
      cwd: WORKSPACE,
      shell: process.platform === "win32",
      windowsHide: true,
    });
  } catch (e) {
    send("erro", "Não consegui iniciar o Claude Code. Confira o LEIA-ME.txt. Detalhe: " + e.message);
    return res.end();
  }

  // O prompt vai pela entrada padrão (stdin), não como argumento — assim aspas,
  // acentos e quebras de linha do prompt não são quebrados pelo shell do Windows.
  try { child.stdin.write(prompt); child.stdin.end(); } catch {}

  child.stdout.on("data", (b) => send("saida", b.toString()));
  child.stderr.on("data", (b) => send("saida", b.toString()));
  child.on("error", (e) =>
    send("erro", "Falha ao executar o Claude: " + e.message + ". Verifique a instalação (LEIA-ME.txt).")
  );
  child.on("close", (code) => {
    send("fim", code === 0 ? "Concluído." : "Terminou com código " + code + ".");
    res.end();
  });

  res.on("close", () => { try { child.kill(); } catch {} });
}

// Roda o Claude, junta toda a saída e devolve de uma vez (para respostas em JSON).
function runClaudeCollect(prompt, done) {
  let child;
  try {
    child = spawn(CLAUDE_BIN, CLAUDE_ARGS, {
      cwd: WORKSPACE, shell: process.platform === "win32", windowsHide: true,
    });
  } catch (e) { return done(null, e.message); }
  let out = "";
  try { child.stdin.write(prompt); child.stdin.end(); } catch {}
  child.stdout.on("data", (b) => (out += b.toString()));
  child.stderr.on("data", (b) => (out += b.toString()));
  child.on("error", (e) => done(null, e.message));
  child.on("close", () => done(out, null));
}

// ---------- Claude com progresso ao vivo ----------
// O modo --print normal fica mudo até terminar (o painel parecia travado). Com
// --output-format stream-json o Claude emite um JSON por linha a cada passo
// (pensando, lendo arquivo, editando...), que traduzimos em texto amigável.
const CLAUDE_ARGS_STREAM = ["--print", "--output-format", "stream-json", "--verbose",
  "--permission-mode", "bypassPermissions"];

function nomeArq(p) { return String(p || "").split(/[\\/]/).pop() || ""; }

// Converte um evento do stream em uma frase curta para o usuário. null = ignorar.
function eventoAmigavel(j) {
  if (!j || !j.type) return null;
  if (j.type === "system" && j.subtype === "init") return "Iniciando o assistente…";
  if (j.type === "assistant" && j.message && Array.isArray(j.message.content)) {
    for (const c of j.message.content) {
      if (c.type === "tool_use") {
        const n = c.name || "", i = c.input || {};
        if (n === "Read") return "Lendo " + (nomeArq(i.file_path) || "arquivo") + "…";
        if (n === "Edit" || n === "Write" || n === "NotebookEdit")
          return "Atualizando " + (nomeArq(i.file_path) || "arquivo") + "…";
        if (n === "Grep" || n === "Glob") return "Procurando no seu perfil…";
        if (n === "WebFetch" || n === "WebSearch") return "Consultando a vaga na internet…";
        if (n === "Bash" || n === "PowerShell") return "Rodando uma verificação…";
        return "Usando " + n + "…";
      }
      if (c.type === "thinking") return "Analisando…";
      if (c.type === "text" && String(c.text || "").trim())
        return String(c.text).trim().replace(/\s+/g, " ").slice(0, 140);
    }
  }
  if (j.type === "user") return "Lendo o resultado…";
  if (j.type === "result") return "Finalizando…";
  return null;
}

// Roda o Claude transmitindo o progresso. onLog(texto) a cada passo;
// done(resultado, erro) no final (resultado = texto da resposta).
// Devolve o processo filho para quem chamou poder cancelá-lo (o rank em lotes roda
// vários assistentes ao mesmo tempo e precisa matar todos ao cancelar). Em caso de
// falha no spawn, chama done() e devolve null.
function runClaudeStream(prompt, onLog, done) {
  let child;
  try {
    child = spawn(CLAUDE_BIN, CLAUDE_ARGS_STREAM,
      { cwd: WORKSPACE, shell: process.platform === "win32", windowsHide: true });
  } catch (e) { done(null, e.message); return null; }
  let buf = "", err = "", resultado = null;
  try { child.stdin.write(prompt); child.stdin.end(); } catch {}
  child.stdout.on("data", (b) => {
    buf += b.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const linha = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!linha) continue;
      let j = null; try { j = JSON.parse(linha); } catch { continue; }
      if (j.type === "result" && j.result != null) resultado = String(j.result);
      const t = eventoAmigavel(j); if (t) onLog(t);
    }
  });
  child.stderr.on("data", (b) => (err += b.toString()));
  child.on("error", (e) => done(null, e.message));
  child.on("close", () =>
    done(resultado, resultado ? null : (err.trim() || "o assistente não devolveu resultado")));
  return child;
}

// Extrai o primeiro objeto JSON da resposta (bloco ```json ou { ... }).
function extractJson(text) {
  if (!text) return null;
  const fence = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  let cand = fence ? fence[1] : null;
  if (!cand) {
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a >= 0 && b > a) cand = text.slice(a, b + 1);
  }
  if (!cand) return null;
  try { return JSON.parse(cand); } catch { return null; }
}

// Resposta de erro com o DETALHE técnico junto: sem isso o painel só mostrava
// "não consegui...", escondendo a causa real (o que o Claude respondeu de fato,
// um limite de uso, a pasta não autorizada, um timeout, etc.).
function erroDetalhado(msg, out, err) {
  const bruto = [err ? String(err) : "", out ? String(out) : ""]
    .filter(Boolean).join("\n").trim();
  // Guarda o FIM da saída: é onde costuma estar a mensagem de erro / a resposta.
  const detalhe = bruto ? bruto.slice(-1500) : null;
  return JSON.stringify({ erro: msg, detalhe });
}

// ---------- Meu currículo ÚNICO (ver / baixar / editar / recompilar) ----------
// O usuário mantém UM currículo só (o mestre cv/main_example.tex), que vai sendo
// enriquecido conforme confirma o que tem. Nada é gerado por vaga: candidatar-se usa
// este mesmo arquivo. Economiza tempo e mantém um documento único e coerente.
const CV_DIR = path.join(WORKSPACE, "cv");
const CV_TEX = "main_example.tex";
const CV_PDF = "main_example.pdf";

// lualatex do MiKTeX — detectado dinamicamente, sem caminho fixo de máquina.
const LUALATEX_BIN = process.env.LUALATEX_BIN || (() => {
  const guess = path.join(os.homedir(), "AppData", "Local", "Programs", "MiKTeX", "miktex", "bin", "x64", "lualatex.exe");
  return process.platform === "win32" && fs.existsSync(guess) ? guess : "lualatex";
})();

// Compila um .tex (2 passadas, como manda o CLAUDE.md). cb(ok, log).
function compileTex(dir, texFile, cb) {
  if (!fs.existsSync(path.join(dir, texFile))) return cb(false, texFile + " não encontrado.");
  const args = ["-interaction=nonstopmode", "-halt-on-error", texFile];
  const pdf = texFile.replace(/\.tex$/i, ".pdf");
  let log = "", killed = false;
  const passada = (n, next) => {
    const p = spawn(LUALATEX_BIN, args, { cwd: dir, shell: process.platform === "win32", windowsHide: true });
    const t = setTimeout(() => { killed = true; try { p.kill(); } catch {} }, 120000);
    p.stdout.on("data", (b) => (log += b.toString()));
    p.stderr.on("data", (b) => (log += b.toString()));
    p.on("error", (e) => { clearTimeout(t); cb(false, "Falha ao rodar o lualatex: " + e.message); });
    p.on("close", () => { clearTimeout(t); if (killed) return cb(false, "A compilação demorou demais e foi cancelada.\n\n" + log.slice(-1500)); next(); });
  };
  passada(1, () => passada(2, () => {
    const ok = fs.existsSync(path.join(dir, pdf));
    cb(ok, ok ? "" : ("Não gerou o PDF. Fim do log:\n\n" + log.slice(-1800)));
  }));
}

// O PDF do currículo está desatualizado? (não existe, ou o .tex é mais novo que o .pdf)
function cvPdfDesatualizado() {
  const tex = path.join(CV_DIR, CV_TEX), pdf = path.join(CV_DIR, CV_PDF);
  if (!fs.existsSync(pdf)) return true;
  try { return fs.existsSync(tex) && fs.statSync(tex).mtimeMs > fs.statSync(pdf).mtimeMs; } catch { return true; }
}

// Nome do candidato extraído do PRÓPRIO currículo (nada hardcoded): assim o arquivo
// baixado sai com o nome de quem usa o sistema, não do autor. Fallback: sem nome.
function limparNomeTex(s) {
  return String(s || "").replace(/\\[a-zA-Z]+\*?/g, "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}
function nomeCandidato() {
  try {
    const tex = fs.readFileSync(path.join(CV_DIR, CV_TEX), "utf8");
    let m = tex.match(/pdfauthor\s*=\s*\{([^}]+)\}/i);          // nosso template (fontspec)
    if (m && limparNomeTex(m[1])) return limparNomeTex(m[1]);
    m = tex.match(/pdftitle\s*=\s*\{([^}]+?)(?:\s*-\s*CV)?\}/i);  // pdftitle "Nome - CV"
    if (m && limparNomeTex(m[1])) return limparNomeTex(m[1]);
    m = tex.match(/\\name\{([^}]*)\}\{([^}]*)\}/);                // moderncv \name{}{}
    if (m) { const n = limparNomeTex(m[1] + " " + m[2]); if (n) return n; }
    m = tex.match(/\\bfseries\\color\{accent\}([^\\{}%]+?)\\par/); // cabeçalho do nosso template
    if (m && limparNomeTex(m[1])) return limparNomeTex(m[1]);
  } catch {}
  return null;
}

// ---------- Busca com progresso real (roda as CLIs direto, cancelável) ----------

function heurFit(title) {
  const t = (title || "").toLowerCase();
  if (/j[úu]nior|\bjr\b|estagi|trainee/.test(t)) return "low";
  if (/s[êe]nior|\bsr\b|\biii\b|especialista|lead|arquitet/.test(t)) return "high";
  return "medium";
}

// ---------- Filtro de relevância (anti-lixo) ----------
// Vários portais fazem busca "OU" entre as palavras do termo. Medido em 15/07/2026 na
// SONDA: q="testes" devolve 17 vagas, mas q="analista de testes" devolve 233 — o
// catálogo inteiro, porque "analista" casa com tudo (Fiscal, Redes, Mainframe...).
// InfoJobs, Empregos e BNE fazem o mesmo, e por isso o radar enchia de RH, enfermagem
// e pesquisa de cosméticos. Aspas não resolvem (a SONDA devolve vazio com aspas), então
// o filtro é aqui: como as palavras genéricas de cargo não distinguem área nenhuma,
// só os termos DISTINTIVOS da busca decidem se a vaga entra.
const PALAVRAS_GENERICAS = new Set([
  // conectivos, artigos e senioridade
  "de", "da", "do", "dos", "das", "e", "em", "para", "com", "a", "o", "os", "as", "no",
  "na", "the", "of", "i", "ii", "iii", "iv", "v", "jr", "sr", "pl", "junior", "juniores",
  "pleno", "plena", "senior", "seniores", "estagio", "estagiario", "trainee", "aprendiz",
  // cargos guarda-chuva: sozinhos casam com qualquer área
  "analista", "analistas", "especialista", "especialistas", "engenheiro", "engenheira",
  "consultor", "consultora", "profissional", "tecnico", "tecnica", "assistente",
  "auxiliar", "coordenador", "coordenadora", "supervisor", "lider", "leader", "gerente",
  "gestor", "gestora", "desenvolvedor", "desenvolvedora", "programador", "developer", "engineer",
  "analyst", "specialist", "consultant", "officer", "assessor", "operador", "operadora",
  // ruído de anúncio
  "vaga", "vagas", "efetivo", "home", "office", "remoto", "remota", "hibrido",
  "presencial", "afirmativa", "exclusiva", "pcd", "banco", "talentos", "copia",
  "perfil", "nivel", "area",
]);

// Tokeniza (via norm: minúsculas, sem acento/pontuação) e reduz plural simples, para
// "testes" e "teste" virarem o mesmo radical.
function radicais(s) {
  return norm(s).split(" ").filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

// Os termos da busca que de fato identificam a área (ex.: "teste", "qa", "quality").
function termosDistintivos(variants) {
  const s = new Set();
  for (const v of variants || []) {
    for (const t of radicais(v)) if (!PALAVRAS_GENERICAS.has(t)) s.add(t);
  }
  return s;
}

// Relevante = o título divide ao menos um termo distintivo com a busca. Se a busca não
// tiver nenhum termo distintivo (o usuário digitou só "Analista", por exemplo), aceita
// tudo: melhor deixar passar do que esvaziar o radar em silêncio.
function relevante(title, distintivos) {
  if (!distintivos || !distintivos.size) return true;
  const t = new Set(radicais(title));
  for (const d of distintivos) if (t.has(d)) return true;
  return false;
}

// Monta as consultas (portal × variante do cargo). remote: remote|hybrid|onsite|"".
// Uma localização é "do Brasil" (ou aberta ao Brasil)? Usada para filtrar os portais
// internacionais quando o usuário escolhe "Só Brasil". Localização vazia → mantém
// (portais BR muitas vezes não trazem o país); remoto/worldwide/LatAm → mantém.
function isBrLocation(loc) {
  if (!loc) return true;
  const s = String(loc).toLowerCase();
  if (/bras|brazil|remoto|remote|home\s*office|any\s*where|world\s*wide|worldwide|latam|latin\s*america|am[ée]rica\s*latina|h[íi]brido|presencial/.test(s)) return true;
  if (/(^|[^a-z])(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)([^a-z]|$)/.test(s)) return true;
  return false;
}

// Monta as consultas. Portais BR por palavra-chave (algumas variações); portais únicos
// e internacionais rodam uma vez com o termo principal. `intl:true` marca os que podem
// trazer vaga de fora — filtrados por localização quando o escopo é "Só Brasil".
function buildSearchTasks(variants, remote) {
  const tasks = [];
  const rf = remote ? ["--remote", remote] : [];
  const cli = (skill) => [".agents/skills/" + skill + "/cli/src/cli.ts"];
  const add = (portal, label, skill, extra, term, intl) =>
    tasks.push({ portal, label, term, intl: !!intl,
      args: ["run", ...cli(skill), "search", "-q", term, ...extra, "--format", "json"] });

  const kw = variants.slice(0, 3);      // portais por palavra-chave: 3 variações do cargo
  const primary = variants[0] || "";    // termo principal para os portais que rodam 1x

  for (const v of kw) {
    add("gupy", "Gupy", "gupy-search", [...rf, "--jobage", "14", "--limit", "10"], v);
    add("vagas", "Vagas.com", "vagas-search", ["--jobage", "14", "--limit", "15"], v);
    add("infojobs", "InfoJobs", "infojobs-search", ["--limit", "12"], v);
    add("empregos", "Empregos.com.br", "empregos-search", ["--limit", "12"], v);
    add("programathor", "Programathor", "programathor-search", ["--limit", "12"], v);
    add("trampos", "Trampos.co", "trampos-search", ["--limit", "12"], v);
    add("solides", "Sólides", "solides-search", ["--limit", "15"], v);
    add("linkedin", "LinkedIn", "linkedin-search", ["-l", "Brazil", ...rf, "--jobage", "14", "--limit", "10"], v);
  }
  // Portais que rodam uma vez (board único / empresa única / registro global)
  add("bne", "BNE", "bne-search", ["--limit", "6"], primary);
  add("compleo", "Compleo", "compleo-search", ["--limit", "15"], primary);
  add("foton", "Fóton", "foton-search", ["--limit", "20"], primary);
  add("freehire", "Freehire", "freehire-search", ["--country", "BR", ...rf, "--jobage", "14", "--limit", "15"], primary, true);
  add("remotive", "Remotive", "remotive-search", ["--limit", "15"], primary, true);
  add("weworkremotely", "We Work Remotely", "weworkremotely-search", ["--limit", "15"], primary, true);
  add("greenhouse", "Greenhouse", "greenhouse-search", ["--limit", "25"], primary, true);
  add("lever", "Lever", "lever-search", ["--limit", "25"], primary, true);
  add("workday", "Workday", "workday-search", ["--limit", "20"], primary, true);
  add("sonda", "SONDA", "sonda-search", ["--limit", "20"], primary, true);
  return tasks;
}

function mergeIntoSeen(collected) {
  const file = path.join(WORKSPACE, "job_scraper", "seen_jobs.json");
  let data = { seen: {} };
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const seen = data.seen || (data.seen = {});
  const knownNk = new Set(Object.values(seen).map((e) => norm(e.company) + "|" + norm(e.title)));
  let novas = 0;
  for (const j of Object.values(collected)) {
    const nk = norm(j.company) + "|" + norm(j.title);
    if (seen[j.url] || knownNk.has(nk)) continue;
    seen[j.url] = {
      title: j.title, company: j.company, url: j.url, portal: j.portal,
      location: j.location || null, date: j.date || null,
      first_seen: "2026-07-11", fit: heurFit(j.title), status: "new",
      notes: "Busca pelo painel",
    };
    if (j.deadline) seen[j.url].deadline = j.deadline;
    knownNk.add(nk); novas++;
  }
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
  return novas;
}

function runSearch(cargo, remote, soBrasil, res) {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  let cancelled = false;
  const filhos = new Set();   // processos de busca vivos (agora são vários em paralelo)
  res.on("close", () => {
    cancelled = true;
    for (const c of filhos) { try { c.kill(); } catch {} }
    filhos.clear();
  });

  send("progress", { pct: 0, msg: "Preparando os termos de busca para “" + cargo + "”…" });

  // Se a pasta não estiver autorizada, avisa o painel (para mostrar o banner amigável).
  // A busca segue mesmo assim, pois os portais funcionam sem depender dessa autorização.
  if (!projetoConfiavel()) {
    send("progress", { pct: 0, trust: true, msg: "Atenção: esta pasta ainda não foi autorizada (workspace has not been trusted)." });
  }

  // Fase 1: o Claude expande as variações de escrita do cargo.
  const vPrompt =
    'Para o cargo "' + cargo + '" no mercado brasileiro, liste de 5 a 8 termos de busca curtos que cubram as ' +
    'formas comuns de escrever esse cargo em anúncios (senioridade, abreviações, sinônimos e o equivalente em inglês). ' +
    'Responda APENAS com um array JSON de strings, sem nenhum texto fora do array. Ex.: ["termo 1","termo 2"].';
  runClaudeCollect(vPrompt, (out) => {
    if (cancelled) { send("cancelado", {}); return res.end(); }
    let variants = [];
    try {
      const m = (out || "").match(/\[[\s\S]*?\]/);
      if (m) variants = JSON.parse(m[0]).filter((x) => typeof x === "string");
    } catch {}
    if (!variants.length) variants = [cargo]; // fallback
    variants = variants.slice(0, 6);

    // Termos que identificam a área; usados para barrar o lixo que a busca "OU" dos
    // portais devolve (ver PALAVRAS_GENERICAS). Inclui o que o usuário digitou.
    const distintivos = termosDistintivos([cargo, ...variants]);

    // Guarda as variações usadas. Sem isso, a limpeza do radar só teria o cargo digitado,
    // e o cargo sozinho é PERIGOSO: "Analista de Testes Sr" gera só o termo "teste" e
    // apagaria "QA Automation Engineer" (nota 91) por engano. Medido em 15/07/2026: uma
    // limpeza pelo cargo tiraria 114 vagas boas; com as variações, tira só as 39 de lixo.
    try {
      const cfg = readConfig();
      cfg.cargo = cargo;
      cfg.termosBusca = variants;
      writeConfig(cfg);
    } catch {}

    const tasks = buildSearchTasks(variants, remote);
    const total = tasks.length;
    const collected = {};
    const nks = new Set();          // chaves empresa|vaga já vistas (dedup)
    let feito = 0, foraDoTema = 0, foraDoBrasil = 0;

    const consumir = (t, out2) => {
      let r;
      try { r = JSON.parse(out2); } catch { return; }
      for (const j of r.results || []) {
        if (!j.url) continue;
        // "Só Brasil": descarta vagas de fora vindas dos portais internacionais.
        if (soBrasil && t.intl && !isBrLocation(j.location)) { foraDoBrasil++; continue; }
        // Anti-lixo: o portal devolveu algo que não tem nada a ver com o cargo buscado.
        if (!relevante(j.title, distintivos)) { foraDoTema++; continue; }
        const nk = norm(j.company) + "|" + norm(j.title);
        if (nks.has(nk)) continue;
        nks.add(nk);
        collected[j.url] = { _nk: nk, title: j.title, company: j.company, url: j.url,
          portal: t.portal, location: j.location || null, date: (j.date || "").slice(0, 10) || null, deadline: j.deadline || null };
      }
    };

    // Cada tarefa é um processo bun independente batendo num portal diferente, então
    // rodar em paralelo é seguro (nada compartilhado) e é o que torna a busca rápida:
    // antes eram ~30 buscas em fila indiana.
    const rodar = (t) => new Promise((resolve) => {
      let ch, out2 = "";
      try { ch = spawn(BUN_BIN, t.args, { cwd: WORKSPACE }); }
      catch { return resolve(); }
      filhos.add(ch);
      ch.stdout.on("data", (b) => (out2 += b.toString()));
      const encerrar = (usar) => {
        filhos.delete(ch);
        if (usar) consumir(t, out2);
        feito++;
        const pct = Math.round((feito / total) * 90);   // 90-100% fica para a consolidação
        send("progress", { pct, feito, total,
          msg: "Buscando em " + total + " frentes ao mesmo tempo — " + feito + "/" + total +
               " concluídas (última: " + t.label + ")" });
        resolve();
      };
      ch.on("error", () => encerrar(false));
      ch.on("close", () => encerrar(true));
    });

    let prox = 0;
    const trabalhador = async () => {
      while (!cancelled) {
        const k = prox++;
        if (k >= total) return;
        await rodar(tasks[k]);
      }
    };
    const CONCORRENCIA = 6;   // 6 portais ao mesmo tempo: rápido sem parecer um ataque
    send("progress", { pct: 5, feito: 0, total,
      msg: "Disparando " + total + " buscas (" + CONCORRENCIA + " ao mesmo tempo)…" });

    Promise.all(Array.from({ length: Math.min(CONCORRENCIA, total) }, trabalhador)).then(() => {
      if (cancelled) { send("cancelado", {}); return res.end(); }
      send("progress", { pct: 95, feito: total, total, msg: "Consolidando e removendo repetidas…" });
      const novas = mergeIntoSeen(collected);
      const descartes = [];
      if (foraDoTema) descartes.push(foraDoTema + " fora do tema");
      if (foraDoBrasil) descartes.push(foraDoBrasil + " fora do Brasil");
      send("fim", { pct: 100, novas, foraDoTema, foraDoBrasil,
        msg: "Busca concluída: " + novas + " vaga(s) nova(s)" +
             (descartes.length ? " (descartadas: " + descartes.join(", ") + ")" : "") + "." });
      res.end();
    });
  });
}

// ---------- Roteamento HTTP ----------

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://${HOST}:${PORT}`);

  if (u.pathname === "/" || u.pathname === "/index.html") {
    const html = fs.readFileSync(path.join(__dirname, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (u.pathname === "/api/state") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    try { return res.end(JSON.stringify(buildState())); }
    catch (e) { res.writeHead(500); return res.end(JSON.stringify({ erro: e.message })); }
  }

  // Análise estruturada: "por que a nota e o que falta" → JSON para o pop-up.
  if (u.pathname === "/api/analyze") {
    const url = u.searchParams.get("url");
    const title = u.searchParams.get("title") || "";
    const company = u.searchParams.get("company") || "";
    if (!url) { res.writeHead(400); return res.end("url ausente"); }
    const prompt =
      'Analise a vaga "' + title + '" (' + company + ', ' + url + ') contra o meu perfil e currículo atuais ' +
      '(leia CLAUDE.md e .claude/skills/job-application-assistant/01-candidate-profile.md). ' +
      'Responda ESTRITAMENTE com UM único bloco JSON válido, sem nenhum texto antes ou depois, neste formato exato:\n' +
      '{"nota": <0 a 100>, "resumo": "<uma frase>", "faltas": [{"item":"<nome curto>","tipo":"adicionavel"|"lacuna_real","explicacao":"<por que pesa na nota>","sugestao":"<o que escrever no CV, só se adicionavel>"}]}\n' +
      '"adicionavel" = algo que eu provavelmente TENHO e só falta no meu currículo (a confirmar comigo). ' +
      '"lacuna_real" = algo que eu genuinamente não tenho e NÃO devo inventar. Não invente nada. Todos os textos em português.';
    runClaudeCollect(prompt, (out, err) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      if (err) return res.end(erroDetalhado("falha ao executar o assistente", out, err));
      const j = extractJson(out);
      if (!j) return res.end(erroDetalhado("não consegui interpretar a análise", out, err));
      res.end(JSON.stringify(j));
    });
    return;
  }

  // Ajusta o currículo com os itens confirmados e reavalia a vaga → JSON.
  if (u.pathname === "/api/adjust" && req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch {}
      const items = (body.items || []).map(String).filter(Boolean);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      if (!items.length) return res.end(JSON.stringify({ erro: "nenhum item selecionado" }));
      const prompt =
        'Eu confirmo que TENHO de verdade as seguintes experiências/competências (marquei no painel), que faltavam no meu currículo:\n- ' +
        items.join("\n- ") + '\n\n' +
        'Adicione-as ao meu perfil (CLAUDE.md e .claude/skills/job-application-assistant/01-candidate-profile.md) e ao cv/main_example.tex ' +
        'de forma verdadeira e natural — SOMENTE o que eu confirmei acima, sem inventar nada além. ' +
        'Depois reavalie a minha adequação à vaga "' + (body.title || "") + '" (' + (body.url || "") + ') e atualize a nota (rank_score) no job_scraper/seen_jobs.json. ' +
        'Responda ESTRITAMENTE com um único bloco JSON: {"notaAntes": <n>, "notaDepois": <n>, "resumo": "<uma frase do que mudou>"}. Sem texto fora do JSON.';
      runClaudeCollect(prompt, (out, err) => {
        if (err) return res.end(erroDetalhado("falha ao executar o assistente", out, err));
        const j = extractJson(out);
        if (!j) return res.end(erroDetalhado("não consegui confirmar o resultado", out, err));
        res.end(JSON.stringify(j));
      });
    });
    return;
  }

  // Busca de vagas com progresso real e cancelável.
  if (u.pathname === "/api/search") {
    const cargo = (u.searchParams.get("cargo") || "").trim();
    const remote = u.searchParams.get("remote") || ""; // remote|hybrid|onsite|""
    const soBrasil = (u.searchParams.get("pais") || "br") !== "world"; // br (default) | world
    if (!cargo) { res.writeHead(400); return res.end("cargo ausente"); }
    return runSearch(cargo, remote, soBrasil, res);
  }

  // Autoriza esta pasta no Claude Code (resolve o erro de "workspace not trusted"),
  // marcando o projeto como confiável no ~/.claude.json. Sem a pessoa mexer em arquivo.
  if (u.pathname === "/api/trust" && req.method === "POST") {
    try {
      const cfgPath = path.join(os.homedir(), ".claude.json");
      const root = path.join(__dirname, ".."); // raiz do projeto (onde fica o .git)
      const bs = root, fw = root.replace(/\\/g, "/");
      const variants = [...new Set([bs, fw, bs[0].toLowerCase() + bs.slice(1), fw[0].toLowerCase() + fw.slice(1)])];
      let j = {};
      try { j = JSON.parse(fs.readFileSync(cfgPath, "utf8")); } catch {}
      try { fs.copyFileSync(cfgPath, cfgPath + ".bak"); } catch {}
      j.projects = j.projects || {};
      for (const k of variants) { j.projects[k] = j.projects[k] || {}; j.projects[k].hasTrustDialogAccepted = true; }
      fs.writeFileSync(cfgPath, JSON.stringify(j, null, 2));
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ ok: true, path: root }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ erro: e.message }));
    }
  }

  if (u.pathname === "/api/run") {
    const prompt = u.searchParams.get("prompt");
    if (!prompt) { res.writeHead(400); return res.end("prompt ausente"); }
    return runClaude(prompt, res);
  }

  // Ler / salvar o cargo-alvo da busca.
  if (u.pathname === "/api/config" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify(readConfig()));
  }
  if (u.pathname === "/api/config" && req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        const cargo = String(body.cargo || "").slice(0, 200).trim();
        writeConfig({ cargo });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, cargo }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ erro: e.message }));
      }
    });
    return;
  }

  // Respostas de formulário (perguntas da Gupy etc.).
  // GET  /api/answers?url=…  → campos desta vaga (ou os padrão, se ainda não houver).
  //                            Sem url → edição dos valores PADRÃO reutilizáveis.
  if (u.pathname === "/api/answers" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    const store = readAnswers();
    const url = (u.searchParams.get("url") || "").trim();
    if (!url) return res.end(JSON.stringify({ global: true, campos: store.padrao }));
    const v = store.vagas[url];
    // Se a vaga ainda não tem respostas, começa a partir dos valores padrão.
    const campos = v && Array.isArray(v.campos) && v.campos.length ? v.campos : store.padrao;
    return res.end(JSON.stringify({ global: false, campos, atualizadoEm: v && v.atualizadoEm || null }));
  }
  // POST /api/answers  {url?, title?, company?, campos:[{pergunta,resposta}], salvarPadrao?}
  if (u.pathname === "/api/answers" && req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        const campos = sanitizeCampos(body.campos);
        const url = String(body.url || "").trim();
        const store = readAnswers();
        if (url) {
          const vaga = {
            title: String(body.title || "").slice(0, 300),
            company: String(body.company || "").slice(0, 200),
            url,
            campos,
            atualizadoEm: new Date().toISOString(),
          };
          store.vagas[url] = vaga;
          escreverSnapshotRespostas(vaga);
        }
        // Salva como padrão quando pedido, ou quando a edição é dos próprios padrões.
        if (body.salvarPadrao || !url) store.padrao = campos;
        writeAnswers(store);
        res.end(JSON.stringify({ ok: true, salvos: campos.length }));
      } catch (e) {
        res.end(JSON.stringify({ erro: e.message }));
      }
    });
    return;
  }

  // ----- Análise/reavaliação EM MASSA (várias vagas de uma vez) -----
  // Analisa as vagas selecionadas e devolve, agregados, os itens que provavelmente
  // faltam no CV e que dá para adicionar (a confirmar) — uma só chamada ao Claude.
  if (u.pathname === "/api/bulk-analyze" && req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      // NDJSON: uma linha por evento, para o painel mostrar o progresso ao vivo.
      res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" });
      const linha = (o) => { try { res.write(JSON.stringify(o) + "\n"); } catch {} };
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch {}
      const jobs = (body.jobs || []).slice(0, 20);
      if (!jobs.length) { linha({ erro: "nenhuma vaga selecionada" }); return res.end(); }
      const lista = jobs.map((j, i) => (i + 1) + ". " + (j.title || "") + " — " + (j.company || "") + " — " + j.url).join("\n");
      const prompt =
        'Compare estas vagas com o meu perfil e currículo atuais (leia CLAUDE.md e ' +
        '.claude/skills/job-application-assistant/01-candidate-profile.md). Vagas:\n' + lista + '\n\n' +
        'Liste de forma AGREGADA os itens que eu PROVAVELMENTE TENHO e que só faltam no meu currículo ' +
        '(adicionáveis, a confirmar comigo) e que aumentariam a nota em uma ou mais dessas vagas. ' +
        'NÃO invente nada; itens que eu genuinamente não tenho vão em "lacunas". ' +
        'Responda ESTRITAMENTE com UM bloco JSON, sem texto fora dele:\n' +
        '{"adicionaveis":[{"item":"<curto>","sugestao":"<o que escrever no CV>","vagas":[<números 1..N que isso ajuda>]}],' +
        '"lacunas":[{"item":"<curto>","explicacao":"<por que não dá para adicionar>"}]}\nTextos em português.';
      let ultimo = "";
      runClaudeStream(prompt, (t) => { if (t !== ultimo) { ultimo = t; linha({ log: t }); } }, (out, err) => {
        if (err) { linha({ erro: "falha ao executar o assistente", detalhe: String(err).slice(-1500) }); return res.end(); }
        const j = extractJson(out);
        if (!j) { linha({ erro: "não consegui interpretar a análise", detalhe: String(out || "").slice(-1500) }); return res.end(); }
        linha({ fim: j }); res.end();
      });
    });
    return;
  }

  // Limpa o LIXO QUE JÁ ESTÁ no radar. O filtro da busca só age sobre resultados novos —
  // as vagas coletadas antes dele existir (RH, enfermagem, mainframe…) continuavam na
  // lista. Aqui a mesma regra é aplicada ao que já foi guardado.
  //   GET  → prévia: diz o que sairia, sem mexer em nada.
  //   POST → aplica, marcando status "skipped" (o painel já ignora esse status).
  // Não apaga: "skipped" é reversível e preserva o histórico de dedup do scraper.
  if (u.pathname === "/api/limpar-radar") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    const cfg = readConfig();
    // Exige as VARIAÇÕES, nunca só o cargo. Isso não é preciosismo: "Analista de Testes Sr"
    // sozinho gera apenas o termo "teste" — não vazio, então passaria batido — e apagaria
    // "QA Automation Engineer" (nota 91) e outras 113 vagas boas. Medido em 15/07/2026.
    if (!Array.isArray(cfg.termosBusca) || !cfg.termosBusca.length) {
      return res.end(JSON.stringify({ erro: "ainda não sei como o seu cargo é escrito por aí " +
        "(QA, Quality Assurance, SDET…). Clique em “Buscar novas vagas” uma vez: é a busca que " +
        "descobre essas variações. Sem elas, a limpeza tiraria vagas boas por engano." }));
    }
    const termos = [cfg.cargo || "", ...cfg.termosBusca].filter(Boolean);
    const distintivos = termosDistintivos(termos);
    if (!distintivos.size) {
      return res.end(JSON.stringify({ erro: "os termos da sua busca são todos genéricos " +
        "(“analista”, “sênior”…), então não dá para dizer o que é fora do tema sem risco." }));
    }
    const file = path.join(WORKSPACE, "job_scraper", "seen_jobs.json");
    let d;
    try { d = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { return res.end(JSON.stringify({ erro: "não consegui ler as vagas: " + e.message })); }
    const seen = d.seen || {};
    const alvos = Object.entries(seen).filter(([, e]) =>
      e.status !== "skipped" && e.status !== "expired" && !relevante(e.title, distintivos));
    const amostra = alvos.slice(0, 12).map(([, e]) => ({ title: e.title, company: e.company || null, score: e.rank_score ?? null }));
    const maiorNota = alvos.reduce((m, [, e]) => Math.max(m, e.rank_score ?? 0), 0);

    if (req.method !== "POST") {   // prévia
      return res.end(JSON.stringify({ previa: true, total: alvos.length,
        termos: [...distintivos], maiorNota, amostra }));
    }
    for (const [, e] of alvos) {
      e.status = "skipped";
      e.notes = "Fora do tema da busca (limpeza do radar em " +
        new Date().toISOString().slice(0, 10) + "): o título não bate com nenhum termo de “" +
        (cfg.cargo || "") + "”.";
    }
    try { fs.writeFileSync(file, JSON.stringify(d, null, 2)); }
    catch (e) { return res.end(JSON.stringify({ erro: "não consegui gravar: " + e.message })); }
    return res.end(JSON.stringify({ removidas: alvos.length, maiorNota, amostra }));
  }

  // Avalia (ranqueia) as vagas da FILA em LOTES, até zerar. Antes, uma única execução
  // tentava todas de uma vez e parava no meio — deixando vagas sem nota para sempre.
  if (u.pathname === "/api/rank-batch" && req.method === "POST") {
    res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" });
    const linha = (o) => { try { res.write(JSON.stringify(o) + "\n"); } catch {} };
    let cancelado = false;
    const filhos = new Set();   // assistentes vivos (vários, agora que roda em paralelo)
    res.on("close", () => {
      cancelado = true;
      for (const c of filhos) { try { c.kill(); } catch {} }
      filhos.clear();
    });

    const file = path.join(WORKSPACE, "job_scraper", "seen_jobs.json");
    // Fila = mesma regra do painel: sem nota, e que não foi descartada/expirada antes.
    const pendentes = () => {
      try {
        const d = JSON.parse(fs.readFileSync(file, "utf8"));
        return Object.entries(d.seen || {})
          .filter(([, e]) => e.rank_score == null && e.status !== "skipped" && e.status !== "expired")
          .map(([url, e]) => ({ url, title: e.title, company: e.company }));
      } catch { return null; }
    };
    const fila = pendentes();
    if (fila === null) { linha({ erro: "não consegui ler as vagas (job_scraper/seen_jobs.json)" }); return res.end(); }
    if (!fila.length) { linha({ fim: { avaliadas: 0, restantes: 0, msg: "Nenhuma vaga na fila — todas já foram avaliadas." } }); return res.end(); }

    // Lotes menores que antes (10 em vez de 20) porque agora rodam em paralelo: mais
    // lotes = progresso mais granular, e um lote que falha derruba menos vagas junto.
    const TAM = 10;
    const CONCORRENCIA = 4;   // 4 assistentes ao mesmo tempo
    const lotes = [];
    for (let i = 0; i < fila.length; i += TAM) lotes.push(fila.slice(i, i + TAM));
    const hoje = new Date().toISOString().slice(0, 10);

    // Quem grava é o SERVIDOR, não o assistente. Isso é o que torna o paralelo seguro:
    // se 4 assistentes editassem o seen_jobs.json ao mesmo tempo, um sobrescreveria o
    // outro (ler-alterar-gravar concorrente) e notas seriam perdidas em silêncio. Aqui
    // a gravação é síncrona e roda na thread única do Node, então os lotes se enfileiram
    // naturalmente. De quebra, acaba o problema do assistente alegar "avaliei 20" sem
    // ter gravado nada: só conta o que passou por esta função.
    const aplicar = (resultados) => {
      let d;
      try { d = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return 0; }
      const seen = d.seen || {};
      let n = 0;
      for (const r of resultados || []) {
        const e = seen[r && r.url];
        if (!e) continue;                       // URL inventada ou fora da fila: ignora
        if (r.expired) {
          e.status = "expired";
          if (r.notes) e.rank_notes = String(r.notes);
          n++; continue;
        }
        const nota = Number(r.score);
        if (!isFinite(nota)) continue;          // sem nota utilizável: fica na fila
        e.status = "ranked";
        e.rank_score = Math.max(0, Math.min(100, Math.round(nota)));
        e.rank_verdict = r.verdict ? String(r.verdict) : null;
        e.rank_date = hoje;
        e.rank_location = /^(PASS|FAIL|FLAG)$/.test(r.location) ? r.location : null;
        e.rank_notes = r.notes ? String(r.notes) : null;
        n++;
      }
      try { fs.writeFileSync(file, JSON.stringify(d, null, 2)); } catch { return 0; }
      return n;
    };

    let gravadas = 0, feitos = 0, falhas = 0;

    const rodarLote = (i) => new Promise((resolve) => {
      const lote = lotes[i];
      const lista = lote.map((j, k) => (k + 1) + ". " + (j.title || "") + " — " + (j.company || "") + " — " + j.url).join("\n");
      const prompt =
        'Avalie estas vagas contra o meu perfil, seguindo EXATAMENTE os critérios do /rank ' +
        '(leia .claude/commands/rank.md e .claude/skills/job-application-assistant/04-job-evaluation.md, ' +
        'além de CLAUDE.md e 01-candidate-profile.md): pesos Técnico 30%, Experiência 25%, ' +
        'Comportamental 15%, Alinhamento de carreira 30%; bandas Strong Fit 75+, Good Fit 60-74, ' +
        'Moderate Fit 45-59, Weak Fit 30-44, Poor Fit <30; veto de localização.\n\nVagas:\n' + lista + '\n\n' +
        'Busque o anúncio de cada URL e pontue SOMENTE pelo conteúdo que conseguir ler. ' +
        'Nunca pontue pelo título e nunca invente conteúdo: se o anúncio não puder ser lido ' +
        'ou estiver encerrado, marque "expired": true e explique em "notes". ' +
        'NÃO edite arquivo nenhum — quem grava é o painel. Seja honesto na nota.\n' +
        'Responda ESTRITAMENTE com UM bloco JSON, sem texto fora dele: ' +
        '{"resultados":[{"url":"<a URL exata da lista>","score":<0-100>,"verdict":"<banda>",' +
        '"location":"PASS"|"FAIL"|"FLAG","notes":"<o que falta, curto>","expired":false}]}';
      let ch = null;
      ch = runClaudeStream(prompt, (t) => linha({ log: "Lote " + (i + 1) + ": " + t }), (out, err) => {
        if (ch) filhos.delete(ch);
        if (cancelado) return resolve();
        if (err) {
          falhas++;
          linha({ aviso: "o lote " + (i + 1) + "/" + lotes.length + " falhou; as vagas dele seguem na fila",
            detalhe: String(err).slice(-600) });
          return resolve();
        }
        const j = extractJson(out);
        const n = aplicar(j && j.resultados);
        gravadas += n;
        if (!n) {
          falhas++;
          linha({ aviso: "o lote " + (i + 1) + "/" + lotes.length + " não devolveu nota utilizável; as vagas dele seguem na fila" });
        }
        resolve();
      });
      if (ch) filhos.add(ch);
    });

    let prox = 0;
    const trabalhador = async () => {
      while (!cancelado) {
        const i = prox++;
        if (i >= lotes.length) return;
        linha({ lote: { atual: feitos, total: lotes.length, pct: Math.round((feitos / lotes.length) * 100),
          msg: "Lote " + (i + 1) + "/" + lotes.length + " iniciado — " + lotes[i].length + " vaga(s)" } });
        await rodarLote(i);
        feitos++;
        linha({ lote: { atual: feitos, total: lotes.length, pct: Math.round((feitos / lotes.length) * 100),
          msg: feitos + "/" + lotes.length + " lotes concluídos — " + gravadas + " vaga(s) avaliada(s)" } });
      }
    };
    // A verdade vem do arquivo, não da contagem que o Claude diz ter feito.
    const finalizar = () => {
      if (cancelado) { linha({ cancelado: true }); return res.end(); }
      const resta = pendentes();
      const restantes = resta === null ? null : resta.length;
      const avaliadas = restantes == null ? null : fila.length - restantes;
      const aviso = falhas ? " (" + falhas + " lote(s) falharam)" : "";
      linha({ fim: { avaliadas, restantes, falhas,
        msg: restantes === 0 ? "Fila zerada: todas as " + fila.length + " vagas foram avaliadas."
          : "Avaliadas " + avaliadas + " de " + fila.length + ". Ainda faltam " + restantes + "." + aviso } });
      res.end();
    };

    linha({ lote: { atual: 0, total: lotes.length, pct: 0,
      msg: fila.length + " vaga(s) na fila — " + lotes.length + " lote(s), " +
           Math.min(CONCORRENCIA, lotes.length) + " rodando ao mesmo tempo" } });
    Promise.all(Array.from({ length: Math.min(CONCORRENCIA, lotes.length) }, trabalhador))
      .then(finalizar);
    return;
  }

  // Adiciona os itens confirmados ao CV/perfil e reavalia TODAS as vagas selecionadas.
  if (u.pathname === "/api/bulk-adjust" && req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      // Responde em NDJSON (uma linha por evento) para o painel mostrar progresso ao vivo.
      res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" });
      const linha = (o) => { try { res.write(JSON.stringify(o) + "\n"); } catch {} };
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch {}
      const items = (body.items || []).map(String).filter(Boolean);
      const jobs = (body.jobs || []).slice(0, 20);
      if (!items.length) { linha({ erro: "nenhum item selecionado" }); return res.end(); }
      if (!jobs.length) { linha({ erro: "nenhuma vaga selecionada" }); return res.end(); }
      const lista = jobs.map((j, i) => (i + 1) + ". " + (j.title || "") + " — " + (j.company || "") + " — " + j.url).join("\n");
      const prompt =
        'Eu confirmo que TENHO de verdade estes itens (marquei no painel), que faltavam no meu currículo:\n- ' +
        items.join("\n- ") + '\n\n' +
        'Adicione-os ao meu perfil (CLAUDE.md e .claude/skills/job-application-assistant/01-candidate-profile.md) e ao ' +
        'cv/main_example.tex de forma verdadeira e natural — SOMENTE o que confirmei, sem inventar nada além. ' +
        'Depois reavalie a minha adequação a CADA uma destas vagas e atualize a nota (rank_score) no ' +
        'job_scraper/seen_jobs.json:\n' + lista + '\n\n' +
        'Responda ESTRITAMENTE com UM bloco JSON, sem texto fora dele: ' +
        '{"resultados":[{"url":"<url>","notaAntes":<n>,"notaDepois":<n>}],"resumo":"<uma frase do que mudou>"}.';
      let ultimo = "";
      runClaudeStream(prompt, (t) => { if (t !== ultimo) { ultimo = t; linha({ log: t }); } }, (out, err) => {
        if (err) { linha({ erro: "falha ao executar o assistente", detalhe: String(err).slice(-1500) }); return res.end(); }
        const j = extractJson(out);
        if (!j) { linha({ erro: "não consegui confirmar o resultado", detalhe: String(out || "").slice(-1500) }); return res.end(); }
        linha({ fim: j }); res.end();
      });
    });
    return;
  }

  // ----- Meu currículo ÚNICO: ver / baixar / editar / recompilar -----
  // Conteúdo do .tex para edição.
  if (u.pathname === "/api/mycv" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    try { return res.end(JSON.stringify({ content: fs.readFileSync(path.join(CV_DIR, CV_TEX), "utf8") })); }
    catch (e) { return res.end(JSON.stringify({ erro: "currículo não encontrado: " + e.message })); }
  }
  // Salvar o .tex editado e recompilar.
  if (u.pathname === "/api/mycv" && req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch {}
      if (typeof body.content !== "string" || !body.content.trim())
        return res.end(JSON.stringify({ erro: "conteúdo vazio" }));
      try { fs.writeFileSync(path.join(CV_DIR, CV_TEX), body.content, "utf8"); }
      catch (e) { return res.end(JSON.stringify({ erro: "falha ao salvar: " + e.message })); }
      compileTex(CV_DIR, CV_TEX, (ok, log) => res.end(JSON.stringify({ ok: true, compilado: ok, log: ok ? "" : log })));
    });
    return;
  }
  // Servir o PDF (inline para ver, ou anexo para baixar). Recompila se o .tex mudou.
  if ((u.pathname === "/api/mycv/pdf" || u.pathname === "/api/mycv/download") && req.method === "GET") {
    const fmt = u.searchParams.get("fmt") || "pdf";
    const baixar = u.pathname === "/api/mycv/download";
    const nome = nomeCandidato();
    const nomeBase = nome ? "Currículo - " + nome : "Currículo";
    // Cabeçalho HTTP precisa ser ASCII: fallback sem acento + filename* (UTF-8, RFC 5987).
    const disp = (ext) => {
      const ascii = nomeBase.normalize("NFD").replace(/[̀-ͯ]/g, "") + "." + ext;
      return (baixar ? "attachment" : "inline") +
        '; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(nomeBase + "." + ext);
    };
    if (fmt === "tex") {
      const p = path.join(CV_DIR, CV_TEX);
      if (!fs.existsSync(p)) { res.writeHead(404); return res.end("sem .tex"); }
      res.writeHead(200, { "Content-Type": "application/x-tex; charset=utf-8", "Content-Disposition": disp("tex") });
      return res.end(fs.readFileSync(p));
    }
    const servePdf = () => {
      const p = path.join(CV_DIR, CV_PDF);
      if (!fs.existsSync(p)) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("PDF ainda não gerado. Clique em Editar e Salvar para compilar."); }
      res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": disp("pdf") });
      fs.createReadStream(p).pipe(res);
    };
    // Mantém o PDF sempre em dia: se o .tex foi enriquecido, recompila antes de servir.
    if (cvPdfDesatualizado()) return compileTex(CV_DIR, CV_TEX, () => servePdf());
    return servePdf();
  }

  // Upload do currículo → salva em documents/cv/ (pasta privada, gitignored).
  // Recebe os bytes crus no corpo do POST; o nome vem no header x-filename.
  if (u.pathname === "/api/upload" && req.method === "POST") {
    const raw = decodeURIComponent(req.headers["x-filename"] || "curriculo.pdf");
    const safe = path.basename(raw).replace(/[^\w.\-() À-ÿ]/g, "_");
    const ext = path.extname(safe).toLowerCase();
    const ok = [".pdf", ".docx", ".doc", ".tex", ".txt"];
    const reply = (code, obj) => {
      res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(obj));
    };
    if (!ok.includes(ext)) return reply(400, { erro: "Formato não suportado. Envie PDF, Word ou .tex." });
    const chunks = []; let size = 0; let tooBig = false;
    req.on("data", (c) => {
      size += c.length;
      if (size > 15 * 1024 * 1024) { tooBig = true; req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (tooBig) return reply(413, { erro: "Arquivo grande demais (máx. 15 MB)." });
      try {
        const dir = path.join(WORKSPACE, "documents", "cv");
        fs.mkdirSync(dir, { recursive: true });
        // Remove currículos antigos para não misturar versões.
        for (const f of fs.readdirSync(dir))
          if (f !== ".gitkeep" && !f.startsWith(".")) fs.unlinkSync(path.join(dir, f));
        fs.writeFileSync(path.join(dir, safe), Buffer.concat(chunks));
        reply(200, { ok: true, arquivo: safe });
      } catch (e) { reply(500, { erro: e.message }); }
    });
    req.on("error", () => reply(500, { erro: "Falha ao receber o arquivo." }));
    return;
  }

  res.writeHead(404);
  res.end("não encontrado");
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Painel de Candidaturas rodando em  http://${HOST}:${PORT}\n`);
  console.log("  Deixe esta janela aberta enquanto usa o painel.");
  console.log("  Para fechar o painel, feche esta janela.\n");
});
