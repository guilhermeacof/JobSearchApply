# Referência de URLs do Vagas.com.br

Páginas de busca públicas, sem autenticação, em **www.vagas.com.br**. HTML renderizado
no servidor — nenhuma API JSON é necessária.

> Apenas para uso pessoal — o robots.txt permite acesso geral (`User-agent: * / Allow: /`),
> mas bloqueia crawlers de IA por UA (ClaudeBot, GPTBot, CCBot, …) e sinaliza
> `Content-Signal: search=yes, ai-train=no`. `/vagas/pesquisas`, `/api/` e `/v1/` são
> proibidos — esta skill usa apenas as páginas de listagem permitidas `/vagas-de-<termo>`.

## Busca

```
GET https://www.vagas.com.br/vagas-de-<slug>?pagina=<n>
```

- `<slug>` é o termo de busca em formato slug: minúsculas, acentos removidos, espaços → `-`
  (ex.: `analista de testes` → `analista-de-testes`).
- `pagina` — página com índice a partir de 1, ~20 resultados por página. Omita para a página 1.
- Não há parâmetro de localização — inclua a cidade no termo
  (`vagas-de-analista-de-testes-sao-paulo` funciona).
- **Charset: ISO-8859-1** (do header Content-Type) — decodifique os bytes de acordo.

Cada resultado é um card `<li class="vaga odd ">` / `<li class="vaga even ">`:

| Campo | Âncora |
|-------|--------|
| id + url + title | `<a class="link-detalhes-vaga" data-id-vaga="<id>" href="/vagas/v<id>/<slug>">` (o texto do título contém destaques `<mark>` — remova as tags) |
| company | `<span class="emprVaga">` |
| level | `<span class="nivelVaga">` (ex.: Júnior/Trainee, Pleno, Sênior) |
| location | `<div class="vaga-local">` — texto entre o ícone e o `<div>` aninhado do tooltip |
| date | `<span class="data-publicacao">` — `DD/MM/YYYY` |
| snippet | `<div class="detalhes"><p>` |

## Detalhe

```
GET https://www.vagas.com.br/vagas/v<id>
```

Redireciona (301) para a URL canônica com slug (`/vagas/v<id>/<slug>`) — siga os redirects.

| Campo | Âncora |
|-------|--------|
| title | `<h1 class="job-shortdescription__title">` |
| company | `<h2 class="job-shortdescription__company">` |
| level | `job-hierarchylist__item--level` — atributo `aria-label` |
| location | `<div class="info-localizacao">` — texto antes do `<div>` aninhado do tooltip |
| date | texto literal `Publicada em DD/MM/YYYY` |
| description | div `data-testid="JobDescription"` — capture até o próximo `<section` |

## Observações

- Não é necessária autenticação para busca nem detalhe.
- Respeite os limites de requisições — a CLI faz backoff em 429/5xx. Mantenha o volume baixo.
