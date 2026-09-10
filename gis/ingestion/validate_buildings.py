import geopandas as gpd


def validate_building_file(file_path):

    print(f"Reading buildings: {file_path}")

    gdf = gpd.read_file(file_path)

    if gdf.empty:
        raise ValueError("Building file contains no features.")

    if gdf.crs is None:
        raise ValueError("Building file has no CRS information.")

    required_fields = [
        "building_number",
        "height_m",
        "floor_count",
        "confidence",
        "parcel_number"
    ]

    for field in required_fields:
        if field not in gdf.columns:
            raise ValueError(
                f"Missing required field: {field}"
            )

    print(f"Buildings: {len(gdf)}")
    print(f"CRS: {gdf.crs}")
    print(f"Geometry types: {gdf.geometry.geom_type.unique()}")

    return gdf