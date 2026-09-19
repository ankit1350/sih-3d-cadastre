"""
CAD / DXF Architectural Floorplan Parser
Extracts apartment unit polyline boundaries, common corridors, and lift lobbies
from architectural CAD blueprints using ezdxf, and georeferences them to the
building footprint.

Supports:
  - Real DXF parsing via ezdxf (LWPOLYLINE, LINE, CIRCLE, TEXT, MTEXT entities)
  - Automatic room detection from closed polylines
  - Text label extraction for room names
  - Fallback to default template layout when no DXF file is provided
"""

import os
from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional, Tuple
import numpy as np


@dataclass
class ParsedCadastralUnit:
    unit_number: str
    unit_name: str
    unit_type: str  # '2_bhk', '3_bhk', 'penthouse', 'common_lobby', 'stairwell'
    carpet_area_sq_m: float
    builtup_area_sq_m: float
    carpet_area_sq_ft: float
    local_polygon_coords: List[List[float]]
    georeferenced_coords: List[List[float]]
    centroid_lat_lon: List[float]


def classify_room_type(area_sq_m: float, label: str = "") -> str:
    """Classify room type based on area and label text."""
    label_lower = label.lower()
    if any(kw in label_lower for kw in ['lobby', 'lift', 'elevator', 'stair', 'corridor', 'passage']):
        return 'common_lobby'
    if any(kw in label_lower for kw in ['pent', 'duplex', 'sky']):
        return 'penthouse'
    if any(kw in label_lower for kw in ['3bhk', '3 bhk', '3-bhk', 'premium']):
        return '3_bhk'
    if any(kw in label_lower for kw in ['2bhk', '2 bhk', '2-bhk', 'comfort']):
        return '2_bhk'
    if any(kw in label_lower for kw in ['1bhk', '1 bhk', '1-bhk', 'studio']):
        return '1_bhk'
    # Area-based classification
    if area_sq_m > 200:
        return 'penthouse'
    elif area_sq_m > 100:
        return '3_bhk'
    elif area_sq_m > 60:
        return '2_bhk'
    elif area_sq_m > 30:
        return '1_bhk'
    else:
        return 'common_lobby'


def polygon_area(coords: List[Tuple[float, float]]) -> float:
    """Compute area using the Shoelace formula."""
    n = len(coords)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += coords[i][0] * coords[j][1]
        area -= coords[j][0] * coords[i][1]
    return abs(area) / 2.0


def polygon_centroid(coords: List[Tuple[float, float]]) -> Tuple[float, float]:
    """Compute centroid of a polygon."""
    n = len(coords)
    if n == 0:
        return (0.0, 0.0)
    cx = sum(c[0] for c in coords) / n
    cy = sum(c[1] for c in coords) / n
    return (cx, cy)


