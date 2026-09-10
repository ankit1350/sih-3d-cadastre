import geopandas as gpd


def validate_file(file_path):
    print(f"Reading: {file_path}")

    gdf = gpd.read_file(file_path)

    if gdf.empty:
        raise ValueError("Input file contains no features.")

    if gdf.crs is None:
        raise ValueError("Input file has no CRS information.")

    if "parcel_number" not in gdf.columns:
        raise ValueError("Missing required field: parcel_number")

    print(f"Features: {len(gdf)}")
    print(f"CRS: {gdf.crs}")
    print(f"Geometry types: {gdf.geometry.geom_type.unique()}")

    return gdf