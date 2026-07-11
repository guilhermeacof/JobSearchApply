# Disabled portal skills

Portal-search CLIs parked here are **ignored by `/scrape`**, which only discovers
skills under `.agents/skills/*/SKILL.md`.

The four Danish portals (jobindex, jobnet, jobbank, jobdanmark) were moved here when
the workspace was switched to the Brazilian market (gupy-search, vagas-search) — kept
intact rather than deleted so they remain available as worked examples of the
portal-skill pattern.

To re-enable one, move it back:

```bash
git mv .agents/skills-disabled/<name> .agents/skills/<name>
cd .agents/skills/<name>/cli && bun install
```
