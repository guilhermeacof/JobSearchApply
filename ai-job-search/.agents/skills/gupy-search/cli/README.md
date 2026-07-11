# gupy-cli

CLI para buscar vagas no portal público de vagas da Gupy (portal.gupy.io) — o maior
ATS do Brasil. Conversa diretamente com a API JSON do portal: sem autenticação, sem
parsing de HTML e **zero dependências em runtime** (apenas `bun` + `fetch`). O
`bun install` só baixa os tipos de desenvolvimento para o `typecheck`.

```bash
# Busca
bun run src/cli.ts search -q "analista de testes" --format table

# Detalhe
bun run src/cli.ts detail 11617787 --format plain

# Testes (inclui um teste de fumaça ao vivo) e typecheck
bun run test
bun run typecheck
```

Consulte `../SKILL.md` para a referência completa de flags e `../url-reference.md`
para a documentação da API.