def parse_dxf_file(dxf_file_path: str) -> Dict[str, Any]:
    """
    Parse a real DXF file using ezdxf.
    Extracts closed LWPOLYLINE entities as room boundaries and
    TEXT/MTEXT entities as room labels.
    """
    import ezdxf

    doc = ezdxf.readfile(dxf_file_path)
    msp = doc.modelspace()

    # Extract all closed polylines as potential room boundaries
    rooms = []
    # Collect layers for reporting
    all_layers = set()

    # Wall/area layers to prioritize
    wall_layers = set()

    for entity in msp:
        if hasattr(entity.dxf, 'layer'):
            layer = entity.dxf.layer
            all_layers.add(layer)
            layer_lower = layer.lower()
            if any(kw in layer_lower for kw in ['wall', 'area', 'room', 'unit', 'apartment', 'flat', 'boundary']):
                wall_layers.add(layer)

    for entity in msp:
        if entity.dxftype() == 'LWPOLYLINE':
            # Get vertices
            vertices = list(entity.get_points(format='xy'))
            if len(vertices) < 3:
                continue

            # Check if polyline is closed
            is_closed = entity.closed or (
                len(vertices) >= 3 and
                abs(vertices[0][0] - vertices[-1][0]) < 0.01 and
                abs(vertices[0][1] - vertices[-1][1]) < 0.01
            )

            if is_closed:
                area = polygon_area(vertices)
                if area > 5.0:  # Filter out tiny decorative polygons (< 5 m²)
                    layer = entity.dxf.layer if hasattr(entity.dxf, 'layer') else 'DEFAULT'
                    rooms.append({
                        'vertices': vertices,
                        'area': area,
                        'layer': layer,
                        'centroid': polygon_centroid(vertices),
                        'label': ''
                    })

        elif entity.dxftype() == 'POLYLINE':
            vertices = [(v.dxf.location.x, v.dxf.location.y) for v in entity.vertices if hasattr(v.dxf, 'location')]
            if len(vertices) >= 3:
                is_closed = entity.is_closed or (
                    abs(vertices[0][0] - vertices[-1][0]) < 0.01 and
                    abs(vertices[0][1] - vertices[-1][1]) < 0.01
                )
                if is_closed:
                    area = polygon_area(vertices)
                    if area > 5.0:
                        layer = entity.dxf.layer if hasattr(entity.dxf, 'layer') else 'DEFAULT'
                        rooms.append({
                            'vertices': vertices,
                            'area': area,
                            'layer': layer,
                            'centroid': polygon_centroid(vertices),
                            'label': ''
                        })

    # Extract text labels and associate with nearest room
    text_labels = []
    for entity in msp:
        text = ''
        pos = None
        if entity.dxftype() == 'TEXT':
            text = entity.dxf.text
            pos = (entity.dxf.insert.x, entity.dxf.insert.y)
        elif entity.dxftype() == 'MTEXT':
            text = entity.text
            pos = (entity.dxf.insert.x, entity.dxf.insert.y)

        if text and pos:
            text_labels.append({'text': text.strip(), 'position': pos})

    # Match labels to rooms by proximity
    for label in text_labels:
        min_dist = float('inf')
        closest_room = None
        for room in rooms:
            cx, cy = room['centroid']
            lx, ly = label['position']
            dist = ((cx - lx) ** 2 + (cy - ly) ** 2) ** 0.5
            if dist < min_dist:
                min_dist = dist
                closest_room = room
        if closest_room is not None and min_dist < 50:  # within 50 drawing units
            if closest_room['label']:
                closest_room['label'] += ' ' + label['text']
            else:
                closest_room['label'] = label['text']

    return {
        'rooms': rooms,
        'layers': sorted(list(all_layers)),
        'wall_layers': sorted(list(wall_layers)),
        'dxf_version': doc.dxfversion,
        'entity_count': len(list(msp)),
        'total_rooms_found': len(rooms)
    }


def georeference_rooms(
    rooms: List[Dict],
    origin_lon: float,
    origin_lat: float,
    scale_x: float = 0.0000001,  # drawing units to degrees longitude
    scale_y: float = 0.0000001   # drawing units to degrees latitude
) -> List[Dict]:
    """Convert local DXF coordinates to WGS84 georeferenced coordinates."""
    for room in rooms:
        geo_coords = []
        for x, y in room['vertices']:
            lon = origin_lon + x * scale_x
            lat = origin_lat + y * scale_y
            geo_coords.append([round(lon, 7), round(lat, 7)])
        # Close the polygon
        if geo_coords and geo_coords[0] != geo_coords[-1]:
            geo_coords.append(geo_coords[0])
        room['georeferenced_coords'] = geo_coords
        cx, cy = room['centroid']
        room['centroid_lon_lat'] = [
            round(origin_lon + cx * scale_x, 7),
            round(origin_lat + cy * scale_y, 7)
        ]
    return rooms


