"""
Generates a realistic binary ASPRS LAS 1.2 point cloud for Auckland CBD (New Zealand)
Centered around Commercial Bay / The Pacifica / Britomart / Waitematā Harbour
Coordinates: WGS84 ~174.7663° E, -36.8436° S (Projected EPSG:2193 / NZGD2000 or WGS84 UTM)
Vertical datum: Auckland 1946 / NZVD2016 (Mean Sea Level, Base 6.0m to 178.0m)
"""

import os
import numpy as np
import laspy


def generate_auckland_cbd_las(
    output_path: str = "data/reference/lidar/auckland_cbd_sample.las",
    center_lon: float = 174.7663,
    center_lat: float = -36.8436,
    base_msl: float = 6.8,
    tower_height: float = 171.2,
    num_floors: int = 54,
):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    print(f"[Auckland LiDAR] Generating 3D LAS point cloud for Auckland CBD...")

    total_points = []
    classifications = []
    intensities = []

    # 1. Ground Points (Pavement, Queen St, Customs St, Quay St Waterfront) - Class 2
    n_ground = 25000
    gx = np.random.uniform(center_lon - 0.003, center_lon + 0.003, n_ground)
    gy = np.random.uniform(center_lat - 0.003, center_lat + 0.003, n_ground)
    gz = np.random.normal(base_msl, 0.25, n_ground)
    ground_pts = np.column_stack([gx, gy, gz])
    total_points.append(ground_pts)
    classifications.extend([2] * n_ground)
    intensities.extend(np.random.randint(25, 90, n_ground))

    # 2. Harbour / Water Surface (Waitematā Basin) - Class 9
    n_water = 8000
    wx = np.random.uniform(center_lon - 0.003, center_lon + 0.003, n_water)
    wy = np.random.uniform(center_lat + 0.0015, center_lat + 0.0035, n_water)
    wz = np.random.normal(0.8, 0.08, n_water)
    water_pts = np.column_stack([wx, wy, wz])
    total_points.append(water_pts)
    classifications.extend([9] * n_water)
    intensities.extend(np.random.randint(5, 25, n_water))

    # 3. High-Rise Tower (The Pacifica / Commercial Bay) - Class 6 (Building)
    # Footprint: ~ 45m x 45m (~0.0004 deg lon x 0.0004 deg lat)
    floor_height = tower_height / num_floors  # ~3.17m per floor
    b_min_x, b_max_x = center_lon - 0.00025, center_lon + 0.00025
    b_min_y, b_max_y = center_lat - 0.00025, center_lat + 0.00025

    b_pts_list = []
    # Floor slabs (high density horizontal returns)
    for f in range(num_floors + 1):
        slab_z = base_msl + (f * floor_height)
        n_slab = 1400 if (f == 0 or f == num_floors) else 750
        fx = np.random.uniform(b_min_x, b_max_x, n_slab)
        fy = np.random.uniform(b_min_y, b_max_y, n_slab)
        fz = np.random.normal(slab_z, 0.035, n_slab)
        b_pts_list.append(np.column_stack([fx, fy, fz]))

    # Facade / Wall returns
    n_facade = 22000
    facade_z = np.random.uniform(base_msl, base_msl + tower_height, n_facade)
    wall_choice = np.random.choice([0, 1, 2, 3], size=n_facade)
    facade_x = np.zeros(n_facade)
    facade_y = np.zeros(n_facade)
    for i, w in enumerate(wall_choice):
        if w == 0:  # North wall
            facade_x[i] = np.random.uniform(b_min_x, b_max_x)
            facade_y[i] = b_max_y + np.random.normal(0, 0.00001)
        elif w == 1:  # South wall
            facade_x[i] = np.random.uniform(b_min_x, b_max_x)
            facade_y[i] = b_min_y + np.random.normal(0, 0.00001)
        elif w == 2:  # East wall
            facade_x[i] = b_max_x + np.random.normal(0, 0.00001)
            facade_y[i] = np.random.uniform(b_min_y, b_max_y)
        else:  # West wall
            facade_x[i] = b_min_x + np.random.normal(0, 0.00001)
            facade_y[i] = np.random.uniform(b_min_y, b_max_y)

    b_pts_list.append(np.column_stack([facade_x, facade_y, facade_z]))
    building_pts = np.vstack(b_pts_list)
    total_points.append(building_pts)
    classifications.extend([6] * len(building_pts))
    intensities.extend(np.random.randint(110, 240, len(building_pts)))

    # 4. Urban Vegetation & Street Canopy (Albert Park / Quay St Palms) - Class 5
    n_veg = 6000
    vx = np.random.uniform(center_lon - 0.0028, center_lon + 0.0028, n_veg)
    vy = np.random.uniform(center_lat - 0.0028, center_lat - 0.001, n_veg)
    vz = base_msl + np.random.exponential(3.2, n_veg)
    veg_pts = np.column_stack([vx, vy, vz])
    total_points.append(veg_pts)
    classifications.extend([5] * n_veg)
    intensities.extend(np.random.randint(40, 110, n_veg))

    # Combine all
    all_xyz = np.vstack(total_points)
    all_class = np.array(classifications, dtype=np.uint8)
    all_intensity = np.array(intensities, dtype=np.uint16)

    # Create LAS 1.2 Header
    header = laspy.LasHeader(point_format=3, version="1.2")
    header.scales = np.array([1e-7, 1e-7, 0.001])
    header.offsets = np.array([center_lon, center_lat, base_msl])

    las = laspy.LasData(header)
    las.x = all_xyz[:, 0]
    las.y = all_xyz[:, 1]
    las.z = all_xyz[:, 2]
    las.classification = all_class
    las.intensity = all_intensity

    las.write(output_path)
    file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"Created Auckland CBD LAS file: {output_path}")
    print(f"  Total Points: {len(all_xyz):,} | Size: {file_size_mb:.2f} MB")
    print(f"  Ground Elevation: {base_msl}m MSL | Tower Height: {tower_height}m MSL ({num_floors} storeys)")
    return output_path


if __name__ == "__main__":
    generate_auckland_cbd_las()

