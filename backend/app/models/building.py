from sqlalchemy import Column, Integer, String, Float
from geoalchemy2 import Geometry

from .parcel import Base


class Building(Base):
    __tablename__ = "buildings"

    id = Column(Integer, primary_key=True)

    parcel_id = Column(Integer)

    building_number = Column(String)

    height_m = Column(Float)

    floor_count = Column(Integer)

    confidence = Column(Float)

    geometry = Column(
        Geometry(
            geometry_type="MULTIPOLYGON",
            srid=4326
        )
    )