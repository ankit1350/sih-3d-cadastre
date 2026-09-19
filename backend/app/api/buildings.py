import os
import sqlite3
import json
from fastapi import APIRouter, Query, HTTPException
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.database import get_db
from app.models.building import Building

router = APIRouter(
    prefix="/api/buildings",
    tags=["Buildings"]
)

def get_sqlite_conn():
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "cadastre.db"))
    return sqlite3.connect(db_path)

@router.get("")
@router.get("/")
def get_buildings(region: Optional[str] = Query("auckland", description="Region filter: auckland")):
    conn = get_sqlite_conn()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    cur.execute("SELECT * FROM buildings WHERE region_id = ?", (region,))
    rows = cur.fetchall()
    
    buildings_list = []
    for r in rows:
        b_dict = dict(r)
        if b_dict.get("polygon_geojson"):
            b_dict["polygon"] = json.loads(b_dict["polygon_geojson"])
            
        # Fetch floors for this building
        cur.execute("SELECT * FROM floors WHERE building_id = ? ORDER BY base_elevation DESC", (r["id"],))
        floor_rows = cur.fetchall()
        floors = []
        for f in floor_rows:
            f_dict = dict(f)
            # Fetch units for floor
            cur.execute("SELECT * FROM units WHERE floor_id = ?", (f["id"],))
            unit_rows = cur.fetchall()
            f_dict["units"] = [dict(u) for u in unit_rows]
            floors.append(f_dict)
            
        b_dict["floors"] = floors
        buildings_list.append(b_dict)
        
    conn.close()
    return buildings_list

@router.get("/{building_id}")
def get_building_by_id(building_id: str):
    conn = get_sqlite_conn()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    cur.execute("SELECT * FROM buildings WHERE id = ?", (building_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Building not found")
        
    b_dict = dict(row)
    if b_dict.get("polygon_geojson"):
        b_dict["polygon"] = json.loads(b_dict["polygon_geojson"])
        
    cur.execute("SELECT * FROM floors WHERE building_id = ? ORDER BY base_elevation DESC", (building_id,))
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
    return b_dict