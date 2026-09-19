import os
import json
import sqlite3

def seed_database():
    db_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data"))
    os.makedirs(db_dir, exist_ok=True)
    db_path = os.path.join(db_dir, "cadastre.db")
    
    # Remove existing DB file if it exists to ensure a clean purge of old Pune data
    if os.path.exists(db_path):
        os.remove(db_path)
    
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # Create tables
    cur.execute("""
    CREATE TABLE IF NOT EXISTS regions (
        id TEXT PRIMARY KEY,
        name TEXT,
        country TEXT,
        flag TEXT,
        crs TEXT,
        vertical_datum TEXT,
        gnss_cors TEXT,
        total_area_ha REAL
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS buildings (
        id TEXT PRIMARY KEY,
        region_id TEXT,
        name TEXT,
        short_label TEXT,
        address TEXT,
        floors_count INTEGER,
        height_m REAL,
        base_elevation_msl REAL,
        roof_elevation_msl REAL,
        units_count INTEGER,
        structure_type TEXT,
        construction_year INTEGER,
        body_corporate TEXT,
        polygon_geojson TEXT,
        FOREIGN KEY (region_id) REFERENCES regions(id)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS floors (
        id TEXT PRIMARY KEY,
        building_id TEXT,
        level TEXT,
        name TEXT,
        elevation_range TEXT,
        base_elevation REAL,
        roof_elevation REAL,
        floor_type TEXT,
        units_count INTEGER,
        FOREIGN KEY (building_id) REFERENCES buildings(id)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS units (
        id TEXT PRIMARY KEY,
        building_id TEXT,
        floor_id TEXT,
        unit_number TEXT,
        name TEXT,
        ulpin TEXT,
        owner_name TEXT,
        carpet_area TEXT,
        builtup_area TEXT,
        volume TEXT,
        uds TEXT,
        tenure TEXT,
        title_ref TEXT,
        air_rights TEXT,
        status TEXT,
        coordinates TEXT,
        latitude REAL,
        longitude REAL,
        elevation_msl REAL,
        FOREIGN KEY (building_id) REFERENCES buildings(id),
        FOREIGN KEY (floor_id) REFERENCES floors(id)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS utilities (
        id TEXT PRIMARY KEY,
        region_id TEXT,
        name TEXT,
        category TEXT,
        operator TEXT,
        depth_m REAL,
        elevation_msl REAL,
        diameter_or_voltage TEXT,
        easement_corridor_m REAL,
        polyline_geojson TEXT,
        FOREIGN KEY (region_id) REFERENCES regions(id)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS parcels (
        id TEXT PRIMARY KEY,
        region_id TEXT,
        parcel_number TEXT,
        ulpin TEXT,
        name TEXT,
        survey_number TEXT,
        area_sq_m REAL,
        land_use TEXT,
        z_min_msl REAL,
        z_max_msl REAL,
        status TEXT,
        jurisdiction TEXT,
        tenure TEXT,
        legal_description TEXT,
        ownership_type TEXT,
        address TEXT,
        polygon_geojson TEXT,
        FOREIGN KEY (region_id) REFERENCES regions(id)
    )
    """)

    # Seed Regions (Auckland only)
    regions = [
        ("auckland", "Auckland CBD Waterfront & Britomart", "New Zealand", "🇳🇿", "EPSG:2193 (NZGD2000) / EPSG:4979 (3D WGS84)", "NZVD2016 (MSL)", "PositioNZ CORS Station AUCK", 45.2)
    ]
    cur.executemany("INSERT OR REPLACE INTO regions VALUES (?, ?, ?, ?, ?, ?, ?, ?)", regions)

    # Seed Buildings (Auckland only)
    buildings = [
        ("b-auk-pacifica", "auckland", "The Pacifica Tower", "Pacifica", "10-12 Commerce Street, Auckland CBD 1010", 57, 182.4, 7.2, 189.6, 273, "Reinforced Concrete / Glass Curtain Wall (57 Storeys)", 2020, "Body Corporate 549102 (LINZ Stratum Base)", json.dumps([[174.7679, -36.8452], [174.7687, -36.8451], [174.7685, -36.8445], [174.7677, -36.8446]])),
        ("b-auk-seascape", "auckland", "Seascape Tower", "Seascape", "85 Customs Street East, Auckland CBD 1010", 56, 179.2, 7.5, 186.7, 221, "Diagrid Steel Exoskeleton (56 Storeys)", 2023, "Body Corporate 549301 (Shundi Customs Ltd)", json.dumps([[174.7688, -36.8459], [174.7696, -36.8458], [174.7694, -36.8452], [174.7686, -36.8453]])),
        ("b-auk-51albert", "auckland", "51 Albert Street Tower", "51 Albert", "51-53 Albert Street, Auckland CBD 1010", 41, 131.2, 7.5, 138.7, 154, "Hotel Indigo + Luxury Residences (41 Storeys)", 2022, "Body Corporate 549402 (94 Feet Property)", json.dumps([[174.7636, -36.8466], [174.7644, -36.8465], [174.7643, -36.8460], [174.7635, -36.8461]])),
        ("b-auk-commbay", "auckland", "Commercial Bay PwC Tower", "PwC Tower", "11-19 Customs Street West, Auckland CBD 1010", 39, 173.2, 6.8, 180.0, 48, "Grade-A Commercial Office Tower (39 Storeys)", 2020, "Precinct Properties NZ Ltd Commercial Master Lease", json.dumps([[174.7654, -36.8441], [174.7668, -36.8439], [174.7666, -36.8432], [174.7652, -36.8434]]))
    ]
    cur.executemany("INSERT OR REPLACE INTO buildings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", buildings)

    # Seed Floors (Auckland only)
    floors = [
        ("fl-pac-56", "b-auk-pacifica", "F56", "Floor 56 (Diamond Sky Penthouse)", "185.0 - 189.6 m MSL", 185.0, 189.6, "penthouse", 1),
        ("fl-pac-52", "b-auk-pacifica", "F52", "Floor 52 (Sky Penthouse Level)", "172.0 - 176.8 m MSL", 172.0, 176.8, "penthouse", 2),
        ("fl-pac-48", "b-auk-pacifica", "F48", "Floor 48 (Sky Residences)", "159.2 - 162.3 m MSL", 159.2, 162.3, "standard", 2),
        ("fl-pac-28", "b-auk-pacifica", "F28", "Floor 28 (Luxury 2-Bed Level)", "95.8 - 98.9 m MSL", 95.8, 98.9, "standard", 4),
        ("fl-pac-20", "b-auk-pacifica", "F20", "Floor 20 (Fire Refuge & Residents Pool)", "70.2 - 73.3 m MSL", 70.2, 73.3, "refuge", 1),
        ("fl-pac-10", "b-auk-pacifica", "F10", "Floor 10 (Standard Suites)", "38.2 - 41.3 m MSL", 38.2, 41.3, "standard", 2),
        ("fl-pac-g", "b-auk-pacifica", "G/P", "Ground Floor Grand Lobby & Retail", "7.2 - 12.0 m MSL", 7.2, 12.0, "podium", 1),
        ("fl-sea-55", "b-auk-seascape", "F55", "Floor 55 (Grand Horizon Penthouse)", "181.5 - 186.7 m MSL", 181.5, 186.7, "penthouse", 1),
        ("fl-sea-36", "b-auk-seascape", "F36", "Floor 36 (High-Rise Panoramic Suites)", "122.7 - 125.9 m MSL", 122.7, 125.9, "standard", 2),
        ("fl-sea-18", "b-auk-seascape", "F18", "Floor 18 (Mid-Rise Premium 2-Bed)", "65.1 - 68.3 m MSL", 65.1, 68.3, "standard", 1),
        ("fl-alb-40", "b-auk-51albert", "F40", "Floor 40 (Albert Sky Penthouse)", "134.0 - 138.7 m MSL", 134.0, 138.7, "penthouse", 1),
        ("fl-alb-28", "b-auk-51albert", "F28", "Floor 28 (Residential Tower Suites)", "95.5 - 98.7 m MSL", 95.5, 98.7, "standard", 1),
        ("fl-pwc-38", "b-auk-commbay", "F38", "Floor 38 (Executive Corporate Penthouse)", "172.0 - 180.0 m MSL", 172.0, 180.0, "penthouse", 1),
        ("fl-pwc-22", "b-auk-commbay", "F22", "Floor 22 (Mid-Rise Corporate Suites)", "102.0 - 106.4 m MSL", 102.0, 106.4, "standard", 1)
    ]
    cur.executemany("INSERT OR REPLACE INTO floors VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", floors)

    # Seed Units (Auckland only)
    units = [
        ("u-auk-pac-5601", "b-auk-pacifica", "fl-pac-56", "PH-5601", "Super Diamond Penthouse Suite", "NZ-AUK-CBD-UN-000201-5601-2", "Sir Graeme Douglas Trust", "410.0 m² Carpet (4,413 sq ft)", "488.0 m²", "1,886.0 m³ Solid Volume", "1.950% Undivided Land Share", "Freehold Stratum Estate", "LINZ Record of Title NA549102/5601", "Unrestricted Exclusive Sky Rights up to 189.6m MSL", "Verified", "36.84495° S, 174.76825° E, +185.0m Z", -36.84495, 174.76825, 185.0),
        ("u-auk-pac-5201", "b-auk-pacifica", "fl-pac-52", "PH-5201", "Sky Penthouse PH-5201", "NZ-AUK-CBD-UN-000201-5201-5", "Auckland Supercity Trust Holdings", "312.0 m² Carpet (3,358 sq ft)", "368.0 m²", "1,497.6 m³ Solid Volume", "1.482% Undivided Land Share", "Freehold Stratum Estate", "LINZ Record of Title NA549102/5201", "Exclusive Sky Rights within Floor 52 prism", "Verified", "36.84495° S, 174.76825° E, +172.0m Z", -36.84495, 174.76825, 172.0),
        ("u-auk-pac-5202", "b-auk-pacifica", "fl-pac-52", "PH-5202", "Sky Penthouse PH-5202", "NZ-AUK-CBD-UN-000201-5202-3", "Dr. Alistair Vance & Dr. Fiona Vance", "298.0 m² Carpet (3,207 sq ft)", "352.0 m²", "1,430.4 m³ Solid Volume", "1.415% Undivided Land Share", "Freehold Stratum Estate", "LINZ Record of Title NA549102/5202", "Exclusive Sky Rights within Floor 52 prism", "Verified", "36.84492° S, 174.76828° E, +172.0m Z", -36.84492, 174.76828, 172.0),
        ("u-auk-pac-4801", "b-auk-pacifica", "fl-pac-48", "Flat 4801", "Sky Residence 4801 (3 BHK)", "NZ-AUK-CBD-UN-000201-4801-7", "Marcus & Jessica Sterling", "142.0 m² Carpet (1,528 sq ft)", "168.0 m²", "440.2 m³", "0.675%", "Freehold Stratum Estate", "LINZ Title NA549102/4801", "Floor 48 Bound", "Verified", "36.84491° S, 174.76821° E, +159.2m Z", -36.84491, 174.76821, 159.2),
        ("u-auk-pac-4802", "b-auk-pacifica", "fl-pac-48", "Flat 4802", "Sky Residence 4802 (3 BHK)", "NZ-AUK-CBD-UN-000201-4802-5", "Keiko Takahashi", "138.5 m² Carpet (1,490 sq ft)", "164.0 m²", "429.3 m³", "0.658%", "Freehold Stratum Estate", "LINZ Title NA549102/4802", "Floor 48 Bound", "Verified", "36.84493° S, 174.76826° E, +159.2m Z", -36.84493, 174.76826, 159.2),
        ("u-auk-pac-2801", "b-auk-pacifica", "fl-pac-28", "Flat 2801", "Apartment 2801 (Harbour View 2 BHK)", "NZ-AUK-CBD-UN-000201-2801-3", "David K. Morrison", "92.4 m² Carpet (995 sq ft)", "109.0 m²", "286.4 m³", "0.382%", "Freehold Stratum Estate", "LINZ Title NA549102/2801", "Floor 28 Bound", "Verified", "36.84490° S, 174.76820° E, +95.8m Z", -36.84490, 174.76820, 95.8),
        ("u-auk-pac-2802", "b-auk-pacifica", "fl-pac-28", "Flat 2802", "Apartment 2802 (City View 2 BHK)", "NZ-AUK-CBD-UN-000201-2802-1", "Chloe Bennett & Ethan Bennett", "88.0 m² Carpet (947 sq ft)", "104.0 m²", "272.8 m³", "0.364%", "Freehold Stratum Estate", "LINZ Title NA549102/2802", "Floor 28 Bound", "Verified", "36.84492° S, 174.76823° E, +95.8m Z", -36.84492, 174.76823, 95.8),
        ("u-auk-pac-2803", "b-auk-pacifica", "fl-pac-28", "Flat 2803", "Apartment 2803 (Executive 1 BHK)", "NZ-AUK-CBD-UN-000201-2803-0", "Sunil & Ritu Verma", "64.5 m² Carpet (694 sq ft)", "76.0 m²", "199.9 m³", "0.267%", "Freehold Stratum Estate", "LINZ Title NA549102/2803", "Floor 28 Bound", "Verified", "36.84494° S, 174.76825° E, +95.8m Z", -36.84494, 174.76825, 95.8),
        ("u-auk-pac-2804", "b-auk-pacifica", "fl-pac-28", "Flat 2804", "Apartment 2804 (Luxury 2-Bed Corner)", "NZ-AUK-CBD-UN-000201-2804-9", "Hamish McDonald & Sarah Chen", "88.5 m² Carpet (953 sq ft)", "104.2 m²", "274.35 m³", "0.366%", "Freehold Stratum Estate", "LINZ Record of Title NA549102/2804", "Exclusive within 95.8m - 98.9m MSL prism", "Verified", "36.84492° S, 174.76822° E, +95.80m Z", -36.84492, 174.76822, 95.8),
        ("u-auk-pac-2001", "b-auk-pacifica", "fl-pac-20", "Amenity-2001", "Sky Lap Pool & Heated Spa Facility", "NZ-AUK-CBD-UN-000201-2001-8", "Body Corporate 549102 (Common Property)", "480.0 m²", "520.0 m²", "1,488.0 m³", "Common Ownership Interest", "Body Corporate Common Property", "LINZ DP 549102 Sheet 10", "Refuge & Common Realm", "Verified", "36.84491° S, 174.76821° E, +70.2m Z", -36.84491, 174.76821, 70.2),
        ("u-auk-pac-1001", "b-auk-pacifica", "fl-pac-10", "Flat 1001", "Apartment 1001 (1 BHK Classic)", "NZ-AUK-CBD-UN-000201-1001-5", "Benjamin Taylor", "56.0 m² Carpet (603 sq ft)", "66.0 m²", "173.6 m³", "0.232%", "Freehold Stratum Estate", "LINZ Title NA549102/1001", "Floor 10 Bound", "Verified", "36.84490° S, 174.76820° E, +38.2m Z", -36.84490, 174.76820, 38.2),
        ("u-auk-pac-1002", "b-auk-pacifica", "fl-pac-10", "Flat 1002", "Apartment 1002 (2 BHK Comfort)", "NZ-AUK-CBD-UN-000201-1002-3", "Sophie Zhang & Ming Zhang", "82.0 m² Carpet (883 sq ft)", "96.0 m²", "254.2 m³", "0.339%", "Freehold Stratum Estate", "LINZ Title NA549102/1002", "Floor 10 Bound", "Verified", "36.84492° S, 174.76822° E, +38.2m Z", -36.84492, 174.76822, 38.2),
        ("u-auk-pac-g01", "b-auk-pacifica", "fl-pac-g", "Retail-G01", "Commerce St Artisan Cafe & Lobby Unit", "NZ-AUK-CBD-UN-000201-0001-1", "Mojo Coffee NZ Limited", "145.0 m²", "160.0 m²", "696.0 m³", "0.601%", "Commercial Stratum Leasehold", "LINZ Title NA549102/G01", "Ground Realm", "Verified", "36.84489° S, 174.76819° E, +7.2m Z", -36.84489, 174.76819, 7.2),
        ("u-auk-sea-5501", "b-auk-seascape", "fl-sea-55", "PH-5501", "Horizon Penthouse Suite 5501", "NZ-AUK-CBD-UN-000203-5501-8", "Liam Zhang & Wei Zhang", "345.0 m² Carpet (3,713 sq ft)", "408.0 m²", "1,794.0 m³", "1.820%", "Freehold Stratum Estate", "LINZ Title NA549301/5501", "Exclusive Sky Rights up to 186.7m MSL", "Verified", "36.84560° S, 174.76920° E, +181.5m Z", -36.84560, 174.76920, 181.5),
        ("u-auk-sea-3601", "b-auk-seascape", "fl-sea-36", "Flat 3601", "Apartment 3601 (East Harbour View)", "NZ-AUK-CBD-UN-000203-3601-4", "Olivia Watson & Thomas Watson", "105.0 m² Carpet (1,130 sq ft)", "122.0 m²", "336.0 m³", "0.455%", "Freehold Stratum Estate", "LINZ Title NA549301/3601", "Floor 36 Bound", "Verified", "36.84558° S, 174.76918° E, +122.7m Z", -36.84558, 174.76918, 122.7),
        ("u-auk-alb-4001", "b-auk-51albert", "fl-alb-40", "PH-4001", "Albert Sky Penthouse PH-4001", "NZ-AUK-CBD-UN-000204-4001-9", "Marcus Thorne & Elena Rostova", "265.0 m² Carpet (2,852 sq ft)", "312.0 m²", "1,245.5 m³", "1.720%", "Freehold Stratum Estate", "LINZ Title NA549402/4001", "Sky Rights up to 138.7m MSL", "Verified", "36.84640° S, 174.76400° E, +134.0m Z", -36.84640, 174.76400, 134.0),
        ("u-auk-pwc-3801", "b-auk-commbay", "fl-pwc-38", "Office-3801", "PwC New Zealand Executive Headquarters", "NZ-AUK-CBD-UN-000202-3801-7", "PricewaterhouseCoopers (PwC NZ)", "1,450.0 m² Carpet (15,607 sq ft)", "1,680.0 m²", "11,600.0 m³", "2.450%", "Corporate Commercial Stratum Leasehold", "LINZ Title 841920/L38", "Commercial Ceiling Bound", "Verified", "36.84360° S, 174.76630° E, +172.0m Z", -36.84360, 174.76630, 172.0)
    ]
    cur.executemany("INSERT OR REPLACE INTO units VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", units)

    # Seed Utilities (Auckland only)
    utilities = [
        ("ut-auk-crl-01", "auckland", "City Rail Link (CRL) Subterranean Twin Rail Tunnel", "Transit / Rail", "KiwiRail / Auckland Transport", -24.0, -17.2, "3.6m Tunnel Bore", 15.0, json.dumps([[174.7635, -36.8432], [174.7655, -36.8445], [174.7670, -36.8465], [174.7685, -36.8495]])),
        ("ut-auk-power-110kv", "auckland", "110kV National Grid High-Voltage Transmission Corridor", "Power / Electrical", "Transpower New Zealand", -16.5, -12.0, "110kV 3-Phase", 10.0, json.dumps([[174.7645, -36.8455], [174.7668, -36.8462], [174.7695, -36.8470]]))
    ]
    cur.executemany("INSERT OR REPLACE INTO utilities VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", utilities)

    # Seed Parcels (Auckland only)
    parcels = [
        ("p-auk-101", "auckland", "P-AUK-101", "NZ-AUK-CBD-PL-000101-4", "Commercial Bay Precinct (Customs St West)", None, 12850.0, "Commercial High-Density Mixed-Use", 6.8, None, "Verified", "Auckland Council / LINZ", "Freehold (Precinct Properties NZ)", "Lot 1 DP 523190 & Lot 2 DP 488102 (LINZ Title 841920)", "Freehold (Precinct Properties NZ)", "7-21 Queen Street & Customs St W, Auckland CBD 1010", json.dumps([[174.7650, -36.8445], [174.7675, -36.8442], [174.7672, -36.8428], [174.7646, -36.8431], [174.7650, -36.8445]])),
        ("p-auk-102", "auckland", "P-AUK-102", "NZ-AUK-CBD-PL-000102-2", "The Pacifica Tower Parcel (Commerce St)", None, 4200.0, "Residential High-Rise Stratum", 7.2, None, "Verified", "Auckland Council / LINZ", "Unit Title Stratum (273 Units)", "Unit Title Stratum Estate DP 549102 (Body Corporate 549102)", "Unit Title Stratum (273 Units)", "10-12 Commerce Street, Auckland CBD 1010", json.dumps([[174.7676, -36.8456], [174.7692, -36.8454], [174.7690, -36.8442], [174.7674, -36.8444], [174.7676, -36.8456]])),
        ("p-auk-103", "auckland", "P-AUK-103", "NZ-AUK-CBD-PL-000103-9", "Britomart Transport Centre & Waterfront Reserve", None, 28400.0, "Civic & Underground Transit Hub", 5.4, None, "Verified", "Auckland Transport / City Rail Link Ltd", "Public Crown Land / Auckland Transport", "Public Transport & Waterfront Esplanade Reserve", "Public Crown Land / Auckland Transport", "Queen Elizabeth II Square, Quay Street, Auckland CBD", json.dumps([[174.7635, -36.8435], [174.7700, -36.8427], [174.7698, -36.8415], [174.7632, -36.8423], [174.7635, -36.8435]]))
    ]
    cur.executemany("INSERT OR REPLACE INTO parcels VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", parcels)

    conn.commit()
    conn.close()
    print(f"Database seeded successfully at: {db_path}")

if __name__ == "__main__":
    seed_database()
