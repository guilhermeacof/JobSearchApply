# vagas-cli

CLI para buscar vagas nas páginas públicas de busca do Vagas.com.br (Brasil). Faz o
parse do HTML renderizado no servidor com regex por chunks — sem autenticação e com
**zero dependências de runtime** (apenas `bun` + `fetch`). O `bun install` só baixa
os types de desenvolvimento para o `typecheck`.

O site serve ISO-8859-1; a CLI decodifica o charset a partir do header Content-Type.

```bash
# Busca
bun run src/cli.ts search -q "analista de testes" --format table

# Detalhe
bun run src/cli.ts detail 2823863 --format plain

# Testes (inclui um smoke test ao vivo) e typecheck
bun run test
bun run typecheck
```

Apenas para uso pessoal — mantenha o volume baixo. Veja `../SKILL.md` para a referência
completa de flags e `../url-reference.md` para as âncoras de parsing.
