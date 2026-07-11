<p align="center">
  <img src="claude_animation.gif" alt="AI Job Search Assistant" width="200">
</p>

# AI Job Search

Um framework de candidatura a vagas com inteligência artificial construído sobre o [Claude Code](https://claude.com/claude-code). Faça o fork, preencha seu perfil e deixe o Claude avaliar vagas, adaptar seu currículo, escrever cartas de apresentação e preparar você para entrevistas.

> Nota: Este é um projeto de código aberto independente e não é afiliado, endossado, patrocinado ou mantido pela Anthropic. A Anthropic e o Claude Code são mencionados apenas para descrever o conjunto de ferramentas que este fluxo de trabalho utiliza.
>
> Este projeto **não tem nenhuma criptomoeda, token ou programa de patrocínio pago afiliado**. Qualquer coisa que afirme o contrário é não autorizada e deve ser tratada como golpe. A única forma de apoiar o projeto é contribuindo no GitHub.

<p align="center">
  <i>Isto salvou você de um domingo escrevendo cartas de apresentação? Considere pagar um café.<br>
  Isto conseguiu a vaga para você? Talvez dois.</i> ☕
</p>


## O que é isto

Um fluxo de trabalho estruturado que transforma o Claude Code em um assistente completo de candidatura a vagas. O fluxo central (autoperfilamento, avaliação de adequação e o pipeline de candidatura redator-revisor) é **independente de idioma e de país**. Este fork está adaptado para o **mercado brasileiro** (Gupy, Vagas.com.br), com LinkedIn e Freehire como skills independentes de país. Os portais dinamarqueses originais (Jobindex, Jobnet, etc.) ficam parados em `.agents/skills-disabled/`, e o padrão foi projetado para ser trocado pelos portais de vagas locais da sua região.

```
/setup          /scrape              /apply <url>
  |                |                     |
  v                v                     v
Fill in        Search job           Evaluate fit
your profile   portals              Score & recommend
  |                |                     |
  v                v                     v
Profile        Present matches      Draft CV + Cover Letter
files ready    with fit ratings     (LaTeX, tailored)
                   |                     |
                   v                     v
               Pick a match         Reviewer agent critiques
               -> /apply            -> Revise -> Final output
```

O framework codifica boas práticas de orientação de carreira, incluindo critérios de avaliação estruturados, enquadramento prospectivo da carta de apresentação e benchmarking salarial opcional.

## Pré-requisitos

- [Claude Code](https://claude.com/claude-code) (CLI)
- Python 3.10+
- [Bun](https://bun.sh) (para as ferramentas de CLI de busca de vagas)
- Distribuição LaTeX com `lualatex` e `xelatex`: [TeX Live](https://tug.org/texlive/), [MacTeX](https://tug.org/mactex/), [TinyTeX](https://yihui.org/tinytex/) ou [MiKTeX](https://miktex.org/). O currículo compila com `lualatex` (o pdflatex frequentemente falha em instalações modernas do MiKTeX com erros de expansão de fonte do `fontawesome5`); a carta de apresentação compila com `xelatex` porque o `cover.cls` requer `fontspec`. Se você usar uma instalação LaTeX mínima, como TinyTeX ou BasicTeX, instale os pacotes extras listados em [SETUP.md](SETUP.md#minimal-tex-install-tinytexbasictex).
- Opcional: `pdftotext` do [poppler](https://poppler.freedesktop.org/) (macOS: `brew install poppler`, Debian/Ubuntu: `apt install poppler-utils`, Windows: `choco install poppler`) — usado pela verificação de parseabilidade ATS do `/apply` no currículo compilado. Se estiver ausente, a verificação degrada de forma controlada para uma revisão visual de palavras-chave.

## Início rápido

### 1. Faça o fork e clone

```bash
gh repo fork <owner>/ai-job-search --clone
cd ai-job-search
```

### 2. Instale as ferramentas de busca de vagas

> This fork targets the **Brazilian market**: `gupy-search` (portal.gupy.io) and
> `vagas-search` (Vagas.com.br) replace the upstream Danish portals, which are parked
> in `.agents/skills-disabled/`.

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

Para o `linkedin-search` e o `freehire-search` a instalação é opcional: ambos têm zero dependências de execução e rodam com o `bun` puro; o `bun install` apenas baixa os tipos de desenvolvimento do TypeScript.

### 3. Configure seu perfil

```bash
claude
# Then inside Claude Code:
/setup
```

O `/setup` oferece três caminhos: ler sua pasta `documents/` caso você tenha uma preenchida (PDF do currículo, exportação do LinkedIn, diplomas, cartas de recomendação, candidaturas anteriores), importar um único currículo colado no chat ou conduzir uma entrevista. Ele detecta automaticamente o que você tem e pergunta. O modo pasta-de-documentos é idempotente e seguro para reexecutar à medida que você adiciona mais material; veja `documents/README.md` para o layout.

### 4. Busque vagas

```bash
/scrape
```

Isto busca em múltiplos portais de vagas por posições que correspondem ao seu perfil, remove duplicatas dos resultados e os apresenta ordenados por adequação. Escolha uma correspondência para rodar o `/apply` nela diretamente — ou, quando uma busca retorna mais vagas do que você quer analisar uma a uma, rode o `/rank` para pontuá-las todas em lote contra o framework de adequação e obter primeiro uma lista curta ranqueada.

### 5. Candidate-se a uma vaga

```bash
/apply https://www.vagas.com.br/vagas/v1234567/analista-de-testes
```

Se a URL não puder ser acessada (alguns portais de vagas bloqueiam o acesso automatizado), você pode colar a descrição da vaga diretamente:

```bash
/apply <paste the full job description here>
```

Isto executa o fluxo completo: avaliar a adequação, redigir currículo + carta de apresentação, revisar com um segundo agente, revisar e apresentar o resultado final.

## Outros comandos

`/setup`, `/scrape` e `/apply` formam o fluxo de trabalho central. Mais sete comandos o estendem depois que seu perfil está pronto:

- **`/interview`** prepara você para uma entrevista agendada de uma candidatura rastreada. Ele monta um pacote de preparação específico da etapa a partir do arquivo da candidatura (a vaga exata, o currículo e a carta de apresentação que o entrevistador realmente leu, o feedback registrado de rodadas anteriores), pesquisa a empresa e os entrevistadores com uma regra de verificar-antes-de-usar, mapeia prováveis perguntas para seus exemplos STAR e oferece uma entrevista simulada seguindo o protocolo de roleplay em `07-interview-prep.md`. Lacunas recebem respostas de ponte honestas, nunca experiência inventada.
- **`/outcome`** registra o que aconteceu com uma candidatura — etapas de entrevista, ofertas, rejeições, silêncio. Ele arquiva o currículo enviado, a carta de apresentação e o texto da vaga em `documents/applications/<company>_<role>/`, mantém o `outcome.md` no formato que o Caminho A do `/setup` interpreta e atualiza o rastreador. Depois que algumas candidaturas se resolvem, ele aponta você de volta para o `/setup` para calibrar o framework de adequação a partir do que de fato gerou entrevistas.
- **`/rank`** faz a ponte entre o `/scrape` e o `/apply`: ele pontua em lote todas as vagas recém-buscadas contra o framework de adequação (agentes paralelos acessam cada vaga e pontuam as cinco dimensões de avaliação) e retorna uma lista curta ranqueada com pontos fortes e lacunas honestos por vaga. Deal-breakers vetam, prazos recebem sinalizações de urgência, vagas encerradas são marcadas como expiradas. Escolha um número e ele passa para o fluxo completo do `/apply`.
- **`/expand`** enriquece seu perfil examinando fontes públicas que você já vinculou nele (repositórios do GitHub, site de portfólio, Kaggle, Google Scholar) e buscando ementas de cursos e certificações nomeados. Competências descobertas são adicionadas ao seu perfil com uma etiqueta de origem. Útil logo após o `/setup` para revelar habilidades que os documentos sozinhos não deixam explícitas.
- **`/upskill`** analisa a lacuna entre seu perfil e as vagas que você rastreia (ou uma única vaga via `/upskill <URL>`). Produz um mapa de calor priorizado de lacunas de habilidades e um plano de aprendizado com recursos de estudo pesquisados na web e estimativas de tempo. Útil para planejamento de carreira entre candidaturas.
- **`/add-template`** registra seu próprio template LaTeX de currículo ou carta de apresentação no lugar dos padrões. Ele captura as instruções do template (engine de compilação, fontes, regras de estilo, limite de páginas), roda uma compilação de teste obrigatória e conecta o template ao `/apply`. Veja [Templates LaTeX](#latex-templates) abaixo.
- **`/add-portal`** gera uma skill de busca de portal de vagas para um portal do seu mercado. Ele investiga o portal (padrão de URL de busca, estrutura dos resultados, regras de acesso), monta o esqueleto da skill de CLI a partir da mesma estrutura das que já vêm no projeto e executa uma consulta ao vivo de teste antes de registrar. Veja [Ferramentas de busca de vagas](#job-search-tools) abaixo.

O `/reset` também está disponível, veja [Recomeçar do zero](#starting-over) abaixo.

## Estrutura de arquivos

```
ai-job-search/
├── CLAUDE.md                          # Main candidate profile + workflow rules
├── .claude/
│   ├── commands/
│   │   ├── apply.md                   # /apply workflow (drafter-reviewer)
│   │   ├── setup.md                   # /setup onboarding (documents folder, CV import, or interview)
│   │   ├── expand.md                  # /expand competency enrichment from documents and online presence
│   │   ├── add-template.md            # /add-template register custom LaTeX templates
│   │   ├── add-portal.md              # /add-portal generate a job-portal search skill for your market
│   │   ├── rank.md                    # /rank triage scraped jobs into a ranked shortlist
│   │   ├── outcome.md                 # /outcome record application results, archive materials
│   │   ├── interview.md               # /interview stage-specific prep pack + mock interview
│   │   └── reset.md                   # /reset wipe profile data or documents folder
│   ├── skills/
│   │   ├── job-application-assistant/  # Core application skill
│   │   │   ├── SKILL.md               # Skill definition
│   │   │   ├── 01-candidate-profile.md # Your education, experience, skills
│   │   │   ├── 02-behavioral-profile.md# PI/DISC/personality assessment
│   │   │   ├── 03-writing-style.md    # Tone, structure, do's and don'ts
│   │   │   ├── 04-job-evaluation.md   # Scoring framework for job fit
│   │   │   ├── 05-cv-templates.md     # LaTeX CV structure + tailoring rules
│   │   │   ├── 06-cover-letter-templates.md # LaTeX cover letter templates
│   │   │   └── 07-interview-prep.md   # STAR examples + interview framework
│   │   ├── job-scraper/               # Job search orchestration
│   │   └── upskill/                   # /upskill skill gap analysis and learning plan
│   └── settings.json                  # Claude Code permissions (shared, scoped)
├── .agents/skills/                    # Job portal CLI tools
│   ├── gupy-search/                   # Gupy ATS portal (Brazil, JSON API)
│   ├── vagas-search/                  # Vagas.com.br (Brazil)
│   ├── linkedin-search/               # LinkedIn public job listings (country-agnostic)
│   └── freehire-search/               # freehire.dev tech job aggregator (multi-market, REST API)
├── .agents/skills-disabled/           # Parked portal CLIs (upstream Danish portals), ignored by /scrape
├── cv/
│   └── main_example.tex               # moderncv LaTeX template
├── cover_letters/
│   ├── cover.cls                      # Custom cover letter LaTeX class
│   ├── cover_example.tex              # Example cover letter (structural reference + CI smoke test)
│   └── OpenFonts/                     # Lato + Raleway fonts
├── templates/                         # Custom templates registered via /add-template
│   └── README.md                      # Folder layout instructions
├── documents/                         # Career source materials for /setup Path A and /expand
│   ├── README.md                      # Folder layout instructions
│   ├── cv/                            # Master CV (PDF or .tex)
│   ├── linkedin/                      # LinkedIn profile export (PDF)
│   ├── diplomas/                      # Degree certificates and transcripts
│   ├── references/                    # Reference letters
│   └── applications/                  # Past application records (<company>_<role>/)
├── .github/workflows/ci.yml           # CI: LaTeX smoke compiles, skill lint, CLI typechecks
├── salary_lookup.py                   # Salary benchmarking tool (BYO data)
├── tools/
│   ├── convert_salary_excel.py        # Convert salary Excel to JSON
│   ├── lint_skills.py                 # CI lint for skills, commands, settings.json
│   ├── security_guards.py             # CI guards: permission allowlist, gitignore rules, manifests
│   └── README_SALARY_TOOL.md          # Salary tool setup instructions
├── job_scraper/                       # Scraper state (seen jobs, results)
├── upskill/                           # /upskill report output (markdown reports per run)
├── job_search_tracker.csv             # Application tracking spreadsheet
└── SETUP.md                           # Detailed setup guide
```

## Como o `/apply` funciona

O comando `/apply` executa um **fluxo de trabalho redator-revisor** com compilação obrigatória de PDF:

1. **Interpreta** a vaga (URL ou texto)
2. **Avalia a adequação** contra seu perfil (habilidades, experiência, cultura, localização, alinhamento de carreira)
3. **Redige** um currículo e uma carta de apresentação adaptados em LaTeX
4. **Cria um agente revisor** que pesquisa a empresa e critica os rascunhos
5. **Revisa** com base no feedback do revisor
6. **Compila e inspeciona** os dois PDFs: lualatex para o currículo, xelatex para a carta de apresentação. O Claude lê as páginas renderizadas e itera sobre o LaTeX até que o currículo tenha exatamente 2 páginas sem títulos de entrada órfãos, e a carta de apresentação tenha exatamente 1 página com a assinatura visível e as fontes consistentes.
7. **Verifica o currículo com ATS**: extrai a camada de texto do PDF (`pdftotext`, dependência opcional) e a verifica da forma como um parser de ATS a enxerga — dados de contato presentes como texto literal, sem glifos corrompidos, ordem de leitura coerente — e então pontua a cobertura de palavras-chave da vaga contra a extração. Palavras-chave que o perfil genuinamente sustenta são adicionadas; lacunas genuínas permanecem visíveis, nunca são enchidas artificialmente.
8. **Apresenta** o resultado final com uma lista de verificação.

Todas as afirmações no currículo e na carta de apresentação são verificadas contra seu perfil real. O sistema nunca fabrica habilidades ou experiência.

### O que torna este fluxo diferente

- **Loop de verificação de PDF.** A maioria dos templates de currículo em LaTeX produz uma saída que "parece boa no .tex", mas quebra no PDF: títulos de cargo ficam órfãos na página seguinte, cartas de apresentação transbordam para a página 2, fontes de bullet silenciosamente caem para a fonte do corpo. O comando `/apply` compila e inspeciona visualmente cada PDF e aplica correções direcionadas (`\needspace`, `\enlargethispage`, wrappers de correspondência de fonte para itens de lista) até que o layout esteja limpo. Isto roda automaticamente em cada candidatura.
- **Verificação ATS na camada de texto do PDF.** Um ATS lê o texto embutido no PDF, não a página renderizada — e o LaTeX pode silenciosamente produzir PDFs cujo texto é extraído como lixo (glifos de ícone onde deveria estar o e-mail, linhas intercaladas de layouts de múltiplas colunas). O `/apply` extrai a camada de texto do currículo compilado com `pdftotext` e verifica os dados de contato, a ordem de leitura e a cobertura de palavras-chave da vaga contra o que um parser realmente enxerga. Regra de honestidade imposta: uma palavra-chave que o perfil não sustenta é reconhecida como lacuna, nunca enfiada à força.
- **Corte de currículo ponderado por relevância.** Quando um currículo transborda de 2 páginas, o fluxo não corta mecanicamente a partir da seção "mais antiga". Ele pontua cada linha candidata por (a) relevância para a vaga-alvo, (b) unicidade no documento e (c) se a carta de apresentação depende dela, e corta primeiro a linha de menor pontuação total. Um bullet de cargo mais antigo que atinge palavras-chave da vaga sobrevive à frente de um bullet de cargo recente que não atinge.
- **Separação redator-revisor.** O redator escreve; um segundo agente Claude, criado com um contexto novo, pesquisa a empresa e critica os rascunhos. O redator então revisa. Isto captura palavras-chave perdidas, enquadramento fraco e linguagem genérica que uma única passagem frequentemente deixa passar.
- **Despacho de revisor eficiente em tokens.** O agente revisor recebe os rascunhos inline em vez de relê-los, e a lista de verificação roda uma única vez ao final do fluxo em vez de ser duplicada por ambos os agentes. Nota: o novo passo de compilar-e-inspecionar no Passo 5 gasta parte dessas economias na renderização do PDF e na iteração de layout — o fluxo troca parte do custo total de tokens por uma redução real de PDFs quebrados chegando ao usuário.

## Personalização

### Quais arquivos editar manualmente

Se você prefere editar arquivos diretamente em vez de usar o `/setup`:

| Arquivo | O que alterar |
|------|---------------|
| `CLAUDE.md` | Seu perfil completo (nome, formação, experiência, habilidades, objetivos) |
| `01-candidate-profile.md` | Versão estruturada dos dados do seu currículo |
| `02-behavioral-profile.md` | Sua avaliação comportamental ou autoavaliação |
| `04-job-evaluation.md` | Áreas de correspondência de habilidades, objetivos de carreira, filtros de motivação |
| `05-cv-templates.md` | Templates de declaração de perfil para diferentes tipos de cargo |
| `07-interview-prep.md` | Seus exemplos STAR a partir de experiência real |
| `search-queries.md` | Consultas de busca de vagas para suas habilidades e localização |

### Atualizando suas consultas de busca

À medida que suas prioridades evoluem, você pode reconfigurar apenas a busca de vagas sem reexecutar a configuração completa do perfil:

```
/setup --section search
```

Isto reexecuta a entrevista de configuração da busca: quais cargos mirar, quais habilidades buscar, quais localizações e quais portais. Ele também sugere tipos de cargo que você pode não ter considerado com base no seu perfil.

### Templates LaTeX

O currículo usa o [moderncv](https://ctan.org/pkg/moderncv) (estilo banking). A carta de apresentação usa um `cover.cls` personalizado com as fontes Lato/Raleway.

Para usar seu próprio template, rode:

```
/add-template
```

Aponte-o para seu arquivo `.tex` (mais quaisquer arquivos `.cls`/`.sty` ou fontes empacotadas). O comando entrevista você sobre as instruções do template — engine de compilação, fontes e onde elas ficam, regras de estilo a preservar, limite rígido de páginas —, armazena tudo em `templates/`, roda uma compilação de teste obrigatória e ativa o template para que o `/apply` redija a partir dele. Os templates são armazenados com tokens `[PLACEHOLDER]` no lugar de dados pessoais, então são seguros para versionar e compartilhar.

- `/add-template --list` mostra os templates registrados
- `/add-template --use <name>` alterna entre eles
- `/add-template --use default` reverte para os templates padrão moderncv / cover.cls

Se você prefere fazer à mão, o caminho manual ainda funciona: atualize a orientação em `05-cv-templates.md` e `06-cover-letter-templates.md`.

### Ferramentas de busca de vagas

As skills de CLI deste fork em `.agents/skills/` (`gupy-search`, `vagas-search`) demonstram o padrão para construir uma integração de portal de vagas para um mercado específico — aqui, o Brasil. Os portais dinamarqueses originais (Jobbank, Jobdanmark, Jobindex, Jobnet) ficam parados em `.agents/skills-disabled/` como exemplos do padrão. Se você está em outro mercado, rode:

```
/add-portal
```

Dê a ele a URL do seu portal de vagas local. O comando investiga o portal (padrão de URL de busca, estrutura da página de resultados, regras de robots.txt/acesso), monta o esqueleto de uma skill de CLI com a mesma estrutura, comandos e contrato de saída das que já vêm no projeto, e executa uma consulta ao vivo de teste antes de registrar qualquer coisa. Portais protegidos por autenticação são recusados, e portais com termos restritivos recebem um aviso proeminente de uso pessoal apenas na skill gerada. A skill gerada é específica do mercado e vive no seu fork; o gerador em si é a parte universal.

Mantém um fork adaptado ao seu mercado ou idioma? Adicione-o à thread [Community forks & adaptations](https://github.com/<owner>/ai-job-search/discussions/78) para que outros possam encontrá-lo.

Para pontos de partida **independentes de país**, o repositório inclui duas skills de portal ao lado das específicas de mercado:

- **`linkedin-search`** — construída sobre os endpoints públicos e não autenticados `jobs-guest` do LinkedIn. Independente de área, **zero dependências de execução** (roda apenas com o `bun`) e recebe a localização de busca como uma flag explícita, então funciona para qualquer mercado direto (`-l "Berlin, Germany"`, `-l "Mumbai, Maharashtra, India"`, `-l "Remote"`, …). Destinada a **uso pessoal apenas** — o acesso automatizado é contra os Termos de Serviço do LinkedIn, então mantenha o volume baixo. Veja `.agents/skills/linkedin-search/SKILL.md`.
- **`freehire-search`** — consulta a API REST pública do agregador [freehire.dev](https://freehire.dev) (JSON, sem chave de API). Focada em tecnologia (software, dados, engenharia, DevOps, remoto), multi-mercado via flags de faceta (`--region`, `--country`, `--remote`), e **zero dependências de execução**. Ao contrário dos portais que fazem scraping de HTML, os resultados voltam estruturados (habilidades, senioridade, categoria). O backend é licenciado sob MIT e [auto-hospedável](https://github.com/strelov1/freehire) — aponte o `FREEHIRE_API_URL` para sua própria instância, se preferir. Veja `.agents/skills/freehire-search/SKILL.md`.

### Benchmarking salarial

A ferramenta salarial funciona com qualquer dado salarial que você fornecer (estatísticas de sindicatos, exportações do Glassdoor, pesquisa pessoal, etc.). Veja `tools/README_SALARY_TOOL.md` para o formato esperado e a configuração. Se você não tem dados salariais, o passo salarial é simplesmente pulado.

### Recomeçar do zero

Para apagar os dados do seu perfil e começar do zero:

```
/reset profile    # clears skill files, preserves framework rules
/reset documents  # deletes files from documents/ folder
/reset all        # both
```

O `/reset` mostra exatamente o que será apagado e exige que você digite `RESET` para confirmar. Nada é apagado até que você o faça.

## Dicas para melhores resultados

### Profundidade do perfil importa

O maior fator isolado na qualidade do resultado é quanto detalhe você coloca no seu perfil. Um perfil superficial produz candidaturas genéricas; um detalhado permite resultados genuinamente adaptados.

- **Descrições de cargo:** Não liste apenas títulos de cargo. Descreva o que você de fato fez em cada posição: projetos específicos, ferramentas usadas, responsabilidades e conquistas mensuráveis. Quanto mais material você fornecer, com mais precisão o sistema pode reenquadrar sua experiência para diferentes cargos.
- **Habilidades em contexto:** Em vez de listar "Python" ou "gestão de projetos", descreva como e onde você as aplicou. "Construí pipelines de ML para previsão de churn de clientes em Python usando scikit-learn" dá ao sistema muito mais material para trabalhar do que "Python, machine learning".
- **Todos os caminhos de onboarding funcionam:** Seja apontando o `/setup` para sua pasta `documents/`, colando um único currículo ou conduzindo a entrevista, o princípio é o mesmo: uma entrada mais rica produz um resultado mais afiado.

### Descoberta de trajetória de carreira

O framework suporta dois modos distintos de busca de vagas:

- **Mira explícita:** Você sabe quais cargos ou setores quer. O sistema ajuda a refinar e priorizar com base na adequação.
- **Descoberta de oportunidades latentes:** Ao analisar todo o seu histórico (não apenas os títulos de cargo, mas o trabalho que você de fato fez), o sistema pode revelar trajetórias de carreira que você não havia considerado. Habilidades transferíveis que mapeiam para indústrias inesperadas, padrões no que você gostou ou no que se destacou, ou cargos emergentes que combinam sua expertise de domínio com nova tecnologia.

Para tirar o máximo disso, invista tempo durante o `/setup` descrevendo não apenas sua experiência, mas o que te energizou, o que te drenou e o que você gostaria de ter mais. Esse contexto molda diretamente como o sistema avalia a adequação e quais cargos ele revela durante o `/scrape`.

## Contribuindo

Pensando em um PR? Leia o [CONTRIBUTING.md](CONTRIBUTING.md) primeiro — ele explica o que é aceito, o que vive em forks e por quê.

## Agradecimentos

- Construído com o [Claude Code](https://claude.com/claude-code) pela [Anthropic](https://anthropic.com)

## Licença

MIT
