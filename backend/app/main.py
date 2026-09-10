from fastapi import FastAPI

from app.api import parcels
from app.api import buildings


app = FastAPI(
    title="SIH 3D Cadastre API",
    version="1.0.0"
)


app.include_router(parcels.router)
app.include_router(buildings.router)


@app.get("/")
def root():
    return {
        "message": "SIH 3D Cadastre API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }