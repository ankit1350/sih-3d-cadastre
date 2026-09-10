import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.database import get_db
from app.models.building import Building

router = APIRouter(
    prefix="/api/buildings",
    tags=["Buildings"]
)


@router.get("/")
def get_buildings(db: Session = Depends(get_db)):

    buildings = db.query(
        Building.id,
        Building.parcel_id,
        Building.building_number,
        Building.height_m,
        Building.floor_count,
        Building.confidence,
        func.ST_AsGeoJSON(Building.geometry).label("geometry")
    ).all()

    return [
        {
            "id": building.id,
            "parcel_id": building.parcel_id,
            "building_number": building.building_number,
            "height_m": building.height_m,
            "floor_count": building.floor_count,
            "confidence": building.confidence,
            "geometry": json.loads(building.geometry)
        }
        for building in buildings
    ]