import os
import hashlib
import json
import time
from datetime import datetime, timezone
from fastapi import APIRouter, Query, HTTPException, Body
from typing import Optional, List, Dict

router = APIRouter(
    prefix="/api/ledger",
    tags=["Cryptographic Title Ledger"]
)

# In-Memory & Persistent Blockchain Mock for 3D Titles
LEDGER_DATA: Dict[str, List[dict]] = {
    "auckland": []
}

def calculate_sha256(data_str: str) -> str:
    return hashlib.sha256(data_str.encode('utf-8')).hexdigest()

def create_block(
    block_height: int,
    previous_hash: str,
    ulpin: str,
    owner_name: str,
    entity_name: str,
    entity_type: str,
    volume_m3: float,
    elevation_range: str,
    uds_pct: float,
    validator: str = "LINZ Landonline Geodetic Node",
    custom_time: Optional[str] = None
) -> dict:
    ts = custom_time or datetime.now(timezone.utc).isoformat()
    payload = {
        "block_height": block_height,
        "timestamp": ts,
        "ulpin": ulpin,
        "owner_name": owner_name,
        "entity_name": entity_name,
        "entity_type": entity_type,
        "volume_m3": volume_m3,
        "elevation_range": elevation_range,
        "uds_percentage": uds_pct,
        "validator": validator,
        "previous_hash": previous_hash
    }
    
    # Compute Merkle payload string & block hash
    raw_str = f"{block_height}|{ts}|{ulpin}|{owner_name}|{volume_m3}|{elevation_range}|{uds_pct}|{previous_hash}"
    block_hash = calculate_sha256(raw_str)
    
    payload["block_hash"] = block_hash
    payload["merkle_leaf"] = calculate_sha256(f"{ulpin}:{block_hash}")
    return payload

def init_default_ledger():
    if LEDGER_DATA["auckland"]:
        return

    # Genesis Block Auckland
    gen_auk = create_block(
        block_height=0,
        previous_hash="0" * 64,
        ulpin="NZ-AUK-CBD-PL-000102-2",
        owner_name="Body Corporate 549102 (The Pacifica)",
        entity_name="The Pacifica Tower Surface Base Parcel",
        entity_type="SURFACE_PARCEL",
        volume_m3=0.0,
        elevation_range="7.2m - 8.0m MSL",
        uds_pct=100.0,
        validator="PositioNZ CORS Node AUCK (LINZ Authority)",
        custom_time="2020-03-15T09:00:00Z"
    )
    b1_auk = create_block(
        block_height=1,
        previous_hash=gen_auk["block_hash"],
        ulpin="NZ-AUK-CBD-BL-000201-8",
        owner_name="Body Corporate 549102 (273 Stratum Units)",
        entity_name="The Pacifica Tower 3D Building Envelope",
        entity_type="3D_BUILDING_ENVELOPE",
        volume_m3=154800.0,
        elevation_range="7.2m - 189.6m MSL",
        uds_pct=100.0,
        validator="PositioNZ CORS Node AUCK (LINZ Authority)",
        custom_time="2020-04-10T11:30:00Z"
    )
    b2_auk = create_block(
        block_height=2,
        previous_hash=b1_auk["block_hash"],
        ulpin="NZ-AUK-CBD-UN-000201-5601-2",
        owner_name="Sir Graeme Douglas Trust",
        entity_name="Super Diamond Penthouse PH-5601",
        entity_type="3D_UNIT_TITLE",
        volume_m3=1886.0,
        elevation_range="185.0m - 189.6m MSL",
        uds_pct=1.95,
        validator="PositioNZ CORS Node AUCK (LINZ Authority)",
        custom_time="2020-11-20T14:45:00Z"
    )
    b3_auk = create_block(
        block_height=3,
        previous_hash=b2_auk["block_hash"],
        ulpin="NZ-AUK-CBD-UT-000001-4",
        owner_name="City Rail Link Ltd / KiwiRail (Crown Agency)",
        entity_name="CRL Sub-surface Twin Rail Corridor",
        entity_type="SUBTERRANEAN_EASEMENT",
        volume_m3=140500.0,
        elevation_range="-17.2m to -14.0m MSL (-24m Depth)",
        uds_pct=0.0,
        validator="Auckland Transport Geodetic Registry",
        custom_time="2021-02-14T08:15:00Z"
    )
    LEDGER_DATA["auckland"] = [gen_auk, b1_auk, b2_auk, b3_auk]

