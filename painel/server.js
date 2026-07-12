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
  const recomendadas = all.filter((j) => j.score != null && !j.vetada);
  const hoje = new Date("2026-07-11T12:00:00"); // data do workspace
  const urgentes = recomendadas.filter((j) => {
    if (!j.deadline) return false;
    const d = Math.round((new Date(j.deadline + "T12:00:00") - hoje) / 864e5);
    return d >= 0 && d <= 7;
  });
  return {
    perfil: readProfileState(),
    cargo: readConfig().cargo || "",
    resumo: {
      totalVagas: all.length,
      ranqueadas: recomendadas.length,
      candidaturas: tracker.length,
      urgentes: urgentes.length,
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

// ---------- Currículos gerados por vaga (ver / baixar / editar / recompilar) ----------

const APPS_DIR = path.join(WORKSPACE, "documents", "applications");

// lualatex do MiKTeX — detectado dinamicamente, sem caminho fixo de máquina.
const LUALATEX_BIN = process.env.LUALATEX_BIN || (() => {
  const guess = path.join(os.homedir(), "AppData", "Local", "Programs", "MiKTeX", "miktex", "bin", "x64", "lualatex.exe");
  return process.platform === "win32" && fs.existsSync(guess) ? guess : "lualatex";
})();

// Resolve a pasta de uma aplicação a partir do id (nome da pasta), barrando path traversal.
function appDir(id) {
  const safe = path.basename(String(id || ""));
  const dir = path.join(APPS_DIR, safe);
  if (!safe || !dir.startsWith(APPS_DIR) || !fs.existsSync(dir)) return null;
  return dir;
}

// Escolhe o PDF do currículo dentro da pasta. Prioriza o cv_draft.pdf (recompilado a
// partir do .tex editável) quando existir — assim, após editar e salvar, o "Ver PDF"
// mostra a versão nova. Senão, cai no PDF de entrega original ("Currículo …" / main_*).
function findCvPdf(dir) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf")); } catch {}
  return files.find((f) => /^cv_draft\.pdf$/i.test(f))
    || files.find((f) => /curr[ií]culo/i.test(f))
    || files.find((f) => /^main_.*\.pdf$/i.test(f))
    || null;
}

// Rótulo amigável da vaga: usa o "# Outcome: …" do outcome.md, senão o nome da pasta.
function appLabel(dir, id) {
  try {
    const oc = fs.readFileSync(path.join(dir, "outcome.md"), "utf8");
    const m = oc.match(/^#\s*Outcome:\s*(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  return String(id).replace(/_/g, " ");
}

// Lista as aplicações que têm currículo (cv_draft.tex).
function listApplications() {
  let out = [];
  try {
    for (const id of fs.readdirSync(APPS_DIR)) {
      const dir = path.join(APPS_DIR, id);
      if (!fs.statSync(dir).isDirectory()) continue;
      const temTex = fs.existsSync(path.join(dir, "cv_draft.tex"));
      if (!temTex) continue;
      out.push({ id, label: appLabel(dir, id), temPdf: !!findCvPdf(dir) });
    }
  } catch {}
  return out;
}

// Recompila cv_draft.tex → cv_draft.pdf (2 passadas, como manda o CLAUDE.md). cb(ok, log).
function compileCv(dir, cb) {
  const tex = "cv_draft.tex";
  if (!fs.existsSync(path.join(dir, tex))) return cb(false, "cv_draft.tex não encontrado.");
  const args = ["-interaction=nonstopmode", "-halt-on-error", tex];
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
    const ok = fs.existsSync(path.join(dir, "cv_draft.pdf"));
    cb(ok, ok ? "" : ("Não gerou o PDF. Fim do log:\n\n" + log.slice(-1800)));
  }));
}

// ---------- Busca com progresso real (roda as CLIs direto, cancelável) ----------

function heurFit(title) {
  const t = (title || "").toLowerCase();
  if (/j[úu]nior|\bjr\b|estagi|trainee/.test(t)) return "low";
  if (/s[êe]nior|\bsr\b|\biii\b|especialista|lead|arquitet/.test(t)) return "high";
  return "medium";
}

