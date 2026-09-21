"""
Comprehensive Ingestion Script for All 893 Auckland Buildings.
Parses data/samples/auckland_custom.geojson, calculates 3D volumetric metrics,
generates floor-by-floor stratum titles and owners according to ISO 19152 LADM,
populates data/cadastre.db (SQLite), and generates frontend/src/data/auckland_buildings_full.json.
"""

import json
import os
import sqlite3
import random
import hashlib

# Deterministic random seed for consistent owner names & data
random.seed(42)

AUCKLAND_OWNERS_POOL = [
    "Auckland Council Property Trust",
    "Sir Graeme Douglas Trust",
    "Kāinga Ora Urban Development",
    "Landonline Stratum Title Register",
    "Waterfront Commercial Holdings Ltd",
    "Britomart Precinct Assets Ltd",
    "Precinct Properties New Zealand",
    "Mansons TCLM Commercial Group",
    "Seascape Luxury Living Trust",
    "Ngāti Whātua Ōrākei Whai Rawa",
    "Waitematā Local Board Trustees",
    "Harbour View Capital Partners",
    "Queen Street Property Holdings",
    "Albert Street Commercial Trust",
    "Shortland Chambers Syndicate",
    "Pacific Gateway Investments",
    "Customs Street Stratum Estates",
    "Hobson Wharf Residences Trust",
    "Viaduct Harbour Holdings Ltd",
    "Southern Cross Investment Fund"
]

def generate_owner_name(bldg_idx, floor_num, unit_num):
    idx = (bldg_idx * 17 + floor_num * 7 + unit_num) % len(AUCKLAND_OWNERS_POOL)
    return AUCKLAND_OWNERS_POOL[idx]

def generate_ulpin(country, state, dist, locality, layer, bldg_seq, floor_seq, unit_seq):
    raw = f"{country}-{state}-{dist}-{locality}-{layer}-{bldg_seq:06d}-{floor_seq:02d}{unit_seq:02d}"
    h = 0
    for char in raw:
        h = (h * 31 + ord(char)) % 10
    return f"{raw}-{h}"

