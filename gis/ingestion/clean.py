def clean_geometry(gdf):

    print("Checking geometry validity...")

    invalid_count = (~gdf.geometry.is_valid).sum()

    print(f"Invalid geometries: {invalid_count}")

    if invalid_count > 0:
        gdf["geometry"] = gdf.geometry.make_valid()

    gdf = gdf[~gdf.geometry.is_empty]

    return gdf