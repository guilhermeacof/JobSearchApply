# Ferramenta de Benchmark Salarial

## O que é isso?

A ferramenta de consulta salarial (`salary_lookup.py`) permite comparar os salários das empresas com uma linha de base a partir dos seus próprios dados. Ela é usada durante o fluxo `/apply` para mostrar como a remuneração da empresa se compara às taxas de mercado.

**Esta ferramenta é opcional.** Se você não tiver dados salariais, a etapa de salário é simplesmente ignorada durante o `/apply`.

## Como funciona

A ferramenta lê um arquivo `salary_data.json` na raiz do repositório contendo benchmarks salariais de empresas. Ela usa correspondência difusa para encontrar empresas pelo nome, tratando caracteres dinamarqueses/nórdicos, sufixos legais (A/S, ApS) e variações de grafia comuns.

O formato de dados suporta qualquer dado salarial baseado em índice ou valor absoluto. Por exemplo:
- Índice 100 = salário médio, valor maior é melhor
- Valores salariais absolutos na sua moeda
- Qualquer métrica personalizada que você quiser acompanhar

## Formato dos dados

A ferramenta espera `salary_data.json` com esta estrutura:

```json
{
  "metadata": {
    "source": "My Union Statistics 2025",
    "index_baseline": 100,
    "index_label": "Index",
    "baseline_description": "Index 100 = median salary for private sector"
  },
  "companies": [
    {
      "company": "Novo Nordisk A/S",
      "city": "Bagsværd",
      "categories": {
        "all_employees": { "count": 500, "index": 108.5 },
        "engineering": { "count": 120, "index": 112.3 }
      }
    },
    {
      "company": "Ørsted A/S",
      "city": "Fredericia",
      "categories": {
        "all_employees": { "count": 200, "index": 105.2 }
      }
    }
  ]
}
```

### Campos

- **metadata.source**: De onde vêm os dados (para referência)
- **metadata.index_baseline**: O valor de referência (por exemplo, 100 para dados baseados em índice)
- **metadata.index_label**: Rótulo para a coluna de índice na saída
- **metadata.baseline_description**: Explicação em linguagem natural da linha de base
- **companies[].company**: Nome da empresa (obrigatório)
- **companies[].city**: Cidade/localização (opcional, usado para filtragem)
- **companies[].categories**: Categorias salariais nomeadas, cada uma com `count` e/ou `index`

## Opções de configuração

### Opção A: Crie `salary_data.json` manualmente

Crie o arquivo manualmente com dados de qualquer fonte: estatísticas sindicais, Glassdoor, pesquisas salariais, networking ou pesquisa pessoal.

### Opção B: Converter de Excel

Se você tiver dados salariais em um arquivo Excel:

```bash
pip install openpyxl
python3 tools/convert_salary_excel.py path/to/salary-data.xlsx \
  --source "My Salary Data 2025" \
  --baseline 100 \
  --baseline-desc "Index 100 = median salary"
```

No Windows, use `py` se for assim que o Python estiver exposto no PATH. Se seu sistema usar `python` em vez de `python3`, substitua nos exemplos.

O conversor detecta automaticamente o layout do Excel:
- Busca uma coluna "Company"/"Firma" e uma coluna opcional "City"/"By"
- Trata as colunas restantes como dados salariais (faz o pareamento automático de colunas `count`/`index`)

### Opção C: Construa a partir da pesquisa

Comece com um modelo vazio e adicione empresas conforme você as pesquisa:

```json
{
  "metadata": {
    "source": "Personal research",
    "index_baseline": 0,
    "index_label": "Monthly salary (DKK)",
    "baseline_description": "Approximate monthly salary before tax"
  },
  "companies": [
    {
      "company": "Example Corp",
      "city": "Copenhagen",
      "categories": {
        "entry_level": { "index": 42000 },
        "senior": { "index": 55000 }
      }
    }
  ]
}
```

## Uso

```bash
python3 salary_lookup.py "Novo Nordisk"
python3 salary_lookup.py "Ørsted" --city "Fredericia"
python3 salary_lookup.py "COWI" --json
python3 salary_lookup.py --list-all
```

## Observações importantes

- O arquivo de dados (`salary_data.json`) é **excluído do git** (veja `.gitignore`). Seus dados salariais podem ser proprietários ou confidenciais.
- Se o arquivo de dados estiver ausente, `salary_lookup.py` encerra com uma mensagem de erro útil e o fluxo `/apply` ignora a etapa de benchmark salarial.
- O matcher difuso trata variações de nomes de empresas dinamarquesas: sufixos legais, caracteres nórdicos, grafias anglicadas e correspondências parciais.