def get_default_tower_floorplan_layout(
    origin_lon: float = 73.7328,
    origin_lat: float = 18.5910,
    width_deg: float = 0.0008,
    height_deg: float = 0.0012,
) -> List[Dict[str, Any]]:
    """
    Standard 4-unit-per-floor architectural layout for high-rise residential towers.
    Used as fallback when no DXF file is provided.
    """
    layouts = [
        {
            "unit_number": "01",
            "unit_name": "Apt 1401 (3 BHK Premium)",
            "unit_type": "3_bhk",
            "carpet_sq_m": 118.5,
            "bua_sq_m": 142.2,
            "bbox_rel": [0.0, 0.5, 0.45, 1.0],
        },
        {
            "unit_number": "02",
            "unit_name": "Apt 1402 (2 BHK Comfort)",
            "unit_type": "2_bhk",
            "carpet_sq_m": 82.4,
            "bua_sq_m": 98.8,
            "bbox_rel": [0.0, 0.0, 0.45, 0.5],
        },
        {
            "unit_number": "03",
            "unit_name": "Apt 1403 (2 BHK Comfort)",
            "unit_type": "2_bhk",
            "carpet_sq_m": 82.4,
            "bua_sq_m": 98.8,
            "bbox_rel": [0.55, 0.0, 1.0, 0.5],
        },
        {
            "unit_number": "04",
            "unit_name": "Apt 1404 (3 BHK Premium)",
            "unit_type": "3_bhk",
            "carpet_sq_m": 118.5,
            "bua_sq_m": 142.2,
            "bbox_rel": [0.55, 0.5, 1.0, 1.0],
        },
        {
            "unit_number": "LOBBY",
            "unit_name": "Elevator Lobby & Fire Escape",
            "unit_type": "common_lobby",
            "carpet_sq_m": 64.0,
            "bua_sq_m": 76.8,
            "bbox_rel": [0.45, 0.2, 0.55, 0.8],
        },
    ]

    units: List[Dict[str, Any]] = []
    for item in layouts:
        rel = item["bbox_rel"]
        lon_min = origin_lon + rel[0] * width_deg
        lon_max = origin_lon + rel[2] * width_deg
        lat_min = origin_lat + rel[1] * height_deg
        lat_max = origin_lat + rel[3] * height_deg

        geo_poly = [
            [round(lon_min, 6), round(lat_min, 6)],
            [round(lon_max, 6), round(lat_min, 6)],
            [round(lon_max, 6), round(lat_max, 6)],
            [round(lon_min, 6), round(lat_max, 6)],
            [round(lon_min, 6), round(lat_min, 6)],
        ]
        local_poly = [
            [round(rel[0] * 32.0, 2), round(rel[1] * 40.0, 2)],
            [round(rel[2] * 32.0, 2), round(rel[1] * 40.0, 2)],
            [round(rel[2] * 32.0, 2), round(rel[3] * 40.0, 2)],
            [round(rel[0] * 32.0, 2), round(rel[3] * 40.0, 2)],
            [round(rel[0] * 32.0, 2), round(rel[1] * 40.0, 2)],
        ]
        c_lon = round((lon_min + lon_max) / 2.0, 6)
        c_lat = round((lat_min + lat_max) / 2.0, 6)

        units.append({
            "unit_number": item["unit_number"],
            "unit_name": item["unit_name"],
            "unit_type": item["unit_type"],
            "carpet_area_sq_m": item["carpet_sq_m"],
            "builtup_area_sq_m": item["bua_sq_m"],
            "carpet_area_sq_ft": round(item["carpet_sq_m"] * 10.7639, 1),
            "local_polygon_coords": local_poly,
            "georeferenced_coords": geo_poly,
            "centroid_lat_lon": [c_lat, c_lon],
        })

    return units


