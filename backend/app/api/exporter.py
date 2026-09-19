import os
import sqlite3
import json
import xml.etree.ElementTree as ET
from xml.dom import minidom
from fastapi import APIRouter, Query, HTTPException, Response
from typing import Optional

router = APIRouter(
    prefix="/api/export",
    tags=["3D Cadastre Exporter"]
)

def get_sqlite_conn():
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "cadastre.db"))
    return sqlite3.connect(db_path)

def build_citygml_xml(building_data: dict) -> str:
    """
    Generates compliant OGC CityGML 2.0 LoD2 XML for the 3D Building & Units.
    """
    city_model = ET.Element('core:CityModel', {
        'xmlns:core': 'http://www.opengis.net/citygml/2.0',
        'xmlns:bldg': 'http://www.opengis.net/citygml/building/2.0',
        'xmlns:gml': 'http://www.opengis.net/gml',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'xsi:schemaLocation': 'http://www.opengis.net/citygml/building/2.0 http://schemas.opengis.net/citygml/building/2.0/building.xsd'
    })

    # Metadata
    city_object_member = ET.SubElement(city_model, 'core:cityObjectMember')
    bldg = ET.SubElement(city_object_member, 'bldg:Building', {'gml:id': building_data.get('id', 'bldg-01')})
    
    ET.SubElement(bldg, 'gml:name').text = building_data.get('name', 'Urban 3D Cadastral Building')
    ET.SubElement(bldg, 'bldg:class').text = '1000' # Residential / Multi-Unit High-Rise
    ET.SubElement(bldg, 'bldg:function').text = '1001' # Stratum Multi-Storey Title
    ET.SubElement(bldg, 'bldg:storeysAboveGround').text = str(building_data.get('total_storeys', 1))
    ET.SubElement(bldg, 'bldg:measuredHeight', {'uom': 'urn:ogc:def:uom:UCUM::m'}).text = str(
        round((building_data.get('roof_elevation', 100) - building_data.get('base_elevation', 0)), 2)
    )

    # Building Footprint Coords
    polygon = building_data.get('polygon', [])
    if not polygon and building_data.get('polygon_geojson'):
        polygon = json.loads(building_data['polygon_geojson'])

    base_z = building_data.get('base_elevation', 10.0)
    roof_z = building_data.get('roof_elevation', 100.0)

    # LoD2 Solid Exterior Ground Surface
    lod2_solid = ET.SubElement(bldg, 'bldg:lod2Solid')
    solid = ET.SubElement(lod2_solid, 'gml:Solid')
    exterior = ET.SubElement(solid, 'gml:exterior')
    comp_surface = ET.SubElement(exterior, 'gml:CompositeSurface')

    if polygon and len(polygon) >= 3:
        # Base Polygon
        sm_base = ET.SubElement(comp_surface, 'gml:surfaceMember')
        poly_base = ET.SubElement(sm_base, 'gml:Polygon', {'gml:id': f"{building_data.get('id')}-ground-poly"})
        ext_base = ET.SubElement(poly_base, 'gml:exterior')
        lr_base = ET.SubElement(ext_base, 'gml:LinearRing')
        pos_list_base = ET.SubElement(lr_base, 'gml:posList', {'srsDimension': '3'})
        coords_base = " ".join([f"{pt[0]} {pt[1]} {base_z}" for pt in polygon] + [f"{polygon[0][0]} {polygon[0][1]} {base_z}"])
        pos_list_base.text = coords_base

        # Roof Polygon
        sm_roof = ET.SubElement(comp_surface, 'gml:surfaceMember')
        poly_roof = ET.SubElement(sm_roof, 'gml:Polygon', {'gml:id': f"{building_data.get('id')}-roof-poly"})
        ext_roof = ET.SubElement(poly_roof, 'gml:exterior')
        lr_roof = ET.SubElement(ext_roof, 'gml:LinearRing')
        pos_list_roof = ET.SubElement(lr_roof, 'gml:posList', {'srsDimension': '3'})
        coords_roof = " ".join([f"{pt[0]} {pt[1]} {roof_z}" for pt in polygon] + [f"{polygon[0][0]} {polygon[0][1]} {roof_z}"])
        pos_list_roof.text = coords_roof

    # Add Building Parts (Floors & Units)
    for floor in building_data.get('floors', []):
        f_base = floor.get('base_elevation', base_z)
        f_top = floor.get('roof_elevation', f_base + 3.0)
        
        for unit in floor.get('units', []):
            part_member = ET.SubElement(bldg, 'bldg:consistsOfBuildingPart')
            part = ET.SubElement(part_member, 'bldg:BuildingPart', {'gml:id': unit.get('id', 'unit-01')})
            ET.SubElement(part, 'gml:name').text = f"Unit {unit.get('unit_number')} ({unit.get('name')})"
            ET.SubElement(part, 'bldg:function').text = f"3D_ULPIN:{unit.get('ulpin')}"
            ET.SubElement(part, 'bldg:storeyHeightsAboveGround', {'uom': 'm'}).text = f"{f_base} - {f_top}"

    xml_str = ET.tostring(city_model, encoding='utf-8')
    parsed_xml = minidom.parseString(xml_str)
    return parsed_xml.toprettyxml(indent="  ")

