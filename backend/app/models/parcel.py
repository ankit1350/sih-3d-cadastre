from sqlalchemy import Column, Integer, String, Float
from geoalchemy2 import Geometry

from sqlalchemy.orm import declarative_base


Base = declarative_base()


class Parcel(Base):
    __tablename__ = "parcels"

    id = Column(Integer, primary_key=True)
    parcel_number = Column(String)
    area_sq_m = Column(Float)

    geometry = Column(
        Geometry(
            geometry_type="MULTIPOLYGON",
            srid=4326
        )
    )