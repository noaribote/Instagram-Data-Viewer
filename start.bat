@echo off
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js est introuvable. Installez Node.js et relancez ce script.& pause & exit /b 1)
where npm >nul 2>nul || (echo npm est introuvable. Reinstallez Node.js avec npm inclus.& pause & exit /b 1)

set "PYTHON_CMD="
if defined PYTHON set "PYTHON_CMD=%PYTHON%"
if not defined PYTHON_CMD where py >nul 2>nul && set "PYTHON_CMD=py -3"
if not defined PYTHON_CMD where python >nul 2>nul && set "PYTHON_CMD=python"
if not defined PYTHON_CMD (echo Python 3.10 ou plus recent est introuvable.& pause & exit /b 1)

if not exist .venv\Scripts\python.exe (
    %PYTHON_CMD% -m venv .venv || (echo Creation de l'environnement Python impossible.& pause & exit /b 1)
)
set "PYTHON=%CD%\.venv\Scripts\python.exe"
"%PYTHON%" -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" || (echo Python 3.10 ou plus recent est requis.& pause & exit /b 1)
"%PYTHON%" -m pip install --upgrade pip || (echo Echec de mise a jour de pip.& pause & exit /b 1)
"%PYTHON%" -m pip install instaloader playwright || (echo Installation des dependances Python impossible.& pause & exit /b 1)
"%PYTHON%" -m playwright install chromium || (echo Installation de Chromium Playwright impossible.& pause & exit /b 1)

if not exist node_modules call npm ci || (echo Installation des dependances Node.js impossible.& pause & exit /b 1)

call npm start
pause
