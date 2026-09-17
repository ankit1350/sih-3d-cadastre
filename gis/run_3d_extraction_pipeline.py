"""
Master Execution Script for 3D ULPIN Generation & Vertical Cadastre Pipeline
Processes Drone Imagery + LiDAR Point Clouds + CAD Floorplans into Standardized 3D Cadastral Datasets.
"""

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
from ai.drone_building_extractor import extract_buildings_from_drone_imagery
from ai.lidar_floor_segmentation import segment_floors_from_lidar
from ai.volumetric_cadastre_generator import generate_3d_volumetric_cadastre


def main():
    print("=" * 85)
    print(" [3D ULPIN GENERATION & VERTICAL PROPERTY MAPPING SYSTEM - MASTER AI PIPELINE]")
    print(" Pilot Area: Blue Ridge Township & SEZ, Hinjewadi Phase 1, Pune (EPSG:32643)")
    print("=" * 85)

    # -------------------------------------------------------------
    # Step 1: AI Drone Imagery Building Footprint Extraction
    # -------------------------------------------------------------
    print("\n[STEP 1/5] Running Computer Vision on High-Res Drone Orthomosaic...")
    drone_res = extract_buildings_from_drone_imagery()
    print(f"  * Source Drone Image: {os.path.relpath(drone_res['source_imagery'])}")
    print(f"  * Resolution: {drone_res['image_dimensions']['width_px']}x{drone_res['image_dimensions']['height_px']} px (GSD: {drone_res['ground_sampling_distance_m']*100:.0f} cm/pixel)")
    print(f"  * AI Detected Buildings: {drone_res['total_buildings_detected']} Footprints")
    print(f"  * Mean Model Confidence: {drone_res['mean_model_confidence']*100:.1f}% | Mean IoU Match: {drone_res['mean_iou_match']*100:.1f}%")
    for b in drone_res["buildings"]:
        print(f"    - {b['building_id']}: Area={b['footprint_area_sq_m']:>6.1f} m² | Perimeter={b['perimeter_m']:>5.1f}m | Centroid={b['centroid_lat_lon']}")

    # -------------------------------------------------------------
    # Step 2: Ingesting Binary LiDAR Point Cloud (.LAS)
    # -------------------------------------------------------------
    print("\n[STEP 2/5] Ingesting ASPRS Binary LiDAR Point Cloud (.LAS)...")
    las_path = "data/reference/lidar/hinjewadi_tower5_sample.las"
    if not os.path.exists(las_path):
        las_path = create_sample_lidar_file(output_path=las_path)
    
    print(f"  * Loaded Binary Point Cloud: {os.path.relpath(las_path)}")
    lidar_res = segment_floors_from_lidar(las_file_path=las_path)
    print(f"  * Total LiDAR Points Processed: {lidar_res['total_points_analyzed']:,} returns")
    print(f"  * Elevation Range: {lidar_res['elevation_bounds']['z_min_msl']}m to {lidar_res['elevation_bounds']['z_max_msl']}m MSL (Height: {lidar_res['elevation_bounds']['total_height_m']}m)")
    print(f"  * Detected Vertical Slabs: {lidar_res['floor_count']} Floor Levels (Inter-floor spacing: {lidar_res['average_inter_floor_height_m']}m)")

    # Print ASCII floor stack sample
    print("\n  --- LiDAR Detected Vertical Floor Stack (Sample Slices) ---")
    for fl in lidar_res["floors"][-3:]:
        tag = "[PENTHOUSE]" if fl["floor_type"] == "penthouse" else ("[REFUGE]" if fl["floor_type"] == "refuge" else "[RESIDENTIAL]")
        print(f"  | Level {fl['floor_code']} | Elevation: {fl['z_min']:>6.1f}m - {fl['z_max']:>6.1f}m MSL | H: {fl['floor_height']}m | {tag:<14} | Confidence: {fl['confidence'] * 100:.1f}% |")

    print("  |   ...    | ... intermediate residential floors 01 to 21 ...    |")
    for fl in lidar_res["floors"][:2]:
        tag = "[PODIUM]" if fl["floor_type"] == "podium" else "[RESIDENTIAL]"
        print(f"  | Level {fl['floor_code']} | Elevation: {fl['z_min']:>6.1f}m - {fl['z_max']:>6.1f}m MSL | H: {fl['floor_height']}m | {tag:<14} | Confidence: {fl['confidence'] * 100:.1f}% |")

    # -------------------------------------------------------------
    # Step 3: CAD Blueprint Slicing & 3D Volumetric Extrusion
    # -------------------------------------------------------------
    print("\n[STEP 3/5] Delineating 3D Apartment Units from CAD & Extruding Polyhedrals...")
    cadastre_res = generate_3d_volumetric_cadastre()
    print(f"  * Generated Watertight 3D Solids: {cadastre_res['total_3d_units_generated']} Apartment Titles")
    print(f"  * Total Gross Carpet Area: {cadastre_res['total_carpet_area_sq_m']:,.2f} m²")
    print(f"  * Undivided Share of Land (UDS) Sum: {cadastre_res['uds_summation_pct']}% (Balanced)")

    # -------------------------------------------------------------
    # Step 4: 3D Spatial Topology Audits
    # -------------------------------------------------------------
    print("\n[STEP 4/5] Executing ISO 19152 LADM 3D Spatial Topology Audits...")
    topo = cadastre_res["topology_validations"]
    print(f"  * Watertight 2-Manifold Rule        : {'PASSED [OK]' if topo['watertight_2_manifold_solids'] else 'FAILED'}")
    print(f"  * Zero Vertical Slab Collisions     : {'PASSED [OK]' if topo['zero_vertical_overlaps'] else 'FAILED'}")
    print(f"  * Building Envelope Enclosure       : {'ST_3DWithin VERIFIED [OK]' if topo['parent_envelope_contained'] else 'FAILED'}")
    print(f"  * Mathematical UDS Balance (=100.0%): {'PASSED [OK]' if topo['uds_summation_balanced'] else 'FAILED'}")

    # -------------------------------------------------------------
    # Step 5: Exporting Datasets
    # -------------------------------------------------------------
    print("\n[STEP 5/5] Exporting Standardized 3D Cadastral Datasets...")
    output_dir = os.path.join(os.path.dirname(__file__), "..", "data", "samples")
    os.makedirs(output_dir, exist_ok=True)

    geojson_path = os.path.join(output_dir, "generated_3d_units.geojson")
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(cadastre_res["geojson_3d"], f, indent=2)
    print(f"  * Exported 3D GeoJSON: {os.path.relpath(geojson_path)}")

    registry_path = os.path.join(output_dir, "cadastre_3d_registry.json")
    with open(registry_path, "w", encoding="utf-8") as f:
        json.dump(cadastre_res["units"], f, indent=2)
    print(f"  * Exported 3D Legal Registry: {os.path.relpath(registry_path)}")

    # Sample output record
    print("\n" + "=" * 85)
    print(" SAMPLE GENERATED 3D BHU-AADHAAR CADASTRAL TITLE")
    print("=" * 85)
    sample = cadastre_res["units"][len(cadastre_res["units"]) // 2]
    print(f"  3D ULPIN Code       : {sample['ulpin']}")
    print(f"  Unit Identity       : {sample['unit_name']} (Tower: {sample['building_name']})")
    print(f"  Parent Parcel       : {sample['parent_parcel_ulpin']}")
    print(f"  Carpet Area         : {sample['carpet_area_sq_m']} m² ({sample['carpet_area_sq_m'] * 10.7639:.1f} sq ft)")
    print(f"  3D Solid Volume     : {sample['volume_cubic_m']} m³ Closed Polyhedral")
    print(f"  Elevation Bounds    : {sample['z_min_msl']}m to {sample['z_max_msl']}m MSL (Height: {sample['height_m']}m)")
    print(f"  Undivided Land Share: {sample['uds_percentage']}% of Parcel Sur. 154/1pt")
    print(f"  LADM Class          : {sample['ladm_class']}")
    print(f"  Legal Tenure        : {sample['legal_tenure']}")
    print("=" * 85)
    print(" [SUCCESS] Full End-to-End AI 3D Cadastral Pipeline Completed Successfully.\n")


if __name__ == "__main__":
    main()
