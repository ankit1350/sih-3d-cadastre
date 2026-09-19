"""
Sample DXF Generator for SIH 3D Cadastre
Generates standard AutoCAD R2010 (AC1024) DXF blueprint drawings with:
- Outer building envelope walls on layer 'A-WALL-EXTR'
- Internal apartment partition walls on layer 'A-WALL-INTR'
- Unit boundary polylines on layer 'A-AREA-UNITS'
- Central lift lobby and staircase on layer 'A-CORE-CIRC'
- MTEXT annotations and dimensions for each unit
"""

import os
import ezdxf
from ezdxf import units


def create_pune_tower5_dxf(output_path: str = "data/samples/pune_hinjewadi_tower5_floor14.dxf"):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    doc = ezdxf.new("R2010")
    doc.units = units.M
    msp = doc.modelspace()

    # Define CAD Layers with distinct AutoCAD Color Index (ACI)
    doc.layers.add("A-WALL-EXTR", color=7)      # White/Black Outer Wall
    doc.layers.add("A-WALL-INTR", color=8)      # Dark Grey Partition Walls
    doc.layers.add("A-AREA-UNITS", color=3)     # Green Unit Boundaries
    doc.layers.add("A-CORE-CIRC", color=1)      # Red Elevator/Stair Core
    doc.layers.add("A-ANNO-TEXT", color=4)      # Cyan Text Labels
    doc.layers.add("A-ANNO-DIMS", color=2)      # Yellow Dimension Lines

    # Building dimensions: 32m width x 40m length
    W, L = 32.0, 40.0

    # 1. Outer Building Envelope
    msp.add_lwpolyline(
        [(0, 0), (W, 0), (W, L), (0, L), (0, 0)],
        dxfattribs={"layer": "A-WALL-EXTR", "lineweight": 50, "closed": True}
    )

    # 2. Central Core / Elevator Lobby (from x=13.0 to 19.0, y=8.0 to 32.0)
    core_pts = [(13.0, 8.0), (19.0, 8.0), (19.0, 32.0), (13.0, 32.0), (13.0, 8.0)]
    msp.add_lwpolyline(core_pts, dxfattribs={"layer": "A-CORE-CIRC", "lineweight": 35, "closed": True})
    msp.add_mtext("CENTRAL LIFT LOBBY\n& FIRE ESCAPE\nArea: 144.0 m²", dxfattribs={"layer": "A-ANNO-TEXT"}).set_location((16.0, 20.0), attachment_point=5)

    # 3. Four Residential Units (LWPOLYLINE closed boundaries on A-AREA-UNITS)
    # Unit 1401 (NW - 3 BHK Premium): x: 0..13, y: 20..40 (Area: 260 m² gross / 118.5 m² net)
    u1401_pts = [(0, 20.0), (13.0, 20.0), (13.0, 40.0), (0, 40.0), (0, 20.0)]
    msp.add_lwpolyline(u1401_pts, dxfattribs={"layer": "A-AREA-UNITS", "lineweight": 25, "closed": True})
    msp.add_mtext("FLAT 1401 (3 BHK)\nCarpet: 118.5 m²\nBUA: 142.2 m²", dxfattribs={"layer": "A-ANNO-TEXT"}).set_location((6.5, 30.0), attachment_point=5)

    # Unit 1402 (SW - 2 BHK Comfort): x: 0..13, y: 0..20 (Area: 260 m² gross / 82.4 m² net)
    u1402_pts = [(0, 0), (13.0, 0), (13.0, 20.0), (0, 20.0), (0, 0)]
    msp.add_lwpolyline(u1402_pts, dxfattribs={"layer": "A-AREA-UNITS", "lineweight": 25, "closed": True})
    msp.add_mtext("FLAT 1402 (2 BHK)\nCarpet: 82.4 m²\nBUA: 98.8 m²", dxfattribs={"layer": "A-ANNO-TEXT"}).set_location((6.5, 10.0), attachment_point=5)

    # Unit 1403 (SE - 2 BHK Comfort): x: 19..32, y: 0..20 (Area: 260 m² gross / 82.4 m² net)
    u1403_pts = [(19.0, 0), (32.0, 0), (32.0, 20.0), (19.0, 20.0), (19.0, 0)]
    msp.add_lwpolyline(u1403_pts, dxfattribs={"layer": "A-AREA-UNITS", "lineweight": 25, "closed": True})
    msp.add_mtext("FLAT 1403 (2 BHK)\nCarpet: 82.4 m²\nBUA: 98.8 m²", dxfattribs={"layer": "A-ANNO-TEXT"}).set_location((25.5, 10.0), attachment_point=5)

    # Unit 1404 (NE - 3 BHK Premium): x: 19..32, y: 20..40 (Area: 260 m² gross / 118.5 m² net)
    u1404_pts = [(19.0, 20.0), (32.0, 20.0), (32.0, 40.0), (19.0, 40.0), (19.0, 20.0)]
    msp.add_lwpolyline(u1404_pts, dxfattribs={"layer": "A-AREA-UNITS", "lineweight": 25, "closed": True})
    msp.add_mtext("FLAT 1404 (3 BHK)\nCarpet: 118.5 m²\nBUA: 142.2 m²", dxfattribs={"layer": "A-ANNO-TEXT"}).set_location((25.5, 30.0), attachment_point=5)

    doc.saveas(output_path)
    print(f"Generated Pune Tower 5 DXF Blueprint: {output_path}")
    return output_path


