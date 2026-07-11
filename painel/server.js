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
