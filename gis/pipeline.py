from ingestion.validate import validate_file
from ingestion.transform import transform_crs
from ingestion.clean import clean_geometry
from ingestion.extract import extract_parcels
from ingestion.load import load_parcels


INPUT_FILE = "../data/samples/parcels.geojson"

SOURCE_CRS = "EPSG:4326"
PROJECTED_CRS = "EPSG:32643"


def run_pipeline():

    print("\n=== GIS INGESTION PIPELINE ===\n")

    # 1. Read and validate source data
    gdf = validate_file(INPUT_FILE)

    # 2. Transform to projected CRS
    gdf = transform_crs(gdf, PROJECTED_CRS)

    # 3. Clean geometry
    gdf = clean_geometry(gdf)

    # 4. Calculate area in square metres
    gdf["area_sq_m"] = gdf.geometry.area

    print("\nCalculated areas:")

    for _, row in gdf.iterrows():
        print(
            f"{row['parcel_number']}: "
            f"{row['area_sq_m']:.2f} m²"
        )

    # 5. Extract features
    parcels = extract_parcels(gdf)

    # 6. Load into PostGIS
    load_parcels(parcels)

    print("\nPipeline completed successfully.")
    print(f"Total parcels processed: {len(parcels)}")


if __name__ == "__main__":
    run_pipeline()