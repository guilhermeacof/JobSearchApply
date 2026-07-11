# Habilidades de portais desativadas

As CLIs de busca por portais estacionadas aqui são **ignorada pelo `/scrape`**, que só descobre
habilidades em `.agents/skills/*/SKILL.md`.

Os quatro portais dinamarqueses (jobindex, jobnet, jobbank, jobdanmark) foram movidos para cá quando
o workspace foi alterado para o mercado brasileiro (gupy-search, vagas-search) — mantidos
intactos em vez de excluídos para continuarem disponíveis como exemplos do
padrão de habilidade de portal.

Para reativar um, mova-o de volta:

```bash
git mv .agents/skills-disabled/<name> .agents/skills/<name>
cd .agents/skills/<name>/cli && bun install
```
