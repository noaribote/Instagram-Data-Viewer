@echo off
cd /d "%~dp0"

if not exist node_modules\electron (
    call npm i --save-dev electron
)

python -m pip install instaloader playwright
python -m playwright install chromium

call npm start
pause