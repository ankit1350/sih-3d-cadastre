@echo off
title SIH 3D ULPIN Cadastre - Project Launcher
echo =========================================================================
echo               SIH 3D ULPIN Cadastre Platform Launcher
echo =========================================================================
echo.

echo [1/3] Verifying Database Seeding...
python backend/app/db/seed_db.py

echo.
echo [2/3] Starting FastAPI Backend on http://localhost:8000 ...
start "SIH Backend API" cmd /k "cd /d %~dp0 && uvicorn backend.app.main:app --reload --port 8000"

echo.
echo [3/3] Starting Vite Frontend on http://localhost:5173 ...
start "SIH Frontend UI" cmd /k "cd /d %~dp0\frontend && npm run dev"

echo.
echo =========================================================================
echo  [SUCCESS] Both Backend & Frontend servers are launching!
echo  Open your browser at: http://localhost:5173
echo =========================================================================
echo.
pause

