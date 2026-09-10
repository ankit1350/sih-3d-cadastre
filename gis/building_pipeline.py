from ingestion.validate_buildings import validate_building_file
from ingestion.transform import transform_crs
from ingestion.clean import clean_geometry
from ingestion.extract_buildings import extract_buildings
from ingestion.load import load_buildings


INPUT_FILE = "../data/samples/buildings.geojson"

PROJECTED_CRS = "EPSG:32643"


def run_pipeline():

    print("\n=== BUILDING INGESTION PIPELINE ===\n")

    # 1. Validate
    gdf = validate_building_file(INPUT_FILE)

    # 2. Transform
    gdf = transform_crs(gdf, PROJECTED_CRS)

    # 3. Clean
    gdf = clean_geometry(gdf)

    # 4. Extract
    buildings = extract_buildings(gdf)

    # 5. Load
    load_buildings(buildings)

    print("\nBuilding pipeline completed.")
    print(f"Total buildings processed: {len(buildings)}")


if __name__ == "__main__":
    run_pipeline()