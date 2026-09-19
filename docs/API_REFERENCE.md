# 📖 REST API Reference — 3D ULPIN Cadastre

The backend provides a high-performance RESTful API built with **FastAPI**.

Base URL: `http://localhost:8000/api`

---

## 1. System & Health

### `GET /health`
Returns runtime system status, active database backend, and LADM engine state.
```json
{
  "status": "ok",
  "postgis": "disabled",
  "database": "sqlite",
  "iso_19152_ladm": "active",
  "ai_segmentation_pipeline": "ready"
}
```

### `GET /api/regions`
Returns all active pilot regions and spatial reference metadata.

---

## 2. Parcels & Land Units

### `GET /api/parcels?region={region}`
Returns surface cadastral parcels with survey numbers, land use, and polygon coordinates.

### `GET /api/parcels/{parcel_id}`
Returns details for a specific parcel by ID.

---

## 3. 3D Buildings & Floor Plates

### `GET /api/buildings?region={region}`
Returns 3D building envelopes with nested structural floors and individual flat units.

### `GET /api/buildings/{building_id}`
Returns detail for a single building.

---

## 4. Volumetric Units & Property Cards

### `GET /api/units?region={region}&building_id={building_id}&floor_level={level}`
Returns individual apartment units with owner names, carpet areas, volumes, and UDS shares.

### `GET /api/units/{unit_id}`
Returns specific unit details.

### `GET /api/units/property-card/{unit_id}`
Returns certified digital 3D Property Card with embedded base64 QR code and legal title deed metadata.

### `GET /api/units/property-card/{unit_id}/qr`
Returns raw PNG image of the official scannable verification QR Code.

---

## 5. AI / ML Spatial Extraction Pipeline

### `POST /api/ai/segment-floors`
Segments raw drone LiDAR point clouds into vertical floor slabs using Gaussian KDE.
**Request Body:**
```json
{
  "region": "auckland",
  "laz_filename": "auckland_cbd_sample.las",
  "floor_height_threshold_m": 3.2,
  "bandwidth_h": 0.85,
  "outlier_std_cutoff": 2.5
}
```

### `POST /api/ai/parse-floorplan`
Parses AutoCAD `.dxf` architectural drawings into legal apartment units.
**Request Body:**
```json
{
  "region": "pune",
  "dxf_filename": "pune_hinjewadi_tower5_floor14.dxf",
  "floor_code": "14"
}
```

### `POST /api/ai/extract-buildings`
Extracts building footprints from aerial drone orthomosaics using OpenCV contour analysis.
**Request Body:**
```json
{
  "region": "pune",
  "image_filename": "pune_drone_ortho.png",
  "gsd_m": 0.15
}
```

### `GET /api/ai/lidar-points?region={region}&max_points=12000`
Returns downsampled 3D LiDAR point cloud returns `[lon, lat, elevation_msl, class_code, intensity]` for WebGL rendering.

---

## 6. Multi-Modal Survey Upload & Ingestion

- `POST /api/upload/lidar` — Upload `.las` or `.laz` point clouds.
- `POST /api/upload/floorplan` — Upload `.dxf` or `.geojson` blueprints.
- `POST /api/upload/drone-image` — Upload `.png` or `.tif` drone orthomosaics.
- `POST /api/upload/parcels` — Upload `.geojson` or `.shp` parcel boundaries.

---

## 7. 3D Topology & ISO 19152 Compliance

### `GET /api/topology/validate?region={region}`
Executes 5 geometric audits (Euler characteristic, volumetric overlap, utility buffer, UDS balance, airspace bounds) on database records.

---

## 8. 3D ULPIN Standard Generator & Verifier

### `POST /api/ulpin/generate`
Generates a 20-character ISO 7064 Modulo 11,2 compliant 3D ULPIN.
**Request Body:**
```json
{
  "country_code": "IN",
  "state_code": "MH",
  "district_code": "PUN",
  "locality_code": "HINJ",
  "layer_type": "UN",
  "building_seq": "000501",
  "floor_seq": "14",
  "unit_seq": "02",
  "owner_name": "Rajesh & Ananya Sharma"
}
```

### `GET /api/ulpin/verify/{ulpin}`
Validates 3D ULPIN format and verifies checksum integrity.

