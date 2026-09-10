import os

from sqlalchemy import create_engine, text


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5433/cadastre"
)

engine = create_engine(DATABASE_URL)


def validate_buildings_inside_parcels():

    print("\n=== BUILDING / PARCEL TOPOLOGY CHECK ===\n")

    with engine.connect() as connection:

        results = connection.execute(
            text("""
                SELECT
                    b.building_number,
                    p.parcel_number,
                    ST_Within(
                        b.geometry,
                        p.geometry
                    ) AS is_inside
                FROM buildings b
                JOIN parcels p
                    ON b.parcel_id = p.id
                ORDER BY b.id
            """)
        ).fetchall()

        for row in results:

            status = "PASS" if row.is_inside else "FAIL"

            print(
                f"{status}: "
                f"{row.building_number} → "
                f"{row.parcel_number}"
            )


if __name__ == "__main__":
    validate_buildings_inside_parcels()