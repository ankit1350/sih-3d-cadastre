import os

from sqlalchemy import create_engine, text


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5433/cadastre"
)

engine = create_engine(DATABASE_URL)


def load_parcels(parcels):

    inserted = 0

    with engine.begin() as connection:

        for parcel in parcels:

            connection.execute(
                text("""
                    INSERT INTO parcels
                    (
                        parcel_number,
                        area_sq_m,
                        geometry
                    )
                    VALUES
                    (
                        :parcel_number,
                        :area_sq_m,
                        ST_Multi(
                            ST_Transform(
                                ST_SetSRID(
                                    ST_GeomFromText(:geometry),
                                    32643
                                ),
                                4326
                            )
                        )
                    )
                    ON CONFLICT (parcel_number)
                    DO UPDATE SET
                        area_sq_m = EXCLUDED.area_sq_m,
                        geometry = EXCLUDED.geometry
                """),
                {
                    "parcel_number": parcel["parcel_number"],
                    "area_sq_m": parcel["area_sq_m"],
                    "geometry": parcel["geometry"].wkt
                }
            )

            inserted += 1

    print(f"Loaded parcels into PostGIS: {inserted}")

    return inserted

def load_buildings(buildings):

    inserted = 0

    with engine.begin() as connection:

        for building in buildings:

            parcel_result = connection.execute(
                text("""
                    SELECT id
                    FROM parcels
                    WHERE parcel_number = :parcel_number
                """),
                {
                    "parcel_number": building["parcel_number"]
                }
            ).fetchone()

            if parcel_result is None:
                print(
                    f"Warning: parcel "
                    f"{building['parcel_number']} not found"
                )
                continue

            parcel_id = parcel_result[0]

            connection.execute(
    text("""
        INSERT INTO buildings
        (
            parcel_id,
            building_number,
            height_m,
            floor_count,
            confidence,
            geometry
        )
        VALUES
        (
            :parcel_id,
            :building_number,
            :height_m,
            :floor_count,
            :confidence,
            ST_Multi(
                ST_Transform(
                    ST_SetSRID(
                        ST_GeomFromText(:geometry),
                        32643
                    ),
                    4326
                )
            )
        )
        ON CONFLICT (building_number)
        DO UPDATE SET
            parcel_id = EXCLUDED.parcel_id,
            height_m = EXCLUDED.height_m,
            floor_count = EXCLUDED.floor_count,
            confidence = EXCLUDED.confidence,
            geometry = EXCLUDED.geometry
    """),
    {
        "parcel_id": parcel_id,
        "building_number": building["building_number"],
        "height_m": building["height_m"],
        "floor_count": building["floor_count"],
        "confidence": building["confidence"],
        "geometry": building["geometry"].wkt
    }
)

            inserted += 1

    print(f"Loaded buildings into PostGIS: {inserted}")

    return inserted