def build_3d_geojson(building_data: dict) -> dict:
    """
    Generates 3D RFC 7946 GeoJSON with [lon, lat, height_msl] coordinates.
    """
    features = []
    polygon = building_data.get('polygon', [])
    if not polygon and building_data.get('polygon_geojson'):
        polygon = json.loads(building_data['polygon_geojson'])

    base_z = building_data.get('base_elevation', 10.0)
    roof_z = building_data.get('roof_elevation', 100.0)

    # 1. Building Envelope (Base & Roof Footprint 3D)
    if polygon:
        ring_base = [[pt[0], pt[1], base_z] for pt in polygon] + [[polygon[0][0], polygon[0][1], base_z]]
        ring_roof = [[pt[0], pt[1], roof_z] for pt in polygon] + [[polygon[0][0], polygon[0][1], roof_z]]

        features.append({
            "type": "Feature",
            "id": building_data.get("id"),
            "geometry": {
                "type": "Polygon",
                "coordinates": [ring_base]
            },
            "properties": {
                "entityType": "BuildingEnvelopeBase",
                "name": building_data.get("name"),
                "ulpin": building_data.get("ulpin"),
                "baseElevationMsl": base_z,
                "roofElevationMsl": roof_z,
                "totalStoreys": building_data.get("total_storeys"),
                "heightMeters": round(roof_z - base_z, 2),
                "ladmClass": "LA_LegalSpaceBuildingUnit"
            }
        })
        features.append({
            "type": "Feature",
            "id": f"{building_data.get('id')}-roof",
            "geometry": {
                "type": "Polygon",
                "coordinates": [ring_roof]
            },
            "properties": {
                "entityType": "BuildingEnvelopeRoof",
                "name": f"{building_data.get('name')} (Roof Plate)",
                "elevationMsl": roof_z
            }
        })

    # 2. Individual Units 3D Solids
    for floor in building_data.get("floors", []):
        f_base = floor.get("base_elevation", base_z)
        f_top = floor.get("roof_elevation", f_base + 3.0)

        for u_idx, unit in enumerate(floor.get("units", [])):
            # If footprint exists, create unit polygon quadrant
            if polygon and len(polygon) >= 4:
                p0, p1, p2, p3 = polygon[0], polygon[1], polygon[2], polygon[3]
                mid_x = (p0[0] + p1[0] + p2[0] + p3[0]) / 4
                mid_y = (p0[1] + p1[1] + p2[1] + p3[1]) / 4
                
                # Create unit footprint polygon slice
                u_ring = [
                    [p0[0], p0[1], f_base],
                    [mid_x, p0[1], f_base],
                    [mid_x, mid_y, f_base],
                    [p0[0], mid_y, f_base],
                    [p0[0], p0[1], f_base]
                ]
            else:
                u_ring = [[0, 0, f_base], [0.001, 0, f_base], [0.001, 0.001, f_base], [0, 0, f_base]]

            features.append({
                "type": "Feature",
                "id": unit.get("id"),
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [u_ring]
                },
                "properties": {
                    "entityType": "3DUnitTitle",
                    "unitNumber": unit.get("unit_number"),
                    "name": unit.get("name"),
                    "ulpin": unit.get("ulpin"),
                    "ownerName": unit.get("owner_name"),
                    "floorLevel": floor.get("floor_level"),
                    "carpetAreaSqm": unit.get("carpet_area_sqm"),
                    "builtupAreaSqm": unit.get("builtup_area_sqm"),
                    "solidVolumeM3": unit.get("volume_m3") or round(unit.get("carpet_area_sqm", 80) * 3.0, 2),
                    "udsPercentage": unit.get("uds_percentage"),
                    "baseElevationMsl": f_base,
                    "roofElevationMsl": f_top,
                    "titleType": unit.get("tenure_type", "Freehold Stratum Estate"),
                    "ladmClass": "LA_BAUnit"
                }
            })

    return {
        "type": "FeatureCollection",
        "name": f"3D_Cadastre_{building_data.get('id')}",
        "crs": {
            "type": "name",
            "properties": {
                "name": "urn:ogc:def:crs:EPSG::4979"  # 3D WGS84 Geographic 3D
            }
        },
        "features": features
    }

@router.get("/building/{building_id}")
def export_building(
    building_id: str,
    format: str = Query("citygml", description="Export format: 'citygml' or 'geojson3d'")
):
    conn = get_sqlite_conn()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    cur.execute("SELECT * FROM buildings WHERE id = ?", (building_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Building not found for 3D export")
        
    b_dict = dict(row)
    if b_dict.get("polygon_geojson"):
        b_dict["polygon"] = json.loads(b_dict["polygon_geojson"])
        
    cur.execute("SELECT * FROM floors WHERE building_id = ? ORDER BY base_elevation ASC", (building_id,))
    floor_rows = cur.fetchall()
    floors = []
    for f in floor_rows:
        f_dict = dict(f)
        cur.execute("SELECT * FROM units WHERE floor_id = ?", (f["id"],))
        unit_rows = cur.fetchall()
        f_dict["units"] = [dict(u) for u in unit_rows]
        floors.append(f_dict)
        
    b_dict["floors"] = floors
    conn.close()

    if format.lower() == "citygml":
        xml_content = build_citygml_xml(b_dict)
        return Response(
            content=xml_content,
            media_type="application/xml",
            headers={
                "Content-Disposition": f'attachment; filename="{building_id}_CityGML_LoD2.gml"'
            }
        )
    elif format.lower() == "geojson3d":
        geojson_data = build_3d_geojson(b_dict)
        return Response(
            content=json.dumps(geojson_data, indent=2),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="{building_id}_3D_Cadastre.geojson"'
            }
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Supported formats: 'citygml', 'geojson3d'")
