# Painel de Candidaturas — Documentação

Front-end local (janela no navegador) que permite a uma pessoa **leiga** operar todo o
fluxo de candidaturas por botões, sem abrir terminal nem digitar comandos. Por trás dos
botões, o painel executa o **Claude Code** (modo headless) sobre o workspace `ai-job-search/`.

> Mantenha esta documentação atualizada a cada mudança no painel — é o registro de
> rastreabilidade do que foi feito e por quê.

---

## Arquitetura

```
Navegador (index.html)  ──HTTP──>  server.js (Node, local)  ──stdin──>  claude --print
     botões / tela              lê estado do workspace,              executa /scrape,
                                serve a página, faz a ponte          /apply, /setup, etc.
```

- Roda 100% local em `http://127.0.0.1:4599` — nada é publicado na internet.
- O servidor não tem dependências externas (só módulos nativos do Node).
- O prompt de cada ação vai para o Claude pela **entrada padrão (stdin)**, não como
  argumento — assim aspas, acentos e quebras de linha não quebram no Windows.

## Arquivos

| Arquivo | Função |
|---------|--------|
| `../Abrir Painel.bat` | Ponto de entrada do leigo, **na raiz do projeto**. Duplo-clique: sobe o servidor (`node --no-deprecation painel\server.js`) e abre o navegador. |
| `server.js` | Servidor HTTP local. Lê o estado do workspace, serve a interface e executa o Claude Code por trás dos botões. Usa `__dirname`, então funciona sendo chamado da raiz. |
| `index.html` | A interface (tela + lógica). |
| `config.json` | Guarda o **cargo-alvo** escolhido pelo usuário. |
| `LEIA-ME.txt` | Instruções de uso diário + instalação única (pré-requisitos). |
| `DOCUMENTACAO.md` | Este arquivo. |

## Endpoints do servidor

| Rota | O que faz |
|------|-----------|
| `GET /` | Serve a interface (`index.html`). |
| `GET /api/state` | Estado do workspace: cargo, perfil (CV enviado? perfil pronto?), resumo (nº de vagas, candidaturas, prazos), lista de vagas ranqueadas (com `gaps` e flag `aplicada`) e URLs já aplicadas. |
| `GET /api/run?prompt=…` | Executa o Claude com o prompt e transmite a saída ao vivo (SSE). Modo `--permission-mode bypassPermissions` para não travar pedindo permissão. Prompt via **stdin**. |
| `GET /api/analyze?url&title&company` | Roda o Claude e devolve **JSON estruturado** com `{nota, resumo, faltas:[{item, tipo, explicacao, sugestao}]}`. Usado pelo pop-up de detalhe da vaga. |
| `POST /api/adjust` | Recebe `{url, title, company, items[]}`, adiciona os itens confirmados ao CV/perfil (só os confirmados), reavalia a vaga e devolve `{notaAntes, notaDepois, resumo}`. |
| `POST /api/upload` | Recebe o PDF do currículo e salva em `ai-job-search/documents/cv/` (remove o antigo). |
| `GET/POST /api/config` | Lê / salva o cargo-alvo em `config.json`. |

## Funcionalidades da interface

1. **Onboarding** — enviar currículo (upload → `documents/cv/`) e "Montar meu perfil"
   (roda `/setup` lendo o CV, sem perguntas interativas). O botão de montar perfil só
   habilita depois do upload.
2. **Cargo-alvo** — campo de texto obrigatório. O Claude expande as variações de escrita
   na hora da busca (Sênior/Sr/Pleno, siglas, inglês). Salvo em `config.json`.
3. **Buscar novas vagas** — exige o cargo preenchido (aviso vermelho se vazio). Roda a
   busca nos portais, deduplica e traz as novas.
4. **Avaliar e ranquear** — nota de 0–100 por vaga.
5. **Ver minhas candidaturas** — status de cada processo.
6. **Vagas recomendadas** — tabela ordenada por nota. Vagas já aplicadas vêm
   **marcadas em verde** (cruzando com `job_search_tracker.csv`); vagas vetadas por
   localização não aparecem.
7. **Detalhe da vaga** (clique numa linha) — mostra a nota, o veredicto e **por que a
   nota / o que falta para 100%**. Cada lacuna é um **checkbox**: o usuário marca só o que
   realmente tem, e o botão **"Adicionar ao currículo e reavaliar"** inclui isso no perfil
   (somente o confirmado, sem inventar) e recalcula a nota. Botões: Explicar, Preparar
   candidatura, Ver vaga no site.
8. **Anti-duplicidade** — aviso ao preparar candidatura de uma vaga já enviada.
9. **Rodapé** — crédito e LinkedIn do autor.

## Limitações honestas

- **Instalação inicial** exige alguém com prática (Claude Code logado + Node + Bun + LaTeX).
- **Cada ação consome créditos** da conta Claude (é o Claude que faz o trabalho).
- **Envio final** de cada candidatura é sempre manual, no site da empresa (Gupy/LinkedIn
  proíbem bots e têm CAPTCHA).