def create_auckland_pacifica_dxf(output_path: str = "data/samples/auckland_pacifica_floor28.dxf"):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    doc = ezdxf.new("R2010")
    doc.units = units.M
    msp = doc.modelspace()

    doc.layers.add("A-WALL-EXTR", color=7)
    doc.layers.add("A-WALL-INTR", color=8)
    doc.layers.add("A-AREA-UNITS", color=5)     # Blue Units
    doc.layers.add("A-CORE-CIRC", color=1)
    doc.layers.add("A-ANNO-TEXT", color=4)

    # Pacifica Floor 28 Footprint (approx 36m x 28m)
    W, L = 36.0, 28.0

    msp.add_lwpolyline(
        [(0, 0), (W, 0), (W, L), (0, L), (0, 0)],
        dxfattribs={"layer": "A-WALL-EXTR", "lineweight": 50, "closed": True}
    )

    # Central Core
    msp.add_lwpolyline(
        [(15.0, 6.0), (21.0, 6.0), (21.0, 22.0), (15.0, 22.0), (15.0, 6.0)],
        dxfattribs={"layer": "A-CORE-CIRC", "lineweight": 35, "closed": True}
    )
    msp.add_mtext("ELEVATOR & LOBBY\nPacifica F28", dxfattribs={"layer": "A-ANNO-TEXT"}).set_location((18.0, 14.0), attachment_point=5)

    # 4 Luxury Stratum Units
    # Flat 2801 (Harbour View 2BHK - NW)
    msp.add_lwpolyline([(0, 14.0), (15.0, 14.0), (15.0, 28.0), (0, 28.0), (0, 14.0)], dxfattribs={"layer": "A-AREA-UNITS", "closed": True})
    msp.add_mtext("FLAT 2801 (Harbour 2BHK)\nCarpet: 92.4 m²", dxfattribs={"layer": "A-ANNO-TEXT"}).set_location((7.5, 21.0), attachment_point=5)

    # Flat 2802 (City View 2BHK - SW)
    msp.add_lwpolyline([(0, 0), (15.0, 0), (15.0, 14.0), (0, 14.0), (0, 0)], dxfattribs={"layer": "A-AREA-UNITS", "closed": True})
    msp.add_mtext("FLAT 2802 (City 2BHK)\nCarpet: 88.0 m²", dxfattribs={"layer": "A-ANNO-TEXT"}).set_location((7.5, 7.0), attachment_point=5)

    # Flat 2803 (Executive 1BHK - SE)
    msp.add_lwpolyline([(21.0, 0), (36.0, 0), (36.0, 14.0), (21.0, 14.0), (21.0, 0)], dxfattribs={"layer": "A-AREA-UNITS", "closed": True})
    msp.add_mtext("FLAT 2803 (Exec 1BHK)\nCarpet: 64.5 m²", dxfattribs={"layer": "A-ANNO-TEXT"}).set_location((28.5, 7.0), attachment_point=5)

    # Flat 2804 (Luxury Corner - NE)
    msp.add_lwpolyline([(21.0, 14.0), (36.0, 14.0), (36.0, 28.0), (21.0, 28.0), (21.0, 14.0)], dxfattribs={"layer": "A-AREA-UNITS", "closed": True})
    msp.add_mtext("FLAT 2804 (Corner 2BHK)\nCarpet: 88.5 m²", dxfattribs={"layer": "A-ANNO-TEXT"}).set_location((28.5, 21.0), attachment_point=5)

    doc.saveas(output_path)
    print(f"Generated Auckland Pacifica DXF Blueprint: {output_path}")
    return output_path


if __name__ == "__main__":
    create_pune_tower5_dxf()
    create_auckland_pacifica_dxf()

