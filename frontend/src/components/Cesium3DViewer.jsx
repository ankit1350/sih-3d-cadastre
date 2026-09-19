import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { REGIONS, BUILDINGS_DATABASE } from '../data/mockCadastral'
import { fetchLidarPoints, getExportBuildingUrl } from '../services/api'
import { ElevationProfile } from './ElevationProfile'
import { CitizenVerify } from './CitizenVerify'

const BASE_LAYERS = {
  satellite: {
    id: 'satellite',
    name: '🛰️ Satellite Imagery (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    credit: '© Esri, Maxar, Earthstar Geographics',
  },
  streets: {
    id: 'streets',
    name: '🗺️ Streets & Roads (OSM)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    credit: '© OpenStreetMap contributors',
  },
}

// Color palette for individual room/unit quadrants
const ROOM_COLORS = [
  '#10b981', // Emerald (NW Suite)
  '#3b82f6', // Marine Blue (NE Suite)
  '#f59e0b', // Amber (SE Suite)
  '#8b5cf6', // Violet (SW Suite)
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#f43f5e', // Rose
]

function getLidarColor(code, z, minZ, maxZ, intensity, mode) {
  if (mode === 'intensity') {
    const val = Math.min(1.0, Math.max(0.15, intensity / 255.0))
    return new Cesium.Color(val, val, val, 0.95)
  }
  if (mode === 'elevation') {
    const norm = Math.min(1.0, Math.max(0.0, (z - minZ) / (maxZ - minZ || 1.0)))
    if (norm < 0.2) return Cesium.Color.fromCssColorString('#3b82f6') // Blue
    if (norm < 0.4) return Cesium.Color.fromCssColorString('#06b6d4') // Cyan
    if (norm < 0.6) return Cesium.Color.fromCssColorString('#22c55e') // Green
    if (norm < 0.8) return Cesium.Color.fromCssColorString('#eab308') // Yellow
    if (norm < 0.92) return Cesium.Color.fromCssColorString('#f97316') // Orange
    return Cesium.Color.fromCssColorString('#ef4444') // Red Top
  }
  // Classification mode (ASPRS standard)
  switch (code) {
    case 2: // Ground / Pavement
      return Cesium.Color.fromCssColorString('#d97706').withAlpha(0.85)
    case 6: // Building / Facade / Slab
      return Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.95)
    case 3:
    case 4:
    case 5: // Vegetation / Canopy
      return Cesium.Color.fromCssColorString('#22c55e').withAlpha(0.9)
    case 9: // Water / Waitematā / Mula River
      return Cesium.Color.fromCssColorString('#0284c7').withAlpha(0.85)
    default:
      return Cesium.Color.fromCssColorString('#cbd5e1').withAlpha(0.8)
  }
}

