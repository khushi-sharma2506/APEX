@echo off
title APEX Assessment Engine
echo ===================================================
echo Starting APEX Platform...
echo ===================================================
cd /d "%~dp0"

echo Checking dependencies...
pip install -r requirements.txt

echo.
echo Starting backend server...
echo Once started, open your browser at: http://127.0.0.1:8000/ui
echo.

python -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload
pause
