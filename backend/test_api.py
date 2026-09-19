import sys
import os
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(__file__))
from app.main import app

client = TestClient(app)

def test_all_endpoints():
    print("Testing /health...")
    r = client.get("/health")
    assert r.status_code == 200, f"Health failed: {r.text}"
    print("[OK] Health OK:", r.json())

    print("\nTesting /api/regions...")
    r = client.get("/api/regions")
    assert r.status_code == 200, f"Regions failed: {r.text}"
    print("[OK] Regions OK:", len(r.json()["available_regions"]), "regions available")

    print("\nTesting /api/parcels?region=auckland...")
    r = client.get("/api/parcels?region=auckland")
    assert r.status_code == 200, f"Parcels failed: {r.text}"
    parcels = r.json()
    print("[OK] Parcels OK:", len(parcels), "parcels returned for Auckland")
    assert len(parcels) > 0, "Expected Auckland parcels to be seeded"

    print("\nTesting /api/buildings?region=auckland...")
    r = client.get("/api/buildings?region=auckland")
    assert r.status_code == 200, f"Buildings failed: {r.text}"
    bldgs = r.json()
    print("[OK] Buildings OK:", len(bldgs), "buildings returned")
    assert len(bldgs) > 0
    print("  First building:", bldgs[0]["name"], f"({len(bldgs[0]['floors'])} floors)")

    print("\nTesting /api/units?region=auckland...")
    r = client.get("/api/units?region=auckland")
    assert r.status_code == 200, f"Units failed: {r.text}"
    units = r.json()
    print("[OK] Units OK:", len(units), "units returned")
    assert len(units) > 0

    print("\nTesting /api/units/property-card/u-auk-pac-5601...")
    r = client.get("/api/units/property-card/u-auk-pac-5601")
    assert r.status_code == 200, f"Property card failed: {r.text}"
    card = r.json()
    print("[OK] Property card OK:", card["unit_number"], "Owner:", card["owner_name"], "ULPIN:", card["ulpin"])

    print("\nTesting /api/ai/segment-floors...")
    r = client.post("/api/ai/segment-floors", json={"region": "auckland", "laz_filename": "auckland_cbd_sample.las"})
    assert r.status_code == 200, f"Segmentation failed: {r.text}"
    seg = r.json()
    print("[OK] Segmentation OK:", seg["total_storeys_detected"], "storeys detected in", seg["execution_time_sec"], "s")

    print("\nTesting /api/ai/parse-floorplan...")
    r = client.post("/api/ai/parse-floorplan", json={"region": "auckland", "floor_code": "28"})
    assert r.status_code == 200, f"Floorplan failed: {r.text}"
    fp = r.json()
    print("[OK] CAD Floorplan OK:", fp["total_units_on_floor"], "units parsed (Source:", fp["source"], ")")

    print("\nTesting /api/ai/extract-buildings...")
    r = client.post("/api/ai/extract-buildings", json={"region": "auckland", "gsd_m": 0.15})
    assert r.status_code == 200, f"Drone building extraction failed: {r.text}"
    drn = r.json()
    print("[OK] Drone CV OK:", drn["total_buildings_detected"], "buildings detected (IoU:", drn["mean_iou_match"], ")")


    print("\nTesting /api/ai/lidar-points...")
    r = client.get("/api/ai/lidar-points?region=auckland&max_points=500")
    assert r.status_code == 200, f"LiDAR points failed: {r.text}"
    pts = r.json()
    print("[OK] LiDAR Points OK:", pts["rendered_points_count"], "points returned")

    print("\nTesting /api/ulpin/generate...")
    r = client.post("/api/ulpin/generate", json={
        "country_code": "NZ", "state_code": "AUK", "district_code": "CBD",
        "locality_code": "PACF", "layer_type": "UN", "building_seq": "000201",
        "floor_seq": "28", "unit_seq": "04", "owner_name": "Hamish McDonald & Sarah Chen"
    })
    assert r.status_code == 200, f"ULPIN generate failed: {r.text}"
    ulpin_res = r.json()
    print("[OK] ULPIN Generate OK:", ulpin_res["ulpin"], "valid:", ulpin_res["valid"])

    print("\nTesting /api/topology/validate?region=auckland...")
    r = client.get("/api/topology/validate?region=auckland")
    assert r.status_code == 200, f"Topology failed: {r.text}"
    topo = r.json()
    print("[OK] Topology OK:", topo["overall_status"], "| Compliance:", topo["compliance_score"], "% |", len(topo["checks"]), "rules tested")

    print("\nTesting /api/export/building/b-auk-pacifica (CityGML & 3D GeoJSON)...")
    r_gml = client.get("/api/export/building/b-auk-pacifica?format=citygml")
    assert r_gml.status_code == 200, f"CityGML export failed: {r_gml.text}"
    assert "core:CityModel" in r_gml.text, "Expected CityGML XML payload"
    print("  [OK] CityGML Export OK: Generated", len(r_gml.text), "bytes of OGC CityGML 2.0 XML")

    r_geo = client.get("/api/export/building/b-auk-pacifica?format=geojson3d")
    assert r_geo.status_code == 200, f"3D GeoJSON export failed: {r_geo.text}"
    geo_json = r_geo.json()
    assert geo_json["type"] == "FeatureCollection"
    print("  [OK] 3D GeoJSON Export OK:", len(geo_json["features"]), "3D polyhedral features exported")

    print("\nTesting /api/ledger/blocks & /api/ledger/verify...")
    r_ledger = client.get("/api/ledger/blocks?region=auckland")
    assert r_ledger.status_code == 200, f"Ledger blocks failed: {r_ledger.text}"
    ledger_data = r_ledger.json()
    print("  [OK] Ledger Chain OK:", ledger_data["total_blocks"], "blocks | Merkle Root:", ledger_data["merkle_root"][:16] + "...")

    r_verify = client.get("/api/ledger/verify/NZ-AUK-CBD-UN-000201-5601-2")
    assert r_verify.status_code == 200, f"Ledger verify failed: {r_verify.text}"
    ver_res = r_verify.json()
    assert ver_res["is_cryptographically_valid"] is True
    print("  [OK] Ledger Verification OK:", ver_res["ulpin"], "Status:", ver_res["status"], "in Block #", ver_res["found_in_block"])

    print("\n[SUCCESS] ALL 13 BACKEND TEST SUITES PASSED CLEANLY (100% SUCCESS)!")

if __name__ == "__main__":
    test_all_endpoints()
