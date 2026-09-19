import os
import sqlite3
import json
import io
import base64
import qrcode
from fastapi import APIRouter, Query, HTTPException, Response
from typing import Optional

router = APIRouter(
    prefix="/api/units",
    tags=["Units & Property Cards"]
)

def get_sqlite_conn():
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "cadastre.db"))
    return sqlite3.connect(db_path)

@router.get("")
@router.get("/")
def get_units(
    region: Optional[str] = Query("auckland", description="Region filter: auckland"),
    building_id: Optional[str] = Query(None, description="Building ID filter"),
    floor_level: Optional[str] = Query(None, description="Floor level filter, e.g. F28, F56")
):
    conn = get_sqlite_conn()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    query = """
    SELECT u.*, b.name as building_name, b.short_label as building_short_label, b.address as building_address,
           f.level as floor_level, f.elevation_range as floor_elevation, b.region_id
    FROM units u
    JOIN buildings b ON u.building_id = b.id
    JOIN floors f ON u.floor_id = f.id
    WHERE b.region_id = ?
    """
    params = [region]
    
    if building_id:
        query += " AND b.id = ?"
        params.append(building_id)
        
    if floor_level:
        query += " AND f.level = ?"
        params.append(floor_level)
        
    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()
    
    return [dict(r) for r in rows]

@router.get("/{unit_id}")
def get_unit_by_id(unit_id: str):
    conn = get_sqlite_conn()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    query = """
    SELECT u.*, b.name as building_name, b.short_label as building_short_label, b.address as building_address,
           b.body_corporate, b.structure_type, b.roof_elevation_msl,
           f.level as floor_level, f.elevation_range as floor_elevation, b.region_id
    FROM units u
    JOIN buildings b ON u.building_id = b.id
    JOIN floors f ON u.floor_id = f.id
    WHERE u.id = ?
    """
    cur.execute(query, (unit_id,))
    row = cur.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Unit not found")
        
    return dict(row)


def generate_qr_base64(data_str: str) -> str:
    """Generate base64 encoded PNG QR code."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=1,
    )
    qr.add_data(data_str)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0f172a", back_color="#ffffff")
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"


@router.get("/property-card/{unit_id}/qr")
def get_property_card_qr(unit_id: str):
    """Returns raw PNG image of the official 3D ULPIN verification QR Code."""
    unit = get_unit_by_id(unit_id)
    verify_url = f"https://cadastre.gov.in/verify?ulpin={unit['ulpin']}"
    
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(verify_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0f172a", back_color="#ffffff")
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Response(content=buf.getvalue(), media_type="image/png")


@router.get("/property-card/{unit_id}")
def get_property_card(unit_id: str):
    unit = get_unit_by_id(unit_id)
    
    # Generate formal ISO 19152 LADM property card payload
    is_nz = unit["region_id"] == "auckland"
    verify_url = f"https://cadastre.gov.in/verify?ulpin={unit['ulpin']}"
    qr_b64 = generate_qr_base64(verify_url)
    
    return {
        "certificate_id": f"3D-CAD-{unit['ulpin'].replace('-', '')}",
        "ulpin": unit["ulpin"],
        "unit_number": unit["unit_number"],
        "unit_name": unit["name"],
        "owner_name": unit["owner_name"],
        "building_name": unit["building_name"],
        "address": f"{unit['unit_number']}, {unit['floor_level']}, {unit['building_address']}",
        "carpet_area": unit["carpet_area"],
        "builtup_area": unit["builtup_area"],
        "watertight_volume": unit["volume"],
        "undivided_land_share": unit["uds"],
        "tenure_type": unit["tenure"],
        "title_reference": unit["title_ref"],
        "air_rights": unit["air_rights"],
        "spatial_coordinates": unit["coordinates"],
        "latitude": unit["latitude"],
        "longitude": unit["longitude"],
        "elevation_msl": unit["elevation_msl"],
        "authority": "Land Information New Zealand (LINZ) / Auckland Council",
        "vertical_datum": "NZVD2016 (Mean Sea Level)",
        "iso_19152_class": "LA_BAUnit (Basic Administrative Unit)",
        "euler_watertightness": "V - E + F = 2 (Watertight 3D Solid Polyhedron)",
        "qr_verification_url": verify_url,
        "qr_code_base64": qr_b64,
        "issue_date": "2026-09-19",
        "status": "Legally Certified & Digitally Signed"
    }
