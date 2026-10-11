@echo off
title APEX Assessment Engine

echo Starting APEX Platform...
cd /d "%~dp0"

echo Checking dependencies...
set "PY_EXE=E:\Khushi\Python312\python.exe"
if not exist "%PY_EXE%" set "PY_EXE=python"

"%PY_EXE%" -m pip install -r requirements.txt

echo.
echo Starting backend server...
echo Once started, open your browser at: http://127.0.0.1:8000/ui
echo.

"%PY_EXE%" -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload
pause
