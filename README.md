# 🌐 3D ULPIN Cadastre & Vertical Property Mapping System
### Smart India Hackathon (SIH) — Automated 3D Land & Stratum Property Cadastre

[![CI Pipeline](https://github.com/ankit1350/sih-3d-cadastre/actions/workflows/ci.yml/badge.svg)](https://github.com/ankit1350/sih-3d-cadastre/actions/workflows/ci.yml)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![CesiumJS](https://img.shields.io/badge/CesiumJS-1.125+-689F38.svg?logo=cesium&logoColor=white)](https://cesium.com)
[![ISO 19152 LADM](https://img.shields.io/badge/Standard-ISO%2019152%20LADM-3b82f6.svg)](https://www.iso.org/standard/51206.html)
[![ISO 7064 Mod 11,2](https://img.shields.io/badge/Checksum-ISO%207064%20Mod%2011%2C2-10b981.svg)](https://en.wikipedia.org/wiki/ISO_7064)

---

## 🌟 Executive Summary

With rapid vertical urbanization, conventional 2D surface cadastres fail to uniquely identify ownership rights associated with **multi-storey apartments, underground transit tunnels, utility corridors, parking spaces, air-rights, and sub-surface networks**.

This platform delivers an **end-to-end 3D ULPIN (Bhu-Aadhaar 3D) generation and vertical property cadastre platform** integrating:
1. **Drone Aerial Orthomosaics** (OpenCV computer vision building contour extraction).
2. **Multi-Return LiDAR Point Clouds** (Gaussian KDE + SciPy peak slicing for floor slab detection).
3. **Architectural CAD Floorplans** (`ezdxf` LWPOLYLINE unit boundary parsing & carpet area computation).
4. **National GIS Parcel Layers** (2D/3D WGS84 GeoJSON parcel boundaries).
5. **GNSS / CORS RTK Reference Networks** (Centimeter-accurate coordinate georeferencing).
6. **DEM / DSM Elevation Models** (Cesium 3D World Terrain & solar sun shadow simulations).
7. **ISO 19152 LADM 3D Topology Audit** (Real-time Euler watertightness, volumetric collision, and sub-surface utility clearance verification).
8. **Digital 3D Property Card** with real scannable QR verification codes and printable legal title certificates.

---

## 🏛️ System Architecture

```
                                  MULTI-MODAL INGESTION
          ┌─────────────────┬──────────────────┬─────────────────┬────────────────┐
          │  Drone Orthos   │  LiDAR .LAS/.LAZ │  CAD .DXF Plans │  GIS GeoJSON   │
          └────────┬────────┴────────┬─────────┴────────┬────────┴────────┬───────┘
                   │                 │                  │                 │
                   ▼                 ▼                  ▼                 ▼
          ┌─────────────────┬──────────────────┬─────────────────┬────────────────┐
          │ OpenCV Contours │ Gaussian KDE     │ ezdxf Unit      │ WGS84 Parcel   │
          │ & approxPolyDP  │ Floor Slicer     │ Extractor       │ Ingestion      │
          └────────┬────────┴────────┬─────────┴────────┬────────┴────────┬───────┘
                   │                 │                  │                 │
                   └─────────────────┼──────────────────┘                 │
                                     ▼                                    │
                         ┌───────────────────────┐                        │
                         │ 3D Topology Engine    │◄───────────────────────┘
                         │ (5 Geometric Checks)  │
                         └───────────┬───────────┘
                                     ▼
                         ┌───────────────────────┐
                         │ 3D ULPIN Generator    │
                         │ (ISO 7064 Mod 11,2)   │
                         └───────────┬───────────┘
                                     ▼
                   ┌─────────────────┴─────────────────┐
                   ▼                                   ▼
        ┌─────────────────────┐             ┌─────────────────────┐
        │ CesiumJS 3D Globe   │             │ Leaflet 2D Map &    │
        │ & LiDAR WebGL Cloud │             │ Certified 3D Cards  │
        └─────────────────────┘             └─────────────────────┘
```

---

## 🚀 Quickstart Guide

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** & **npm**

### 1. Backend Setup
```bash
# Navigate to backend
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Start FastAPI server
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation: [http://localhost:8000/docs](http://localhost:8000/docs)  
Health Check: [http://localhost:8000/health](http://localhost:8000/health)

### 2. Frontend Setup
```bash
# Navigate to frontend
cd frontend

# Install Node dependencies
npm install

# Start Vite dev server
npm run dev
```
Open your browser at: **`http://localhost:5173`**

### 3. Run Automated Integration Tests
```bash
# Run all 11 test suites
python backend/test_api.py
```

---

## 📊 Key Features

| Module | Features & Capabilities | Standards / Tech |
| :--- | :--- | :--- |
| **3D WebGL Globe** | Extruded solid buildings, floor slicing, explosion view, room-level selection, X-ray transparency | CesiumJS, WebGL |
| **2D GIS Map** | Interactive slippy map with parcels, building footprints, sub-surface utilities, and CORS stations | Leaflet, OpenStreetMap |
| **LiDAR Point Cloud** | WebGL point cloud renderer with elevation slicing, classification colors, and pulse intensity | laspy, WebGL PrimitiveCollection |
| **AI Floor Slicer** | Automated inter-floor slab detection ($\pm 0.03\text{m}$ precision) along vertical $Z$-axis | Gaussian KDE, SciPy |
| **Drone CV Extractor** | Aerial orthomosaic building detection, Douglas-Peucker polygonization, IoU scoring | OpenCV (`cv2`) |
| **CAD Blueprint Parser** | Extracts apartment units, carpet areas, built-up areas, and CAD layers directly from `.dxf` | `ezdxf`, Shoelace Area |
| **3D Topology Engine** | Euler watertightness ($V-E+F=2$), volumetric overlap, utility buffer clearance, UDS equity | ISO 19152:2012 LADM |
| **3D ULPIN Generator** | 20-character hierarchical unique land parcel identifier with checksum validation | ISO 7064 Modulo 11,2 |
| **3D Property Card** | Certified digital title card with embedded scannable QR verification code and print support | QR Code, ISO 19152 LA_BAUnit |

---

## 📜 Documentation

- [System Architecture Guide](docs/ARCHITECTURE.md)
- [REST API Reference](docs/API_REFERENCE.md)

---

## 👥 Authors
Developed for **Smart India Hackathon (SIH)** — 3D ULPIN Generation & Vertical Property Mapping Problem Statement.