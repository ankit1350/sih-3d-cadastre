import os
import sqlite3
import json
from typing import Optional
from fastapi import APIRouter, Query

router = APIRouter(
    prefix="/api/parcels",
    tags=["Parcels"]
)

def get_sqlite_conn():
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "cadastre.db"))
    return sqlite3.connect(db_path)

@router.get("")
@router.get("/")
def get_parcels(region: Optional[str] = Query("auckland", description="Region filter: auckland")):
    try:
        conn = get_sqlite_conn()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM parcels WHERE region_id = ?", (region,))
        rows = cur.fetchall()
        conn.close()
        
        result = []
        for r in rows:
            p_dict = dict(r)
            if p_dict.get("polygon_geojson"):
                try:
                    p_dict["polygon"] = json.loads(p_dict["polygon_geojson"])
                except (json.JSONDecodeError, TypeError):
                    pass
            result.append(p_dict)
        return result
    except Exception as e:
        print(f"Error fetching parcels: {e}")
        return []

@router.get("/{parcel_id}")
def get_parcel_by_id(parcel_id: str):
    try:
        conn = get_sqlite_conn()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM parcels WHERE id = ?", (parcel_id,))
        row = cur.fetchone()
        conn.close()
        
        if not row:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Parcel not found")
        
        p_dict = dict(row)
        if p_dict.get("polygon_geojson"):
            try:
                p_dict["polygon"] = json.loads(p_dict["polygon_geojson"])
            except (json.JSONDecodeError, TypeError):
                pass
        return p_dict
    except Exception as e:
        print(f"Error fetching parcel: {e}")
        return {}