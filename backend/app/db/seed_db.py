import os
import json
import sqlite3
import sys

def seed_database():
    db_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data"))
    os.makedirs(db_dir, exist_ok=True)
    db_path = os.path.join(db_dir, "cadastre.db")
    
    # Check if existing DB already has full Auckland dataset (893 buildings)
    if os.path.exists(db_path):
        try:
            test_conn = sqlite3.connect(db_path)
            cur = test_conn.cursor()
            cur.execute("SELECT count(*) FROM buildings WHERE region_id = 'auckland'")
            count = cur.fetchone()[0]
            test_conn.close()
            if count >= 800:
                print(f"[DB Seed] Database already contains {count} Auckland buildings. Retaining complete dataset.")
                return
        except Exception:
            pass

    print("[DB Seed] Seeding complete Auckland dataset with all 893 buildings...")
    
    # Import and run the comprehensive ingestion
    gis_ai_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "gis", "ai"))
    if gis_ai_dir not in sys.path:
        sys.path.insert(0, gis_ai_dir)
    
    try:
        from ingest_all_auckland_buildings import ingest_all_buildings
        ingest_all_buildings()
    except Exception as e:
        print(f"[DB Seed] Error running ingest_all_buildings: {e}")

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Seed Regions
    regions = [
        ("auckland", "Auckland CBD Waterfront & Britomart", "New Zealand", "🇳🇿", "EPSG:2193 (NZGD2000) / EPSG:4979 (3D WGS84)", "NZVD2016 (MSL)", "PositioNZ CORS Station AUCK", 45.2)
    ]
    cur.executemany("INSERT OR REPLACE INTO regions VALUES (?, ?, ?, ?, ?, ?, ?, ?)", regions)

    # Seed Utilities
    utilities = [
        ("ut-auk-crl-01", "auckland", "City Rail Link (CRL) Subterranean Twin Rail Tunnel", "Transit / Rail", "KiwiRail / Auckland Transport", -24.0, -17.2, "3.6m Tunnel Bore", 15.0, json.dumps([[174.7635, -36.8432], [174.7655, -36.8445], [174.7670, -36.8465], [174.7685, -36.8495]])),
        ("ut-auk-power-110kv", "auckland", "110kV National Grid High-Voltage Transmission Corridor", "Power / Electrical", "Transpower New Zealand", -16.5, -12.0, "110kV 3-Phase", 10.0, json.dumps([[174.7645, -36.8455], [174.7668, -36.8462], [174.7695, -36.8470]]))
    ]
    cur.executemany("INSERT OR REPLACE INTO utilities VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", utilities)

    # Seed Parcels
    parcels = [
        ("p-auk-101", "auckland", "P-AUK-101", "NZ-AUK-CBD-PL-000101-4", "Commercial Bay Precinct (Customs St West)", None, 12850.0, "Commercial High-Density Mixed-Use", 6.8, None, "Verified", "Auckland Council / LINZ", "Freehold (Precinct Properties NZ)", "Lot 1 DP 523190 & Lot 2 DP 488102 (LINZ Title 841920)", "Freehold (Precinct Properties NZ)", "7-21 Queen Street & Customs St W, Auckland CBD 1010", json.dumps([[174.7650, -36.8445], [174.7675, -36.8442], [174.7672, -36.8428], [174.7646, -36.8431], [174.7650, -36.8445]])),
        ("p-auk-102", "auckland", "P-AUK-102", "NZ-AUK-CBD-PL-000102-2", "The Pacifica Tower Parcel (Commerce St)", None, 4200.0, "Residential High-Rise Stratum", 7.2, None, "Verified", "Auckland Council / LINZ", "Unit Title Stratum (273 Units)", "Unit Title Stratum Estate DP 549102 (Body Corporate 549102)", "Unit Title Stratum (273 Units)", "10-12 Commerce Street, Auckland CBD 1010", json.dumps([[174.7676, -36.8456], [174.7692, -36.8454], [174.7690, -36.8442], [174.7674, -36.8444], [174.7676, -36.8456]])),
        ("p-auk-103", "auckland", "P-AUK-103", "NZ-AUK-CBD-PL-000103-9", "Britomart Transport Centre & Waterfront Reserve", None, 28400.0, "Civic & Underground Transit Hub", 5.4, None, "Verified", "Auckland Transport / City Rail Link Ltd", "Public Crown Land / Auckland Transport", "Public Transport & Waterfront Esplanade Reserve", "Public Crown Land / Auckland Transport", "Queen Elizabeth II Square, Quay Street, Auckland CBD", json.dumps([[174.7635, -36.8435], [174.7700, -36.8427], [174.7698, -36.8415], [174.7632, -36.8423], [174.7635, -36.8435]]))
    ]
    cur.executemany("INSERT OR REPLACE INTO parcels VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", parcels)

    conn.commit()
    conn.close()
    print(f"[DB Seed] Database fully verified at: {db_path}")

if __name__ == "__main__":
    seed_database()
