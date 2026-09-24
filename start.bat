@echo off
title Area Drill
cd /d "%~dp0.."
echo Starting Area Drill...
start "" http://localhost:8000
where node >nul 2>nul
if %errorlevel%==0 (
  node app\server.mjs 8000
) else (
  echo (Node isn't installed - falling back to the Python server.^)
  python app\serve.py 8000
)
pause
