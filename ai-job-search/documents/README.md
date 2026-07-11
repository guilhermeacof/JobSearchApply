# Pasta de Documentos

Esta pasta contém seus documentos de carreira reais. O comando `/setup` lê tudo aqui e usa para preencher os arquivos de habilidade do candidato em `.claude/skills/job-application-assistant/`. É seguro executar `/setup` novamente à medida que você adiciona mais documentos — ele faz a mesclagem de forma inteligente e nunca sobrescreve conteúdo existente sem perguntar primeiro.

---

## Estrutura da pasta

```
documents/
├── cv/                          # Seus arquivos de CV (PDF ou LaTeX)
├── linkedin/                    # Exportação do perfil do LinkedIn (PDF)
├── diplomas/                    # Certificados de grau e históricos acadêmicos
├── references/                  # Cartas de referência
├── applications/                # Candidaturas anteriores
│   └── <company>_<role>/
│       ├── job_posting.md       # O anúncio original (cole como texto)
│       ├── cover_letter.tex     # A carta de apresentação que você enviou
│       ├── cv_draft.tex         # A variante de CV que você enviou
│       └── outcome.md           # Resultado + notas (preencha após retorno)
└── README.md                    # Este arquivo
```

---

## cv/

Seu CV principal — a versão mais completa e não editada do seu histórico profissional.

**Formatos suportados:** `.pdf`, `.tex`

**O que `/setup` extrai:**
- Experiência profissional (títulos, empresas, datas, bullets)
- Educação (graus, instituições, datas, temas de tese)
- Habilidades técnicas
- Prêmios e publicações
- Informações de contato

**Nomeação:** Qualquer nome de arquivo funciona. Se houver vários arquivos, `/setup` lê todos e faz referência cruzada para consistência.

**Dica:** Mantenha seu CV mais completo aqui (não uma variante personalizada). Os arquivos de habilidade são a fonte canônica — CVs personalizados são gerados por aplicação pelo `/apply`.

---

## linkedin/

Seu perfil do LinkedIn exportado como PDF.

**Como exportar:** No LinkedIn, vá para seu perfil → Mais → Salvar como PDF. Isso exporta um resumo estruturado do seu perfil.

**Formatos suportados:** `.pdf`

**O que `/setup` extrai:**
- Experiência profissional e datas (referenciadas com seu CV)
- Habilidades e recomendações
- Educação
- Certificações e licenças
- Trabalho voluntário
- Publicações
- Seção Sobre/resumo (usada para inferir adições ao perfil comportamental)
- Recomendações recebidas (podem enriquecer o contexto de referências)

**Nomeação:** Qualquer nome de arquivo funciona. Apenas uma exportação do LinkedIn é esperada; se houver várias, `/setup` usa a mais recentemente modificada.

---

## diplomas/

Certificados de grau, históricos acadêmicos e quaisquer qualificações oficiais.

**Formatos suportados:** `.pdf`

**O que `/setup` extrai:**
- Títulos de grau e nomes oficiais (usados para verificar entradas de educação)
- Datas de conclusão
- Notas ou distinções (se visíveis)
- Nomes das instituições (grafia oficial)

**Nomeação:** Use nomes descritivos, por exemplo `msc_physics_ucph_2025.pdf`, `bsc_physics_ucph_2016.pdf`. O nome não afeta a análise.

---

## references/

Cartas de referência de ex-gerentes, supervisores ou colaboradores.

**Formatos suportados:** `.pdf`, `.txt`, `.md`

**O que `/setup` extrai:**
- Nome, título e organização do referenciador
- Citações e avaliações específicas (adicionadas à seção de referências de `01-candidate-profile.md`)
- Linguagem de competência usada pelos referenciadores (adiciona sinal comportamental a `02-behavioral-profile.md`)

**Nomeação:** Use o nome do referenciador, por exemplo `reference_ole_frandsen.pdf`.

---

## applications/

Um registro de candidaturas anteriores. Cada subpasta é uma candidatura.

Você pode manter estas pastas manualmente ou deixar o comando **`/outcome`** cuidar disso: ele registra atualizações de progresso e resultados finais de forma conversacional, arquiva os rascunhos enviados e o texto do anúncio, mantém `outcome.md` no formato abaixo e atualiza `job_search_tracker.csv` no mesmo passo.

**Nomeação da subpasta:** `<company>_<role>` — minúsculas, underscores para espaços.

Exemplos:
```
applications/
├── acme_ml_engineer/
├── bigcorp_software_engineer/
└── consultco_ai_consultant/
```

### Arquivos dentro de cada pasta de candidatura

**`job_posting.md`** — Cole aqui o texto completo do anúncio. Usado pelo `/setup` para inferir quais habilidades e tipos de função você tem direcionado e calibrar `04-job-evaluation.md`.

**`cover_letter.tex`** — A carta de apresentação que você realmente enviou. Usada para extrair padrões de estilo de escrita e estrutura para `06-cover-letter-templates.md`.

**`cv_draft.tex`** — A variante de CV que você enviou. Usada para extrair estilos de declaração de perfil para `05-cv-templates.md`.

**`outcome.md`** — Preencha depois que a candidatura for resolvida. Formato:

```markdown
# Outcome: <Company> — <Role>

**Status:** in_progress | hired | offer_declined | rejected | no_response | interview_only

**Date resolved:** YYYY-MM-DD

## Interview stages reached
- [ ] Phone screen
- [ ] Technical interview
- [ ] Case interview
- [ ] Final round
- [ ] Offer received

## Notes
What happened? What feedback did you receive (if any)?
What would you do differently?
Any signal about what they valued or didn't?
```

`in_progress` marca uma candidatura que ainda está aberta (usado pelo `/outcome` para atualizações de estágio de entrevista antes da resolução). A calibração do `/setup` tira conclusões apenas de candidaturas com status final.

As pastas de candidatura também podem conter arquivos **`interview_prep_<stage>.md`** escritos pelo `/interview` (um por estágio de entrevista, mantidos como histórico). O `/setup` lê apenas os quatro arquivos nomeados acima e ignora estes.

**O que o `/setup` aprende a partir do outcome.md:**
- Quais tipos de função e empresas levaram a entrevistas (sinais de áreas de forte adequação)
- Quais candidaturas não progrediram (informa a calibração de correspondência de experiência em `04-job-evaluation.md`)
- O feedback da entrevista, se você o registrou, pode revelar novos candidatos STAR

---

## Notas de formato de arquivo

| Formato | Legível pelo `/setup` | Observações |
|--------|--------------------------|-------------|
| `.pdf` | Sim | Analisado diretamente com a ferramenta Read |
| `.tex` | Sim | Fonte LaTeX — estrutura e conteúdo legíveis |
| `.md` | Sim | Texto simples |
| `.txt` | Sim | Texto simples |
| `.docx` | Não | Converta para PDF antes de colocar aqui |
| `.png` / `.jpg` | Não | Documentos escaneados não serão analisados — use PDFs de texto |

---

## Reexecutando `/setup`

O comando é projetado para ser executado novamente conforme sua coleção de documentos cresce. Cada execução:

1. Lê o estado atual de todos os arquivos de habilidade
2. Compara o conteúdo extraído dos documentos com o que já existe
3. Propõe alterações apenas para conteúdo genuinamente novo ou conflitante
4. Nunca sobrescreve silenciosamente — conflitos são exibidos explicitamente para você decidir

**Quando reexecutar:**
- Após adicionar uma nova exportação do LinkedIn
- Após adicionar cartas de referência
- Após registrar resultados de candidaturas concluídas
- Após atualizar seu CV mestre