def ingest_all_buildings():
    input_path = "data/samples/auckland_custom.geojson"
    if not os.path.exists(input_path):
        print(f"Error: {input_path} not found")
        return

    print(f"Reading {input_path}...")
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    print(f"Total features in dataset: {len(features)}")

    db_path = "data/cadastre.db"
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Clear old Auckland buildings, floors, units to prevent stale duplicates
    cur.execute("DELETE FROM units WHERE building_id LIKE 'b-auk-%'")
    cur.execute("DELETE FROM floors WHERE building_id LIKE 'b-auk-%'")
    cur.execute("DELETE FROM buildings WHERE region_id = 'auckland'")
    conn.commit()

    processed_buildings = []
    processed_geojson_features = []

    # Well-known landmark overrides
    landmark_overrides = {
        "The Pacifica": {"levels": 57, "height": 182.4, "id": "b-auk-pacifica", "base": 7.2},
        "The Pacifica Tower": {"levels": 57, "height": 182.4, "id": "b-auk-pacifica", "base": 7.2},
        "Seascape": {"levels": 52, "height": 187.0, "id": "b-auk-seascape", "base": 6.8},
        "Commercial Bay": {"levels": 39, "height": 180.0, "id": "b-auk-commbay", "base": 5.5},
        "PwC Tower": {"levels": 39, "height": 180.0, "id": "b-auk-commbay", "base": 5.5},
        "SkyCity Hotel": {"levels": 18, "height": 62.0, "id": "b-auk-skycity", "base": 18.0},
        "Aotea Centre": {"levels": 6, "height": 28.0, "id": "b-auk-aotea", "base": 16.0},
        "Waldorf Celestion": {"levels": 18, "height": 58.0, "id": "b-auk-celestion", "base": 9.0},
        "Mount Terrace": {"levels": 13, "height": 42.0, "id": "b-auk-mtterrace", "base": 12.0},
        "Auckland City Hotel": {"levels": 12, "height": 38.0, "id": "b-auk-cityhotel", "base": 14.0},
    }

    bldg_counter = 0

    for idx, feat in enumerate(features):
        geom = feat.get("geometry", {})
        props = feat.get("properties", {})
        g_type = geom.get("type")

        if g_type not in ("Polygon", "MultiPolygon"):
            continue

        raw_coords = geom.get("coordinates", [])
        if not raw_coords:
            continue

        # Extract outer ring coordinates
        if g_type == "Polygon":
            outer_ring = raw_coords[0]
        else: # MultiPolygon
            outer_ring = raw_coords[0][0]

        if len(outer_ring) < 3:
            continue

        bldg_counter += 1

        name = props.get("name")
        b_type = props.get("building", "commercial")
        levels_val = props.get("building:levels")
        height_val = props.get("height")

        # Determine storey count
        levels = 4
        if levels_val:
            try:
                levels = max(1, int(float(levels_val)))
            except Exception:
                levels = 4
        elif height_val:
            try:
                h = float(height_val.replace("m", "").strip())
                levels = max(1, int(h / 3.2))
            except Exception:
                levels = 4
        else:
            if b_type in ("apartments", "hotel"):
                levels = random.choice([8, 10, 12, 16, 20])
            elif b_type in ("commercial", "office"):
                levels = random.choice([6, 8, 12, 15, 24])
            elif b_type in ("university", "public"):
                levels = random.choice([4, 6, 8])
            else:
                levels = random.choice([2, 3, 4, 5])

        # Centroid
        lons = [p[0] for p in outer_ring]
        lats = [p[1] for p in outer_ring]
        c_lon = sum(lons) / len(lons)
        c_lat = sum(lats) / len(lats)

        # Baseline terrain elevation (Auckland CBD ranges from ~4m waterfront to ~35m up Queen St)
        dist_from_coast = max(0.0, (-36.8420 - c_lat) * 111000) # meters south of Waitematā Harbour
        base_msl = round(min(38.0, 5.0 + (dist_from_coast * 0.025)), 1)

        # Building name & ID
        b_id = f"b-auk-{bldg_counter:04d}"
        if name and name in landmark_overrides:
            override = landmark_overrides[name]
            levels = override["levels"]
            height_m = override["height"]
            b_id = override["id"]
            base_msl = override.get("base", base_msl)
        else:
            height_m = round(levels * 3.2, 1)

        roof_msl = round(base_msl + height_m, 1)

        display_name = name or f"Auckland Stratum {b_type.capitalize()} #{bldg_counter}"
        short_label = (name[:18] if name else f"AUK-BLDG-{bldg_counter:04d}")
        address = f"{random.randint(1, 199)} Queen Street, Auckland CBD 1010" if not name else f"{name} Precinct, Auckland CBD"

        ulpin = generate_ulpin("NZ", "AUK", "CBD", "AUK", "BL", bldg_counter, 0, 0)

        # Generate Floor & Unit hierarchy for this building
        floors = []
        units_count = 0

        # Create realistic key floor levels (Ground, Selected intermediate, and Top floor)
        key_levels = [1]
        if b_id == "b-auk-pacifica":
            key_levels = [1, 28, 56]
        else:
            if levels > 2:
                key_levels.append(max(2, levels // 2))
            if levels > 1:
                key_levels.append(levels)

        for lvl in sorted(list(set(key_levels))):
            fl_id = f"fl-{b_id}-F{lvl:02d}"
            if b_id == "b-auk-pacifica" and lvl == 56:
                fl_id = "fl-pac-56"
            fl_base = round(base_msl + (lvl - 1) * 3.2, 1)
            fl_roof = round(fl_base + 3.2, 1)
            fl_name = f"Ground Level (Level 01)" if lvl == 1 else (f"Penthouse Level (Floor {lvl})" if lvl == levels and levels > 4 else f"Level {lvl:02d} (Stratum Suites)")
            fl_type = "retail" if lvl == 1 else ("penthouse" if lvl == levels and levels > 4 else "residential")

            # 2 to 4 units per floor
            units_on_floor = []
            num_units = 4 if fl_type != "penthouse" else 2
            units_count += num_units

            for u_idx in range(1, num_units + 1):
                u_id = f"u-{b_id}-L{lvl:02d}-{u_idx:02d}"
                unit_num = f"{lvl}{u_idx:02d}"
                u_ulpin = generate_ulpin("NZ", "AUK", "CBD", "AUK", "UN", bldg_counter, lvl, u_idx)
                u_owner = generate_owner_name(bldg_counter, lvl, u_idx)

                if b_id == "b-auk-pacifica" and lvl == 56 and u_idx == 1:
                    u_id = "u-auk-pac-5601"
                    unit_num = "PH-5601"
                    u_ulpin = "NZ-AUK-CBD-UN-000201-5601-2"
                    u_owner = "Sir Graeme Douglas Trust"
                u_area = round(random.uniform(72.0, 145.0) if fl_type != "penthouse" else random.uniform(220.0, 450.0), 1)
                u_vol = round(u_area * 2.85, 1)
                u_uds = round((100.0 / (levels * 3.5)), 3)

                unit_obj = {
                    "id": u_id,
                    "buildingId": b_id,
                    "floorId": fl_id,
                    "unitNumber": unit_num,
                    "name": f"Suite {unit_num} ({fl_name})",
                    "ulpin": u_ulpin,
                    "ownerName": u_owner,
                    "area": f"{u_area} m² Carpet",
                    "builtupArea": f"{round(u_area * 1.18, 1)} m²",
                    "volume": f"{u_vol} m³ Solid Volume",
                    "uds": f"{u_uds}% Undivided Land Share",
                    "tenure": "Freehold Stratum Estate (Unit Titles Act 2010)",
                    "titleRef": f"LINZ NA{400000 + bldg_counter}/{lvl}{u_idx:02d}",
                    "airRights": f"Vertical column {fl_base}m to {fl_roof}m MSL",
                    "floorLevel": f"Level {lvl:02d}",
                    "elevation": f"{fl_base} - {fl_roof} m MSL",
                    "coordinates": f"{c_lat:.5f}° S, {c_lon:.5f}° E, +{fl_base:.1f}m Z",
                }
                units_on_floor.append(unit_obj)

                # Insert into DB
                cur.execute("""
                    INSERT INTO units (
                        id, building_id, floor_id, unit_number, name, ulpin,
                        owner_name, carpet_area, builtup_area, volume, uds, tenure,
                        title_ref, air_rights, status, coordinates, latitude, longitude, elevation_msl
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    u_id, b_id, fl_id, unit_num, unit_obj["name"], u_ulpin,
                    u_owner, unit_obj["area"], unit_obj["builtupArea"], unit_obj["volume"],
                    unit_obj["uds"], unit_obj["tenure"], unit_obj["titleRef"],
                    unit_obj["airRights"], "Verified", unit_obj["coordinates"],
                    c_lat, c_lon, fl_base
                ))

            floor_obj = {
                "id": fl_id,
                "buildingId": b_id,
                "level": f"F{lvl:02d}",
                "name": fl_name,
                "elevation": f"{fl_base} - {fl_roof} m MSL",
                "baseElevation": fl_base,
                "roofElevation": fl_roof,
                "type": fl_type,
                "units": units_on_floor
            }
            floors.append(floor_obj)

            # Insert floor into DB
            cur.execute("""
                INSERT INTO floors (
                    id, building_id, level, name, elevation_range, base_elevation,
                    roof_elevation, floor_type, units_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                fl_id, b_id, floor_obj["level"], fl_name, floor_obj["elevation"],
                fl_base, fl_roof, fl_type, len(units_on_floor)
            ))

        # Insert building into DB
        polygon_json_str = json.dumps(outer_ring)
        cur.execute("""
            INSERT INTO buildings (
                id, region_id, name, short_label, address, floors_count, height_m,
                base_elevation_msl, roof_elevation_msl, units_count, structure_type,
                construction_year, body_corporate, polygon_geojson
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            b_id, "auckland", display_name, short_label, address, levels, height_m,
            base_msl, roof_msl, units_count, f"{b_type.capitalize()} Structure ({levels} Storeys)",
            random.randint(1995, 2023), f"Body Corporate BC-{500000 + bldg_counter}", polygon_json_str
        ))

        bldg_record = {
            "id": b_id,
            "name": display_name,
            "shortLabel": short_label,
            "address": address,
            "floorsCount": levels,
            "heightM": height_m,
            "baseElevationMsl": base_msl,
            "roofElevationMsl": roof_msl,
            "unitsCount": units_count,
            "structureType": f"{b_type.capitalize()} ({levels} Storeys)",
            "constructionYear": random.randint(1995, 2023),
            "bodyCorporate": f"Body Corporate BC-{500000 + bldg_counter} (LINZ)",
            "polygon": outer_ring,
            "centroid": [round(c_lon, 6), round(c_lat, 6)],
            "floors": floors
        }
        processed_buildings.append(bldg_record)

        # GeoJSON feature
        processed_geojson_features.append({
            "type": "Feature",
            "id": b_id,
            "properties": {
                "id": b_id,
                "name": display_name,
                "floors": levels,
                "height_m": height_m,
                "base_elevation_msl": base_msl,
                "roof_elevation_msl": roof_msl,
                "ulpin": ulpin,
                "structure_type": b_type,
                "units_count": units_count,
            },
            "geometry": geom
        })

    conn.commit()
    conn.close()

    print(f"Successfully ingested {len(processed_buildings)} buildings into data/cadastre.db!")

    # Write out client-side full JSON dataset for fast frontend loading
    frontend_out = "frontend/src/data/auckland_buildings_full.json"
    os.makedirs(os.path.dirname(frontend_out), exist_ok=True)
    with open(frontend_out, "w", encoding="utf-8") as f:
        json.dump(processed_buildings, f)
    print(f"Saved {frontend_out} ({round(os.path.getsize(frontend_out) / 1024, 1)} KB)")

    # Save complete GeoJSON layer
    geojson_out = "data/samples/auckland_buildings.geojson"
    with open(geojson_out, "w", encoding="utf-8") as f:
        json.dump({
            "type": "FeatureCollection",
            "name": "auckland_all_buildings_3d",
            "features": processed_geojson_features
        }, f)
    print(f"Saved {geojson_out}")

if __name__ == "__main__":
    ingest_all_buildings()
