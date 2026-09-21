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
    
    sample_points = []
    try:
        import laspy
        import numpy as np
        las = laspy.read(file_path)
        pt_count = len(las.points)
        metadata.update({
            "point_count": pt_count,
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

        # Generate lightweight WebGL visualization sample (up to 4000 points)
        step = max(1, pt_count // 4000)
        xs = np.array(las.x[::step])
        ys = np.array(las.y[::step])
        zs = np.array(las.z[::step])
        classes = np.array(las.classification[::step])
        
        # Check if coordinates are in projected EPSG:2193 (NZTM) or WGS84
        if np.mean(xs) > 1000000: # NZTM 2000 Projection
            try:
                from pyproj import Transformer
                transformer = Transformer.from_crs("EPSG:2193", "EPSG:4326", always_xy=True)
                lons, lats = transformer.transform(xs, ys)
            except Exception:
                # Fallback shift around Auckland CBD
                lons = 174.767 + (xs - np.mean(xs)) / 111000.0
                lats = -36.845 + (ys - np.mean(ys)) / 111000.0
        else:
            lons, lats = xs, ys

        for lon, lat, z, cl in zip(lons, lats, zs, classes):
            sample_points.append({
                "lon": round(float(lon), 6),
                "lat": round(float(lat), 6),
                "elevation": round(float(z), 2),
                "classification": int(cl)
            })

    except Exception as e:
        metadata["parse_warning"] = f"Could not parse LAS metadata: {str(e)}"
    
    return {
        "status": "success",
        "type": "lidar",
        "metadata": metadata,
        "points": sample_points
    }


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
    
    parsed_buildings = []

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
            features = geojson.get("features", [])
            metadata.update({
                "feature_count": len(features),
                "geojson_type": geojson.get("type", "Unknown")
            })

            # Synthesize 3D volumetric buildings from GeoJSON features
            for idx, feat in enumerate(features):
                geom = feat.get("geometry", {})
                props = feat.get("properties", {})
                g_type = geom.get("type")
                if g_type not in ("Polygon", "MultiPolygon"):
                    continue
                coords = geom.get("coordinates", [])
                if not coords:
                    continue
                ring = coords[0] if g_type == "Polygon" else coords[0][0]
                if len(ring) < 3:
                    continue

                name = props.get("name") or f"Imported Building #{idx + 1}"
                levels_str = props.get("building:levels") or props.get("floors") or 6
                try:
                    levels = max(1, int(float(levels_str)))
                except Exception:
                    levels = 6

                height_m = round(levels * 3.2, 1)
                base_msl = 8.0
                roof_msl = round(base_msl + height_m, 1)

                lons = [p[0] for p in ring]
                lats = [p[1] for p in ring]
                c_lon = sum(lons) / len(lons)
                c_lat = sum(lats) / len(lats)

                b_id = f"b-imp-{idx + 1:04d}"
                ulpin = f"NZ-AUK-IMP-BL-{idx + 1:06d}-9"

                # Generate floor titles & owners
                floors = []
                for lvl in range(1, min(levels + 1, 5)):
                    fl_id = f"fl-{b_id}-F{lvl:02d}"
                    fl_base = round(base_msl + (lvl - 1) * 3.2, 1)
                    fl_roof = round(fl_base + 3.2, 1)
                    fl_name = f"Ground Floor" if lvl == 1 else f"Floor {lvl:02d} (Stratum Units)"
                    
                    units = []
                    for u_idx in range(1, 3):
                        unit_num = f"{lvl}{u_idx:02d}"
                        u_ulpin = f"NZ-AUK-IMP-UN-{idx + 1:06d}-{lvl:02d}{u_idx:02d}-2"
                        units.append({
                            "id": f"u-{b_id}-L{lvl:02d}-{u_idx:02d}",
                            "buildingId": b_id,
                            "floorId": fl_id,
                            "unitNumber": unit_num,
                            "name": f"Unit {unit_num} ({fl_name})",
                            "ulpin": u_ulpin,
                            "ownerName": props.get("owner") or f"Owner of Unit {unit_num} (Imported Title)",
                            "area": f"{round(85.0 + u_idx * 15, 1)} m² Carpet",
                            "builtupArea": f"{round(102.0 + u_idx * 18, 1)} m²",
                            "volume": f"{round(242.0 + u_idx * 40, 1)} m³ Solid Volume",
                            "uds": f"{round(100.0 / (levels * 2), 3)}% Undivided Land Share",
                            "tenure": "Freehold Stratum Estate",
                            "titleRef": f"LINZ-IMP/{idx + 1:04d}-{lvl}{u_idx:02d}",
                            "airRights": f"Vertical prism {fl_base}m to {fl_roof}m MSL",
                            "floorLevel": f"Floor {lvl:02d}",
                            "elevation": f"{fl_base} - {fl_roof} m MSL",
                            "coordinates": f"{c_lat:.5f}° S, {c_lon:.5f}° E, +{fl_base:.1f}m Z",
                        })

                    floors.append({
                        "id": fl_id,
                        "buildingId": b_id,
                        "level": f"F{lvl:02d}",
                        "name": fl_name,
                        "elevation": f"{fl_base} - {fl_roof} m MSL",
                        "baseElevation": fl_base,
                        "roofElevation": fl_roof,
                        "type": "residential" if lvl > 1 else "retail",
                        "units": units
                    })

                parsed_buildings.append({
                    "id": b_id,
                    "name": name,
                    "shortLabel": name[:18],
                    "address": f"{idx + 1} Customs Street, Auckland CBD",
                    "floorsCount": levels,
                    "heightM": height_m,
                    "baseElevationMsl": base_msl,
                    "roofElevationMsl": roof_msl,
                    "unitsCount": len(floors) * 2,
                    "structureType": f"Extruded 3D Building ({levels} Storeys)",
                    "constructionYear": 2022,
                    "bodyCorporate": f"Body Corporate BC-IMP-{idx + 1}",
                    "polygon": ring,
                    "centroid": [round(c_lon, 6), round(c_lat, 6)],
                    "floors": floors
                })

        except Exception as e:
            metadata["parse_warning"] = f"Could not parse GeoJSON: {str(e)}"
    
    return {
        "status": "success",
        "type": "floorplan",
        "metadata": metadata,
        "buildings": parsed_buildings
    }


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
