@echo off
title Arena Dashboard
set "HERE=%~dp0"
cd /d "%~dp0.."
echo Starting Arena Dashboard...
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node isn't installed. Install it once from https://nodejs.org
  echo (the LTS version^), then double-click start.bat again.
  pause
  exit /b 1
)
start "" http://localhost:8000
node "%HERE%server.mjs" 8000
pause
