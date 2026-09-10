from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.building import Building


router = APIRouter(
    prefix="/api/buildings",
    tags=["Buildings"]
)


@router.get("/")
def get_buildings(db: Session = Depends(get_db)):

    buildings = db.query(Building).all()

    return [
        {
            "id": building.id,
            "parcel_id": building.parcel_id,
            "building_number": building.building_number,
            "height_m": building.height_m,
            "floor_count": building.floor_count,
            "confidence": building.confidence
        }
        for building in buildings
    ]