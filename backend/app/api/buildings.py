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
def get_buildings(
    region: Optional[str] = Query("auckland", description="Region filter: auckland"),
    limit: Optional[int] = Query(None, description="Max buildings to return (default all)")
):
    conn = get_sqlite_conn()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    query = "SELECT * FROM buildings WHERE region_id = ?"
    params = [region]
    if limit:
        query += " LIMIT ?"
        params.append(limit)
        
    cur.execute(query, params)
    rows = cur.fetchall()
    
    # Batch fetch all floors and units in 2 queries
    cur.execute("SELECT * FROM floors ORDER BY base_elevation DESC")
    all_floors = cur.fetchall()
    
    cur.execute("SELECT * FROM units")
    all_units = cur.fetchall()
    conn.close()

    # Index units by floor_id
    units_by_floor = {}
    for u in all_units:
        u_dict = dict(u)
        f_id = u_dict.get("floor_id")
        if f_id not in units_by_floor:
            units_by_floor[f_id] = []
        units_by_floor[f_id].append(u_dict)

    # Index floors by building_id
    floors_by_bldg = {}
    for f in all_floors:
        f_dict = dict(f)
        b_id = f_dict.get("building_id")
        f_dict["units"] = units_by_floor.get(f_dict["id"], [])
        if b_id not in floors_by_bldg:
            floors_by_bldg[b_id] = []
        floors_by_bldg[b_id].append(f_dict)
    
    buildings_list = []
    for r in rows:
        b_dict = dict(r)
        if b_dict.get("polygon_geojson"):
            try:
                b_dict["polygon"] = json.loads(b_dict["polygon_geojson"])
            except Exception:
                b_dict["polygon"] = []
        b_dict["floors"] = floors_by_bldg.get(r["id"], [])
        buildings_list.append(b_dict)
        
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