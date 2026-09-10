from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.parcel import Parcel


router = APIRouter(
    prefix="/api/parcels",
    tags=["Parcels"]
)


@router.get("/")
def get_parcels(db: Session = Depends(get_db)):

    parcels = db.query(Parcel).all()

    return [
        {
            "id": parcel.id,
            "parcel_number": parcel.parcel_number,
            "area_sq_m": parcel.area_sq_m
        }
        for parcel in parcels
    ]