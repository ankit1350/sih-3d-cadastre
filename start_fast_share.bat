@echo off
title SIH 3D ULPIN Cadastre - High Speed Share Mode
echo =========================================================================
echo       SIH 3D ULPIN Cadastre - High-Speed Production Share Server
echo =========================================================================
echo.

echo [1/3] Seeding Database...
python backend/app/db/seed_db.py

echo.
echo [2/3] Building Production Bundle (Single File for Lightning Load Speed)...
cd /d %~dp0\frontend
call npm run build
cd /d %~dp0

echo.
echo [3/3] Starting FastAPI Backend on http://0.0.0.0:8000 ...
start "SIH Backend API" cmd /k "cd /d %~dp0 && uvicorn backend.app.main:app --host 0.0.0.0 --port 8000"
start "SIH Backend API" cmd /k "cd /d %~dp0\backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo.
echo Starting Production Preview Server on http://0.0.0.0:5173 ...
start "SIH High-Speed Frontend" cmd /k "cd /d %~dp0\frontend && npm run preview -- --host --port 5173"

echo.
echo =========================================================================
echo  ⚡ LIGHTNING FAST SHARE MODE ACTIVE!
echo.
echo  📍 Local URL:         http://localhost:5173
echo  🌐 Wi-Fi / LAN URL:   http://192.168.1.42:5173
echo.
echo  🚀 For Remote Teammates (Instant <1s Tunnel Speed):
echo     Run this in a new terminal:
echo     npx localtunnel --port 5173
echo =========================================================================
echo.
pause

