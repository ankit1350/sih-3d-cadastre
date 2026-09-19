"""
Master Execution Script for 3D ULPIN Generation & Vertical Cadastre Pipeline
Processes Drone Imagery + LiDAR Point Clouds + CAD Floorplans into Standardized 3D Cadastral Datasets.
Supports both Auckland CBD (New Zealand) and Pune Hinjewadi (India) datasets.
"""

import argparse
import json
import os
import sys

# Set standard output encoding for Windows terminals
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Ensure local gis path is in python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ai.create_sample_lidar_las import create_sample_lidar_file
from ai.create_auckland_lidar_las import generate_auckland_cbd_las
from ai.drone_building_extractor import extract_buildings_from_drone_imagery
from ai.lidar_floor_segmentation import segment_floors_from_lidar
from ai.volumetric_cadastre_generator import generate_3d_volumetric_cadastre


def main():
    parser = argparse.ArgumentParser(description="Run 3D Cadastre Extraction Pipeline")
    parser.add_argument(
        "--region",
        choices=["auckland", "pune"],
        default="auckland",
        help="Target pilot region dataset to process (default: auckland)",
    )
    args = parser.parse_args()
    region = args.region

    print("=" * 85)
    print(" [3D ULPIN GENERATION & VERTICAL PROPERTY MAPPING SYSTEM - MASTER AI PIPELINE]")
    if region == "auckland":
        print(" Pilot Area: Auckland CBD Waterfront & Britomart (EPSG:2193 / NZGD2000 & WGS84)")
        print(" Dataset   : LINZ Open LiDAR & City Rail Link (CRL) Subterranean Cadastre")
    else:
        print(" Pilot Area: Blue Ridge Township & SEZ, Hinjewadi Phase 1, Pune (EPSG:32643)")
        print(" Dataset   : PMRDA High-Res Drone & Aerial LiDAR Survey")
    print("=" * 85)

    # -------------------------------------------------------------
    # Step 1: Ingesting Binary LiDAR Point Cloud (.LAS)
    # -------------------------------------------------------------
    print(f"\n[STEP 1/5] Ingesting ASPRS Binary LiDAR Point Cloud (.LAS) for {region.upper()}...")
    print(f"\n[STEP 1/5] Ingesting ASPRS Binary LiDAR Point Cloud (.LAS/.LAZ) for {region.upper()}...")
    if region == "auckland":
        las_path = "data/reference/lidar/auckland_cbd_sample.las"
        if not os.path.exists(las_path):
            las_path = generate_auckland_cbd_las(output_path=las_path)
        expected_floor_h = 3.17
        if os.path.exists("data/reference/lidar/auckland_cbd.laz"):
            las_path = "data/reference/lidar/auckland_cbd.laz"
        elif os.path.exists("data/reference/lidar/auckland_cbd_sample.las"):
            las_path = "data/reference/lidar/auckland_cbd_sample.las"
        else:
            las_path = generate_auckland_cbd_las(output_path="data/reference/lidar/auckland_cbd_sample.las")
        expected_floor_h = 3.20
    else:
        las_path = "data/reference/lidar/hinjewadi_tower5_sample.las"
        if not os.path.exists(las_path):
            las_path = create_sample_lidar_file(output_path=las_path)
        expected_floor_h = 3.00

    print(f"  * Loaded Binary Point Cloud: {os.path.relpath(las_path)}")
    lidar_res = segment_floors_from_lidar(las_file_path=las_path, expected_floor_height=expected_floor_h)
    print(f"  * Total LiDAR Points Processed: {lidar_res['total_points_analyzed']:,} returns")
    print(f"  * Elevation Range: {lidar_res['elevation_bounds']['z_min_msl']}m to {lidar_res['elevation_bounds']['z_max_msl']}m MSL (Height: {lidar_res['elevation_bounds']['total_height_m']}m)")
    print(f"  * Detected Vertical Slabs: {lidar_res['floor_count']} Floor Levels (Inter-floor spacing: {lidar_res['average_inter_floor_height_m']}m)")

    # Print ASCII floor stack sample
    print(f"\n  --- LiDAR Detected Vertical Floor Stack ({region.title()} Sample Slices) ---")
    for fl in lidar_res["floors"][-3:]:
        tag = "[PENTHOUSE]" if fl["floor_type"] == "penthouse" else ("[REFUGE]" if fl["floor_type"] == "refuge" else "[RESIDENTIAL]")
        print(f"  | Level {fl['floor_code']} | Elevation: {fl['z_min']:>6.1f}m - {fl['z_max']:>6.1f}m MSL | H: {fl['floor_height']}m | {tag:<14} | Confidence: {fl['confidence'] * 100:.1f}% |")

    print(f"  |   ...    | ... intermediate floors (total {lidar_res['floor_count']} levels) ...    |")
    for fl in lidar_res["floors"][:2]:
        tag = "[PODIUM]" if fl["floor_type"] == "podium" else "[RESIDENTIAL]"
        print(f"  | Level {fl['floor_code']} | Elevation: {fl['z_min']:>6.1f}m - {fl['z_max']:>6.1f}m MSL | H: {fl['floor_height']}m | {tag:<14} | Confidence: {fl['confidence'] * 100:.1f}% |")

    # -------------------------------------------------------------
    # Step 2: AI Drone / Aerial Building Footprint Extraction
    # -------------------------------------------------------------
    print("\n[STEP 2/5] Running Computer Vision on Orthomosaic / Cadastral Footprints...")
    drone_res = extract_buildings_from_drone_imagery()
    print(f"  * Source Drone Image: {os.path.relpath(drone_res['source_imagery'])}")
    print(f"  * Resolution: {drone_res['image_dimensions']['width_px']}x{drone_res['image_dimensions']['height_px']} px")
    print(f"  * AI Detected Buildings: {drone_res['total_buildings_detected']} Footprints")
    print(f"  * Mean Model Confidence: {drone_res['mean_model_confidence']*100:.1f}% | Mean IoU Match: {drone_res['mean_iou_match']*100:.1f}%")

    # -------------------------------------------------------------
    # Step 3: CAD / LINZ Blueprint Slicing & 3D Volumetric Extrusion
    # -------------------------------------------------------------
    print("\n[STEP 3/5] Delineating 3D Unit Titles & Extruding Watertight Polyhedrals...")
    cadastre_res = generate_3d_volumetric_cadastre()
    print(f"  * Generated Watertight 3D Solids: {cadastre_res['total_3d_units_generated']} Title Units")
    print(f"  * Total Gross Carpet Area: {cadastre_res['total_carpet_area_sq_m']:,.2f} m²")
    print(f"  * Ownership Share Summation: {cadastre_res['uds_summation_pct']}% (Balanced)")

    # -------------------------------------------------------------
    # Step 4: 3D Spatial Topology Audits
    # -------------------------------------------------------------
    print("\n[STEP 4/5] Executing ISO 19152 LADM 3D Spatial Topology Audits...")
    topo = cadastre_res["topology_validations"]
    print(f"  * Watertight 2-Manifold Rule        : {'PASSED [OK]' if topo['watertight_2_manifold_solids'] else 'FAILED'}")
    print(f"  * Zero Vertical Slab Collisions     : {'PASSED [OK]' if topo['zero_vertical_overlaps'] else 'FAILED'}")
    print(f"  * Building Envelope Enclosure       : {'ST_3DWithin VERIFIED [OK]' if topo['parent_envelope_contained'] else 'FAILED'}")
    print(f"  * Mathematical Ownership Balance    : {'PASSED [OK]' if topo['uds_summation_balanced'] else 'FAILED'}")

    # -------------------------------------------------------------
    # Step 5: Exporting Datasets
    # -------------------------------------------------------------
    print("\n[STEP 5/5] Exporting Standardized 3D Cadastral Datasets...")
    output_dir = os.path.join(os.path.dirname(__file__), "..", "data", "samples")
    os.makedirs(output_dir, exist_ok=True)

    geojson_file = f"{region}_generated_3d_units.geojson" if region == "auckland" else "generated_3d_units.geojson"
    geojson_path = os.path.join(output_dir, geojson_file)
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(cadastre_res["geojson_3d"], f, indent=2)
    print(f"  * Exported 3D GeoJSON: {os.path.relpath(geojson_path)}")

    registry_file = f"{region}_cadastre_3d_registry.json" if region == "auckland" else "cadastre_3d_registry.json"
    registry_path = os.path.join(output_dir, registry_file)
    with open(registry_path, "w", encoding="utf-8") as f:
        json.dump(cadastre_res["units"], f, indent=2)
    print(f"  * Exported 3D Legal Registry: {os.path.relpath(registry_path)}")

    print("\n" + "=" * 85)
    print(f" [SUCCESS] AI 3D Cadastral Pipeline Completed for Region: {region.upper()}.\n")


if __name__ == "__main__":
    main()
