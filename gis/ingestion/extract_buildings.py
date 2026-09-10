def extract_buildings(gdf):

    buildings = []

    for _, row in gdf.iterrows():

        building = {
            "building_number": row["building_number"],
            "height_m": float(row["height_m"]),
            "floor_count": int(row["floor_count"]),
            "confidence": float(row["confidence"]),
            "parcel_number": row["parcel_number"],
            "geometry": row.geometry
        }

        buildings.append(building)

    print(f"Extracted buildings: {len(buildings)}")

    return buildings