// Monta as consultas (portal × variante do cargo). remote: remote|hybrid|onsite|"".
function buildSearchTasks(variants, remote) {
  const tasks = [];
  const rf = remote ? ["--remote", remote] : [];
  const cli = (skill) => [".agents/skills/" + skill + "/cli/src/cli.ts"];
  for (const v of variants) {
    tasks.push({ portal: "gupy", label: "Gupy", term: v,
      args: ["run", ...cli("gupy-search"), "search", "-q", v, ...rf, "--jobage", "14", "--limit", "10", "--format", "json"] });
    tasks.push({ portal: "linkedin", label: "LinkedIn", term: v,
      args: ["run", ...cli("linkedin-search"), "search", "-q", v, "-l", "Brazil", ...rf, "--jobage", "14", "--limit", "10", "--format", "json"] });
    tasks.push({ portal: "freehire", label: "Freehire", term: v,
      args: ["run", ...cli("freehire-search"), "search", "-q", v, "--country", "BR", ...rf, "--jobage", "14", "--limit", "15", "--format", "json"] });
    tasks.push({ portal: "vagas", label: "Vagas.com", term: v,
      args: ["run", ...cli("vagas-search"), "search", "-q", v, "--jobage", "14", "--limit", "20", "--format", "json"] });
  }
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

function runSearch(cargo, remote, res) {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  let cancelled = false, curChild = null;
  res.on("close", () => { cancelled = true; if (curChild) { try { curChild.kill(); } catch {} } });

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

    const tasks = buildSearchTasks(variants, remote);
    const total = tasks.length;
    const collected = {};
    let i = 0;

    const next = () => {
      if (cancelled) { send("cancelado", {}); return res.end(); }
      if (i >= total) {
        send("progress", { pct: 99, feito: total, total, msg: "Consolidando e removendo repetidas…" });
        const novas = mergeIntoSeen(collected);
        send("fim", { pct: 100, novas, msg: "Busca concluída: " + novas + " vaga(s) nova(s) encontrada(s)." });
        return res.end();
      }
      const t = tasks[i];
      const pct = Math.round((i / total) * 100);
      send("progress", { pct, feito: i, total, msg: 'Buscando "' + t.term + '" na ' + t.label + " — " + (i + 1) + "/" + total + " (" + pct + "%)" });
      let out2 = "";
      try { curChild = spawn(BUN_BIN, t.args, { cwd: WORKSPACE }); }
      catch { i++; return next(); }
      curChild.stdout.on("data", (b) => (out2 += b.toString()));
      curChild.on("error", () => { i++; next(); });
      curChild.on("close", () => {
        try {
          const r = JSON.parse(out2);
          for (const j of r.results || []) {
            if (!j.url) continue;
            const nk = norm(j.company) + "|" + norm(j.title);
            if (Object.values(collected).some((c) => c._nk === nk)) continue;
            collected[j.url] = { _nk: nk, title: j.title, company: j.company, url: j.url,
              portal: t.portal, location: j.location || null, date: (j.date || "").slice(0, 10) || null, deadline: j.deadline || null };
          }
        } catch {}
        i++; next();
      });
    };
    next();
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
      if (err) return res.end(JSON.stringify({ erro: err }));
      const j = extractJson(out);
      if (!j) return res.end(JSON.stringify({ erro: "não consegui interpretar a análise" }));
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
        if (err) return res.end(JSON.stringify({ erro: err }));
        const j = extractJson(out);
        if (!j) return res.end(JSON.stringify({ erro: "não consegui confirmar o resultado" }));
        res.end(JSON.stringify(j));
      });
    });
    return;
  }

  // Busca de vagas com progresso real e cancelável.
  if (u.pathname === "/api/search") {
    const cargo = (u.searchParams.get("cargo") || "").trim();
    const remote = u.searchParams.get("remote") || ""; // remote|hybrid|onsite|""
    if (!cargo) { res.writeHead(400); return res.end("cargo ausente"); }
    return runSearch(cargo, remote, res);
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
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch {}
      const jobs = (body.jobs || []).slice(0, 20);
      if (!jobs.length) return res.end(JSON.stringify({ erro: "nenhuma vaga selecionada" }));
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
      runClaudeCollect(prompt, (out, err) => {
        if (err) return res.end(JSON.stringify({ erro: err }));
        const j = extractJson(out);
        if (!j) return res.end(JSON.stringify({ erro: "não consegui interpretar a análise" }));
        res.end(JSON.stringify(j));
      });
    });
    return;
  }

  // Adiciona os itens confirmados ao CV/perfil e reavalia TODAS as vagas selecionadas.
  if (u.pathname === "/api/bulk-adjust" && req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch {}
      const items = (body.items || []).map(String).filter(Boolean);
      const jobs = (body.jobs || []).slice(0, 20);
      if (!items.length) return res.end(JSON.stringify({ erro: "nenhum item selecionado" }));
      if (!jobs.length) return res.end(JSON.stringify({ erro: "nenhuma vaga selecionada" }));
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
      runClaudeCollect(prompt, (out, err) => {
        if (err) return res.end(JSON.stringify({ erro: err }));
        const j = extractJson(out);
        if (!j) return res.end(JSON.stringify({ erro: "não consegui confirmar o resultado" }));
        res.end(JSON.stringify(j));
      });
    });
    return;
  }

  // ----- Currículos gerados por vaga: listar / ver / baixar / editar / recompilar -----
  if (u.pathname === "/api/cvs" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ cvs: listApplications() }));
  }
  // Conteúdo do .tex para edição.
  if (u.pathname === "/api/cv" && req.method === "GET") {
    const dir = appDir(u.searchParams.get("id"));
    res.writeHead(dir ? 200 : 404, { "Content-Type": "application/json; charset=utf-8" });
    if (!dir) return res.end(JSON.stringify({ erro: "currículo não encontrado" }));
    try { return res.end(JSON.stringify({ content: fs.readFileSync(path.join(dir, "cv_draft.tex"), "utf8") })); }
    catch (e) { return res.end(JSON.stringify({ erro: e.message })); }
  }
  // Salvar o .tex editado e recompilar.
  if (u.pathname === "/api/cv" && req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch {}
      const dir = appDir(body.id);
      if (!dir) return res.end(JSON.stringify({ erro: "currículo não encontrado" }));
      if (typeof body.content !== "string" || !body.content.trim())
        return res.end(JSON.stringify({ erro: "conteúdo vazio" }));
      try { fs.writeFileSync(path.join(dir, "cv_draft.tex"), body.content, "utf8"); }
      catch (e) { return res.end(JSON.stringify({ erro: "falha ao salvar: " + e.message })); }
      compileCv(dir, (ok, log) => res.end(JSON.stringify({ ok: true, compilado: ok, log: ok ? "" : log })));
    });
    return;
  }
  // Servir o PDF (inline para ver, ou anexo para baixar). Recompila se ainda não houver PDF.
  if ((u.pathname === "/api/cv/pdf" || u.pathname === "/api/cv/download") && req.method === "GET") {
    const dir = appDir(u.searchParams.get("id"));
    if (!dir) { res.writeHead(404); return res.end("não encontrado"); }
    const fmt = u.searchParams.get("fmt") || "pdf";
    const baixar = u.pathname === "/api/cv/download";
    const nomeBase = "Currículo - Guilherme Augusto S. F. C. Oliveira";
    // Cabeçalho HTTP precisa ser ASCII: fallback sem acento + filename* (UTF-8, RFC 5987).
    const disp = (ext) => {
      const ascii = nomeBase.normalize("NFD").replace(/[̀-ͯ]/g, "") + "." + ext;
      return (baixar ? "attachment" : "inline") +
        '; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(nomeBase + "." + ext);
    };
    if (fmt === "tex") {
      const p = path.join(dir, "cv_draft.tex");
      if (!fs.existsSync(p)) { res.writeHead(404); return res.end("sem .tex"); }
      res.writeHead(200, { "Content-Type": "application/x-tex; charset=utf-8", "Content-Disposition": disp("tex") });
      return res.end(fs.readFileSync(p));
    }
    const servePdf = () => {
      const pdf = findCvPdf(dir);
      if (!pdf) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("PDF ainda não gerado. Edite e salve para compilar."); }
      res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": disp("pdf") });
      fs.createReadStream(path.join(dir, pdf)).pipe(res);
    };
    if (findCvPdf(dir)) return servePdf();
    return compileCv(dir, () => servePdf()); // sem PDF ainda → tenta compilar antes de servir
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
