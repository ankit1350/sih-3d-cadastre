def transform_crs(gdf, target_crs):
    if gdf.crs is None:
        raise ValueError("Cannot transform data without a source CRS.")

    print(f"Transforming CRS: {gdf.crs} -> {target_crs}")

    return gdf.to_crs(target_crs)