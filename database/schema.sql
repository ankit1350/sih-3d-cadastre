-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- PARCELS
-- ============================================

CREATE TABLE IF NOT EXISTS parcels (
    id SERIAL PRIMARY KEY,
    parcel_number VARCHAR(100) UNIQUE NOT NULL,
    area_sq_m DOUBLE PRECISION,
    geometry GEOMETRY(MULTIPOLYGON, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS parcels_geometry_idx
ON parcels
USING GIST (geometry);


-- ============================================
-- BUILDINGS
-- ============================================

CREATE TABLE IF NOT EXISTS buildings (
    id SERIAL PRIMARY KEY,
    parcel_id INTEGER REFERENCES parcels(id) ON DELETE SET NULL,

    building_number VARCHAR(100),
    height_m DOUBLE PRECISION,
    floor_count INTEGER,

    confidence DOUBLE PRECISION,

    geometry GEOMETRY(MULTIPOLYGON, 4326),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS buildings_geometry_idx
ON buildings
USING GIST (geometry);


-- ============================================
-- BUILDING FLOORS
-- ============================================

CREATE TABLE IF NOT EXISTS building_floors (
    id SERIAL PRIMARY KEY,

    building_id INTEGER NOT NULL
        REFERENCES buildings(id)
        ON DELETE CASCADE,

    floor_number INTEGER NOT NULL,

    elevation_min_m DOUBLE PRECISION,
    elevation_max_m DOUBLE PRECISION,

    geometry GEOMETRY(MULTIPOLYGON, 4326),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(building_id, floor_number)
);

CREATE INDEX IF NOT EXISTS building_floors_geometry_idx
ON building_floors
USING GIST (geometry);


-- ============================================
-- FLOOR UNITS / VERTICAL PARCELS
-- ============================================

CREATE TABLE IF NOT EXISTS floor_units (
    id SERIAL PRIMARY KEY,

    floor_id INTEGER NOT NULL
        REFERENCES building_floors(id)
        ON DELETE CASCADE,

    unit_number VARCHAR(100),

    area_sq_m DOUBLE PRECISION,

    geometry GEOMETRY(MULTIPOLYGON, 4326),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS floor_units_geometry_idx
ON floor_units
USING GIST (geometry);


-- ============================================
-- POINT CLOUD DATASETS
-- ============================================

CREATE TABLE IF NOT EXISTS point_clouds (
    id SERIAL PRIMARY KEY,

    name VARCHAR(255) NOT NULL,

    file_path TEXT NOT NULL,

    file_format VARCHAR(20),

    point_count BIGINT,

    min_x DOUBLE PRECISION,
    max_x DOUBLE PRECISION,

    min_y DOUBLE PRECISION,
    max_y DOUBLE PRECISION,

    min_z DOUBLE PRECISION,
    max_z DOUBLE PRECISION,

    coordinate_system VARCHAR(100),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- DATA SOURCES
-- ============================================

CREATE TABLE IF NOT EXISTS data_sources (
    id SERIAL PRIMARY KEY,

    name VARCHAR(255) NOT NULL,

    source_type VARCHAR(50),

    file_path TEXT,

    coordinate_system VARCHAR(100),

    metadata JSONB,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);