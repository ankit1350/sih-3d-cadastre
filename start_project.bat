@echo off
title SIH 3D ULPIN Cadastre - Project Launcher
echo =========================================================================
echo               SIH 3D ULPIN Cadastre Platform Launcher
echo =========================================================================
echo.

echo [1/2] Seeding Database...
python backend/app/db/seed_db.py

echo.
echo [2/2] Starting FastAPI Backend & Vite Frontend Server...
start "SIH Backend API" cmd /k "cd /d %~dp0\backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
start "SIH Frontend UI" cmd /k "cd /d %~dp0\frontend && npm run dev -- --host --port 5173"

echo.
echo =========================================================================
echo  ⚡ SIH 3D CADASTRE PLATFORM ACTIVE!
echo.
echo  📍 Local Access:
echo     http://localhost:5173
echo.
echo  🌐 Wi-Fi / LAN Access:
echo     http://192.168.1.42:5173
echo =========================================================================
echo.
pause

