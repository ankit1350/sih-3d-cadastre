@echo off
title SIH 3D ULPIN Cadastre - Project Launcher
echo =========================================================================
echo               SIH 3D ULPIN Cadastre Platform Launcher
echo =========================================================================
echo.

echo [1/3] Verifying Database Seeding...
python backend/app/db/seed_db.py

echo.
echo [2/3] Building Optimized Production Bundle (1-File Instant Load)...
cd /d %~dp0\frontend
call npm run build
cd /d %~dp0

echo.
echo [3/3] Starting FastAPI Backend & Vite Production Server...
start "SIH Backend API" cmd /k "cd /d %~dp0\backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
start "SIH High-Speed Frontend" cmd /k "cd /d %~dp0\frontend && npm run preview -- --host --port 5173"

echo.
echo =========================================================================
echo  ⚡ LIGHTNING-FAST SERVER ACTIVE!
echo.
echo  📍 Local Access:
echo     http://localhost:5173
echo.
echo  🌐 Share with Teammates on Same Wi-Fi / Local Network:
echo     http://192.168.1.42:5173
echo =========================================================================
echo.
pause

