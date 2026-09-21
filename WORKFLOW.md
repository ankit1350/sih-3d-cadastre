# End-to-End System Workflow: SIH 3D Cadastre & 3D Bhu-Aadhaar Platform

This document provides a comprehensive, technical walkthrough of how the **3D Cadastre & 3D Bhu-Aadhaar Platform** operates internally. It explains the exact data flows, computer vision algorithms, point cloud signal processing, spatial geometry generation, and front-to-back architecture that power the system.

---

## 1. High-Level System Architecture

The platform operates across three interconnected layers:

```
+---------------------------------------------------------------------------------------------------+
|                                      1. DATA INGESTION & AI PIPELINE                              |
|  [Drone Orthomosaics]        [LiDAR Point Clouds]       [CAD DXF Floorplans]    [2D Cadastral GIS]|
|        | (OpenCV)                   | (laspy + scipy)           | (ezdxf)               | (GeoJSON)|
|        v                            v                           v                       v         |
|  Roof Contours Extraction   Vertical Peak Slicing       Room Vectorization      Base Land Parcels |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                  2. SPATIAL GENERATOR & POSTGIS LEDGER                            |
|       * ISO 19152 LADM Solid Extrusion (LoD1 -> LoD2 -> LoD3 Watertight Polyhedrons)              |
|       * ISO 7064 Modulo 11,2 Checksum 3D ULPIN Derivation                                         |
|       * 3D Topology Audit & Clash Detection (ST_3DIntersects, Euler-Poincaré 2-Manifold)          |
|       * PostgreSQL 16 + PostGIS 3.4 (with SQLite Spatialite local cache fallback)                 |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                  3. INTERACTIVE 3D WEBGL CLIENT (REACT 19)                        |
|       * CesiumJS WebGL 2.0 Ellipsoidal Globe (EPSG:4326 + MSL Orthometric Vertical Datum)         |
|       * Interactive Raycasting DrillPick (Building Envelopes, Concrete Slabs, Units)             |
|       * Subterranean / Underground Transparency (CRL Twin Rail, Power Cables, Gas Conduits)       |
|       * Digital 3D Property Card Certificate with QR-Code Verification                            |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Stage-by-Stage Internal Execution Flow

### Stage 1: Drone Orthomosaic Building Extraction (Computer Vision)
* **Code Location**: [`gis/ai/drone_building_extractor.py`](file:///d:/Downloads/sih/sih-3d-cadastre/gis/ai/drone_building_extractor.py)
* **Input**: Aerial high-resolution drone orthomosaic image (`.png` / `.tif`).
* **Goal**: Automatically extract real-world polygon footprints of buildings without manual human digitizing.

#### What happens internally:
1. **Matrix Ingestion**: The aerial photograph is read into memory as a NumPy matrix via `cv2.imread()`.
2. **Channel Reduction**: Converted from 3-channel RGB to single-channel 8-bit grayscale using `cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)`.
3. **Gaussian Smoothing**: A $5 \times 5$ kernel Gaussian filter (`cv2.GaussianBlur`) suppresses sensor noise and roof texture artifacts.
4. **Adaptive Thresholding + Canny Edge Isolation**:
   * Otsu’s binarization automatically calculates the optimum threshold separating illuminated building rooftops from surrounding ground.
   * `cv2.Canny(blurred, 50, 150)` computes directional gradient vectors to find sharp building outline edges.
5. **Morphological Closing**: A $7 \times 7$ rectangular structuring element (`cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)`) closes boundary gaps caused by rooftop HVAC units, vents, and casting shadows.
6. **Boundary Contour Detection**: `cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)` extracts external boundary coordinate chains.
7. **Vector Simplification (Douglas-Peucker Algorithm)**:
   $$\epsilon = 0.02 \times \text{arcLength}(C)$$
   `cv2.approxPolyDP(cnt, epsilon, True)` converts thousands of raster boundary pixels into a simplified 4-to-8-point clean geometric polygon.
8. **Affine Georeferencing Transformation**:
   The pixel coordinates $(u, v)$ are mapped to real-world WGS84 GPS Lat/Lon coordinates $(\lambda, \phi)$ via an affine transformation:
   $$\lambda = \lambda_0 + u \cdot \Delta\lambda, \quad \phi = \phi_0 - v \cdot \Delta\phi$$
9. **Intersection-over-Union (IoU) Validation**: The extracted polygon is evaluated against the 2D cadastral land registry. IoU values $> 95\%$ confirm automated acceptance.

---

### Stage 2: LiDAR Point Cloud Ingestion & Floor Slab Slicing
* **Code Location**: [`gis/ai/lidar_floor_segmentation.py`](file:///d:/Downloads/sih/sih-3d-cadastre/gis/ai/lidar_floor_segmentation.py) & [`backend/app/api/pipeline.py`](file:///d:/Downloads/sih/sih-3d-cadastre/backend/app/api/pipeline.py)
* **Input**: ASPRS Standard LAS/LAZ Point Cloud files (`.las`, `.laz`).
* **Goal**: Automatically discover building height, roof elevation, and the exact physical elevation of every concrete floor slab inside the high-rise tower.

#### What happens internally:
1. **Binary Decompression**: The `laspy` library parses the binary ASPRS LAS file headers, scale factors, and coordinate offsets.
2. **Classification Filtering**:
   * Points are separated by ASPRS standard classification codes:
     * `Classification == 2`: Ground returns (used to calculate ground surface datum $Z_{\text{base}}$).
     * `Classification == 6`: Building returns (points striking walls, balconies, and roofs).
3. **1D Vertical Density Histogram**:
   * The $Z$ elevations of all building returns are projected onto a 1D vertical line and binned into a fine-grained elevation histogram:
     $$H(z) = \sum_{i=1}^{N} \delta(\text{bin}(z_i) - z)$$
4. **Signal Peak Detection**:
   * Concrete floor slabs have thick horizontal mass, causing high point return densities at regular vertical intervals.
   * `scipy.signal.find_peaks(H, height=\mu \cdot 0.35, distance=2)` isolates local density maxima.
   * Each detected peak represents an inter-floor slab (e.g. Floor 1 at $+7.2\text{m}$, Floor 28 at $+96.8\text{m}$, Floor 56 at $+185.0\text{m}$ MSL).
5. **Storey Parametrization**:
   * Storey heights ($h \approx 3.2\text{m}$), structural slab plate thicknesses ($0.28\text{m}$), and ceiling clearances are computed per level.

---

### Stage 3: Architectural CAD Blueprint Parsing
* **Code Location**: [`gis/ai/dxf_floorplan_parser.py`](file:///d:/Downloads/sih/sih-3d-cadastre/gis/ai/dxf_floorplan_parser.py)
* **Input**: AutoCAD `.dxf` architectural drawing files.
* **Goal**: Extract internal apartment units, corridors, elevators, and refuge areas.

#### What happens internally:
1. **AutoCAD ModelSpace Parsing**: `ezdxf.readfile(path)` loads the entity database.
2. **Entity Isolation**:
   * `LWPOLYLINE` entities are extracted as candidate room boundaries.
   * `TEXT` and `MTEXT` labels are extracted (e.g., "Flat 5601", "3BHK Luxury", "Lift Core").
3. **Closed Loop Verification**: Polylines with matching start and end vertices are retained as valid 2D unit footprints.
4. **Centroid-Label Association**: Raycasting point-in-polygon tests associate each room label with its bounding polyline.
5. **Spatial Scale & Translation**:
   The local CAD coordinates (measured in architectural millimeters or meters) are scaled and georeferenced to fit precisely inside the building's outer polygon footprint:
   $$\mathbf{P}_{\text{geo}} = \mathbf{P}_{\text{bldg\_origin}} + \mathbf{R}(\theta) \cdot \frac{\mathbf{P}_{\text{cad}}}{\text{Scale}}$$

---

### Stage 4: 3D Volumetric Solid Construction (ISO 19152 LADM)
* **Code Location**: [`gis/ai/volumetric_cadastre_generator.py`](file:///d:/Downloads/sih/sih-3d-cadastre/gis/ai/volumetric_cadastre_generator.py)
* **Input**: 2D footprint + Floor elevations + Unit subdivisions.
* **Goal**: Generate watertight 3D polyhedral prisms for each property unit.

#### What happens internally:
1. **Face Extrusion**:
   For each 2D polygon with $K$ vertices:
   $$\{(x_1, y_1), (x_2, y_2), \dots, (x_K, y_K)\}$$
   and vertical range $[Z_{\text{base}}, Z_{\text{roof}}]$, the algorithm constructs:
   * 1 Bottom horizontal polygon face at $Z_{\text{base}}$.
   * 1 Top horizontal polygon face at $Z_{\text{roof}}$.
   * $K$ Vertical quadrilateral side wall faces connecting $(x_i, y_i, Z_{\text{base}})$ to $(x_{i+1}, y_{i+1}, Z_{\text{roof}})$.
2. **Volume Computation**:
   $$\text{Volume} = \text{Carpet Area} \times (Z_{\text{roof}} - Z_{\text{base}})$$
3. **Polyhedral Export**:
   The output geometry is formatted into standard spatial exchange formats:
   * **OGC CityGML 2.0 / 3.0**: `<bldg:BuildingPart>` XML format with LoD2/LoD3 surface geometries.
   * **RFC 7946 3D GeoJSON**: MultiPolygon with 3D coordinate tuples `[longitude, latitude, elevation_msl]`.

---

### Stage 5: 3D ULPIN (Bhu-Aadhaar 3D) Generation & Checksum Derivation
* **Code Location**: [`backend/app/api/ulpin.py`](file:///d:/Downloads/sih/sih-3d-cadastre/backend/app/api/ulpin.py)
* **Input**: Spatial unit parameters (Country, State, District, Locality, Layer, Sequence, Floor, Unit).
* **Goal**: Generate a globally unique, tamper-proof 3D cadastral identifier.

#### Mathematical Algorithm:
1. **Raw Identifier Assembly**:
   ```
   [Country]-[State]-[District]-[Locality]-[Layer]-[BuildingSeq]-[FloorSeq][UnitSeq]
   Example: NZ-AUK-CBD-PACF-UN-000201-5601
   ```
   * `UN`: Volumetric 3D Property Unit.
   * `000201`: Registered Building Sequence.
   * `5601`: Floor 56, Suite 01.
2. **ISO 7064 Modulo 11,2 Check Digit Calculation**:
   The cleaned alphanumeric string is processed through a checksum accumulator:
   $$\text{total} = 0$$
   $$\text{For each character } c: \quad \text{total} = ((\text{total} + \text{val}(c)) \times 2) \pmod{11}$$
   $$\text{check\_val} = (12 - \text{total}) \pmod{11}$$
   $$\text{If } \text{check\_val} = 10 \implies \text{"X"}, \quad \text{else } \text{str}(\text{check\_val})$$
3. **Final 3D ULPIN**:
   `NZ-AUK-CBD-UN-000201-5601-2`
4. **Cryptographic Integrity Hash**:
   A SHA-256 hash is generated by combining:
   $$\text{Hash} = \text{SHA256}(\text{ULPIN} \,\|\, \text{OwnerName} \,\|\, \text{CentroidLatLonZ} \,\|\, \text{TitleReference})$$
   This hash is encoded directly into the citizen’s **3D Property Card QR Code** for instantaneous fraud-proof mobile scanning.

---

### Stage 6: 3D Topology Validation & Clash Detection
* **Code Location**: [`gis/validation/topology.py`](file:///d:/Downloads/sih/sih-3d-cadastre/gis/validation/topology.py) & [`backend/app/api/topology.py`](file:///d:/Downloads/sih/sih-3d-cadastre/backend/app/api/topology.py)
* **Goal**: Ensure no two property units occupy the same 3D airspace, and guarantee mathematical solid validity.

#### Verification Checks:
1. **Watertight 2-Manifold Verification**:
   Uses the classical Euler-Poincaré topological formula:
   $$V - E + F = 2(1 - g)$$
   * $V$: Vertex count, $E$: Edge count, $F$: Face count, $g$: Genus (number of holes, $0$ for standard rooms).
   * Verifies that every edge is shared by exactly two adjacent faces with no open holes or self-intersections.
2. **Volumetric Encroachment & Clash Detection**:
   In PostgreSQL + PostGIS, 3D solids $A$ and $B$ are checked using 3D spatial primitives:
   ```sql
   SELECT ST_3DIntersects(geom_a, geom_b);
   SELECT ST_Volume(ST_3DIntersection(geom_a, geom_b));
   ```
   * If $\text{Overlap Volume} > 0.001\text{ m}^3$, the system raises a **3D Cadastral Encroachment Alert**, displaying the exact clash volume in cubic meters.

---

### Stage 7: WebGL 3D Globe Rendering & Raycasting (Frontend)
* **Code Location**: [`frontend/src/components/Cesium3DViewer.jsx`](file:///d:/Downloads/sih/sih-3d-cadastre/frontend/src/components/Cesium3DViewer.jsx)
* **Goal**: Deliver a 60 FPS, interactive 3D browser client capable of slicing buildings, isolating floors, and viewing sub-surface utilities.

#### Internal Rendering & Interaction Pipeline:
1. **Dual Scene Layering**:
   * **CesiumJS WebGL Canvas**: Directly renders satellite imagery pyramids, 3D building solid meshes, LiDAR point clouds, and sub-surface pipes on the GPU.
   * **React 19 Glassmorphic DOM Overlay**: Renders the floating inspector HUD, floor selector pills, and property card drawers without burdening the WebGL canvas.
2. **Raycasting DrillPick (Entity Selection)**:
   * When a user clicks on the 3D map canvas, Cesium casts a ray from the camera lens through the cursor screen position into 3D world space:
     ```javascript
     const pickedObjects = scene.drillPick(movement.position);
     ```
   * **Hierarchical Resolution**:
     1. Prioritizes individual flat units (`u-...`).
     2. Next prioritizes structural floor slabs (`slab-...`).
     3. Next prioritizes the building envelope (`b-...`).
3. **Centroid-Targeted Camera Framing (`focusOnBuilding`)**:
   * Instead of resetting the view to default city coordinates, the camera computes the exact 3D centroid $[c_{\text{lon}}, c_{\text{lat}}]$ and mid-height of the clicked structure.
   * Calls `viewer.camera.flyToBoundingSphere` preserving the user’s active azimuth angle (`viewer.camera.heading`), pitching down at $-28^\circ$ with a distance scaled dynamically to building height.
4. **Subterranean Visualization Mode**:
   * Toggling "Underground Mode" activates Cesium globe translucency:
     ```javascript
     scene.globe.translucency.enabled = true;
     ```
   * Renders the City Rail Link (CRL) twin train tunnel at $-24.0\text{m}$ MSL depth, high-voltage power conduits at $-3.2\text{m}$, and water pipelines with true negative elevation.

---

## 3. Data Flow Diagram

```
+-------------------------------------------------------------------------------+
|                             RAW ASSET INGESTION                               |
|   +-----------------------+     +--------------------+    +---------------+   |
|   | Drone Ortho Image     |     | ASPRS LiDAR (.las) |    | CAD DXF File  |   |
|   +-----------+-----------+     +---------+----------+    +-------+-------+   |
+---------------|---------------------------|-----------------------|-----------+
                |                           |                       |
                v                           v                       v
