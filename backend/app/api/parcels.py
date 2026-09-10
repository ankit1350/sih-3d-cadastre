import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.database import get_db
from app.models.parcel import Parcel

router = APIRouter(
    prefix="/api/parcels",
    tags=["Parcels"]
)


@router.get("/")
def get_parcels(db: Session = Depends(get_db)):

    parcels = db.query(
        Parcel.id,
        Parcel.parcel_number,
        Parcel.area_sq_m,
        func.ST_AsGeoJSON(Parcel.geometry).label("geometry")
    ).all()

    return [
        {
            "id": parcel.id,
            "parcel_number": parcel.parcel_number,
            "area_sq_m": parcel.area_sq_m,
            "geometry": json.loads(parcel.geometry)
        }
        for parcel in parcels
    ]