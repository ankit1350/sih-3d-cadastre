Write-Host ""
Write-Host "========================================"
Write-Host " SIH 3D CADASTRE - PROJECT SETUP"
Write-Host "========================================"
Write-Host ""

# ----------------------------------------
# 1. Check required software
# ----------------------------------------

Write-Host "Checking required software..."

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Python is not installed."
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is not installed."
    exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker is not installed."
    exit 1
}

Write-Host "Python, Node.js and Docker found."
Write-Host ""

# ----------------------------------------
# 2. Create Python virtual environment
# ----------------------------------------

Write-Host "Creating Python virtual environment..."

if (-not (Test-Path ".venv")) {
    python -m venv .venv
    Write-Host "Virtual environment created."
}
else {
    Write-Host "Virtual environment already exists."
}

Write-Host ""

# ----------------------------------------
# 3. Activate virtual environment
# ----------------------------------------

Write-Host "Activating Python environment..."

& ".\.venv\Scripts\Activate.ps1"

Write-Host ""

# ----------------------------------------
# 4. Install Python requirements
# ----------------------------------------

Write-Host "Installing Python requirements..."

python -m pip install --upgrade pip
pip install -r requirements.txt

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Python requirements installation failed."
    exit 1
}

Write-Host "Python requirements installed."
Write-Host ""

# ----------------------------------------
# 5. Install frontend requirements
# ----------------------------------------

Write-Host "Installing frontend dependencies..."

Set-Location frontend

npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Frontend installation failed."
    exit 1
}

Set-Location ..

Write-Host "Frontend dependencies installed."
Write-Host ""

# ----------------------------------------
# 6. Start Docker services
# ----------------------------------------

Write-Host "Starting Docker services..."

docker compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker services could not start."
    exit 1
}

Write-Host "Docker services started."
Write-Host ""

# ----------------------------------------
# 7. Wait for PostgreSQL
# ----------------------------------------

Write-Host "Waiting for PostgreSQL..."

Start-Sleep -Seconds 5

# ----------------------------------------
# 8. Initialize database
# ----------------------------------------

Write-Host "Initializing database schema..."

Get-Content ".\database\schema.sql" |
    docker exec -i sih-postgis psql -U postgres -d cadastre

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Database initialization failed."
    exit 1
}

Write-Host "Database initialized."
Write-Host ""

# ----------------------------------------
# Setup complete
# ----------------------------------------

Write-Host "========================================"
Write-Host " SETUP COMPLETED SUCCESSFULLY!"
Write-Host "========================================"
Write-Host ""

Write-Host "To start the backend:"
Write-Host ""
Write-Host ".\.venv\Scripts\Activate.ps1"
Write-Host "uvicorn backend.app.main:app --reload"
Write-Host ""

Write-Host "To start the frontend, open another terminal:"
Write-Host ""
Write-Host "cd frontend"
Write-Host "npm run dev"
Write-Host ""

Write-Host "Backend:  http://localhost:8000"
Write-Host "Swagger:  http://localhost:8000/docs"
Write-Host "Frontend: http://localhost:5173"
Write-Host ""