+-------------------------------+ +--------------------+ +----------------------+
| OpenCV Canny / Contour Engine | | SciPy Peak Slicing | | ezdxf Room Extractor |
| (Extracts Ground Footprints)  | | (Extracts Storeys) | | (Extracts Units)     |
+---------------+---------------+ +---------+----------+ +----------+-----------+
                |                           |                       |
                +------------------->+<-----+-----------------------+
                                     |
                                     v
                  +--------------------------------------+
                  | 3D Volumetric Solid Generator        |
                  | (Watertight LoD2/LoD3 Polyhedrons)   |
                  +------------------+-------------------+
                                     |
                                     v
                  +--------------------------------------+
                  | ISO 7064 Modulo 11,2 Checksum Engine |
                  | (Generates Verified 3D ULPIN)        |
                  +------------------+-------------------+
                                     |
                                     v
                  +--------------------------------------+
                  | 3D Topology Audit & Clash Detection  |
                  | (ST_3DIntersects, Euler-Poincaré)    |
                  +------------------+-------------------+
                                     |
                  +------------------+-------------------+
                  |                                      |
                  v                                      v
+------------------------------------+ +----------------------------------------+
| PostGIS 3D Spatial Database        | | CesiumJS WebGL 3D Globe Viewer         |
| (Stratum Titles, Land Ledger, UDS) | | (Raycasting, Dynamic Slicing, QR Card) |
+------------------------------------+ +----------------------------------------+
```

---

## 4. Summary of Key Algorithms & Formats

| Component | Technical Implementation | Purpose |
| :--- | :--- | :--- |
| **Footprint Extraction** | OpenCV Canny + Otsu + `approxPolyDP` | Converts drone aerial raster imagery to vector cadastral polygons |
| **Storey Slicing** | 1D Density Histogram + `scipy.signal.find_peaks` | Discovers concrete floor slab heights from LiDAR laser returns |
| **Blueprint Parsing** | `ezdxf` LWPOLYLINE & MTEXT Extraction | Converts 2D architectural CAD drawings into interior unit boundaries |
| **3D Solid Construction** | Polygon Surface Extrusion (ISO 19152 LADM) | Generates watertight LoD2/LoD3 volumetric cadastre prisms |
| **Identifier Derivation** | ISO 7064 Modulo 11,2 Algorithm | Generates unique, tamper-proof 3D ULPIN (Bhu-Aadhaar 3D) codes |
| **Clash Detection** | PostGIS `ST_3DIntersects` & Euler-Poincaré | Prevents overlapping ownership of 3D airspace & ensures manifold solids |
| **3D Rendering** | CesiumJS WebGL 2.0 + React 19 Transitions | 60 FPS interactive globe rendering with zero GPU overhead |
| **Citizen Verification** | SHA-256 Dynamic QR Code Generation | Provides instant smartphone verification of 3D property deeds |
