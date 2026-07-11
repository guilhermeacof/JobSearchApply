<p align="center">
  <img src="claude_animation.gif" alt="AI Job Search Assistant" width="200">
</p>

# AI Job Search

Uma estrutura de candidatura de emprego movida a IA construída sobre [Claude Code](https://claude.com/claude-code). Faça fork, preencha seu perfil e deixe o Claude avaliar anúncios, adaptar seu currículo, redigir cartas de apresentação e prepará-lo para entrevistas.

Este fork foi adaptado e é mantido por Guilherme Cançado.

> Observação: este é um projeto open source independente e não é afiliado, endossado, patrocinado ou mantido pela Anthropic. Anthropic e Claude Code são referenciados apenas para descrever a cadeia de ferramentas que este fluxo utiliza.
>
> Este projeto não tem **nenhum programa de criptomoeda, token ou patrocínio pago associado**. Qualquer afirmação em contrário não é autorizada e deve ser tratada como golpe. As únicas formas de apoiar o projeto são o link do Ko-fi abaixo e contribuir no GitHub.

<p align="center">
  <i>Isto economizou um domingo inteiro de escrever cartas de apresentação? Considere um café.<br>
  Conseguiu o emprego? Talvez dois.</i> ☕
</p>

## O que é isto

Um fluxo de trabalho estruturado que transforma Claude Code em um assistente completo de candidatura de emprego. O fluxo central (autoavaliação, avaliação de adequação e o pipeline redator-revisor) é **independente de idioma e país**. As habilidades de busca por portais de emprego são construídas para o mercado dinamarquês (Jobindex, Jobnet, Akademikernes Jobbank, etc.), mas o padrão foi projetado para ser trocado pelos seus portais locais.

```
/setup          /scrape              /apply <url>
  |                |                     |
  v                v                     v
Preencha       Busque vagas         Avalie adequação
seu perfil     nos portais          Avalie e recomende
  |                |                     |
  v                v                     v
Perfil pronto  Apresente matches    Elabore CV + Carta de Apresentação
               com notas de fit     (LaTeX, personalizado)
                   |                     |
                   v                     v
               Escolha uma vaga      Agente revisor critique
               -> /apply            -> Revise -> Resultado final
```

A estrutura codifica práticas recomendadas de orientação de carreira, incluindo critérios de avaliação estruturados, enquadramento de carta de apresentação com visão futura e benchmark salarial opcional.

## Pré-requisitos

- [Claude Code](https://claude.com/claude-code) (CLI)
- Python 3.10+
- [Bun](https://bun.sh) (para ferramentas CLI de busca de vagas)
- Distribuição LaTeX com `lualatex` e `xelatex`: [TeX Live](https://tug.org/texlive/), [MacTeX](https://tug.org/mactex/), [TinyTeX](https://yihui.org/tinytex/) ou [MiKTeX](https://miktex.org/). O CV compila com `lualatex` (pdflatex frequentemente falha em instalações modernas do MiKTeX com erros de expansão da fonte `fontawesome5`); a carta de apresentação compila com `xelatex` porque `cover.cls` requer `fontspec`. Se estiver usando uma instalação TeX mínima, como TinyTeX ou BasicTeX, instale os pacotes extras listados em [SETUP.md](SETUP.md#minimal-tex-install-tinytexbasictex).
- Opcional: `pdftotext` do [poppler](https://poppler.freedesktop.org/) (macOS: `brew install poppler`, Debian/Ubuntu: `apt install poppler-utils`, Windows: `choco install poppler`) — usado pela verificação de legibilidade ATS do `/apply` no CV compilado. Se estiver ausente, a verificação degrada graciosamente para uma revisão visual de palavras-chave.

## Início rápido

### 1. Faça fork e clone

```bash
gh repo fork <owner>/ai-job-search --clone
cd ai-job-search
```

### 2. Instale as ferramentas de busca de vagas

> Este fork é direcionado para o **mercado brasileiro**: `gupy-search` (portal.gupy.io) e
> `vagas-search` (Vagas.com.br) substituem os portais dinamarqueses originais, que estão estacionados
> em `.agents/skills-disabled/`.

PowerShell:

```powershell
$tools = @("gupy-search", "vagas-search", "linkedin-search", "freehire-search")
foreach ($tool in $tools) {
  Set-Location ".agents/skills/$tool/cli"
  bun install
  Set-Location "..\..\..\.."
}
```

Bash / zsh / Git Bash:

```bash
for tool in gupy-search vagas-search linkedin-search freehire-search; do
  cd .agents/skills/$tool/cli && bun install && cd ../../../..
done
```

Para `linkedin-search` e `freehire-search`, a instalação é opcional: ambos não têm dependências de runtime e funcionam com `bun` puro; `bun install` apenas baixa tipos de desenvolvimento do TypeScript.

### 3. Configure seu perfil

```bash
claude
# Então dentro do Claude Code:
/setup
```

`/setup` oferece três caminhos: ler sua pasta `documents/` se ela estiver preenchida (CV em PDF, exportação do LinkedIn, diplomas, cartas de referência, candidaturas anteriores), importar um único CV colado no chat ou seguir uma entrevista. Ele detecta automaticamente o que você tem e pergunta. O modo de pasta de documentos é idempotente e seguro para rodar novamente à medida que você adiciona mais material; veja `documents/README.md` para o layout.

### 4. Busque vagas

```bash
/scrape
```

Isso busca vários portais de emprego por posições compatíveis com seu perfil, deduplica resultados e os apresenta ordenados por adequação. Escolha uma vaga para executar `/apply` diretamente — ou, quando uma pesquisa retornar mais vagas do que você quer analisar, execute `/rank` para pontuá-las em lote contra o framework de adequação e obter uma lista curta ranqueada primeiro.

### 5. Candidate-se a uma vaga

```bash
/apply https://jobindex.dk/job/1234567
```

Se a URL não puder ser buscada (alguns portais bloqueiam acesso automatizado), você pode colar a descrição da vaga diretamente:

```bash
/apply <cole aqui a descrição completa da vaga>
```

Isso executa o fluxo completo: avalia a adequação, redige o CV e a carta de apresentação, revisa com um segundo agente, revisa novamente e apresenta o resultado final.

## Outros comandos

`/setup`, `/scrape` e `/apply` formam o fluxo central. Sete comandos adicionais estendem-no depois que seu perfil estiver pronto:

- **`/interview`** prepara você para uma entrevista agendada em uma candidatura rastreada. Ele monta um pacote de preparação específico para o estágio a partir do arquivo da aplicação (o anúncio exato, o CV e a carta de apresentação que o entrevistador realmente leu, feedback registrado de rodadas anteriores), pesquisa a empresa e os entrevistadores com uma regra de verificação antes do uso, mapeia perguntas prováveis aos seus exemplos STAR e oferece uma simulação de entrevista seguindo o protocolo de roleplay em `07-interview-prep.md`. Lacunas recebem respostas de ponte honestas, nunca experiência inventada.
- **`/outcome`** registra o que aconteceu em uma candidatura — estágios de entrevista, ofertas, rejeições, silêncio. Arquiva o CV enviado, a carta de apresentação e o texto do anúncio em `documents/applications/<company>_<role>/`, mantém `outcome.md` no formato que o Caminho A do `/setup` analisa e atualiza o rastreador. Depois que algumas candidaturas forem resolvidas, aponta você de volta ao `/setup` para calibrar o framework de adequação com base no que realmente gerou entrevistas.
- **`/rank`** faz a ponte entre `/scrape` e `/apply`: pontua em lote todas as vagas recém-raspadas contra o framework de adequação (agentes paralelos buscam cada anúncio e pontuam as cinco dimensões de avaliação) e retorna uma lista ranqueada com pontos fortes e lacunas honestas por vaga. Fatores eliminatórios vetam, prazos recebem bandeiras de urgência, anúncios vencidos são marcados como expirados. Escolha um número e ele entrega ao fluxo completo de `/apply`.
- **`/expand`** enriquece seu perfil escaneando fontes públicas que você já vinculou nele (repositórios GitHub, site de portfólio, Kaggle, Google Scholar) e pesquisando ementas para cursos e certificações mencionados. Competências descobertas são adicionadas ao seu perfil com uma tag de fonte. Útil logo após `/setup` para expor habilidades que apenas documentos não tornam explícitas.
- **`/upskill`** analisa a lacuna entre seu perfil e suas vagas rastreadas (ou um único anúncio via `/upskill <URL>`). Produz um mapa de calor priorizado de lacunas de habilidade e um plano de aprendizagem com recursos pesquisados na web e estimativas de tempo. Útil para planejamento de carreira entre candidaturas.
- **`/add-template`** registra seu próprio modelo LaTeX de CV ou carta de apresentação em vez dos modelos padrão. Ele captura as instruções do modelo (motor de compilação, fontes, regras de estilo, limite de páginas), executa uma compilação de teste obrigatória e conecta o modelo a `/apply`. Veja [LaTeX templates](#latex-templates) abaixo.
- **`/add-portal`** gera uma habilidade de busca de portal de emprego para um quadro de vagas no seu mercado. Ele investiga o portal (padrão de URL de busca, estrutura da página de resultados, robots.txt/regras de acesso), gera uma habilidade CLI com a mesma estrutura, comandos e contrato de saída dos modelos enviados e testa uma consulta ao vivo antes de registrar qualquer coisa. Portais com autenticação são recusados, e portais com termos restritivos recebem um aviso proeminente de uso somente pessoal no skill gerado. O skill gerado é específico para o mercado e vive no seu fork; o gerador em si é a parte universal.

`/reset` também está disponível, veja [Starting over](#starting-over) abaixo.

## Estrutura de arquivos

```
ai-job-search/
├── CLAUDE.md                          # Perfil principal do candidato + regras do fluxo de trabalho
├── .claude/
│   ├── commands/
│   │   ├── apply.md                   # fluxo /apply (redator-revisor)
│   │   ├── setup.md                   # onboarding /setup (pasta de documentos, importação de CV ou entrevista)
│   │   ├── expand.md                  # enriquecimento /expand de competências a partir de documentos e presença online
│   │   ├── add-template.md            # /add-template registra modelos LaTeX personalizados
│   │   ├── add-portal.md              # /add-portal gera uma habilidade de busca de portal de emprego para seu mercado
│   │   ├── rank.md                    # /rank triage vagas raspadas em uma lista ranqueada
│   │   ├── outcome.md                 # /outcome registra resultados de candidatura e arquiva materiais
│   │   ├── interview.md               # /interview pacote de preparação por estágio + simulação de entrevista
│   │   └── reset.md                   # /reset apaga dados de perfil ou pasta de documentos
│   ├── skills/
│   │   ├── job-application-assistant/  # habilidade principal de candidatura
│   │   │   ├── SKILL.md               # definição de habilidade
│   │   │   ├── 01-candidate-profile.md # sua educação, experiência, habilidades
│   │   │   ├── 02-behavioral-profile.md# avaliação comportamental PI/DISC/personalidade
│   │   │   ├── 03-writing-style.md    # tom, estrutura, o que fazer e o que não fazer
│   │   │   ├── 04-job-evaluation.md   # framework de pontuação para adequação de vaga
│   │   │   ├── 05-cv-templates.md     # estrutura de CV em LaTeX + regras de adaptação
│   │   │   ├── 06-cover-letter-templates.md # modelos de carta de apresentação em LaTeX
│   │   │   └── 07-interview-prep.md   # exemplos STAR + framework de entrevista
│   │   ├── job-scraper/               # orquestração de busca de vagas
│   │   └── upskill/                   # análise de lacunas /upskill e plano de aprendizagem
│   └── settings.json                  # permissões do Claude Code (compartilhadas, scope)
├── .agents/skills/                    # ferramentas CLI de portais de emprego
│   ├── gupy-search/                   # portal ATS Gupy (Brasil, API JSON)
│   ├── vagas-search/                   # Vagas.com.br (Brasil)
│   ├── linkedin-search/               # anúncios públicos do LinkedIn (sem país específico)
│   └── freehire-search/               # agregador técnico freehire.dev (multi-mercado, REST API)
├── .agents/skills-disabled/           # CLIs de portais arquivados (portais dinamarqueses upstream), ignorados pelo /scrape
├── cv/
│   └── main_example.tex               # modelo LaTeX moderncv
├── cover_letters/
│   ├── cover.cls                      # classe LaTeX personalizada para cartas de apresentação
│   ├── cover_example.tex              # carta de apresentação de exemplo (referência estrutural + teste de smoke de CI)
│   └── OpenFonts/                     # fontes Lato + Raleway
├── templates/                         # modelos personalizados registrados via /add-template
│   └── README.md                      # instruções de layout da pasta
├── documents/                         # materiais de carreira para /setup Path A e /expand
│   ├── README.md                      # instruções de layout da pasta
│   ├── cv/                            # CV mestre (PDF ou .tex)
│   ├── linkedin/                      # exportação de perfil do LinkedIn (PDF)
│   ├── diplomas/                      # certificados e históricos
│   ├── references/                    # cartas de referência
│   └── applications/                  # candidaturas anteriores (<company>_<role>/)
├── .github/workflows/ci.yml           # CI: compilações smoke LaTeX, lint de habilidades, verificação de tipos da CLI
├── salary_lookup.py                   # ferramenta de benchmark salarial (BYO data)
├── tools/
│   ├── convert_salary_excel.py        # converte Excel salarial para JSON
│   ├── lint_skills.py                 # lint de CI para skills, commands, settings.json
│   ├── security_guards.py             # guardas de CI: allowlist de permissões, regras de gitignore, manifests
│   └── README_SALARY_TOOL.md          # instruções de configuração da ferramenta salarial
├── job_scraper/                       # estado do scraper (vagas vistas, resultados)
├── upskill/                           # saída de relatórios /upskill (markdown por execução)
├── job_search_tracker.csv             # planilha de rastreamento de candidaturas
└── SETUP.md                           # guia detalhado de configuração
```

## Como `/apply` funciona

O comando `/apply` executa um **fluxo redator-revisor** com compilação PDF obrigatória:

1. **Analisa** o anúncio de vaga (URL ou texto)
2. **Avalia a adequação** em relação ao seu perfil (habilidades, experiência, cultura, localização, alinhamento de carreira)
3. **Redige** um CV e uma carta de apresentação personalizados em LaTeX
4. **Gera um agente revisor** que pesquisa a empresa e critica os rascunhos
5. **Revisa** com base no feedback do revisor
6. **Compila e inspeciona** ambos os PDFs: lualatex para o CV, xelatex para a carta. Claude lê as páginas renderizadas e itera sobre o LaTeX até que o CV tenha exatamente 2 páginas sem títulos de entrada órfãos, e a carta de apresentação caiba exatamente em 1 página com assinatura visível e fontes consistentes.
7. **Verifica o CV no ATS**: extrai a camada de texto do PDF (`pdftotext`, dependência opcional) e valida da forma como um parser ATS vê — detalhes de contato como texto literal, sem glifos corrompidos, ordem de leitura sensata — então pontua a cobertura de palavras-chave do anúncio contra a extração. Palavras-chave que o perfil realmente suporta são adicionadas; lacunas reais permanecem visíveis, sem enchimento.
8. **Apresenta** o resultado final com uma lista de verificação de verificação

Todas as afirmações no CV e na carta de apresentação são verificadas em relação ao seu perfil real. O sistema nunca fabrica habilidades ou experiência.

### O que torna esse fluxo diferente

- **Loop de verificação de PDF.** A maioria dos modelos LaTeX de currículo produz um resultado que "parece bom no .tex" mas quebra no PDF: títulos de cargo órfãos na página seguinte, cartas de apresentação que passam para a página 2, fontes de marcador que silenciosamente mudam para a fonte do corpo. O comando `/apply` compila e inspeciona visualmente cada PDF e aplica correções direcionadas (`\needspace`, `\enlargethispage`, wrappers de correspondência de fonte para itens de lista) até que o layout esteja limpo. Isso roda automaticamente em cada candidatura.
- **Verificação ATS na camada de texto do PDF.** Um ATS lê o texto incorporado do PDF, não a página renderizada — e o LaTeX pode produzir PDFs cujo texto é extraído como lixo (glifos de ícone onde o e-mail deveria estar, linhas intercaladas em layouts de várias colunas). `/apply` extrai a camada de texto do CV compilado com `pdftotext` e verifica detalhes de contato, ordem de leitura e cobertura de palavras-chave do anúncio contra o que um parser realmente vê. A regra de honestidade é aplicada: uma palavra-chave que o perfil não suporta é reconhecida como lacuna, nunca é inserida artificialmente.
- **Corte de CV ponderado por relevância.** Quando um CV ultrapassa 2 páginas, o fluxo não corta mecanicamente da seção "mais antiga". Ele pontua cada linha candidata por (a) relevância ao anúncio alvo, (b) exclusividade no documento e (c) se a carta de apresentação depende dela, e corta a linha com menor pontuação total primeiro. Um bullet de um cargo mais antigo que atenda palavras-chave do anúncio sobrevive à frente de um bullet de cargo recente que não o faça.
- **Separação redator-revisor.** O redator escreve; um segundo agente Claude, gerado com um contexto fresco, pesquisa a empresa e critica os rascunhos. O redator então revisa. Isso captura palavras-chave perdidas, enquadramento fraco e linguagem genérica que uma única passagem costuma deixar passar.
- **Despacho de revisor eficiente em tokens.** O agente revisor recebe os rascunhos inline em vez de relê-los, e a lista de verificação é executada uma vez ao final do fluxo em vez de ser duplicada por ambos os agentes. Nota: a nova etapa de compilação e inspeção no Passo 5 usa parte dessas economias em renderização de PDF e iteração de layout — o fluxo troca algum custo total de token por uma redução real de PDFs quebrados chegando ao usuário.

## Personalização

### Quais arquivos editar manualmente

Se você prefere editar arquivos diretamente em vez de usar `/setup`:

| Arquivo | O que alterar |
|------|---------------|
| `CLAUDE.md` | Seu perfil completo (nome, educação, experiência, habilidades, objetivos) |
| `01-candidate-profile.md` | Versão estruturada dos dados do seu CV |
| `02-behavioral-profile.md` | Sua avaliação comportamental ou autoavaliação |
| `04-job-evaluation.md` | Áreas de correspondência de habilidades, metas de carreira, filtros de motivação |
| `05-cv-templates.md` | Modelos de declaração de perfil para diferentes tipos de função |
| `07-interview-prep.md` | Seus exemplos STAR de experiência real |
| `search-queries.md` | Consultas de busca de vaga para suas habilidades e localizações |

### Atualizando suas consultas de busca

Conforme suas prioridades evoluem, você pode reconfigurar apenas a busca de vagas sem reexecutar o setup completo:

```
/setup --section search
```

Isso reinicia a entrevista de configuração de busca: quais cargos mirar, quais habilidades buscar, quais locais e quais portais. Também sugere tipos de função que você pode não ter considerado com base no seu perfil.

### Modelos LaTeX

O CV usa [moderncv](https://ctan.org/pkg/moderncv) (estilo banking). A carta de apresentação usa um `cover.cls` personalizado com fontes Lato/Raleway.

Para usar seu próprio modelo, execute:

```
/add-template
```

Aponte para seu arquivo `.tex` (mais quaisquer arquivos `.cls`/`.sty` ou fontes incluídas). O comando pergunta as instruções do modelo — motor de compilação, fontes e onde elas vivem, regras de estilo a preservar, limite de páginas rígido — armazena tudo em `templates/`, executa uma compilação de teste obrigatória e ativa o modelo para que `/apply` redija a partir dele. Os modelos são armazenados com tokens `[PLACEHOLDER]` em vez de dados pessoais, então são seguros para commitar e compartilhar.

- `/add-template --list` mostra os modelos registrados
- `/add-template --use <name>` alterna entre eles
- `/add-template --use default` reverte para os modelos padrão moderncv / cover.cls

Se preferir fazer manualmente, a rota manual ainda funciona: atualize as orientações em `05-cv-templates.md` e `06-cover-letter-templates.md`.

### Ferramentas de busca de vagas

As quatro ferramentas CLI dinamarquesas em `.agents/skills/` (Jobbank, Jobdanmark, Jobindex, Jobnet) demonstram o padrão para construir uma integração de portal de emprego para um mercado específico. Se você estiver em outro país, execute:

```
/add-portal
```

Forneça a URL do seu quadro de vagas local. O comando investiga o portal (padrão de URL de busca, estrutura da página de resultados, robots.txt/regras de acesso), gera uma habilidade CLI com a mesma estrutura, comandos e contrato de saída dos modelos enviados e testa uma consulta ao vivo antes de registrar qualquer coisa. Portais com autenticação são recusados, e portais com termos restritivos recebem um aviso proeminente de uso somente pessoal no skill gerado. O skill gerado é específico para o mercado e vive no seu fork; o gerador em si é a parte universal.

Mantendo um fork adaptado ao seu mercado ou idioma? Adicione-o ao tópico [Community forks & adaptations](https://github.com/<owner>/ai-job-search/discussions/78) para que outros possam encontrá-lo.

Para pontos de partida **independentes de país** fora da Dinamarca, o repositório envia duas habilidades de portal juntamente com as demos dinamarquesas:

- **`linkedin-search`** — construído nos endpoints públicos e não autenticados `jobs-guest` do LinkedIn. Agnóstico de campo, **zero dependências de runtime** (executa apenas com `bun`) e recebe a localização de busca como uma flag explícita, por isso funciona em qualquer mercado imediatamente (`-l "Berlin, Germany"`, `-l "Mumbai, Maharashtra, India"`, `-l "Remote"`, …). Destinado a **uso pessoal apenas** — acesso automatizado é contra os Termos de Serviço do LinkedIn, então mantenha o volume baixo. Veja `.agents/skills/linkedin-search/SKILL.md`.
- **`freehire-search`** — consulta a API REST pública do agregador [freehire.dev](https://freehire.dev) (JSON, sem chave de API). Focado em tecnologia (software, dados, engenharia, DevOps, remoto), multi-mercado via flags de faceta (`--region`, `--country`, `--remote`) e **zero dependências de runtime**. Diferente dos portais dinamarqueses que raspam HTML, os resultados voltam estruturados (habilidades, senioridade, categoria). O backend é licenciado MIT e [auto-hospedável](https://github.com/strelov1/freehire) — aponte `FREEHIRE_API_URL` para sua própria instância se preferir. Veja `.agents/skills/freehire-search/SKILL.md`.

### Benchmark salarial

A ferramenta salarial funciona com quaisquer dados salariais que você fornecer (estatísticas sindicais, exports do Glassdoor, pesquisa pessoal etc.). Veja `tools/README_SALARY_TOOL.md` para o formato e a configuração esperados. Se você não tiver dados salariais, a etapa salarial é simplesmente ignorada.

### Começando de novo

Para apagar seus dados de perfil e começar do zero:

```
/reset profile    # limpa arquivos de habilidade, preserva as regras do framework
/reset documents  # apaga arquivos da pasta documents/
/reset all        # ambos
```

`/reset` mostra exatamente o que será apagado e exige que você digite `RESET` para confirmar. Nada é excluído até que você faça isso.

## Dicas para melhores resultados

### A profundidade do perfil importa

O fator mais importante na qualidade do resultado é a quantidade de detalhe que você coloca no seu perfil. Um perfil raso produz candidaturas genéricas; um perfil detalhado permite resultados genuinamente personalizados.

- **Descrições de cargo:** Não apenas liste títulos de trabalhos. Descreva o que você realmente fez em cada posição: projetos específicos, ferramentas usadas, responsabilidades e realizações mensuráveis. Quanto mais material você fornecer, mais precisamente o sistema poderá reenquadrar sua experiência para diferentes funções.
- **Habilidades em contexto:** Em vez de listar "Python" ou "gerenciamento de projetos", descreva como e onde você as aplicou. "Construiu pipelines de ML para previsão de churn de clientes em Python usando scikit-learn" dá ao sistema muito mais para trabalhar do que "Python, machine learning".
- **Todos os caminhos de onboarding funcionam:** Quer você aponte `/setup` para sua pasta `documents/`, cole um único CV ou passe pela entrevista, o princípio é o mesmo: entrada mais rica produz saída mais afiada.

### Descoberta de caminho de carreira

O framework suporta dois modos distintos de busca de vagas:

- **Alvo explícito:** você sabe quais cargos ou setores quer. O sistema ajuda a refinar e priorizar com base na adequação.
- **Descoberta de oportunidades latentes:** ao analisar seu histórico completo (não apenas títulos de trabalho, mas o trabalho real que você fez), o sistema pode revelar caminhos de carreira que você não considerou. Habilidades transferíveis que se mapeiam para indústrias inesperadas, padrões no que você gostou ou se destacou, ou funções emergentes que combinam sua expertise com nova tecnologia.

Para aproveitar ao máximo isso, invista tempo durante o `/setup` em descrever não apenas sua experiência, mas o que o energizou, o que o esgotou e o que você gostaria de ter mais. Esse contexto molda diretamente como o sistema avalia a adequação e quais vagas ele apresenta durante o `/scrape`.

## Contribuição

Pensando em abrir um PR? Leia [CONTRIBUTING.md](CONTRIBUTING.md) primeiro — ele explica o que é mesclado, o que vive em forks e por quê.

## Agradecimentos

- Construído com [Claude Code](https://claude.com/claude-code) pela [Anthropic](https://anthropic.com)

## Licença

MIT
