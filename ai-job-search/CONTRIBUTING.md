# Contribuindo

Obrigado por considerar uma contribuição! Este repositório tem uma filosofia deliberada e restrita, e a maioria dos PRs recusados são trabalhos bem executados que simplesmente não a conheciam. Leia isto primeiro; vai poupar seu esforço e mostrar onde seu trabalho terá o melhor encaixe.

## A única regra da qual tudo decorre

**Este repositório é um template universal.** As pessoas fazem fork dele e o adaptam ao seu próprio mercado, idioma e perfil. O upstream permanece agnóstico a mercado, agnóstico a pessoa e nativo do Claude Code. O corolário: uma contribuição é julgada primeiro pela aderência a essa regra, e só depois pela qualidade da execução. Trabalho bem-feito, mas fora da política, ainda assim é recusado (gentilmente, com justificativas).

## O que é aceito (merge)

- **Recursos de customização universais**: qualquer coisa que melhore o caminho de fork-e-adaptação para todo mundo. Precedente: `/add-template` ([#30]), `/add-portal` ([#37]).
- **Correções de robustez e correção** com o caso de falha demonstrado. Precedente: validação de flag NaN ([#35]), decodificação de entidades HTML ([#55], [#56]), detecção de coluna de salário ([#64]).
- **Documentação que fecha lacunas reais**: configuração específica de plataforma ([#41], [#60]), referências desatualizadas ([#36], [#68]).
- **Infraestrutura que reduz a carga de revisão** e é argumentada a partir de evidências, não de especulação. Precedente: CI ([#59]), que pegou um bug latente enquanto era construído.

## O que é recusado

- **Skills e conteúdo específicos de mercado ou país.** O portal de um país abre a porta para o portal de todos os países; não há ponto de parada com princípio. Precedente: [#31] (Índia), [#39] (França, apesar de um PR honesto e excelente), [#67] (China). As skills de portal presentes na árvore ou são agnósticas a país (`linkedin-search`) ou são a instância de demonstração do próprio mantenedor (os portais dinamarqueses).
- **Dados de perfil pessoal.** O template distribui placeholders; seu perfil populado vive no seu fork. A CI impõe isso (`placeholder-integrity`). Precedente: [#17], [#72].
- **Ports para outros harnesses e fontes de workflow duplicadas.** As especificações em markdown SÃO a implementação; uma segunda cópia (outra CLI de agente, uma camada de orquestração, um comando wrapper) diverge da primeira no momento em que qualquer uma das duas muda. Precedente: [#44], [#49], [#66].
- **Infraestrutura especulativa.** A complexidade precisa ser argumentada a partir de um problema que existe, não de um que poderia existir. Precedente: [#63].
- **PRs "pia de cozinha".** Uma preocupação por PR. Pacotes recebem pedido para se dividir ([#73]) - e as divisões são revisadas rápido ([#75], [#76] chegaram dentro de uma hora e foram resolvidos no mesmo dia).

## A régua para novos comandos

O ciclo de vida central está **completo em funcionalidades**: `/setup` → `/scrape` → `/rank` → `/apply` → `/interview` → `/outcome` → calibração de volta para o `/setup`, com `/expand`, `/upskill`, `/add-template`, `/add-portal` e `/reset` ao redor. Cada etapa de uma busca real de emprego tem um responsável.

Um novo comando, portanto, enfrenta uma régua alta. O teste que admitiu os existentes: **ele operacionaliza algo propenso a erro que já existe no framework** (maquinário documentado que nada executa, dados que algo escreve mas nada lê)? "Útil" e "possível" não são suficientes; as propostas mais fortes conectam duas coisas que já existem sem modificar nenhuma delas ([#43], [#54]).

## Afirmações são verificadas

As revisões aqui são empíricas. Relatos de bug são reproduzidos no master antes de a correção ser considerada; "todos os testes passando" é conferido contra se os testes conseguem distinguir o master da correção. PRs cuja premissa não se reproduz são recusados mesmo quando o código está correto - já aconteceu (a correção do conversor de [#35], a primeira versão de [#52]). Você pode acelerar isso:

- Descreva o caso de falha e como reproduzi-lo.
- Coloque testes de CLI em `.agents/skills/<name>/cli/tests/` (bun test, sem rede sempre que possível); testes de ferramentas Python em `tests/`.
- Rode o que a CI roda: `python3 tools/lint_skills.py` (ou `python tools/lint_skills.py` se esse for o seu executável do Python 3), `bun run typecheck` nas CLIs alteradas e as suítes de teste relevantes.

**Norma de crédito:** uma mudança que incorpora seu código de fato recebe um trailer `Co-authored-by`; uma mudança escrita de forma independente a partir da sua observação ou relato recebe uma menção nominal na mensagem de commit e no PR. Ambos acontecem sem precisar pedir.

## Construindo para o seu próprio mercado? Faça isto em vez disso

1. Faça fork do repositório e rode `/add-portal` com o seu quadro de vagas local - ele monta o esqueleto de uma skill de portal que segue o contrato distribuído, e o `/scrape` a reconhece automaticamente.
2. Anuncie seu fork na discussão fixada [Community forks & adaptations](https://github.com/<owner>/ai-job-search/discussions/78) para que outros possam encontrá-lo.

Skills específicas de mercado são genuinamente valiosas - elas apenas vivem em forks, onde seus mantenedores podem testá-las e seus usuários podem encontrá-las.

## Notas práticas

- **Contrato da skill de portal**: comandos `search`/`detail`, `--format json|table|plain`, erros em JSON no stderr com exit 1, backoff em 429/5xx, zero dependências de runtime por padrão. Veja a especificação do `/add-portal` e a `linkedin-search` como implementação de referência.
- **Limites de uso pessoal**: skills de portal que acessam fontes restritas por Termos de Serviço carregam um aviso proeminente de uso pessoal apenas, e a CI deliberadamente não faz requisições ao vivo a portais. Não "conserte" isso.
- **Mudanças em LaTeX**: os dois templates precisam compilar (`lualatex` para o currículo, `xelatex` para a carta de apresentação) e manter suas contagens exatas de páginas. A CI faz uma verificação de fumaça (smoke-check) disso.

Perguntas e propostas são bem-vindas em [Discussions](https://github.com/<owner>/ai-job-search/discussions) - uma thread de Ideia não custa nada e pode evitar que você construa a coisa errada :-)

[#17]: https://github.com/<owner>/ai-job-search/issues/17
[#30]: https://github.com/<owner>/ai-job-search/issues/30
[#31]: https://github.com/<owner>/ai-job-search/issues/31
[#35]: https://github.com/<owner>/ai-job-search/issues/35
[#36]: https://github.com/<owner>/ai-job-search/issues/36
[#37]: https://github.com/<owner>/ai-job-search/issues/37
[#39]: https://github.com/<owner>/ai-job-search/issues/39
[#41]: https://github.com/<owner>/ai-job-search/issues/41
[#43]: https://github.com/<owner>/ai-job-search/issues/43
[#44]: https://github.com/<owner>/ai-job-search/issues/44
[#49]: https://github.com/<owner>/ai-job-search/issues/49
[#52]: https://github.com/<owner>/ai-job-search/issues/52
[#54]: https://github.com/<owner>/ai-job-search/issues/54
[#55]: https://github.com/<owner>/ai-job-search/issues/55
[#56]: https://github.com/<owner>/ai-job-search/issues/56
[#59]: https://github.com/<owner>/ai-job-search/issues/59
[#60]: https://github.com/<owner>/ai-job-search/issues/60
[#63]: https://github.com/<owner>/ai-job-search/issues/63
[#64]: https://github.com/<owner>/ai-job-search/issues/64
[#66]: https://github.com/<owner>/ai-job-search/issues/66
[#67]: https://github.com/<owner>/ai-job-search/issues/67
[#68]: https://github.com/<owner>/ai-job-search/issues/68
[#72]: https://github.com/<owner>/ai-job-search/issues/72
[#73]: https://github.com/<owner>/ai-job-search/issues/73
[#75]: https://github.com/<owner>/ai-job-search/issues/75
[#76]: https://github.com/<owner>/ai-job-search/issues/76
