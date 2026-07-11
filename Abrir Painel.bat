@echo off
setlocal enabledelayedexpansion
title Painel de Candidaturas - NAO FECHE esta janela
cd /d "%~dp0"

echo.
echo   ============================================================
echo    PAINEL DE CANDIDATURAS
echo   ============================================================
echo.
echo    Conferindo os programas necessarios nesta maquina...
echo.

set FALTA=0

REM --- Node.js (obrigatorio) ---
where node >nul 2>&1
if !errorlevel!==0 (echo    [ OK ]  Node.js) else (echo    [FALTA] Node.js  -  baixe em https://nodejs.org & set FALTA=1)

REM --- Bun (obrigatorio) ---
set BUNOK=0
if exist "%USERPROFILE%\.bun\bin\bun.exe" set BUNOK=1
where bun >nul 2>&1
if !errorlevel!==0 set BUNOK=1
if "!BUNOK!"=="1" (echo    [ OK ]  Bun) else (echo    [FALTA] Bun  -  como instalar no arquivo painel\LEIA-ME.txt & set FALTA=1)

REM --- Claude Code (obrigatorio, precisa estar logado) ---
set CLAUDEOK=0
if exist "%USERPROFILE%\.local\bin\claude.exe" set CLAUDEOK=1
where claude >nul 2>&1
if !errorlevel!==0 set CLAUDEOK=1
if "!CLAUDEOK!"=="1" (echo    [ OK ]  Claude Code) else (echo    [FALTA] Claude Code logado  -  https://claude.com/claude-code & set FALTA=1)

REM --- LaTeX / MiKTeX (so para gerar os PDFs do curriculo) ---
set TEXOK=0
if exist "%USERPROFILE%\AppData\Local\Programs\MiKTeX\miktex\bin\x64\lualatex.exe" set TEXOK=1
where lualatex >nul 2>&1
if !errorlevel!==0 set TEXOK=1
if "!TEXOK!"=="1" (echo    [ OK ]  LaTeX / MiKTeX) else (echo    [AVISO] LaTeX/MiKTeX ausente  -  so precisa para gerar os PDFs  -  https://miktex.org)

echo.

if "!FALTA!"=="1" (
  echo   ============================================================
  echo    Faltam os programas marcados com [FALTA] acima.
  echo    Instale-os e rode este arquivo de novo.
  echo    Passo a passo completo em: painel\LEIA-ME.txt
  echo   ============================================================
  echo.
  pause
  exit /b
)

echo    Tudo certo com os programas necessarios.
echo.

REM --- Dependencias do projeto: baixa so na primeira vez, mostrando progresso ---
if not exist "painel\.deps-ok" (
  echo    Baixando as dependencias do projeto pela primeira vez...
  echo    Isso pode levar um ou dois minutos. Acompanhe abaixo:
  echo.
  set N=0
  for %%S in (gupy-search vagas-search linkedin-search freehire-search) do (
    set /a N+=1
    echo    [!N!/4] Preparando ferramenta de busca: %%S ...
    pushd "ai-job-search\.agents\skills\%%S\cli"
    if exist "%USERPROFILE%\.bun\bin\bun.exe" ("%USERPROFILE%\.bun\bin\bun.exe" install) else (bun install)
    popd
    echo.
  )
  echo instalado> "painel\.deps-ok"
  echo    Dependencias baixadas com sucesso.
  echo.
)

echo    Abrindo o painel no seu navegador...
echo    ^(deixe esta janela aberta enquanto usa o painel^)
echo.
start "" http://127.0.0.1:4599
node --no-deprecation painel\server.js

echo.
echo    O painel foi encerrado. Pode fechar esta janela.
pause