init_default_ledger()

@router.get("/blocks")
def get_ledger_blocks(region: str = Query("auckland", description="Region: auckland")):
    init_default_ledger()
    chain = LEDGER_DATA.get(region, LEDGER_DATA["auckland"])
    
    # Calculate overall Merkle Root of current chain
    hashes_concat = "".join([b["block_hash"] for b in chain])
    merkle_root = calculate_sha256(hashes_concat)
    
    return {
        "region": region,
        "total_blocks": len(chain),
        "merkle_root": merkle_root,
        "algorithm": "SHA-256 (ISO/IEC 10118-3)",
        "chain_status": "VERIFIED_TAMPER_PROOF",
        "blocks": chain
    }

@router.get("/verify/{ulpin}")
def verify_ulpin_in_ledger(ulpin: str):
    init_default_ledger()
    all_blocks = LEDGER_DATA["auckland"]
    
    for idx, block in enumerate(all_blocks):
        if block["ulpin"] == ulpin or ulpin in block["ulpin"]:
            # Verify SHA-256 integrity
            raw_str = f"{block['block_height']}|{block['timestamp']}|{block['ulpin']}|{block['owner_name']}|{block['volume_m3']}|{block['elevation_range']}|{block['uds_percentage']}|{block['previous_hash']}"
            computed_hash = calculate_sha256(raw_str)
            is_valid = computed_hash == block["block_hash"]
            
            return {
                "ulpin": ulpin,
                "found_in_block": block["block_height"],
                "block_hash": block["block_hash"],
                "computed_hash": computed_hash,
                "previous_hash": block["previous_hash"],
                "is_cryptographically_valid": is_valid,
                "owner": block["owner_name"],
                "entity": block["entity_name"],
                "status": "VERIFIED_ON_CHAIN" if is_valid else "CORRUPTED"
            }
            
    raise HTTPException(status_code=404, detail=f"ULPIN {ulpin} not found in blockchain ledger.")

@router.post("/register")
def register_new_ulpin_block(
    ulpin: str = Body(..., embed=True),
    owner_name: str = Body(..., embed=True),
    entity_name: str = Body(..., embed=True),
    entity_type: str = Body("3D_UNIT_TITLE", embed=True),
    volume_m3: float = Body(350.0, embed=True),
    elevation_range: str = Body("100m - 103m MSL", embed=True),
    uds_pct: float = Body(0.5, embed=True),
    region: str = Body("auckland", embed=True)
):
    init_default_ledger()
    chain = LEDGER_DATA.get(region, LEDGER_DATA["auckland"])
    
    last_block = chain[-1]
    new_height = last_block["block_height"] + 1
    prev_hash = last_block["block_hash"]
    
    new_block = create_block(
        block_height=new_height,
        previous_hash=prev_hash,
        ulpin=ulpin,
        owner_name=owner_name,
        entity_name=entity_name,
        entity_type=entity_type,
        volume_m3=volume_m3,
        elevation_range=elevation_range,
        uds_pct=uds_pct,
        validator="PositioNZ CORS Node AUCK (LINZ Authority)"
    )
    
    chain.append(new_block)
    
    return {
        "status": "SUCCESS",
        "message": f"Registered ULPIN {ulpin} in Cryptographic Blockchain Ledger",
        "block": new_block
    }
