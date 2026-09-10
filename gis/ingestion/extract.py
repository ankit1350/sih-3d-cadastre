def extract_parcels(gdf):

    parcels = []

    for _, row in gdf.iterrows():

        parcel = {
            "parcel_number": row["parcel_number"],
            "area_sq_m": row["area_sq_m"],
            "geometry": row.geometry
        }

        parcels.append(parcel)

    print(f"Extracted parcels: {len(parcels)}")

    return parcels