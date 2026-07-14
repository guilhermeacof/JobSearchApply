# Painel de Candidaturas

Ferramenta que **busca vagas em 18 fontes ao mesmo tempo, avalia cada uma e escreve seu currículo e carta de apresentação sob medida** — tudo por botões, sem precisar digitar comandos. Alcança até empresas que só anunciam no site próprio (via Greenhouse, Workday, Sólides, SuccessFactors e outros).

## 🖱️ Como usar (é só clicar)

1. Baixe este projeto para o seu computador.
2. **Dê duplo-clique em `Abrir Painel.bat`** (este arquivo, aqui nesta pasta).
3. Uma janela preta abre (o motor do painel — **deixe-a aberta**) e o painel abre sozinho no seu navegador.
4. No painel: **envie seu currículo**, **escreva o cargo** que procura, escolha **🇧🇷 Só Brasil** ou **🌎 Mundo todo** e clique em **Buscar novas vagas**.

O painel encontra as vagas (em 18 fontes), dá uma nota de 0 a 100 para cada uma e prepara os documentos. O **envio final** de cada candidatura você confirma no site da empresa.

## 🔎 Onde ele busca (18 fontes)

- **Portais do Brasil:** Gupy · Vagas.com · InfoJobs · BNE · Empregos.com.br · Programathor · Trampos.co
- **Rede & remoto:** LinkedIn · Remotive · We Work Remotely · freehire
- **ATS multi-empresa (sites próprios):** Sólides · Compleo · Greenhouse · Lever
- **Carreiras corporativas / site próprio:** Workday · SONDA · Fóton

O filtro **Só Brasil** mantém vagas no Brasil + remotas abertas ao país e descarta as físicas em outro país; **Mundo todo** traz tudo. Cada fonte é uma skill em [`ai-job-search/.agents/skills/`](ai-job-search/.agents/skills/) e novas podem ser criadas com `/add-portal`.

## ⚙️ Antes do primeiro uso (uma vez, por alguém com prática)

O painel depende de alguns programas instalados na máquina: **Claude Code** (logado), **Node.js**, **Bun** e **LaTeX (MiKTeX)**. O **Git** é opcional — se estiver instalado, ao abrir o painel ele **avisa quando há uma versão nova no GitHub** e oferece baixar. Passo a passo em [`painel/LEIA-ME.txt`](painel/LEIA-ME.txt).

## 📚 Mais

- Documentação técnica do painel: [`painel/DOCUMENTACAO.md`](painel/DOCUMENTACAO.md)
- Uso avançado por comandos (linha de comando): [`ai-job-search/README.md`](ai-job-search/README.md)

---

Guilherme Cançado · 2026 · [LinkedIn](https://www.linkedin.com/in/guilherme-augusto-s-840b1190/)
