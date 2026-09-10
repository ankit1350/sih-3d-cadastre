# SIH 3D Cadastre

A scalable 3D cadastral data platform integrating:

- LiDAR / 3D point clouds
- Drone imagery
- GIS parcel data
- Building footprints
- Floor plans
- GNSS/CORS coordinates
- DEM/DSM data
- AI/ML-based building extraction
- Floor segmentation
- Vertical parcel delineation
- Topology validation
- 3D visualization

## Architecture

Frontend → FastAPI → PostGIS

AI/ML and GIS processing services integrate with the backend.

## Project Structure

- `frontend/` - React/Vite frontend and 3D visualization
- `backend/` - FastAPI backend
- `ai/` - AI/ML and point-cloud processing
- `gis/` - GIS and spatial processing
- `database/` - PostgreSQL/PostGIS schema
- `data/` - project datasets
- `docs/` - architecture and API documentation
- `tests/` - automated tests
- `scripts/` - utility scripts

## Development

The complete development environment will be provided through Docker Compose.