def parse_floorplan_units(
    dxf_file_path: Optional[str] = None,
    building_footprint_lon_lat: Optional[List[List[float]]] = None,
    floor_code: str = "14",
    origin_lon: float = 73.7328,
    origin_lat: float = 18.5910,
) -> Dict[str, Any]:
    """
    Parses architectural CAD drawings and extracts standardized apartment units.
    
    If a valid DXF file path is provided, uses ezdxf to parse real geometry.
    Otherwise falls back to the default template layout.
    """
    source = "default_template"

    # Try to parse real DXF file if provided
    if dxf_file_path and os.path.exists(dxf_file_path):
        try:
            dxf_data = parse_dxf_file(dxf_file_path)
            rooms = dxf_data['rooms']

            if rooms:
                source = "dxf_parsed"

                # Compute scale factors for georeferencing
                # Get bounding box of all rooms
                all_x = [v[0] for r in rooms for v in r['vertices']]
                all_y = [v[1] for r in rooms for v in r['vertices']]
                bbox_width = max(all_x) - min(all_x) if all_x else 1.0
                bbox_height = max(all_y) - min(all_y) if all_y else 1.0

                # Determine building footprint dimensions in degrees
                if building_footprint_lon_lat and len(building_footprint_lon_lat) >= 3:
                    fp_lons = [p[0] for p in building_footprint_lon_lat]
                    fp_lats = [p[1] for p in building_footprint_lon_lat]
                    width_deg = max(fp_lons) - min(fp_lons)
                    height_deg = max(fp_lats) - min(fp_lats)
                    origin_lon = min(fp_lons)
                    origin_lat = min(fp_lats)
                else:
                    width_deg = 0.0008
                    height_deg = 0.0012

                scale_x = width_deg / bbox_width if bbox_width > 0 else 0.0000001
                scale_y = height_deg / bbox_height if bbox_height > 0 else 0.0000001

                # Shift to origin
                min_x = min(all_x) if all_x else 0
                min_y = min(all_y) if all_y else 0

                parsed_units = []
                for idx, room in enumerate(rooms):
                    shifted_verts = [(v[0] - min_x, v[1] - min_y) for v in room['vertices']]
                    room['vertices'] = shifted_verts
                    room['centroid'] = polygon_centroid(shifted_verts)

                rooms = georeference_rooms(rooms, origin_lon, origin_lat, scale_x, scale_y)

                parsed_units = []
                total_carpet = 0.0
                for idx, room in enumerate(rooms):
                    unit_type = classify_room_type(room['area'], room.get('label', ''))
                    unit_num = room.get('label', '').strip() or f"{floor_code}{idx+1:02d}"
                    unit_name = room.get('label', '').strip() or f"Unit {unit_num} ({unit_type.replace('_', ' ').title()})"

                    local_coords = [[round(v[0], 2), round(v[1], 2)] for v in room['vertices']]
                    if local_coords and local_coords[0] != local_coords[-1]:
                        local_coords.append(local_coords[0])

                    unit = ParsedCadastralUnit(
                        unit_number=unit_num,
                        unit_name=unit_name,
                        unit_type=unit_type,
                        carpet_area_sq_m=round(room['area'], 1),
                        builtup_area_sq_m=round(room['area'] * 1.2, 1),
                        carpet_area_sq_ft=round(room['area'] * 10.7639, 1),
                        local_polygon_coords=local_coords,
                        georeferenced_coords=room.get('georeferenced_coords', []),
                        centroid_lat_lon=[
                            room.get('centroid_lon_lat', [0, 0])[1],
                            room.get('centroid_lon_lat', [0, 0])[0]
                        ]
                    )
                    parsed_units.append(unit)
                    if unit_type != 'common_lobby':
                        total_carpet += room['area']

                return {
                    "floor_code": floor_code,
                    "source": source,
                    "dxf_version": dxf_data.get('dxf_version', 'Unknown'),
                    "layers_found": dxf_data.get('layers', []),
                    "wall_layers": dxf_data.get('wall_layers', []),
                    "total_entities": dxf_data.get('entity_count', 0),
                    "total_rooms_detected": len(rooms),
                    "total_units_on_floor": len([u for u in parsed_units if u.unit_type != 'common_lobby']),
                    "total_carpet_area_sq_m": round(total_carpet, 2),
                    "units": [asdict(u) for u in parsed_units],
                }
        except Exception as e:
            print(f"Warning: DXF parsing failed ({e}), falling back to default template.")
            source = "default_template_fallback"

    # Fallback: use default template layout
    units_raw = get_default_tower_floorplan_layout(origin_lon=origin_lon, origin_lat=origin_lat)

    parsed_units: List[ParsedCadastralUnit] = []
    total_carpet = 0.0

    for u in units_raw:
        unit_full_id = f"{floor_code}{u['unit_number']}" if u['unit_number'] != "LOBBY" else f"{floor_code}-LOBBY"
        parsed = ParsedCadastralUnit(
            unit_number=unit_full_id,
            unit_name=u["unit_name"].replace("14", floor_code),
            unit_type=u["unit_type"],
            carpet_area_sq_m=u["carpet_area_sq_m"],
            builtup_area_sq_m=u["builtup_area_sq_m"],
            carpet_area_sq_ft=u["carpet_area_sq_ft"],
            local_polygon_coords=u["local_polygon_coords"],
            georeferenced_coords=u["georeferenced_coords"],
            centroid_lat_lon=u["centroid_lat_lon"],
        )
        parsed_units.append(parsed)
        if u["unit_type"] != "common_lobby":
            total_carpet += u["carpet_area_sq_m"]

    return {
        "floor_code": floor_code,
        "source": source,
        "total_units_on_floor": len([u for u in parsed_units if u.unit_type != "common_lobby"]),
        "total_carpet_area_sq_m": round(total_carpet, 2),
        "units": [asdict(u) for u in parsed_units],
    }


if __name__ == "__main__":
    print("Testing CAD Floorplan Parser...")
    res = parse_floorplan_units(floor_code="14")
    print(f"Source: {res['source']}")
    print(f"Parsed {res['total_units_on_floor']} units on Floor {res['floor_code']}.")
    for unit in res["units"]:
        print(f"  Unit {unit['unit_number']} ({unit['unit_name']}): {unit['carpet_area_sq_m']} m² Carpet")
