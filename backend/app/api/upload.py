"""
File Upload API — Accepts LiDAR (.las/.laz), Floor Plans (.dxf/.geojson),
Drone Images (.png/.jpg/.tif), and GIS Parcels (.geojson/.shp).
"""
import os
import json
import shutil
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter(
    prefix="/api/upload",
    tags=["Data Upload & Ingestion"]
)

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

def save_upload(file: UploadFile, sub_dir: str) -> str:
    """Save uploaded file and return the full path."""
    target_dir = os.path.join(UPLOAD_DIR, sub_dir)
    os.makedirs(target_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = f"{timestamp}_{file.filename}"
    file_path = os.path.join(target_dir, safe_name)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return file_path

@router.post("/lidar")
async def upload_lidar(file: UploadFile = File(...)):
    """Upload LiDAR point cloud (.las / .laz) file."""
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.las', '.laz'):
        raise HTTPException(status_code=400, detail=f"Invalid file type: {ext}. Expected .las or .laz")
    
    file_path = save_upload(file, "lidar")
    file_size = os.path.getsize(file_path)
    
    # Extract metadata from LAS file
    metadata = {
        "filename": file.filename,
        "size_bytes": file_size,
        "size_mb": round(file_size / (1024 * 1024), 2),
        "format": ext.upper().replace(".", ""),
        "upload_path": file_path,
        "uploaded_at": datetime.now().isoformat()
    }
    
    try:
        import laspy
        import numpy as np
        las = laspy.read(file_path)
        metadata.update({
            "point_count": len(las.points),
            "version": f"{las.header.version.major}.{las.header.version.minor}",
            "point_format": las.header.point_format.id,
            "bounds": {
                "x_min": float(las.header.x_min), "x_max": float(las.header.x_max),
                "y_min": float(las.header.y_min), "y_max": float(las.header.y_max),
                "z_min": float(las.header.z_min), "z_max": float(las.header.z_max)
            },
            "classifications": list(set(int(c) for c in las.classification)),
            "crs_info": "ASPRS LAS"
        })
    except Exception as e:
        metadata["parse_warning"] = f"Could not parse LAS metadata: {str(e)}"
    
    return {"status": "success", "type": "lidar", "metadata": metadata}


@router.post("/floorplan")
async def upload_floorplan(file: UploadFile = File(...)):
    """Upload architectural floor plan (.dxf / .geojson / .png / .svg)."""
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.dxf', '.geojson', '.json', '.png', '.jpg', '.svg', '.pdf'):
        raise HTTPException(status_code=400, detail=f"Invalid file type: {ext}. Expected .dxf, .geojson, .png, .svg, or .pdf")
    
    file_path = save_upload(file, "floorplans")
    file_size = os.path.getsize(file_path)
    
    metadata = {
        "filename": file.filename,
        "size_bytes": file_size,
        "size_mb": round(file_size / (1024 * 1024), 2),
        "format": ext.upper().replace(".", ""),
        "upload_path": file_path,
        "uploaded_at": datetime.now().isoformat()
    }
    
    # Parse DXF if applicable
    if ext == '.dxf':
        try:
            import ezdxf
            doc = ezdxf.readfile(file_path)
            msp = doc.modelspace()
            entity_count = len(list(msp))
            layer_names = list(set(e.dxf.layer for e in msp if hasattr(e.dxf, 'layer')))
            metadata.update({
                "dxf_version": doc.dxfversion,
                "entity_count": entity_count,
                "layers": layer_names[:20],
                "has_wall_layer": any('wall' in l.lower() for l in layer_names)
            })
        except Exception as e:
            metadata["parse_warning"] = f"Could not parse DXF: {str(e)}"
    
    # Parse GeoJSON if applicable
    if ext in ('.geojson', '.json'):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                geojson = json.load(f)
            metadata.update({
                "feature_count": len(geojson.get("features", [])),
                "geojson_type": geojson.get("type", "Unknown")
            })
        except Exception as e:
            metadata["parse_warning"] = f"Could not parse GeoJSON: {str(e)}"
    
    return {"status": "success", "type": "floorplan", "metadata": metadata}


@router.post("/drone-image")
async def upload_drone_image(file: UploadFile = File(...)):
    """Upload drone orthomosaic image (.png / .jpg / .tif / .tiff)."""
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.png', '.jpg', '.jpeg', '.tif', '.tiff'):
        raise HTTPException(status_code=400, detail=f"Invalid file type: {ext}. Expected .png, .jpg, .tif")
    
    file_path = save_upload(file, "drone_imagery")
    file_size = os.path.getsize(file_path)
    
    metadata = {
        "filename": file.filename,
        "size_bytes": file_size,
        "size_mb": round(file_size / (1024 * 1024), 2),
        "format": ext.upper().replace(".", ""),
        "upload_path": file_path,
        "uploaded_at": datetime.now().isoformat()
    }
    
    try:
        from PIL import Image
        img = Image.open(file_path)
        metadata.update({
            "width_px": img.width,
            "height_px": img.height,
            "resolution": f"{img.width}x{img.height}",
            "mode": img.mode,
            "dpi": img.info.get("dpi", "Unknown")
        })
    except Exception as e:
        metadata["parse_warning"] = f"Could not read image metadata: {str(e)}"
    
    return {"status": "success", "type": "drone_image", "metadata": metadata}


@router.post("/parcels")
async def upload_parcels(file: UploadFile = File(...)):
    """Upload GIS parcel boundaries (.geojson / .shp / .json)."""
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.geojson', '.json', '.shp', '.gpkg'):
        raise HTTPException(status_code=400, detail=f"Invalid file type: {ext}. Expected .geojson, .shp, or .gpkg")
    
    file_path = save_upload(file, "parcels")
    file_size = os.path.getsize(file_path)
    
    metadata = {
        "filename": file.filename,
        "size_bytes": file_size,
        "size_mb": round(file_size / (1024 * 1024), 2),
        "format": ext.upper().replace(".", ""),
        "upload_path": file_path,
        "uploaded_at": datetime.now().isoformat()
    }
    
    if ext in ('.geojson', '.json'):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                geojson = json.load(f)
            features = geojson.get("features", [])
            metadata.update({
                "feature_count": len(features),
                "geojson_type": geojson.get("type", "Unknown"),
                "crs": geojson.get("crs", {}).get("properties", {}).get("name", "WGS84 (assumed)"),
                "parcel_ids": [f.get("properties", {}).get("parcel_number", "?") for f in features[:10]]
            })
        except Exception as e:
            metadata["parse_warning"] = f"Could not parse GeoJSON: {str(e)}"
    
    return {"status": "success", "type": "parcels", "metadata": metadata}
