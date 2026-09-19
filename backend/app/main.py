import os
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from app.api import parcels
from app.api import buildings
from app.api import units
from app.api import pipeline
from app.api import ulpin
from app.api import topology
from app.api import upload
from app.api import exporter
from app.api import ledger
from app.api import ai_copilot
from app.db.seed_db import seed_database

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-seed SQLite database on startup
    try:
        seed_database()
    except Exception as e:
        print(f"Warning during DB seed: {e}")
    yield

app = FastAPI(
    title="SIH 3D ULPIN Cadastre API",
    description="ISO 19152 LADM Volumetric Spatial Cadastre & 3D ULPIN Engine",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend Vite development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all API routers
app.include_router(parcels.router)
app.include_router(buildings.router)
app.include_router(units.router)
app.include_router(pipeline.router)
app.include_router(ulpin.router)
app.include_router(topology.router)
app.include_router(upload.router)
app.include_router(exporter.router)
app.include_router(ledger.router)
app.include_router(ai_copilot.router)


@app.get("/")
def root():
    return {
        "message": "SIH 3D Cadastre API is running",
        "regions_supported": ["auckland"],
        "version": "1.0.0",
        "docs_url": "/docs"
    }


@app.get("/health")
def health():
    # Dynamically check actual database state
    postgis_status = "disabled"
    db_type = "sqlite"
    try:
        db_url = os.environ.get("DATABASE_URL", "")
        if "postgresql" in db_url:
            import psycopg2
            conn = psycopg2.connect(db_url)
            conn.close()
            postgis_status = "enabled"
            db_type = "postgis"
    except Exception:
        pass
    
    return {
        "status": "ok",
        "postgis": postgis_status,
        "database": db_type,
        "iso_19152_ladm": "active",
        "ai_segmentation_pipeline": "ready"
    }


@app.get("/api/regions")
def get_regions():
    return {
        "active_region": "auckland",
        "available_regions": [
            {
                "id": "auckland",
                "name": "Auckland CBD Waterfront & Britomart",
                "country": "New Zealand",
                "flag": "🇳🇿",
                "crs": "EPSG:2193 (NZGD2000) / EPSG:4979 (3D WGS84)",
                "center": {"lon": 174.7663, "lat": -36.8436, "height": 650},
                "point_cloud_source": "LINZ Open Data / Auckland Council LiDAR (3.28M pts)",
                "active_buildings": 4,
                "active_units": 273,
                "utilities_count": 4
            }
        ],
    }


@app.get("/api/cadastre/3d-units")
def get_3d_units(region: Optional[str] = Query("auckland", description="Target region: auckland")):
    file_name = "auckland_generated_3d_units.geojson"
    sample_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "samples", file_name)
    if os.path.exists(sample_path):
        with open(sample_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"type": "FeatureCollection", "features": []}

    return {"type": "FeatureCollection", "features": []}