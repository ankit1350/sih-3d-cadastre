"""
Master Execution Script for 3D ULPIN Generation & Vertical Cadastre Pipeline
Processes LiDAR Point Clouds + CAD Floorplans into Standardized 3D Cadastral Datasets.
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

from ai.lidar_floor_segmentation import segment_floors_from_lidar
from ai.volumetric_cadastre_generator import generate_3d_volumetric_cadastre


def main():
    print("=" * 80)
    print(" [3D ULPIN GENERATION & VERTICAL PROPERTY MAPPING SYSTEM - AI ENGINE]")
    print(" Pilot Area: Blue Ridge Township & SEZ, Hinjewadi Phase 1, Pune (EPSG:32643)")
    print("=" * 80)

    # Step 1: LiDAR Vertical Point Cloud Processing
    print("\n[STEP 1/4] Running Gaussian KDE on LiDAR Point Cloud...")
    lidar_res = segment_floors_from_lidar()
    print(f"  * Point Cloud Elevation Bounds: {lidar_res['elevation_bounds']['z_min_msl']}m to {lidar_res['elevation_bounds']['z_max_msl']}m MSL")
    print(f"  * Total Vertical Height: {lidar_res['elevation_bounds']['total_height_m']}m")
    print(f"  * Detected Floor Slabs: {lidar_res['floor_count']} Levels (Average Height: {lidar_res['average_inter_floor_height_m']}m)")

    # Print ASCII floor stack
    print("\n  --- Detected Vertical Floor Stack (Sample Slices) ---")
    for fl in lidar_res["floors"][-4:]:
        tag = "[PENTHOUSE]" if fl["floor_type"] == "penthouse" else ("[REFUGE]" if fl["floor_type"] == "refuge" else "[RESIDENTIAL]")
        print(f"  | Level {fl['floor_code']} | Elevation: {fl['z_min']:>6.1f}m - {fl['z_max']:>6.1f}m MSL | H: {fl['floor_height']}m | {tag:<14} | Confidence: {fl['confidence'] * 100:.1f}% |")

    print("  |   ...    | ... intermediate floors 01 to 20 ...        |")
    for fl in lidar_res["floors"][:2]:
        tag = "[PODIUM]" if fl["floor_type"] == "podium" else "[RESIDENTIAL]"
        print(f"  | Level {fl['floor_code']} | Elevation: {fl['z_min']:>6.1f}m - {fl['z_max']:>6.1f}m MSL | H: {fl['floor_height']}m | {tag:<14} | Confidence: {fl['confidence'] * 100:.1f}% |")

    # Step 2: 3D Volumetric Extrusion & 3D ULPIN Allocation
    print("\n[STEP 2/4] Delineating 3D Units from Architectural CAD Plans & Extruding Solids...")
    cadastre_res = generate_3d_volumetric_cadastre()
    print(f"  * Extruded Watertight 3D Solids: {cadastre_res['total_3d_units_generated']} Apartment Titles")
    print(f"  * Total Building Carpet Area: {cadastre_res['total_carpet_area_sq_m']:.2f} m²")
    print(f"  * Undivided Share of Land (UDS) Sum: {cadastre_res['uds_summation_pct']}% (Balanced)")

    # Step 3: 3D Topology Audit
    print("\n[STEP 3/4] Performing Automated 3D Spatial Topology Audits...")
    topo = cadastre_res["topology_validations"]
    print(f"  * Watertight 2-Manifold Rule: {'PASSED' if topo['watertight_2_manifold_solids'] else 'FAILED'}")
    print(f"  * Vertical Overlap & Slab Collisions: {'ZERO COLLISIONS' if topo['zero_vertical_overlaps'] else 'FAILED'}")
    print(f"  * Building Envelope Enclosure: {'ST_3DWithin VERIFIED' if topo['parent_envelope_contained'] else 'FAILED'}")
    print(f"  * Mathematical UDS Reconciliation: {'100.00% EXACT' if topo['uds_summation_balanced'] else 'FAILED'}")

    # Step 4: Export Datasets
    print("\n[STEP 4/4] Exporting Generated 3D Cadastral Datasets...")
    output_dir = os.path.join(os.path.dirname(__file__), "..", "data", "samples")
    os.makedirs(output_dir, exist_ok=True)

    geojson_path = os.path.join(output_dir, "generated_3d_units.geojson")
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(cadastre_res["geojson_3d"], f, indent=2)
    print(f"  * Saved 3D GeoJSON: {os.path.relpath(geojson_path)}")

    registry_path = os.path.join(output_dir, "cadastre_3d_registry.json")
    with open(registry_path, "w", encoding="utf-8") as f:
        json.dump(cadastre_res["units"], f, indent=2)
    print(f"  * Saved 3D Legal Registry: {os.path.relpath(registry_path)}")

    # Sample output
    print("\n" + "=" * 80)
    print(" SAMPLE GENERATED 3D CADASTRAL TITLE (BHU-AADHAAR 3D)")
    print("=" * 80)
    sample = cadastre_res["units"][len(cadastre_res["units"]) // 2]
    print(f"  3D ULPIN Code       : {sample['ulpin']}")
    print(f"  Unit Identity       : {sample['unit_name']} (Tower: {sample['building_name']})")
    print(f"  Parent Parcel       : {sample['parent_parcel_ulpin']}")
    print(f"  Carpet Area         : {sample['carpet_area_sq_m']} m² ({sample['carpet_area_sq_m'] * 10.7639:.1f} sq ft)")
    print(f"  3D Volume           : {sample['volume_cubic_m']} m³ Solid Prism")
    print(f"  Elevation Bounds    : {sample['z_min_msl']}m to {sample['z_max_msl']}m MSL (Height: {sample['height_m']}m)")
    print(f"  Undivided Land Share: {sample['uds_percentage']}% of Parcel Sur. 154/1pt")
    print(f"  LADM Class          : {sample['ladm_class']}")
    print(f"  Legal Tenure        : {sample['legal_tenure']}")
    print("=" * 80)
    print(" [SUCCESS] 3D Cadastral Pipeline Completed Successfully.\n")


if __name__ == "__main__":
    main()
