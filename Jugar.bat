@echo off
setlocal
cd /d "%~dp0"

rem Play La Torre with one double-click: uses the system Node when present,
rem otherwise the portable copy that came with this folder.
set "NODE="
set "NPM="
set "PORTABLE_NODE=..\.tools\node\node.exe"
set "PORTABLE_NPM=..\.tools\node\npm.cmd"

where node >nul 2>nul
if %errorlevel%==0 (
  set "NODE=node"
  set "NPM=npm"
)
if not defined NODE if exist "%PORTABLE_NODE%" (
  set "NODE=%PORTABLE_NODE%"
  set "NPM=%PORTABLE_NPM%"
)
if not defined NODE (
  echo No encuentro Node.js. Instala la version LTS de https://nodejs.org
  echo y vuelve a abrir este archivo.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Preparando el juego por primera vez, esto tarda un poco...
  call "%NPM%" install
  if not exist "node_modules\vite\bin\vite.js" (
    echo Fallo la instalacion de dependencias.
    pause
    exit /b 1
  )
)

echo Abriendo La Torre... deja esta ventana abierta mientras juegas.
"%NODE%" scripts\dev-local.mjs
pause
