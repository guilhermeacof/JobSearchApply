# Modelos Personalizados

Esta pasta contém modelos LaTeX registrados pelo usuário, gerenciados pelo comando `/add-template`. O framework funciona imediatamente com seus modelos padrão (moderncv para CVs, `cover.cls` para cartas de apresentação) — esta pasta só recebe conteúdo quando você registra seu próprio modelo.

## Layout

```
templates/
├── cv/
│   └── <nome-do-modelo>/
│       ├── template.tex     # Estrutura independente do perfil (tokens [PLACEHOLDER])
│       ├── TEMPLATE.md      # Manifesto: engine, fontes, limite de páginas, regras de estilo, armadilhas
│       ├── *.cls / *.sty    # Arquivos de classe/estilo personalizados (se o modelo precisar)
│       └── fonts/           # Arquivos de fonte incluídos (se não usar fontes do sistema)
└── cover_letters/
    └── <nome-do-modelo>/
        └── (mesmo layout)
```

## Como funciona

- `/add-template` lhe faz perguntas sobre as instruções do modelo (motor de compilação, fontes, regras de estilo, limite de páginas), armazena os arquivos aqui e executa uma compilação de teste obrigatória antes de registrar qualquer coisa.
- Ativar um modelo adiciona um bloco gerenciado a `05-cv-templates.md` ou `06-cover-letter-templates.md`, que é o que `/apply` lê ao redigir — nenhuma outra configuração é necessária.
- `/add-template --list` mostra os modelos registrados; `/add-template --use <name>` muda para ele; `/add-template --use default` retorna aos modelos padrão.

Os modelos são armazenados com tokens `[PLACEHOLDER]` em vez de dados pessoais, portanto são seguros para commitar e compartilhar.
