@echo off
title CraftForge Minecraft Server Manager
cd /d "%~dp0"

:: Check for bundled executable first
if exist "%~dp0craftforge.exe" (
    echo Starting CraftForge (standalone)...
    "%~dp0craftforge.exe"
    pause
    exit /b
)

:: Fall back to Python
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python 3.11+ is required.
    echo Install it from https://python.org and try again.
    pause
    exit /b
)

echo Installing dependencies...
pip install -r "%~dp0requirements.txt" -q

echo Starting CraftForge...
echo Open http://localhost:8080 in your browser.
echo Press Ctrl+C to stop.
python "%~dp0main.py"
pause
