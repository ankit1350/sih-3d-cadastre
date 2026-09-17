"""
Sample LiDAR Point Cloud Generator (ASPRS LAS Format)
Creates authentic binary LAS files with realistic urban high-rise points,
ASPRS classifications (Ground=2, Building=6, Vegetation=5), and UTM coordinates.
"""

import os
import numpy as np
import laspy


def create_sample_lidar_file(
    output_path: str = "data/reference/lidar/hinjewadi_tower5_sample.las",
    center_easting: float = 366150.0,   # UTM Zone 43N Easting (Pune)
    center_northing: float = 2056200.0, # UTM Zone 43N Northing (Pune)
    base_elevation: float = 561.2,      # MSL Base Elevation (Meters)
    building_height: float = 76.8,      # 26 Storeys
    floor_count: int = 26,
    num_points: int = 75000,
) -> str:
    """
    Constructs a standard binary LAS point cloud containing:
    - Ground terrain returns (Class 2)
    - 26-storey high-rise concrete slab & facade returns (Class 6)
    - Surrounding trees / riparian buffer returns (Class 5)
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # 1. Create LAS Header (Point Format 3 with GPS Time & Color)
    header = laspy.LasHeader(point_format=3, version="1.2")
    header.offsets = [center_easting, center_northing, base_elevation]
    header.scales = [0.001, 0.001, 0.001]  # Millimeter precision

    las = laspy.LasData(header)

    xs, ys, zs = [], [], []
    classifications = []
    intensities = []

    # 2. Generate Ground Terrain (Class 2)
    ground_count = num_points // 4
    gx = np.random.uniform(center_easting - 80, center_easting + 80, ground_count)
    gy = np.random.uniform(center_northing - 80, center_northing + 80, ground_count)
    gz = np.random.normal(base_elevation, 0.15, ground_count)
    xs.extend(gx)
    ys.extend(gy)
    zs.extend(gz)
    classifications.extend([2] * ground_count)
    intensities.extend(np.random.randint(50, 120, ground_count))

    # 3. Generate High-Rise Building Tower 5 (Class 6)
    tower_pts_per_floor = (num_points // 2) // floor_count
    floor_height = building_height / floor_count

    for f in range(floor_count):
        slab_z = base_elevation + (f * floor_height)

        # Slab perimeter & interior returns
        bx = np.random.uniform(center_easting - 16, center_easting + 16, tower_pts_per_floor)
        by = np.random.uniform(center_northing - 16, center_northing + 16, tower_pts_per_floor)
        bz = np.random.normal(slab_z, 0.03, tower_pts_per_floor)

        xs.extend(bx)
        ys.extend(by)
        zs.extend(bz)
        classifications.extend([6] * tower_pts_per_floor)
        intensities.extend(np.random.randint(180, 255, tower_pts_per_floor))

    # Roof slab
    roof_pts = 5000
    rx = np.random.uniform(center_easting - 16, center_easting + 16, roof_pts)
    ry = np.random.uniform(center_northing - 16, center_northing + 16, roof_pts)
    rz = np.random.normal(base_elevation + building_height, 0.04, roof_pts)
    xs.extend(rx)
    ys.extend(ry)
    zs.extend(rz)
    classifications.extend([6] * roof_pts)
    intensities.extend(np.random.randint(200, 255, roof_pts))

    # 4. Generate Vegetation / Trees (Class 5)
    veg_count = num_points // 8
    vx = np.random.uniform(center_easting + 30, center_easting + 70, veg_count)
    vy = np.random.uniform(center_northing - 70, center_northing - 20, veg_count)
    vz = np.random.uniform(base_elevation + 0.5, base_elevation + 12.0, veg_count)
    xs.extend(vx)
    ys.extend(vy)
    zs.extend(vz)
    classifications.extend([5] * veg_count)
    intensities.extend(np.random.randint(30, 90, veg_count))

    # 5. Populate LAS data arrays
    las.x = np.array(xs)
    las.y = np.array(ys)
    las.z = np.array(zs)
    las.classification = np.array(classifications, dtype=np.uint8)
    las.intensity = np.array(intensities, dtype=np.uint16)

    # 6. Write binary LAS file
    las.write(output_path)
    return output_path


if __name__ == "__main__":
    out = create_sample_lidar_file()
    print(f"Created sample LiDAR file: {out}")
    # Verify file
    f = laspy.read(out)
    print(f"Verified LAS: {len(f.points)} points | Z-range: {f.z.min():.2f}m to {f.z.max():.2f}m")