export function Cesium3DViewer({
  onSelectObject,
  onSelectBuilding,
  onSelectFloor,
  onSelectUnit,
  onInspectCard,
  onGenerateUlpin,
  onToggleExpand,
  isExpanded = false,
  heightMode = 'standard',
  activeObjectId,
  activeRegion = 'auckland',
  selectedBuildingId: externalBuildingId,
  selectedFloorLevel: externalFloorLevel,
}) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const currentBaseLayerRef = useRef(null)
  const pointCollectionRef = useRef(null)

  const [activeBaseLayer, setActiveBaseLayer] = useState('satellite')
  const [sceneDimension, setSceneDimension] = useState('3d')
  const [showUnderground, setShowUnderground] = useState(true)
  const [showFlats, setShowFlats] = useState(true)
  const [showElevatorCore, setShowElevatorCore] = useState(true)
  const [showUtilities, setShowUtilities] = useState(true)
  const [xrayMode, setXrayMode] = useState(true)
  const [explosionOffset, setExplosionOffset] = useState(0)
  const [isolateFloorOnly, setIsolateFloorOnly] = useState(false)
  const [useTerrain, setUseTerrain] = useState(false)
  const [enableShadows, setEnableShadows] = useState(true)
  const [showCors, setShowCors] = useState(true)

  // LiDAR Point Cloud & Elevation Slicing State
  const [showPointCloud, setShowPointCloud] = useState(false)
  const [lidarColorMode, setLidarColorMode] = useState('classification') // 'classification' | 'elevation' | 'intensity'
  const [pointSize, setPointSize] = useState(3)
  const [sliceMaxElevation, setSliceMaxElevation] = useState(200)
  const [lidarData, setLidarData] = useState(null)
  const [lidarLoading, setLidarLoading] = useState(false)

  // Selected Building and Floor inside Viewer HUD
  const regionBuildings = useMemo(() => {
    return BUILDINGS_DATABASE[activeRegion] || BUILDINGS_DATABASE.auckland
  }, [activeRegion])

  const [internalBuildingId, setInternalBuildingId] = useState(
    externalBuildingId || regionBuildings[0]?.id || 'b-auk-pacifica'
  )
  const [internalFloorLevel, setInternalFloorLevel] = useState(
    externalFloorLevel || regionBuildings[0]?.floors[0]?.level || 'F56'
  )
  const [selectedUnit, setSelectedUnit] = useState(null)
  const [showInspectorHUD, setShowInspectorHUD] = useState(false)
  const [hudMinimized, setHudMinimized] = useState(false)
  const [copiedUlpin, setCopiedUlpin] = useState(null)
  const [showElevationModal, setShowElevationModal] = useState(false)
  const [verifyUlpinTarget, setVerifyUlpinTarget] = useState(null)
  const [showLayersDropdown, setShowLayersDropdown] = useState(false)
  const [showToolsDropdown, setShowToolsDropdown] = useState(false)

  const currentBuilding = useMemo(() => {
    const targetId = externalBuildingId || internalBuildingId
    return (
      regionBuildings.find((b) => b.id === targetId) ||
      regionBuildings[0]
    )
  }, [regionBuildings, externalBuildingId, internalBuildingId])

  const currentFloor = useMemo(() => {
    if (!currentBuilding) return null
    const targetLvl = externalFloorLevel || internalFloorLevel
    return (
      currentBuilding.floors.find((f) => f.level === targetLvl) ||
      currentBuilding.floors[0]
    )
  }, [currentBuilding, externalFloorLevel, internalFloorLevel])

  // Load LiDAR data when region changes or point cloud is toggled
  useEffect(() => {
    let active = true
    setLidarLoading(true)
    fetchLidarPoints(activeRegion, 12000).then((data) => {
      if (active && data) {
        setLidarData(data)
        setSliceMaxElevation(data.max_elevation_msl || 200)
        setLidarLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [activeRegion])

  // Toggle 3D Digital Elevation Terrain (DEM/DTM)
  useEffect(() => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return
    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
    if (useTerrain && ionToken) {
      Cesium.createWorldTerrainAsync({ requestWaterMask: true, requestVertexNormals: true })
        .then((tp) => {
          if (viewerRef.current && !viewerRef.current.isDestroyed()) {
            viewerRef.current.terrainProvider = tp
          }
        })
        .catch(() => {
          if (viewerRef.current && !viewerRef.current.isDestroyed()) {
            viewerRef.current.terrainProvider = new Cesium.EllipsoidTerrainProvider()
          }
        })
    } else {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.terrainProvider = new Cesium.EllipsoidTerrainProvider()
      }
    }
  }, [useTerrain])

  // Toggle Realistic Solar Shadows & Sky Lighting
  useEffect(() => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return
    viewerRef.current.shadows = enableShadows
    viewerRef.current.terrainShadows = enableShadows ? Cesium.ShadowMode.RECEIVE_ONLY : Cesium.ShadowMode.DISABLED
  }, [enableShadows])

  // Handle entity picking from 3D scene (Raycasting)
  const handlePickEntity = (entityId) => {
    if (!entityId) return

    // 1. Check if clicked a building envelope
    const bldg = regionBuildings.find((b) => b.id === entityId)
    if (bldg) {
      setInternalBuildingId(bldg.id)
      const topFloor = bldg.floors[0]
      if (topFloor) {
        setInternalFloorLevel(topFloor.level)
        setSelectedUnit(topFloor.units[0] || null)
      }

      if (onSelectBuilding) onSelectBuilding(bldg.id)
      if (onSelectObject) onSelectObject(entityId)

      if (viewerRef.current) {
        const ent = viewerRef.current.entities.getById(entityId)
        if (ent) {
          viewerRef.current.flyTo(ent, {
            offset: new Cesium.HeadingPitchRange(
              Cesium.Math.toRadians(0),
              Cesium.Math.toRadians(-35),
              260
            ),
            duration: 1.2,
          })
        }
      }
      return
    }

    // 2. Check if clicked an individual room / flat unit
    let foundUnit = null
    let parentBldg = null
    let parentFloor = null

    for (const b of regionBuildings) {
      for (const fl of b.floors) {
        for (const u of fl.units) {
          if (u.id === entityId) {
            foundUnit = u
            parentBldg = b
            parentFloor = fl
            break
          }
        }
        if (foundUnit) break
      }
      if (foundUnit) break
    }

    if (foundUnit && parentBldg && parentFloor) {
      setInternalBuildingId(parentBldg.id)
      setInternalFloorLevel(parentFloor.level)
      setSelectedUnit(foundUnit)

      if (onSelectBuilding) onSelectBuilding(parentBldg.id)
      if (onSelectFloor) onSelectFloor(parentFloor.level)
      if (onSelectUnit) onSelectUnit(foundUnit)
      if (onSelectObject) onSelectObject(entityId)

      if (viewerRef.current) {
        const ent = viewerRef.current.entities.getById(entityId)
        if (ent) {
          viewerRef.current.flyTo(ent, {
            offset: new Cesium.HeadingPitchRange(
              Cesium.Math.toRadians(20),
              Cesium.Math.toRadians(-26),
              120
            ),
            duration: 1.0,
          })
        }
      }
      return
    }

    if (onSelectObject) {
      onSelectObject(entityId)
    }
  }

  const handlePickEntityRef = useRef(handlePickEntity)
  useEffect(() => {
    handlePickEntityRef.current = handlePickEntity
  })

  // Initialize Cesium Viewer
  useEffect(() => {
    if (!containerRef.current) return

    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
    if (ionToken) {
      Cesium.Ion.defaultAccessToken = ionToken
    }

    const initialLayer = BASE_LAYERS.satellite
    const imageryProvider = new Cesium.UrlTemplateImageryProvider({
      url: initialLayer.url,
      subdomains: initialLayer.subdomains || [],
      credit: initialLayer.credit,
    })

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      selectionIndicator: false,
      timeline: false,
      animation: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      imageryProvider: imageryProvider,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      scene3DOnly: false,
      shadows: false,
      showRenderLoopErrors: false,
      skyAtmosphere: new Cesium.SkyAtmosphere(),
    })

    if (viewer.cesiumWidget && viewer.cesiumWidget.creditContainer) {
      viewer.cesiumWidget.creditContainer.style.display = 'none'
    }

    viewerRef.current = viewer

    // Configure globe visual quality
    const scene = viewer.scene
    scene.globe.depthTestAgainstTerrain = false
    scene.globe.enableLighting = true
    scene.globe.showGroundAtmosphere = true

    // Enable Underground Transparency for Utility Cadastres
    scene.globe.translucency.enabled = true
    scene.globe.translucency.frontFaceAlphaByDistance = new Cesium.NearFarScalar(
      400.0,
      0.35,
      8000.0,
      1.0
    )
    scene.globe.translucency.subsurfaceColor = Cesium.Color.fromCssColorString('#0284c7')

    // Initialize WebGL Point Collection for LiDAR
    const pointCollection = scene.primitives.add(new Cesium.PointPrimitiveCollection())
    pointCollectionRef.current = pointCollection

    // Raycasting Click Handler for 3D Slicing & Flat Picking
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas)
    handler.setInputAction((movement) => {
      const pickedObject = scene.pick(movement.position)
      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entityId = pickedObject.id.id || pickedObject.id
        if (handlePickEntityRef.current) {
          handlePickEntityRef.current(entityId)
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    // Initial camera position centered directly on The Pacifica Tower, Auckland CBD Waterfront
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(174.7681, -36.8449, 260.0),
      orientation: {
        heading: Cesium.Math.toRadians(28.0),
        pitch: Cesium.Math.toRadians(-25.0),
        roll: 0.0,
      },
    })


    return () => {
      handler.destroy()
      if (!viewer.isDestroyed()) {
        viewer.destroy()
      }
      viewerRef.current = null
      pointCollectionRef.current = null
    }
  }, [])

  // -------------------------------------------------------------
  // RENDER LIDAR POINT CLOUD PRIMITIVES
  // -------------------------------------------------------------
  useEffect(() => {
    if (!pointCollectionRef.current) return
    const collection = pointCollectionRef.current
    collection.removeAll()

    if (showPointCloud && lidarData && lidarData.points && lidarData.points.length > 0) {
      const minZ = lidarData.min_elevation_msl || 0
      const maxZ = lidarData.max_elevation_msl || 200

      for (let i = 0; i < lidarData.points.length; i++) {
        const [lon, lat, z, cls, intensity] = lidarData.points[i]
        // Elevation cross-section slicing cutoff
        if (z > sliceMaxElevation) continue

        collection.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, z),
          color: getLidarColor(cls, z, minZ, maxZ, intensity, lidarColorMode),
          pixelSize: pointSize,
        })
      }
    }
  }, [showPointCloud, lidarData, lidarColorMode, pointSize, sliceMaxElevation])

  // -------------------------------------------------------------
  // RENDER CADASTRAL 3D ENTITIES
  // -------------------------------------------------------------
  useEffect(() => {
    if (!viewerRef.current) return
    const viewer = viewerRef.current
    viewer.entities.removeAll()

    const regionConfig = REGIONS[activeRegion] || REGIONS.auckland
    const { lon, lat, height, pitch, heading } = regionConfig.center

    // Fly camera smoothly to the active region
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        lon,
        lat - (activeRegion === 'auckland' ? -0.003 : 0.005),
        height
      ),
      orientation: {
        heading: Cesium.Math.toRadians(heading || 0.0),
        pitch: Cesium.Math.toRadians(pitch || -38.0),
        roll: 0.0,
      },
      duration: 1.4,
    })

    const facadeAlpha = xrayMode ? 0.18 : 0.80

    // Building Footprints Reference
    const BUILDING_FOOTPRINTS = {
      'b-auk-pacifica': [
        [174.7677, -36.8453],
        [174.7687, -36.8451],
        [174.7685, -36.8444],
        [174.7675, -36.8446],
      ],
      'b-auk-seascape': [
        [174.7688, -36.8459],
        [174.7696, -36.8458],
        [174.7694, -36.8452],
        [174.7686, -36.8453],
      ],
      'b-auk-51albert': [
        [174.7635, -36.8466],
        [174.7645, -36.8465],
        [174.7643, -36.8459],
        [174.7633, -36.8460],
      ],
      'b-auk-commbay': [
        [174.7652, -36.8441],
        [174.7668, -36.8439],
        [174.7666, -36.8431],
        [174.7650, -36.8433],
      ],
      'b-pun-t05': [
        [73.7329, 18.5912],
        [73.7341, 18.5914],
        [73.7339, 18.5922],
        [73.7327, 18.5920],
      ],
      'b-pun-t06': [
        [73.7345, 18.5910],
        [73.7357, 18.5912],
        [73.7355, 18.5920],
        [73.7343, 18.5918],
      ],
      'b-pun-t07': [
        [73.7315, 18.5916],
        [73.7327, 18.5918],
        [73.7325, 18.5926],
        [73.7313, 18.5924],
      ],
    }

    // 1. SURFACE LAND PARCELS
    if (activeRegion === 'auckland') {
      viewer.entities.add({
        id: 'p-auk-101',
        name: 'Commercial Bay Precinct (Customs St West)',
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray([
            174.765, -36.8445,
            174.7675, -36.8442,
            174.7672, -36.8428,
            174.7646, -36.8431,
          ]),
          material: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.25),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#60a5fa'),
          outlineWidth: 3,
          height: 6.8,
        },
      })

      viewer.entities.add({
        id: 'p-auk-102',
        name: 'The Pacifica Tower Parcel (Commerce St)',
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray([
            174.7676, -36.8456,
            174.7692, -36.8454,
            174.769, -36.8442,
            174.7674, -36.8444,
          ]),
          material: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.22),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#93c5fd'),
          outlineWidth: 2,
          height: 7.2,
        },
      })

      viewer.entities.add({
        id: 'p-auk-103',
        name: 'Britomart Transport Reserve & Waterfront',
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray([
            174.7635, -36.8435,
            174.77, -36.8427,
            174.7698, -36.8415,
            174.7632, -36.8423,
          ]),
          material: Cesium.Color.fromCssColorString('#0284c7').withAlpha(0.2),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#38bdf8'),
          outlineWidth: 2,
          height: 5.4,
        },
      })

      // Auckland Sky Tower Landmark
      viewer.entities.add({
        id: 'b-auk-skytower',
        name: 'Auckland Sky Tower (328m Landmark)',
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray([
            174.7618, -36.8488,
            174.7626, -36.8488,
            174.7626, -36.848,
            174.7618, -36.848,
          ]),
          extrudedHeight: 328.0,
          height: 24.5,
          material: Cesium.Color.fromCssColorString('#ec4899').withAlpha(0.55),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#f472b6'),
        },
        label: {
          text: '🗼 Sky Tower (328m)',
          font: '12px Inter, sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000),
        },
        position: Cesium.Cartesian3.fromDegrees(174.7622, -36.8484, 335.0),
      })

      // Auckland PositioNZ GNSS CORS Station
      if (showCors) {
        viewer.entities.add({
          id: 'cors-auk-01',
          name: 'PositioNZ GNSS CORS Station AUCK (LINZ RTK Network)',
          position: Cesium.Cartesian3.fromDegrees(174.7663, -36.8415, 45.0),
          cylinder: {
            length: 40.0,
            topRadius: 1.5,
            bottomRadius: 1.5,
            material: Cesium.Color.fromCssColorString('#a855f7').withAlpha(0.7),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#c084fc'),
          },
          label: {
            text: '📡 PositioNZ CORS AUCK\nRTK ±1.2cm Fixed | NZGD2000',
            font: '11px Inter, sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#e9d5ff'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8000),
          },
        })
      }
    }

    // 2. GENERATE MULTI-FLOOR SLICES & MULTI-ROOM APARTMENT SOLIDS FOR ALL BUILDINGS
    regionBuildings.forEach((bldg) => {
      const footprint = BUILDING_FOOTPRINTS[bldg.id]
      if (!footprint || footprint.length < 4) return

      const [p0, p1, p2, p3] = footprint
      const flatDegrees = [p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]]

      // Midpoints for 4-quadrant room subdivision
      const m01 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
      const m12 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
      const m23 = [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2]
      const m30 = [(p3[0] + p0[0]) / 2, (p3[1] + p0[1]) / 2]
      const center = [(p0[0] + p1[0] + p2[0] + p3[0]) / 4, (p0[1] + p1[1] + p2[1] + p3[1]) / 4]

      const quadrants = [
        [p0[0], p0[1], m01[0], m01[1], center[0], center[1], m30[0], m30[1]],
        [m01[0], m01[1], p1[0], p1[1], m12[0], m12[1], center[0], center[1]],
        [center[0], center[1], m12[0], m12[1], p2[0], p2[1], m23[0], m23[1]],
        [m30[0], m30[1], center[0], center[1], m23[0], m23[1], p3[0], p3[1]],
      ]

      const totalFloors = bldg.floors.length
      const maxExplosion = explosionOffset * (totalFloors * 0.75)

      // A. Exterior Translucent Glass Shell
      viewer.entities.add({
        id: bldg.id,
        name: `${bldg.name} (${bldg.floorsCount} Storeys)`,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(flatDegrees),
          extrudedHeight: bldg.roofElevationMsl + maxExplosion,
          height: bldg.baseElevationMsl,
          material: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(facadeAlpha),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#0284c7').withAlpha(0.8),
          outlineWidth: 2,
        },
        label: {
          text: `🏢 ${bldg.name}\n${bldg.floorsCount} Storeys (${bldg.roofElevationMsl}m MSL)\n${bldg.unitsCount} Flat Owners Registered`,
          font: '12px Inter, sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000),
        },
        position: Cesium.Cartesian3.fromDegrees(center[0], center[1], bldg.roofElevationMsl + maxExplosion + 8),
      })

      // B. Central Elevator & Core Shaft
      if (showElevatorCore) {
        const coreFactor = 0.28
        const c0 = [center[0] - (m01[0] - center[0]) * coreFactor, center[1] - (m01[1] - center[1]) * coreFactor]
        const c1 = [center[0] + (m01[0] - center[0]) * coreFactor, center[1] + (m01[1] - center[1]) * coreFactor]
        const c2 = [center[0] + (m12[0] - center[0]) * coreFactor, center[1] + (m12[1] - center[1]) * coreFactor]
        const c3 = [center[0] - (m12[0] - center[0]) * coreFactor, center[1] - (m12[1] - center[1]) * coreFactor]

        viewer.entities.add({
          id: `core-${bldg.id}`,
          name: `${bldg.name} — 3D Central Elevator Core & Lift Shaft`,
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray([c0[0], c0[1], c1[0], c1[1], c2[0], c2[1], c3[0], c3[1]]),
            extrudedHeight: bldg.roofElevationMsl + maxExplosion + 2,
            height: bldg.baseElevationMsl,
            material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.75),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#fbbf24'),
            outlineWidth: 2,
          },
          label: {
            text: '🛗 Lift Core',
            font: '10px Inter, sans-serif',
            fillColor: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1500),
          },
          position: Cesium.Cartesian3.fromDegrees(center[0], center[1], bldg.baseElevationMsl + 15),
        })
      }

      // C. For each Floor Slab and its 4 Subdivided Rooms
      bldg.floors.forEach((floor, fIdx) => {
        const elevParts = floor.elevation.split('-')
        const rawBase = parseFloat(elevParts[0]) || (bldg.baseElevationMsl + fIdx * 3.2)
        const rawTop = parseFloat(elevParts[1]) || (rawBase + 3.2)

        const explodedBase = rawBase + explosionOffset * (fIdx * 0.75)
        const explodedTop = rawTop + explosionOffset * (fIdx * 0.75)

        const isTargetFloor = floor.level === (externalFloorLevel || internalFloorLevel)
        if (isolateFloorOnly && !isTargetFloor) return

        // 1. 3D Floor Slab Plate (Concrete Base)
        viewer.entities.add({
          id: `slab-${bldg.id}-${floor.level}`,
          name: `${bldg.name} — ${floor.name} (3D Concrete Slab Plate)`,
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(flatDegrees),
            extrudedHeight: explodedBase + 0.28,
            height: explodedBase,
            material: Cesium.Color.fromCssColorString('#334155').withAlpha(0.95),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#64748b'),
            outlineWidth: 2,
          },
        })

        // 2. 3D Subdivided Rooms / Individual Apartment Volumes
        if (showFlats && floor.units && floor.units.length > 0) {
          floor.units.forEach((unit, uIdx) => {
            const quadCoords = quadrants[uIdx % 4]
            const roomColor = ROOM_COLORS[uIdx % ROOM_COLORS.length]

            viewer.entities.add({
              id: unit.id,
              name: `${unit.unitNumber}: ${unit.name} (Owner: ${unit.ownerName})`,
              polygon: {
                hierarchy: Cesium.Cartesian3.fromDegreesArray(quadCoords),
                extrudedHeight: explodedTop,
                height: explodedBase + 0.28,
                material: Cesium.Color.fromCssColorString(roomColor).withAlpha(0.88),
                outline: true,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
              },
              label: {
                text: `${unit.unitNumber} (${floor.level})\n👤 ${unit.ownerName.split('&')[0].trim()}\n📐 ${unit.area.split(' ')[0]}m² | 🧊 ${unit.volume.split(' ')[0]}m³`,
                font: '10px Inter, sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 3,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1800),
              },
              position: Cesium.Cartesian3.fromDegrees(
                (quadCoords[0] + quadCoords[4]) / 2,
                (quadCoords[1] + quadCoords[5]) / 2,
                explodedTop + 1.0
              ),
            })
          })
        }
      })
    })

    // 3. SUB-SURFACE GOVERNMENT UTILITIES
    if (showUtilities) {
      if (activeRegion === 'auckland') {
        // City Rail Link (CRL) Subterranean Twin Rail Tunnel (-24.0m Depth / -17.2m MSL)
        viewer.entities.add({
          id: 'ut-auk-crl-01',
          name: '🚇 City Rail Link (CRL) Subterranean Rail Tunnel (-24m Depth)',
          polylineVolume: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              174.7635, -36.8432, -16.5,
              174.7655, -36.8445, -17.2,
              174.767, -36.8465, -15.8,
              174.7685, -36.8495, -14.0,
            ]),
            shape: computeCircle(3.6),
            material: Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.95),
          },
          label: {
            text: '🚇 City Rail Link (CRL) Twin Tunnel\nOperator: KiwiRail / Auckland Transport\nDepth: -24.0m MSL',
            font: '10px Inter, sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#fca5a5'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000),
          },
          position: Cesium.Cartesian3.fromDegrees(174.767, -36.8465, -15.8),
        })

        // Sub-surface Stormwater Main Box Conduit (-4.5m Depth)
        viewer.entities.add({
          id: 'ut-auk-storm-01',
          name: '🌊 Quay Street Stormwater Trunk Main (-4.5m Depth)',
          polylineVolume: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              174.764, -36.843, 2.5,
              174.7675, -36.8438, 2.0,
              174.77, -36.8432, 1.5,
            ]),
            shape: computeCircle(2.2),
            material: Cesium.Color.fromCssColorString('#0284c7').withAlpha(0.85),
          },
        })
      } else {
        // MNGL Underground Gas Pipeline
        viewer.entities.add({
          id: 'ut-pun-gas-01',
          name: '🔥 MNGL Natural Gas Sub-surface Pipeline (Mulshi Grid)',
          polylineVolume: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              73.731, 18.591, 558.0,
              73.734, 18.5915, 558.2,
              73.737, 18.592, 558.5,
            ]),
            shape: computeCircle(1.5),
            material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.95),
          },
          label: {
            text: '🔥 MNGL Gas Grid Pipeline\nDepth: 2.5m Below Ground\nSafety Buffer: 2.0m',
            font: '10px Inter, sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#fef08a'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2500),
          },
          position: Cesium.Cartesian3.fromDegrees(73.734, 18.5915, 558.2),
        })
      }
    }
  }, [
    activeRegion,
    regionBuildings,
    xrayMode,
    showFlats,
    showElevatorCore,
    showUtilities,
    explosionOffset,
    isolateFloorOnly,
    externalFloorLevel,
    internalFloorLevel,
  ])

  // Switch Base Imagery Layer dynamically
  const switchBaseLayer = (layerKey) => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return
    const target = BASE_LAYERS[layerKey] || BASE_LAYERS.satellite
    setActiveBaseLayer(layerKey)

    const viewer = viewerRef.current
    try {
      viewer.imageryLayers.removeAll()

      const providerOptions = {
        url: target.url,
        credit: target.credit,
      }
      if (target.subdomains) {
        providerOptions.subdomains = target.subdomains
      }

      const newLayer = new Cesium.ImageryLayer(
        new Cesium.UrlTemplateImageryProvider(providerOptions)
      )
      viewer.imageryLayers.add(newLayer)
      currentBaseLayerRef.current = newLayer
    } catch (err) {
      console.warn('Base layer switch error:', err)
    }
  }

  // Morph between 3D Globe, 2D Flat Map, and 2.5D Columbus View
  const changeSceneDimension = (mode) => {
    if (!viewerRef.current) return
    const viewer = viewerRef.current

    setSceneDimension(mode)
    if (mode === '2d') {
      viewer.scene.morphTo2D(1.0)
    } else if (mode === '3d') {
      viewer.scene.morphTo3D(1.0)
    } else if (mode === 'columbus') {
      viewer.scene.morphToColumbusView(1.0)
    }
  }

  // Toggle Sub-surface ground transparency
  const toggleUnderground = () => {
    if (!viewerRef.current) return
    const nextVal = !showUnderground
    setShowUnderground(nextVal)
    viewerRef.current.scene.globe.translucency.enabled = nextVal
  }

  // Zoom to active object
  useEffect(() => {
    if (!viewerRef.current || !activeObjectId) return
    const entity = viewerRef.current.entities.getById(activeObjectId)
    if (entity) {
      viewerRef.current.flyTo(entity, {
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(0),
          Cesium.Math.toRadians(-35),
          260
        ),
        duration: 1.0,
      })
    }
  }, [activeObjectId])

  const flyToReset = useCallback(() => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return
    const viewer = viewerRef.current

    // Priority 1: Target the active building entity in the 3D scene (e.g. The Pacifica Tower)
    const targetBuildingId =
      currentBuilding?.id ||
      (activeRegion === 'auckland' ? 'b-auk-pacifica' : 'b-pun-t05')

    const bldgEntity = viewer.entities.getById(targetBuildingId)
    if (bldgEntity) {
      viewer.flyTo(bldgEntity, {
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(activeRegion === 'auckland' ? 28 : 25),
          Cesium.Math.toRadians(-24),
          activeRegion === 'auckland' ? 340 : 260
        ),
        duration: 1.2,
      })
      return
    }

    // Priority 2: Direct coordinate flyTo focused specifically on The Pacifica Tower / Tower 5
    if (activeRegion === 'auckland') {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(174.7662, -36.8472, 220.0),
        orientation: {
          heading: Cesium.Math.toRadians(28.0),
          pitch: Cesium.Math.toRadians(-24.0),
          roll: 0.0,
        },
        duration: 1.2,
      })
    } else {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(73.7315, 18.5895, 720.0),
        orientation: {
          heading: Cesium.Math.toRadians(25.0),
          pitch: Cesium.Math.toRadians(-28.0),
          roll: 0.0,
        },
        duration: 1.2,
      })
    }
  }, [activeRegion, currentBuilding])

  // Automatically recenter camera when switching active pilot region
  const isInitialMountRef = useRef(true)
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      return
    }
    const timer = setTimeout(() => {
      flyToReset()
    }, 150)
    return () => clearTimeout(timer)
  }, [activeRegion, flyToReset])

  const handleSelectFloorPill = (floorLevel) => {
    setInternalFloorLevel(floorLevel)
    if (onSelectFloor) onSelectFloor(floorLevel)
    const fl = currentBuilding?.floors.find((f) => f.level === floorLevel)
    if (fl && fl.units.length > 0) {
      setSelectedUnit(fl.units[0])
      if (onSelectUnit) onSelectUnit(fl.units[0])
      const entity = viewerRef.current?.entities.getById(fl.units[0].id)
      if (entity) {
        viewerRef.current.flyTo(entity, {
          offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-30), 200),
          duration: 0.9,
        })
      }
    }
  }

  const handleFocusUnitInCesium = (unit) => {
    setSelectedUnit(unit)
    if (onSelectUnit) onSelectUnit(unit)
    if (onSelectObject) onSelectObject(unit.id)
    if (viewerRef.current) {
      const entity = viewerRef.current.entities.getById(unit.id)
      if (entity) {
        viewerRef.current.flyTo(entity, {
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(20),
            Cesium.Math.toRadians(-25),
            160
          ),
          duration: 1.0,
        })
      }
    }
  }

  const handleCopy = (text) => {
    navigator.clipboard?.writeText(text)
    setCopiedUlpin(text)
    setTimeout(() => setCopiedUlpin(null), 2000)
  }

  const activeRegionData = REGIONS[activeRegion] || REGIONS.auckland

  return (
    <div
      className={`cesium-wrapper ${heightMode} ${isExpanded ? 'expanded' : ''}`}
      style={{
        height: isExpanded ? 'calc(100vh - 120px)' : heightMode === 'tall' ? '920px' : '820px',
      }}
    >
      <div ref={containerRef} className="cesium-viewer-container" />

      {/* Sleek Floating Glassmorphic Top Controls Bar */}
      <div className="cesium-top-controls">
        {/* Cluster 1: Dimension Switcher & Primary Recenter */}
        <div className="hud-pill-group">
          <button
            className={`hud-btn ${sceneDimension === '3d' ? 'active' : ''}`}
            onClick={() => changeSceneDimension('3d')}
            title="3D Globe View"
          >
            🌐 3D
          </button>
          <button
            className={`hud-btn ${sceneDimension === '2d' ? 'active' : ''}`}
            onClick={() => changeSceneDimension('2d')}
            title="2D Map View"
          >
            🗺️ 2D
          </button>
          <button
            className={`hud-btn ${sceneDimension === 'columbus' ? 'active' : ''}`}
            onClick={() => changeSceneDimension('columbus')}
            title="2.5D Columbus Plan"
          >
            📐 Plan
          </button>
          <button
            className="hud-btn highlight"
            onClick={flyToReset}
            title="Recenter Camera on Primary High-Rise Tower"
            style={{ color: '#38bdf8', fontWeight: '700' }}
          >
            🎯 Recenter
          </button>
        </div>

        {/* Cluster 2: Basemap Selector */}
        <div className="hud-pill-group">
          <select
            className="hud-select"
            value={activeBaseLayer}
            onChange={(e) => switchBaseLayer(e.target.value)}
            title="Switch Satellite or Streets Basemap"
          >
            <option value="satellite">🛰️ Satellite (Esri)</option>
            <option value="streets">🗺️ Streets (OSM)</option>
          </select>
        </div>

        {/* Cluster 3: 3D Layers Menu */}
        <div className="hud-pill-group dropdown-container" style={{ position: 'relative' }}>
          <button
            className={`hud-btn ${showLayersDropdown ? 'active' : ''}`}
            onClick={() => {
              setShowLayersDropdown(!showLayersDropdown)
              setShowToolsDropdown(false)
            }}
            title="Toggle 3D Cadastral Layers & Physical Models"
          >
            🎛️ 3D Layers {showLayersDropdown ? '▲' : '▼'}
          </button>

          {showLayersDropdown && (
            <div className="hud-popover-menu">
              <div className="popover-title">3D CADASTRAL LAYERS</div>
              <label className="popover-item">
                <input
                  type="checkbox"
                  checked={xrayMode}
                  onChange={(e) => setXrayMode(e.target.checked)}
                />
                <span>🏢 Translucent X-Ray Glass</span>
              </label>
              <label className="popover-item">
                <input
                  type="checkbox"
                  checked={showFlats}
                  onChange={(e) => setShowFlats(e.target.checked)}
                />
                <span>🚪 3D Flat Volumes & Rooms</span>
              </label>
              <label className="popover-item">
                <input
                  type="checkbox"
                  checked={isolateFloorOnly}
                  onChange={(e) => setIsolateFloorOnly(e.target.checked)}
                />
                <span>🔍 Isolate Active Floor Only</span>
              </label>
              <label className="popover-item">
                <input
                  type="checkbox"
                  checked={showElevatorCore}
                  onChange={(e) => setShowElevatorCore(e.target.checked)}
                />
                <span>🛗 Central Lift & Core Shaft</span>
              </label>
              <label className="popover-item">
                <input
                  type="checkbox"
                  checked={showUtilities}
                  onChange={(e) => setShowUtilities(e.target.checked)}
                />
                <span>🚇 Sub-surface Utilities & CRL Tunnel</span>
              </label>
              <label className="popover-item">
                <input
                  type="checkbox"
                  checked={useTerrain}
                  onChange={(e) => setUseTerrain(e.target.checked)}
                />
                <span>🏔️ 3D World Digital Elevation Terrain</span>
              </label>
              <label className="popover-item">
                <input
                  type="checkbox"
                  checked={enableShadows}
                  onChange={(e) => setEnableShadows(e.target.checked)}
                />
                <span>☀️ Solar Sun Shadows & Diurnal Lighting</span>
              </label>
              <label className="popover-item">
                <input
                  type="checkbox"
                  checked={showCors}
                  onChange={(e) => setShowCors(e.target.checked)}
                />
                <span>📡 GNSS CORS RTK Reference Nodes</span>
              </label>
            </div>
          )}
        </div>

        {/* Cluster 4: 3D Survey Tools, LiDAR & Depth Profiler */}
        <div className="hud-pill-group dropdown-container" style={{ position: 'relative' }}>
          <button
            className={`hud-btn ${showPointCloud ? 'active' : ''}`}
            onClick={() => setShowPointCloud(!showPointCloud)}
            title="Toggle Drone LiDAR Point Cloud WebGL Overlay"
            style={{
              color: showPointCloud ? '#38bdf8' : undefined,
              borderColor: showPointCloud ? '#0284c7' : undefined,
            }}
          >
            ☁️ LiDAR {showPointCloud ? 'On' : 'Off'}
          </button>
          <button
            className={`hud-btn ${showElevationModal ? 'active' : ''}`}
            onClick={() => setShowElevationModal(true)}
            title="Open Sub-surface Depth Slicing & Elevation Cross-Section Profiler"
            style={{
              color: '#38bdf8',
              borderColor: '#0284c7',
            }}
          >
            📐 Depth Slicer
          </button>
          <button
            className={`hud-btn ${showToolsDropdown ? 'active' : ''}`}
            onClick={() => {
              setShowToolsDropdown(!showToolsDropdown)
              setShowLayersDropdown(false)
            }}
            title="Export 3D CityGML & 3D GeoJSON"
          >
            💾 Export {showToolsDropdown ? '▲' : '▼'}
          </button>

          {showToolsDropdown && (
            <div className="hud-popover-menu">
              <div className="popover-title">OPEN 3D GEOSPATIAL EXPORT</div>
              <a
                className="popover-link"
                href={getExportBuildingUrl(currentBuilding?.id || (activeRegion === 'auckland' ? 'b-auk-pacifica' : 'b-pun-t05'), 'citygml')}
                download
              >
                🏛️ Download OGC CityGML 2.0 LoD2 (.gml)
              </a>
              <a
                className="popover-link"
                href={getExportBuildingUrl(currentBuilding?.id || (activeRegion === 'auckland' ? 'b-auk-pacifica' : 'b-pun-t05'), 'geojson3d')}
                download
              >
                🌐 Download 3D Cadastre GeoJSON (.json)
              </a>
            </div>
          )}
        </div>

        {/* Cluster 5: Floor Explosion Slider */}
        <div className="hud-pill-group">
          <div className="hud-slider-box">
            <span>💥 Explosion: {explosionOffset > 0 ? `+${explosionOffset}m` : '0m'}</span>
            <input
              type="range"
              min="0"
              max="35"
              step="5"
              value={explosionOffset}
              onChange={(e) => setExplosionOffset(Number(e.target.value))}
              title="Slide to vertically separate each floor in 3D"
            />
          </div>
        </div>

        {/* Cluster 6: Expand Toggle */}
        {onToggleExpand && (
          <div className="hud-pill-group">
            <button
              className="hud-btn"
              onClick={onToggleExpand}
              title={isExpanded ? 'Collapse Map' : 'Expand Full Width'}
            >
              {isExpanded ? '⤡ Collapse' : '⛶ Full Width'}
            </button>
          </div>
        )}
      </div>

      {/* Floating LiDAR Point Cloud Studio & Elevation Slicing Profiler Toolbar (Active when LiDAR points enabled) */}
      {showPointCloud && (
        <div className="cesium-lidar-toolbar">
          <div className="lidar-toolbar-header">
            <div className="lidar-title">
              <span className="lidar-dot" />
              <strong>3D DRONE LIDAR WEBGL POINT CLOUD</strong>
              <small>({lidarData?.total_file_points?.toLocaleString() || '103,550'} LAS Returns • Riegl VUX-1UAV)</small>
            </div>
            <div className="lidar-header-actions">
              <span className="lidar-badge">±1.8cm Vertical RTK Accuracy</span>
            </div>
          </div>

          <div className="lidar-toolbar-controls">
            {/* Color Mode Selector */}
            <div className="lidar-control-item">
              <span>🎨 Color Mapping:</span>
              <div className="lidar-pill-group">
                <button
                  className={`lidar-btn ${lidarColorMode === 'classification' ? 'active' : ''}`}
                  onClick={() => setLidarColorMode('classification')}
                  title="ASPRS Standard: Ground, Building, Vegetation, Water"
                >
                  🏷️ Classification
                </button>
                <button
                  className={`lidar-btn ${lidarColorMode === 'elevation' ? 'active' : ''}`}
                  onClick={() => setLidarColorMode('elevation')}
                  title="Rainbow/Turbo Elevation Ramp MSL"
                >
                  🌈 Elevation Ramp
                </button>
                <button
                  className={`lidar-btn ${lidarColorMode === 'intensity' ? 'active' : ''}`}
                  onClick={() => setLidarColorMode('intensity')}
                  title="Laser Return Reflectance Intensity"
                >
                  💡 Intensity
                </button>
              </div>
            </div>

            {/* Point Size Slider */}
            <div className="lidar-control-item">
              <span>Point Size: <strong>{pointSize}px</strong></span>
              <input
                type="range"
                min="1"
                max="7"
                step="1"
                value={pointSize}
                onChange={(e) => setPointSize(Number(e.target.value))}
                className="lidar-slider"
              />
            </div>

            {/* Elevation Slicing Profiler Slider */}
            <div className="lidar-control-item wide">
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span>✂️ Elevation Slicing Cutoff:</span>
                <strong>≤ {sliceMaxElevation}m MSL</strong>
              </div>
              <input
                type="range"
                min={lidarData?.min_elevation_msl || 0}
                max={lidarData?.max_elevation_msl || 200}
                step="1"
                value={sliceMaxElevation}
                onChange={(e) => setSliceMaxElevation(Number(e.target.value))}
                className="lidar-slider"
                title="Slide to dynamically cut through vertical LiDAR levels"
              />
            </div>
          </div>
        </div>
      )}

      {/* Floating 3D Cadastre Building & Unit Inspector HUD */}
      {showInspectorHUD && currentBuilding && (
        <div className={`cesium-inspector-hud ${hudMinimized ? 'minimized' : ''}`}>
          <div className="inspector-hud-header">
            <div>
              <span className="hud-title-badge">3D VOLUMETRIC CADASTRE</span>
              <h3>{currentBuilding.name}</h3>
              <small style={{ color: '#94a3b8', fontSize: '10px' }}>📍 {currentBuilding.address}</small>
            </div>
            <div className="hud-header-actions">
              <button
                className="hud-icon-btn"
                onClick={() => setHudMinimized(!hudMinimized)}
                title={hudMinimized ? 'Expand' : 'Minimize'}
              >
                {hudMinimized ? '▲' : '▼'}
              </button>
              <button
                className="hud-icon-btn"
                onClick={() => setShowInspectorHUD(false)}
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {!hudMinimized && (
            <div className="inspector-hud-body">
              {/* Select Building */}
              <div className="hud-section-label">SELECT HIGH-RISE TOWER</div>
              <div className="hud-bldg-pills">
                {regionBuildings.map((bldg) => (
                  <button
                    key={bldg.id}
                    className={`hud-bldg-pill ${bldg.id === currentBuilding.id ? 'active' : ''}`}
                    onClick={() => {
                      setInternalBuildingId(bldg.id)
                      setInternalFloorLevel(bldg.floors[0]?.level || 'F01')
                      if (onSelectBuilding) onSelectBuilding(bldg.id)
                      const ent = viewerRef.current?.entities.getById(bldg.id)
                      if (ent) viewerRef.current.flyTo(ent, { duration: 1.0 })
                    }}
                  >
                    🏢 {bldg.shortLabel || bldg.name.split(' ')[0]} ({bldg.floorsCount} Fl)
                  </button>
                ))}
              </div>

              {/* Floor Level Selector Tabs */}
              <div className="hud-section-label">
                SELECT FLOOR LEVEL ({currentBuilding.floors.length} Storeys Mapped)
              </div>
              <div className="hud-floor-tabs">
                {currentBuilding.floors.map((fl) => (
                  <button
                    key={fl.level}
                    className={`hud-floor-tab ${fl.level === currentFloor?.level ? 'active' : ''}`}
                    onClick={() => handleSelectFloorPill(fl.level)}
                  >
                    <span className="floor-lvl">{fl.level}</span>
                    <span className="floor-elev">{fl.elevation.split(' ')[0]}m</span>
                  </button>
                ))}
              </div>

              {/* Active Floor & Individual Rooms / Flats Details */}
              {currentFloor && (
                <div className="hud-floor-details">
                  <div className="active-floor-header">
                    <div>
                      <strong>{currentFloor.name}</strong>
                      <span className="elevation-tag">Elevation: {currentFloor.elevation}</span>
                    </div>
                    <span className={`floor-type-tag ${currentFloor.type}`}>
                      {currentFloor.units?.length || 0} ROOMS / FLATS
                    </span>
                  </div>

                  {/* List of Individual Rooms & Flat Owners */}
                  <div className="hud-flats-list">
                    {currentFloor.units && currentFloor.units.length > 0 ? (
                      currentFloor.units.map((unit, idx) => {
                        const isSelected = selectedUnit?.id === unit.id
                        const roomColor = ROOM_COLORS[idx % ROOM_COLORS.length]
                        return (
                          <div
                            key={unit.id}
                            className={`hud-flat-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleFocusUnitInCesium(unit)}
                          >
                            <div className="flat-card-head">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="unit-number-tag" style={{ background: roomColor }}>
                                  {unit.unitNumber}
                                </span>
                                <span className="unit-name">{unit.name}</span>
                              </div>
                              <span className="verified-badge">✓ Verified</span>
                            </div>

                            <div className="flat-meta-grid">
                              <div className="flat-meta-item">
                                <span>👤 Registered Owner:</span>
                                <strong className="highlight-owner">{unit.ownerName}</strong>
                              </div>
                              <div className="flat-meta-item">
                                <span>📐 Carpet Area:</span>
                                <strong>{unit.area}</strong>
                              </div>
                              <div className="flat-meta-item">
                                <span>🧊 3D Solid Volume:</span>
                                <strong>{unit.volume}</strong>
                              </div>
                              <div className="flat-meta-item">
                                <span>⚖️ Land Share (UDS):</span>
                                <strong style={{ color: '#06b6d4' }}>{unit.uds}</strong>
                              </div>
                              <div className="flat-meta-item full-width">
                                <span>🏷️ 3D ULPIN (Bhu-Aadhaar 3D):</span>
                                <div className="ulpin-copy-row">
                                  <code>{unit.ulpin}</code>
                                  <button
                                    className="copy-mini-btn"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleCopy(unit.ulpin)
                                    }}
                                  >
                                    {copiedUlpin === unit.ulpin ? '✓ Copied' : '📋 Copy'}
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="flat-card-actions">
                              <button
                                className="flat-action-btn primary"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleFocusUnitInCesium(unit)
                                }}
                              >
                                🎯 Focus Room in 3D
                              </button>
                              {onInspectCard && (
                                <button
                                  className="flat-action-btn secondary"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onInspectCard(unit)
                                  }}
                                >
                                  📜 View 3D Property Card
                                </button>
                              )}
                              {onGenerateUlpin && (
                                <button
                                  className="flat-action-btn accent"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onGenerateUlpin(unit)
                                  }}
                                >
                                  🏷️ ULPIN
                                </button>
                              )}
                              <button
                                className="flat-action-btn"
                                style={{ background: 'rgba(16, 185, 129, 0.2)', borderColor: '#10b981', color: '#6ee7b7' }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setVerifyUlpinTarget(unit.ulpin)
                                }}
                                title="Verify Title in National Cryptographic Ledger"
                              >
                                🔐 Verify
                              </button>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <p style={{ color: '#94a3b8', fontSize: '11px', textAlign: 'center' }}>
                        Common Property / Service Floor — No individual apartments on this level.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Coordinate & Reference Overlay */}
      <div className="cesium-bottom-info">
        <span className="info-badge">
          📍 {activeRegionData.flag} {activeRegionData.name}
        </span>
        <span className="info-badge">
          🌐 {activeRegionData.pilotAreaInfo.crs.split(' ')[0]}
        </span>
        <span className="info-badge">
          ☁️ {showPointCloud ? 'Drone LiDAR Point Cloud Active' : '3D Extruded Solids'}
        </span>
        <span className="info-badge">🏢 3D Floors & Individual Rooms WebGL</span>
      </div>

      {/* High-Impact Modals */}
      {showElevationModal && (
        <ElevationProfile
          activeRegion={activeRegion}
          onClose={() => setShowElevationModal(false)}
        />
      )}
      {verifyUlpinTarget && (
        <CitizenVerify
          ulpin={verifyUlpinTarget}
          activeRegion={activeRegion}
          onClose={() => setVerifyUlpinTarget(null)}
        />
      )}
    </div>
  )
}

function computeCircle(radius) {
  const positions = []
  for (let i = 0; i < 360; i += 30) {
    const radians = Cesium.Math.toRadians(i)
    positions.push(
      new Cesium.Cartesian2(
        radius * Math.cos(radians),
        radius * Math.sin(radians)
      )
    )
  }
  return positions
}
