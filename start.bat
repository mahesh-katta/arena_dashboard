@echo off
title Arena Dashboard
set "HERE=%~dp0"
cd /d "%~dp0.."
echo Starting Arena Dashboard...
start "" http://localhost:8000
where node >nul 2>nul
if %errorlevel%==0 (
  node "%HERE%server.mjs" 8000
) else (
  echo (Node isn't installed - falling back to the Python server.^)
  python "%HERE%serve.py" 8000
)
pause
