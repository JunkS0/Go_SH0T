@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run this game.
  echo Install Node.js 20 or newer, then run this file again.
  pause
  exit /b 1
)
start "" "http://localhost:8787"
node server.js
pause
