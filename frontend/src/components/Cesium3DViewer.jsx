import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { REGIONS, BUILDINGS_DATABASE, getBuildingFullFloors } from '../data/mockCadastral'
import { fetchLidarPoints, getExportBuildingUrl } from '../services/api'
import { ElevationProfile } from './ElevationProfile'
import { CitizenVerify } from './CitizenVerify'

const BASE_LAYERS = {
  satellite: {
    id: 'satellite',
    name: '🛰️ Satellite Imagery (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 19,
    credit: '© Esri, Maxar, Earthstar Geographics',
  },
  streets: {
    id: 'streets',
    name: '🗺️ Streets & Roads (OSM)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maximumLevel: 19,
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
  importedLayer = null,
  allBuildings = null,
}) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const currentBaseLayerRef = useRef(null)
  const pointCollectionRef = useRef(null)

  const [activeBaseLayer, setActiveBaseLayer] = useState('satellite')
  const [sceneDimension, setSceneDimension] = useState('3d')
  const [showUnderground, setShowUnderground] = useState(false)
  const [showFlats, setShowFlats] = useState(true)
  const [showElevatorCore, setShowElevatorCore] = useState(false)
  const [showUtilities, setShowUtilities] = useState(false)
  const [xrayMode, setXrayMode] = useState(true)
  const [explosionOffset, setExplosionOffset] = useState(0)
  const [isolateFloorOnly, setIsolateFloorOnly] = useState(false)
  const [isolateBuildingMode, setIsolateBuildingMode] = useState(false)
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
    const base = allBuildings || BUILDINGS_DATABASE[activeRegion] || BUILDINGS_DATABASE.auckland || []
    if (importedLayer && importedLayer.buildings && importedLayer.buildings.length > 0) {
      return [...importedLayer.buildings, ...base]
    }
    return base
  }, [activeRegion, allBuildings, importedLayer])

  // Automatically fly to imported dataset and show inspector on upload
  useEffect(() => {
    if (!viewerRef.current || !importedLayer) return
    if (importedLayer.buildings && importedLayer.buildings.length > 0) {
      const b0 = importedLayer.buildings[0]
      const c = b0.centroid || (b0.polygon ? [b0.polygon[0][0], b0.polygon[0][1]] : [174.767, -36.845])
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(c[0], c[1], (b0.roofElevationMsl || 50) + 380),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0.0,
        },
        duration: 1.8,
      })
      setInternalBuildingId(b0.id)
      if (b0.floors && b0.floors.length > 0) {
        setInternalFloorLevel(b0.floors[0].level)
        if (b0.floors[0].units && b0.floors[0].units.length > 0) {
          setSelectedUnit(b0.floors[0].units[0])
        }
      }
      setShowInspectorHUD(true)
    } else if (importedLayer.points && importedLayer.points.length > 0) {
      setShowPointCloud(true)
      const p0 = importedLayer.points[0]
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(p0.lon, p0.lat, (p0.elevation || 25) + 280),
        duration: 1.8,
      })
    }
  }, [importedLayer])

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

  const currentBuildingFloors = useMemo(() => {
    return getBuildingFullFloors(currentBuilding)
  }, [currentBuilding])

  const currentFloor = useMemo(() => {
    if (!currentBuildingFloors || currentBuildingFloors.length === 0) return null
    const targetLvl = externalFloorLevel || internalFloorLevel
    return (
      currentBuildingFloors.find((f) => f.level === targetLvl) ||
      currentBuildingFloors[0]
    )
  }, [currentBuildingFloors, externalFloorLevel, internalFloorLevel])

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

    // 0. Check if clicked a floor slab
    if (typeof entityId === 'string' && entityId.startsWith('slab-')) {
      const parts = entityId.split('-')
      const floorLvl = parts[parts.length - 1]
      const bldgId = entityId.replace('slab-', '').replace('-' + floorLvl, '')
      const bldg = regionBuildings.find((b) => b.id === bldgId)
      if (bldg) {
        setIsolateBuildingMode(true)
        setInternalBuildingId(bldg.id)
        setInternalFloorLevel(floorLvl)
        const fullFloors = getBuildingFullFloors(bldg)
        const fl = fullFloors.find((f) => f.level === floorLvl)
        if (fl && fl.units && fl.units.length > 0) {
          setSelectedUnit(fl.units[0])
          if (onSelectUnit) onSelectUnit(fl.units[0])
        }
        setShowInspectorHUD(true)
        setHudMinimized(false)
        if (onSelectBuilding) onSelectBuilding(bldg.id)
        if (onSelectFloor) onSelectFloor(floorLvl)
        return
      }
    }

    // 1. Check if clicked an individual room / flat unit
    let foundUnit = null
    let parentBldg = null
    let parentFloor = null

    for (const b of regionBuildings) {
      const bFloors = getBuildingFullFloors(b)
      for (const fl of bFloors) {
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
      setIsolateBuildingMode(true)
      setInternalBuildingId(parentBldg.id)
      setInternalFloorLevel(parentFloor.level)
      setSelectedUnit(foundUnit)
      setShowInspectorHUD(true)
      setHudMinimized(false)

      if (onSelectBuilding) onSelectBuilding(parentBldg.id)
      if (onSelectFloor) onSelectFloor(parentFloor.level)
      if (onSelectUnit) onSelectUnit(foundUnit)
      if (onSelectObject) onSelectObject(entityId)

      if (viewerRef.current) {
        const ent = viewerRef.current.entities.getById(entityId)
        if (ent && ent.position) {
          const pos = ent.position.getValue(Cesium.JulianDate.now())
          if (pos) {
            viewerRef.current.camera.flyToBoundingSphere(
              new Cesium.BoundingSphere(pos, 15),
              {
                offset: new Cesium.HeadingPitchRange(
                  Cesium.Math.toRadians(35),
                  Cesium.Math.toRadians(-22),
                  45
                ),
                duration: 0.8,
              }
            )
          }
        }
      }
      return
    }

    // 2. Check if clicked a building envelope
    const bldg = regionBuildings.find((b) => b.id === entityId || (typeof entityId === 'string' && entityId.startsWith('envelope-' + b.id)))
    if (bldg) {
      setIsolateBuildingMode(true)
      setInternalBuildingId(bldg.id)
      const fullFloors = getBuildingFullFloors(bldg)
      const topFloor = fullFloors[fullFloors.length - 1] || fullFloors[0]
      if (topFloor) {
        setInternalFloorLevel(topFloor.level)
        setSelectedUnit(topFloor.units[0] || null)
      }
      setShowInspectorHUD(true)
      setHudMinimized(false)

      if (onSelectBuilding) onSelectBuilding(bldg.id)
      if (onSelectObject) onSelectObject(entityId)

      if (viewerRef.current) {
        const footprint = bldg.polygon || [[174.7677, -36.8453], [174.7687, -36.8451], [174.7685, -36.8444], [174.7675, -36.8446]]
        const cLon = footprint.reduce((sum, p) => sum + p[0], 0) / footprint.length
        const cLat = footprint.reduce((sum, p) => sum + p[1], 0) / footprint.length
        const roofMsl = bldg.roofElevationMsl || 180

        viewerRef.current.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            cLon - 0.0016,
            cLat - 0.0016,
            roofMsl + 90
          ),
          orientation: {
            heading: Cesium.Math.toRadians(35.0),
            pitch: Cesium.Math.toRadians(-26.0),
            roll: 0.0,
          },
          duration: 1.2,
        })
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
    let handler = null

    try {
      const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
      if (ionToken) {
        Cesium.Ion.defaultAccessToken = ionToken
      }

      const initialLayer = BASE_LAYERS.satellite
      const imageryProvider = new Cesium.UrlTemplateImageryProvider({
        url: initialLayer.url,
        maximumLevel: initialLayer.maximumLevel || 19,
        subdomains: initialLayer.subdomains || [],
        credit: initialLayer.credit,
      })
      const baseImageryLayer = new Cesium.ImageryLayer(imageryProvider)

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
        baseLayer: baseImageryLayer,
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
      currentBaseLayerRef.current = baseImageryLayer

      // Configure globe visual quality for bright, clear, natural satellite imagery
      const scene = viewer.scene
      scene.globe.depthTestAgainstTerrain = false
      scene.globe.enableLighting = false
      scene.globe.showGroundAtmosphere = false
      scene.globe.baseColor = Cesium.Color.fromCssColorString('#2a324b')

      // Ground opacity (underground transparency can be toggled on demand)
      scene.globe.translucency.enabled = false
      scene.globe.translucency.subsurfaceColor = Cesium.Color.fromCssColorString('#1e293b')

      // Initialize WebGL Point Collection for LiDAR
      const pointCollection = scene.primitives.add(new Cesium.PointPrimitiveCollection())
      pointCollectionRef.current = pointCollection

      // Raycasting Click Handler for 3D Slicing & Flat Picking
      handler = new Cesium.ScreenSpaceEventHandler(scene.canvas)
      handler.setInputAction((movement) => {
        try {
          // Use drillPick so clicking an apartment unit inside a translucent shell works immediately
          const pickedObjects = scene.drillPick(movement.position)
          if (pickedObjects && pickedObjects.length > 0) {
            // 1. Prioritize clicking a specific apartment unit (u-...)
            let chosen = pickedObjects.find((p) => p.id && p.id.id && typeof p.id.id === 'string' && p.id.id.startsWith('u-'))
            // 2. Next prioritize a floor slab (slab-...)
            if (!chosen) {
              chosen = pickedObjects.find((p) => p.id && p.id.id && typeof p.id.id === 'string' && p.id.id.startsWith('slab-'))
            }
            // 3. Next prioritize the building itself (not envelope)
            if (!chosen) {
              chosen = pickedObjects.find((p) => p.id && p.id.id && typeof p.id.id === 'string' && !p.id.id.startsWith('envelope-'))
            }
            if (!chosen) chosen = pickedObjects[0]

            if (chosen && chosen.id) {
              const entityId = chosen.id.id || chosen.id
              if (handlePickEntityRef.current) {
                handlePickEntityRef.current(entityId)
              }
            }
          }
        } catch (_err) {
          // ignore raycast pick errors
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
    } catch (err) {
      console.warn('Cesium viewer initialization warning:', err)
    }

    return () => {
      if (handler) handler.destroy()
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy()
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

    const activePoints = (importedLayer && importedLayer.points && importedLayer.points.length > 0)
      ? importedLayer.points
      : (lidarData && lidarData.points ? lidarData.points : [])

    if (showPointCloud && activePoints.length > 0) {
      const minZ = lidarData?.min_elevation_msl || 0
      const maxZ = lidarData?.max_elevation_msl || 200

      for (let i = 0; i < activePoints.length; i++) {
        const pt = activePoints[i]
        const lon = Array.isArray(pt) ? pt[0] : pt.lon
        const lat = Array.isArray(pt) ? pt[1] : pt.lat
        const z = Array.isArray(pt) ? pt[2] : pt.elevation
        const cls = Array.isArray(pt) ? pt[3] : (pt.classification || 2)
        const intensity = Array.isArray(pt) ? pt[4] : (pt.intensity || 120)

        // Elevation cross-section slicing cutoff
        if (z > sliceMaxElevation) continue

        collection.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, z),
          color: getLidarColor(cls, z, minZ, maxZ, intensity, lidarColorMode),
          pixelSize: pointSize,
        })
      }
    }
  }, [showPointCloud, lidarData, importedLayer, lidarColorMode, pointSize, sliceMaxElevation])

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

    // 2. GENERATE 3D VOLUMETRIC SOLIDS & MULTI-FLOOR SLICES
    regionBuildings.forEach((bldg) => {
      const footprint = bldg.polygon || BUILDING_FOOTPRINTS[bldg.id]
      if (!footprint || footprint.length < 3) return

      const p0 = footprint[0]
      const p1 = footprint[1]
      const p2 = footprint[2]
      const p3 = footprint[3] || footprint[2]

      const flatDegrees = footprint.flatMap((pt) => [pt[0], pt[1]])

      const lons = footprint.map((p) => p[0])
      const lats = footprint.map((p) => p[1])
      const center = [
        lons.reduce((a, b) => a + b, 0) / footprint.length,
        lats.reduce((a, b) => a + b, 0) / footprint.length,
      ]

      const isImported = bldg.id && bldg.id.startsWith('b-imp-')
      const isSelected = bldg.id === (externalBuildingId || internalBuildingId)

      const buildingFloors = getBuildingFullFloors(bldg)
      const totalFloors = (buildingFloors && buildingFloors.length) || bldg.floorsCount || 4
      const maxExplosion = isSelected ? explosionOffset * (totalFloors * 0.75) : 0

      // If in Isolate Mode and this building is NOT the isolated building:
      // Render as a subtle, low-profile ground silhouette footprint so the isolated building stands out completely
      if (isolateBuildingMode && !isSelected) {
        viewer.entities.add({
          id: bldg.id,
          name: `${bldg.name} (City Background Context)`,
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(flatDegrees),
            extrudedHeight: (bldg.baseElevationMsl || 7.5) + 0.3,
            height: bldg.baseElevationMsl || 7.5,
            material: Cesium.Color.fromCssColorString('#1e293b').withAlpha(0.12),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#334155').withAlpha(0.25),
            outlineWidth: 1,
          },
        })
        return
      }

      // If this building is selected and in isolate mode:
      // DO NOT cover the flats with an opaque shell!
      // Render an ultra-delicate glass outline envelope so every inner floor and flat is crystal clear!
      if (isSelected && isolateBuildingMode) {
        viewer.entities.add({
          id: `envelope-${bldg.id}`,
          name: `${bldg.name} (${totalFloors} Storeys)`,
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(flatDegrees),
            extrudedHeight: (bldg.roofElevationMsl || (bldg.baseElevationMsl + totalFloors * 3.2)) + maxExplosion,
            height: bldg.baseElevationMsl || 7.5,
            material: Cesium.Color.fromCssColorString('#06b6d4').withAlpha(xrayMode ? 0.04 : 0.22),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#00e5ff').withAlpha(0.5),
            outlineWidth: 2,
          },
          label: {
            text: `🏢 ${bldg.name} (${totalFloors} Storeys)\n🔑 Bhu-Aadhaar 3D Cadastre Model`,
            font: 'bold 12px Inter, sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#0f172a'),
            outlineWidth: 4,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000),
          },
          position: Cesium.Cartesian3.fromDegrees(center[0], center[1], (bldg.roofElevationMsl || 50) + maxExplosion + 8),
        })
      } else {
        // Standard city building rendering
        let facadeColor = '#64748b'
        let facadeAlpha = 0.95
        let outlineColor = '#334155'
        let outlineWidth = 1

        if (isSelected) {
          facadeColor = '#06b6d4'
          facadeAlpha = xrayMode ? 0.28 : 0.90
          outlineColor = '#00e5ff'
          outlineWidth = 3
        } else if (isImported) {
          facadeColor = '#f59e0b'
          facadeAlpha = 0.95
          outlineColor = '#fbbf24'
          outlineWidth = 2
        } else if (bldg.structureType && bldg.structureType.includes('Apartment')) {
          facadeColor = '#94a3b8'
          facadeAlpha = 0.95
          outlineColor = '#64748b'
        } else if (bldg.structureType && bldg.structureType.includes('Commercial')) {
          facadeColor = '#475569'
          facadeAlpha = 0.95
          outlineColor = '#1e293b'
        }

        const entityOptions = {
          id: bldg.id,
          name: `${bldg.name} (${bldg.floorsCount || totalFloors} Storeys)`,
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(flatDegrees),
            extrudedHeight: (bldg.roofElevationMsl || (bldg.baseElevationMsl + totalFloors * 3.2)) + maxExplosion,
            height: bldg.baseElevationMsl || 7.5,
            material: Cesium.Color.fromCssColorString(facadeColor).withAlpha(facadeAlpha),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString(outlineColor).withAlpha(0.9),
            outlineWidth: outlineWidth,
          },
          position: Cesium.Cartesian3.fromDegrees(center[0], center[1], (bldg.roofElevationMsl || 50) + maxExplosion + 8),
        }

        if (isSelected) {
          entityOptions.label = {
            text: `🏢 ${bldg.name}\n${bldg.floorsCount || totalFloors} Storeys | ${bldg.unitsCount || totalFloors * 4} Registered Units`,
            font: 'bold 12px Inter, sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#0f172a'),
            outlineWidth: 4,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -10),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000),
          }
        }

        viewer.entities.add(entityOptions)
      }

      // Render all 3D floor slabs and individual flat units for the selected building (or when in isolate mode)
      if (isSelected && buildingFloors && buildingFloors.length > 0) {
        // Midpoints for 4-quadrant room subdivision
        const m01 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
        const m12 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
        const m23 = [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2]
        const m30 = [(p3[0] + p0[0]) / 2, (p3[1] + p0[1]) / 2]

        const quadrants = [
          [p0[0], p0[1], m01[0], m01[1], center[0], center[1], m30[0], m30[1]],
          [m01[0], m01[1], p1[0], p1[1], m12[0], m12[1], center[0], center[1]],
          [center[0], center[1], m12[0], m12[1], p2[0], p2[1], m23[0], m23[1]],
          [m30[0], m30[1], center[0], center[1], m23[0], m23[1], p3[0], p3[1]],
        ]

        // Central Lift & Core Shaft
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
              extrudedHeight: (bldg.roofElevationMsl || 50) + maxExplosion + 2,
              height: bldg.baseElevationMsl || 7.5,
              material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.85),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString('#fbbf24'),
              outlineWidth: 2,
            },
          })
        }

        // Generate each concrete slab plate and individual 3D apartment flat unit across all floors
        buildingFloors.forEach((floor, fIdx) => {
          const elevParts = floor.elevation ? floor.elevation.split('-') : []
          const rawBase = parseFloat(elevParts[0]) || ((bldg.baseElevationMsl || 7.5) + fIdx * 3.2)
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
              material: Cesium.Color.fromCssColorString(isTargetFloor ? '#0284c7' : '#334155').withAlpha(0.95),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString(isTargetFloor ? '#38bdf8' : '#64748b'),
              outlineWidth: isTargetFloor ? 2 : 1,
            },
          })

          // 2. 3D Subdivided Rooms / Individual Apartment Volumes
          if (showFlats && floor.units && floor.units.length > 0) {
            floor.units.forEach((unit, uIdx) => {
              const quadCoords = quadrants[uIdx % 4]
              const roomColor = ROOM_COLORS[uIdx % ROOM_COLORS.length]
              const isUnitSelected = selectedUnit?.id === unit.id

              const unitEntity = {
                id: unit.id,
                name: `${unit.unitNumber}: ${unit.name} (Owner: ${unit.ownerName})`,
                polygon: {
                  hierarchy: Cesium.Cartesian3.fromDegreesArray(quadCoords),
                  extrudedHeight: explodedTop,
                  height: explodedBase + 0.28,
                  material: Cesium.Color.fromCssColorString(roomColor).withAlpha(isUnitSelected ? 0.95 : 0.85),
                  outline: true,
                  outlineColor: isUnitSelected ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString('#1e293b'),
                  outlineWidth: isUnitSelected ? 3 : 1,
                },
                position: Cesium.Cartesian3.fromDegrees(
                  (quadCoords[0] + quadCoords[4]) / 2,
                  (quadCoords[1] + quadCoords[5]) / 2,
                  explodedTop + 0.5
                ),
              }

              // Show focused pin badge for selected unit
              if (isUnitSelected) {
                unitEntity.label = {
                  text: `📍 ${unit.unitNumber} (${floor.level})\n👤 ${unit.ownerName}\n📐 ${unit.area} | 🧊 ${unit.volume}\n🔑 ULPIN: ${unit.ulpin}`,
                  font: 'bold 11px Inter, sans-serif',
                  fillColor: Cesium.Color.WHITE,
                  outlineColor: Cesium.Color.fromCssColorString('#0f172a'),
                  outlineWidth: 4,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                  verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                  pixelOffset: new Cesium.Cartesian2(0, -8),
                  distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1500),
                }
              }

              viewer.entities.add(unitEntity)
            })
          }
        })
      }
    })

    // 3. SUB-SURFACE GOVERNMENT UTILITIES & INFRASTRUCTURE
    if (showUtilities) {
      if (activeRegion === 'auckland') {
        // 1. City Rail Link (CRL) Subterranean Twin Rail Tunnel (-24.0m Depth / -17.2m MSL)
        viewer.entities.add({
          id: 'ut-auk-crl-01',
          name: '🚇 City Rail Link (CRL) Subterranean Twin Rail Tunnel (-24.0m Depth)',
          polylineVolume: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              174.7635, -36.8432, -16.5,
              174.7655, -36.8445, -17.2,
              174.767, -36.8465, -15.8,
              174.7685, -36.8495, -14.0,
            ]),
            shape: computeCircle(3.6),
            material: Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.92),
          },
          label: {
            text: '🚇 City Rail Link (CRL) Subterranean Tunnel\nOperator: KiwiRail / Auckland Transport\nDepth: -24.0m MSL | Ø 7.2m Bored Tube',
            font: '10px Inter, sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#fca5a5'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000),
          },
          position: Cesium.Cartesian3.fromDegrees(174.767, -36.8465, -15.8),
        })

        // 2. Vector 33kV Sub-surface Power Transmission Conduit (-3.2m Depth)
        viewer.entities.add({
          id: 'ut-auk-power-01',
          name: '⚡ Vector 33kV Sub-surface Power Transmission Conduit (-3.2m Depth)',
          polylineVolume: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              174.7645, -36.8440, 3.5,
              174.7670, -36.8445, 3.2,
              174.7690, -36.8450, 2.8,
            ]),
            shape: computeCircle(0.9),
            material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.92),
          },
          label: {
            text: '⚡ Vector 33kV Power Corridor\nDepth: 3.2m Below Ground | Ø 1.8m Duct',
            font: '10px Inter, sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#fde68a'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2500),
          },
          position: Cesium.Cartesian3.fromDegrees(174.7670, -36.8445, 3.2),
        })

        // 3. Watercare Potable Water High-Pressure Trunk Mains (-1.8m Depth)
        viewer.entities.add({
          id: 'ut-auk-water-01',
          name: '💧 Watercare Potable Water High-Pressure Mains (-1.8m Depth)',
          polylineVolume: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              174.7650, -36.8450, 5.0,
              174.7680, -36.8452, 4.8,
              174.7700, -36.8455, 4.5,
            ]),
            shape: computeCircle(0.6),
            material: Cesium.Color.fromCssColorString('#0284c7').withAlpha(0.92),
          },
          label: {
            text: '💧 Watercare Water Trunk Main\nDepth: 1.8m Below Ground | 600mm DI',
            font: '10px Inter, sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#bae6fd'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2500),
          },
          position: Cesium.Cartesian3.fromDegrees(174.7680, -36.8452, 4.8),
        })

        // 4. Sub-surface Stormwater Main Box Conduit (-4.5m Depth)
        viewer.entities.add({
          id: 'ut-auk-storm-01',
          name: '🌊 Quay Street Stormwater Trunk Main Box Culvert (-4.5m Depth)',
          polylineVolume: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              174.764, -36.843, 2.5,
              174.7675, -36.8438, 2.0,
              174.77, -36.8432, 1.5,
            ]),
            shape: computeCircle(1.2),
            material: Cesium.Color.fromCssColorString('#06b6d4').withAlpha(0.85),
          },
          label: {
            text: '🌊 Quay St Stormwater Culvert\nDepth: 4.5m Below Ground | 2.4m Box',
            font: '10px Inter, sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#a5f3fc'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2500),
          },
          position: Cesium.Cartesian3.fromDegrees(174.7675, -36.8438, 2.0),
        })

        // 5. FirstGas Commercial Natural Gas Distribution Main (-2.0m Depth)
        viewer.entities.add({
          id: 'ut-auk-gas-01',
          name: '🔥 FirstGas CBD Commercial Gas Distribution Main (-2.0m Depth)',
          polylineVolume: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              174.7660, -36.8455, 5.5,
              174.7685, -36.8458, 5.2,
              174.7705, -36.8460, 5.0,
            ]),
            shape: computeCircle(0.5),
            material: Cesium.Color.fromCssColorString('#f97316').withAlpha(0.92),
          },
          label: {
            text: '🔥 FirstGas Gas Main\nDepth: 2.0m Below Ground | Safety Zone: 2.0m',
            font: '10px Inter, sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#fed7aa'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2500),
          },
          position: Cesium.Cartesian3.fromDegrees(174.7685, -36.8458, 5.2),
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
    isolateBuildingMode,
    externalBuildingId,
    internalBuildingId,
    externalFloorLevel,
    internalFloorLevel,
    selectedUnit,
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
        maximumLevel: target.maximumLevel || 19,
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

  const flyToFullCity = useCallback(() => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return
    const regionConfig = REGIONS[activeRegion] || REGIONS.auckland
    const { lon, lat, height, pitch, heading } = regionConfig.center
    viewerRef.current.camera.flyTo({
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
      duration: 1.2,
    })
  }, [activeRegion])

  const exitIsolateMode = useCallback(() => {
    setIsolateBuildingMode(false)
    setIsolateFloorOnly(false)
    setExplosionOffset(0)
    flyToFullCity()
  }, [flyToFullCity])

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
      <div
        ref={containerRef}
        className="cesium-viewer-container"
        style={{ width: '100%', height: '100%', minHeight: '650px', position: 'relative' }}
      />

      {/* Sleek Floating Minimalist Top Controls */}
      <div className="cesium-top-controls">
        <div className="hud-pill-group">
          <button
            className="hud-btn highlight"
            onClick={flyToReset}
            title="Recenter Camera on Primary High-Rise Tower"
            style={{ color: '#38bdf8', fontWeight: '700' }}
          >
            🎯 Recenter
          </button>
          <select
            className="hud-select"
            value={activeBaseLayer}
            onChange={(e) => switchBaseLayer(e.target.value)}
            title="Switch Satellite or Streets Basemap"
          >
            <option value="satellite">🛰️ Satellite (Esri)</option>
            <option value="streets">🗺️ Streets (OSM)</option>
          </select>
          {onToggleExpand && (
            <button
              className="hud-btn"
              onClick={onToggleExpand}
              title={isExpanded ? 'Collapse Map' : 'Expand Full Width'}
            >
              {isExpanded ? '⤡ Normal' : '⛶ Full Width'}
            </button>
          )}
        </div>
      </div>

      {/* Floating 3D Building Level Navigator */}
      {isolateBuildingMode && currentBuilding && (
        <div className="isolate-mode-banner">
          <div className="isolate-banner-left">
            <span className="isolate-badge">SELECTED TOWER</span>
            <div className="isolate-building-name">
              🏢 {currentBuilding.name}
            </div>
            <span className="isolate-meta">
              {currentBuildingFloors?.length || 4} Floors Mapped
            </span>
          </div>

          <div className="isolate-banner-actions">
            {/* Floor Navigation & Stepper */}
            <div className="isolate-floor-picker">
              <span className="isolate-floor-label">LEVEL:</span>
              <button
                className="isolate-tool-btn"
                disabled={!currentBuildingFloors || currentBuildingFloors.length === 0}
                onClick={() => {
                  const idx = currentBuildingFloors.findIndex((f) => f.level === (currentFloor?.level || internalFloorLevel))
                  if (idx > 0) {
                    const prevFloor = currentBuildingFloors[idx - 1]
                    setInternalFloorLevel(prevFloor.level)
                    if (prevFloor.units?.length > 0) setSelectedUnit(prevFloor.units[0])
                    if (onSelectFloor) onSelectFloor(prevFloor.level)
                  }
                }}
                title="Step down to lower floor"
              >
                ▼ Down
              </button>
              <select
                className="isolate-floor-select"
                value={currentFloor?.level || internalFloorLevel}
                onChange={(e) => {
                  const lvl = e.target.value
                  setInternalFloorLevel(lvl)
                  const fl = currentBuildingFloors.find((f) => f.level === lvl)
                  if (fl && fl.units?.length > 0) setSelectedUnit(fl.units[0])
                  if (onSelectFloor) onSelectFloor(lvl)
                }}
                title="Select floor to inspect"
              >
                {currentBuildingFloors.slice().reverse().map((f) => (
                  <option key={f.level} value={f.level}>
                    {f.name} {f.elevation ? `(${f.elevation}m)` : ''}
                  </option>
                ))}
              </select>
              <button
                className="isolate-tool-btn"
                disabled={!currentBuildingFloors || currentBuildingFloors.length === 0}
                onClick={() => {
                  const idx = currentBuildingFloors.findIndex((f) => f.level === (currentFloor?.level || internalFloorLevel))
                  if (idx < currentBuildingFloors.length - 1) {
                    const nextFloor = currentBuildingFloors[idx + 1]
                    setInternalFloorLevel(nextFloor.level)
                    if (nextFloor.units?.length > 0) setSelectedUnit(nextFloor.units[0])
                    if (onSelectFloor) onSelectFloor(nextFloor.level)
                  }
                }}
                title="Step up to higher floor"
              >
                ▲ Up
              </button>
            </div>

            <button
              className="isolate-exit-btn"
              onClick={exitIsolateMode}
              title="Return to full city view"
            >
              🏙️ City View
            </button>
          </div>
        </div>
      )}

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
