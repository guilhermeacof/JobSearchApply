# Referência de URLs do Portal da Gupy

API JSON pública, sem autenticação, por trás do **portal.gupy.io** (portal de vagas
da Gupy — o maior ATS do Brasil). O `portal.gupy.io/robots.txt` permite todos os
caminhos (`Disallow:` vazio); o `employability-portal.gupy.io` não tem robots.txt (404).

## Busca

```
GET https://employability-portal.gupy.io/api/v1/jobs
```

Parâmetros de query (verificados ao vivo em 2026-07-11):

| Parâmetro | Significado | Exemplo |
|-------|---------|---------|
| `jobName` | Busca de texto livre sobre o título da vaga | `analista de testes` |
| `city` | Filtro exato por cidade | `São Paulo` |
| `workplaceType` | Tipo de local de trabalho | `remote` · `hybrid` · `on-site` |
| `limit` | Tamanho da página (50 verificado como funcional) | `10` |
| `offset` | Deslocamento de paginação | `0`, `10`, `20`, … |

**Particularidades:**
- Parâmetros desconhecidos (ex.: `order`) retornam `400 Bad Request` — a API valida
  de forma estrita.
- **Não há filtro de data nem parâmetro de ordenação no servidor**; o CLI aplica o
  `--jobage` client-side sobre `publishedDate`.
- Vagas remotas costumam ter `city`/`state` vazios, então um filtro por `city` as exclui.

Resposta: `{ "data": [vaga, ...], "pagination": { "total", "limit", "offset" } }`.

Campos usados por vaga: `id` (número), `name` (título), `careerPageName` (empresa),
`careerPageUrl`, `description` (pode conter HTML), `type`
(`vacancy_type_effective` etc.), `publishedDate` (ISO), `applicationDeadline`
(`YYYY-MM-DD`), `isRemoteWork` (booleano), `city`, `state`, `country`,
`workplaceType` (`remote`/`hybrid`/`on-site`), `jobUrl` (link de candidatura na
página da empresa).

## Detalhe

```
GET https://employability-portal.gupy.io/api/v1/jobs/<jobId>
```

Retorna um único objeto de vaga com os mesmos campos de um resultado de busca (a
resposta da busca já carrega a descrição completa). 404 → vaga não encontrada/expirada.

## Token da URL da vaga

Os valores de `jobUrl` terminam em um segmento base64 codificando
`{"jobId":<n>,"source":"gupy_portal"}` — o comando `detail` do CLI decodifica esse
segmento para aceitar URLs completas de vaga como entrada.

## Observações

- Não exige autenticação.
- Respeite os limites de requisição — o CLI faz backoff em 429/5xx.