- A **nota** é calculada contra o perfil; para um cargo diferente do perfil, a busca acha
  as vagas certas, mas a nota fica 100% afinada só depois de montar o perfil do novo cargo.

---

## Changelog

### 2026-07-11 — portabilidade (sem caminhos fixos)
- Confirmado que nenhum arquivo distribuído tem caminho fixo de máquina: o `Abrir
  Painel.bat` usa `%~dp0` (a própria pasta, em qualquer disco) e `%USERPROFILE%`
  (usuário logado); o `server.js` usa `__dirname` e `os.homedir()`. Funciona em C:, D:,
  Área de Trabalho, para qualquer usuário.
- `CLAUDE_BIN` agora é **detectado dinamicamente**: env `CLAUDE_BIN`, senão o local
  padrão `%USERPROFILE%\.local\bin\claude.exe`, senão `claude` no PATH.

### 2026-07-11 — BAT na raiz + checagem de pré-requisitos + download de dependências
- `Abrir Painel.bat` movido para a **raiz do projeto** (leigo baixa e clica direto).
  Adicionado `README.md` na raiz para o GitHub mostrar as instruções.
- Ao abrir, a janela preta **confere e lista os pré-requisitos** (Node, Bun, Claude
  Code, LaTeX/MiKTeX) com status `[ OK ]` / `[FALTA]` e links. Se faltar algo
  obrigatório, orienta e para (não sobe um servidor quebrado).
- **Download automático das dependências do projeto** na primeira execução, com
  progresso `[1/4]…[4/4]` por ferramenta de busca (`bun install`). Flag `.deps-ok`
  evita repetir (gitignored, para clone novo baixar de novo).
- Limite honesto: os 4 programas pesados não são instalados automaticamente (exigem
  admin/login); o BAT os lista e o `LEIA-ME.txt` traz os comandos prontos.

### 2026-07-11 — busca com progresso, filtros e cancelamento
- **Busca controlada pelo servidor** (`GET /api/search`, SSE): roda as CLIs de portal
  direto, com **barra de progresso real e porcentagem** ("Buscando 'X' na Gupy — 5/24
  (21%)") e **botão Cancelar** (fecha a conexão → o servidor mata o processo).
- **Filtro de modelo de trabalho** (Remoto / Híbrido / Presencial / Todos) aplicado à
  busca via `--remote`.
- O `/api/state` agora devolve **todas** as vagas (não só as recomendadas); a interface
  tem seletor **Recomendadas / Todas / Nota mínima** (com campo de nota).
- Cancelar também disponível no console das outras ações (rank/apply).
- Validado ao vivo: `/api/search` transmitiu progresso 0→100% em 24 consultas
  (Claude expandiu as variações do cargo) e mesclou as vagas novas no `seen_jobs.json`.

### 2026-07-11 — pop-up de detalhe estruturado (substitui o console cru)
- A tela de detalhe da vaga deixou de jogar texto cru do Claude no console preto.
- Novo botão **"Analisar meu currículo"** → `GET /api/analyze` roda o Claude e devolve
  **JSON estruturado**; o pop-up monta a lista de faltas com **checkboxes** e etiquetas
  "dá para adicionar" (verde) / "lacuna real" (vermelho), com explicação e sugestão.
- **"Adicionar ao currículo e reavaliar"** → `POST /api/adjust` edita o CV/perfil (só o
  que foi marcado) e reavalia; o pop-up mostra a nota **antes → depois** com destaque,
  sem console.
- **Spinner** e área de resultado dentro do pop-up (layout limpo, não terminal).
- Servidor: helpers `runClaudeCollect` (junta a saída) e `extractJson` (extrai o JSON).
- Validado ao vivo: `/api/analyze` na vaga da Nexdom retornou nota 88 + 4 faltas
  corretamente classificadas (Postman/Testes de segurança = adicionável; RestAssured/
  Unimed = lacuna real).

### 2026-07-11 — versão inicial
- Servidor local `server.js` + interface `index.html` + lançador `Abrir Painel.bat` + `LEIA-ME.txt`.
- Leitura do estado real do workspace (tracker, `seen_jobs.json`, candidaturas).
- Botões: buscar, avaliar, ver candidaturas, preparar candidatura (colar link).
- Onboarding: upload de currículo (`/api/upload`) + montar perfil.
- Campo de cargo-alvo (`/api/config`) com expansão de variações pelo Claude; obrigatório para buscar (aviso vermelho).
- Vagas já aplicadas marcadas em verde; filtro remove vagas vetadas por localização.
- Tela de detalhe da vaga: "por que a nota / o que falta para 100%", com checkboxes para
  adicionar experiências ao currículo e reavaliar.
- Correção: prompt enviado por **stdin** (antes falhava no Windows com "Input must be
  provided…") e `--permission-mode bypassPermissions` para as ações rodarem sem travar.
- Rodapé com crédito e LinkedIn do autor.
