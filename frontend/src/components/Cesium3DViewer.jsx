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

function generateFallbackLidar(region = 'auckland', count = 5000) {
  const isAuckland = region === 'auckland'
  const cLon = isAuckland ? 174.7663 : 73.7332
  const cLat = isAuckland ? -36.8436 : 18.5916
  const baseZ = isAuckland ? 7.2 : 561.0
  const topZ = isAuckland ? 189.6 : 638.0

  const points = []
  for (let i = 0; i < count; i++) {
    const rand = Math.random()
    let cls = 2
    let z = baseZ + (Math.random() - 0.5) * 0.8
    let dLon = (Math.random() - 0.5) * 0.0032
    let dLat = (Math.random() - 0.5) * 0.0032

    if (rand < 0.65) {
      cls = 6 // Building structure / facade / roof
      z = baseZ + Math.random() * (topZ - baseZ)
      dLon = (Math.random() - 0.5) * 0.0018
      dLat = (Math.random() - 0.5) * 0.0018
    } else if (rand > 0.9) {
      cls = 5 // Tree canopy
      z = baseZ + Math.random() * 12
    }

    const intensity = Math.floor(Math.random() * 180 + 50)
    points.push([
      Number((cLon + dLon).toFixed(6)),
      Number((cLat + dLat).toFixed(6)),
      Number(z.toFixed(2)),
      cls,
      intensity,
    ])
  }

  return {
    status: 'success',
    region,
    total_file_points: count,
    rendered_points_count: count,
    min_elevation_msl: baseZ,
    max_elevation_msl: topZ,
    points,
    sensor_metadata: {
      sensor: 'Riegl VUX-1UAV Drone LiDAR System',
      scanner_pulse_rate: '550 kHz',
      vertical_accuracy: '± 1.8 cm (CORS RTK)',
      horizontal_accuracy: '± 2.5 cm',
    },
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
  const cityDataSourceRef = useRef(null)
  const towerDataSourceRef = useRef(null)

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
  const [enableShadows, setEnableShadows] = useState(false)
  const [showCors, setShowCors] = useState(true)

  // LiDAR Point Cloud & Elevation Slicing State
  const [showPointCloud, setShowPointCloud] = useState(false)
  const [lidarColorMode, setLidarColorMode] = useState('classification') // 'classification' | 'elevation' | 'intensity'
  const [pointSize, setPointSize] = useState(3)
  const [sliceMaxElevation, setSliceMaxElevation] = useState(200)
  const [lidarData, setLidarData] = useState(null)
  const [lidarLoading, setLidarLoading] = useState(false)
  const parsedPointsRef = useRef([])

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
    fetchLidarPoints(activeRegion, 5000).then((data) => {
      if (active) {
        if (data && data.points && data.points.length > 0) {
          setLidarData(data)
          setSliceMaxElevation(data.max_elevation_msl || 200)
        } else {
          const fallback = generateFallbackLidar(activeRegion)
          setLidarData(fallback)
          setSliceMaxElevation(fallback.max_elevation_msl || 200)
        }
        setLidarLoading(false)
      }
    }).catch(() => {
      if (active) {
        const fallback = generateFallbackLidar(activeRegion)
        setLidarData(fallback)
        setSliceMaxElevation(fallback.max_elevation_msl || 200)
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

      // ULTRA-LOW GPU/CPU OVERHEAD CONFIGURATION (ZERO-GPU / INTEGRATED GRAPHICS OPTIMIZED)
      viewer.resolutionScale = 1.0 // 1:1 pixel mapping, eliminate supersampling overhead

      // Configure globe visual quality
      const scene = viewer.scene
      scene.globe.depthTestAgainstTerrain = false
      scene.globe.enableLighting = false
      scene.globe.showGroundAtmosphere = false
      scene.globe.baseColor = Cesium.Color.fromCssColorString('#0b1324')
      scene.globe.maximumScreenSpaceError = 3.0 // Drastically reduces tile requests & triangle count

      // Disable heavy full-screen FXAA anti-aliasing shader pass
      scene.postProcessStages.fxaa.enabled = false

      // ON-DEMAND RENDERING: Only redraw when camera moves or data changes!
      // This drops CPU & GPU load from 100% down to near 0% when idle.
      scene.requestRenderMode = true
      scene.maximumRenderTimeChange = Infinity

      // Disable shadow map passes
      viewer.shadows = false
      viewer.terrainShadows = Cesium.ShadowMode.DISABLED

      // Ground opacity (underground transparency can be toggled on demand)
      scene.globe.translucency.enabled = false
      scene.globe.translucency.subsurfaceColor = Cesium.Color.fromCssColorString('#1e293b')

      // Dedicated CustomDataSources: static city buildings vs active inspected building
      const citySource = new Cesium.CustomDataSource('city-buildings')
      const towerSource = new Cesium.CustomDataSource('active-tower')
      viewer.dataSources.add(citySource)
      viewer.dataSources.add(towerSource)
      cityDataSourceRef.current = citySource
      towerDataSourceRef.current = towerSource

      // Initialize WebGL Point Collection for LiDAR
      const pointCollection = scene.primitives.add(new Cesium.PointPrimitiveCollection())
      pointCollectionRef.current = pointCollection

      // Raycasting Click Handler with shallow drillPick (limit 3) to prevent GPU synchronous freeze
      handler = new Cesium.ScreenSpaceEventHandler(scene.canvas)
      handler.setInputAction((movement) => {
        try {
          const pickedObjects = scene.drillPick(movement.position, 3)
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
          scene.requestRender()
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
      cityDataSourceRef.current = null
      towerDataSourceRef.current = null
      pointCollectionRef.current = null
    }
  }, [])

  // -------------------------------------------------------------
  // RENDER LIDAR POINT CLOUD PRIMITIVES (High Performance / 60 FPS)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!pointCollectionRef.current) return
    const collection = pointCollectionRef.current

    if (!showPointCloud) {
      collection.show = false
      return
    }
    collection.show = true

    const activePoints = (importedLayer && importedLayer.points && importedLayer.points.length > 0)
      ? importedLayer.points
      : (lidarData && lidarData.points ? lidarData.points : [])

    if (activePoints.length === 0) {
      collection.removeAll()
      parsedPointsRef.current = []
      return
    }

    const minZ = lidarData?.min_elevation_msl || 0
    const maxZ = lidarData?.max_elevation_msl || 200

    // Fast path: update in-place without rebuilding GPU buffers
    if (collection.length === activePoints.length && parsedPointsRef.current.length === activePoints.length) {
      const cached = parsedPointsRef.current
      for (let i = 0; i < cached.length; i++) {
        const p = collection.get(i)
        const c = cached[i]
        p.show = c.z <= sliceMaxElevation
        p.pixelSize = pointSize
        p.color = getLidarColor(c.cls, c.z, minZ, maxZ, c.intensity, lidarColorMode)
      }
      viewerRef.current?.scene.requestRender()
      return
    }

    // Rebuild collection once
    collection.removeAll()
    const newCache = new Array(activePoints.length)
    for (let i = 0; i < activePoints.length; i++) {
      const pt = activePoints[i]
      const lon = Array.isArray(pt) ? pt[0] : pt.lon
      const lat = Array.isArray(pt) ? pt[1] : pt.lat
      const z = Array.isArray(pt) ? pt[2] : pt.elevation
      const cls = Array.isArray(pt) ? pt[3] : (pt.classification || 2)
      const intensity = Array.isArray(pt) ? pt[4] : (pt.intensity || 120)

      newCache[i] = { z, cls, intensity }

      collection.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, z),
        color: getLidarColor(cls, z, minZ, maxZ, intensity, lidarColorMode),
        pixelSize: pointSize,
        show: z <= sliceMaxElevation,
      })
    }
    parsedPointsRef.current = newCache
    viewerRef.current?.scene.requestRender()
  }, [showPointCloud, lidarData, importedLayer, lidarColorMode, pointSize, sliceMaxElevation])

  // -------------------------------------------------------------
  // RENDER CADASTRAL 3D ENTITIES
  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // 1. RENDER STATIC CITY BUILDINGS & PARCELS (Runs ONCE per region)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!viewerRef.current || !cityDataSourceRef.current) return
    const citySource = cityDataSourceRef.current
    citySource.entities.removeAll()

    const regionConfig = REGIONS[activeRegion] || REGIONS.auckland
    const { lon, lat, height, pitch, heading } = regionConfig.center

    // Fly camera smoothly to the active region once
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

    // 1. Surface Land Parcels
    if (activeRegion === 'auckland') {
      citySource.entities.add({
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

      citySource.entities.add({
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

      citySource.entities.add({
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
      citySource.entities.add({
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
      citySource.entities.add({
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

      // CRL Rail Tunnel
      citySource.entities.add({
        id: 'ut-auk-crl-01',
        name: '🚇 City Rail Link (CRL) Subterranean Twin Rail Tunnel',
        polylineVolume: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            174.7635, -36.8432, -18.0,
            174.7655, -36.8445, -17.5,
            174.7670, -36.8465, -17.0,
            174.7685, -36.8495, -16.5,
          ]),
          shape: computeCircle(3.6),
          material: Cesium.Color.fromCssColorString('#06b6d4').withAlpha(0.85),
        },
      })
    }

    // 2. City Buildings Envelopes (Added ONCE to GPU)
    regionBuildings.forEach((bldg) => {
      const footprint = bldg.polygon || BUILDING_FOOTPRINTS[bldg.id]
      if (!footprint || footprint.length < 3) return

      const flatDegrees = footprint.flatMap((pt) => [pt[0], pt[1]])
      const lons = footprint.map((p) => p[0])
      const lats = footprint.map((p) => p[1])
      const center = [
        lons.reduce((a, b) => a + b, 0) / footprint.length,
        lats.reduce((a, b) => a + b, 0) / footprint.length,
      ]

      const isImported = bldg.id && bldg.id.startsWith('b-imp-')
      const totalFloors = bldg.floorsCount || 4

      let facadeColor = '#475569'
      let facadeAlpha = 0.88
      let outlineColor = '#1e293b'

      if (isImported) {
        facadeColor = '#f59e0b'
        facadeAlpha = 0.95
        outlineColor = '#fbbf24'
      } else if (bldg.structureType && bldg.structureType.includes('Apartment')) {
        facadeColor = '#64748b'
        facadeAlpha = 0.92
      }

      citySource.entities.add({
        id: bldg.id,
        name: `${bldg.name} (${totalFloors} Storeys)`,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(flatDegrees),
          extrudedHeight: bldg.roofElevationMsl || (bldg.baseElevationMsl + totalFloors * 3.2),
          height: bldg.baseElevationMsl || 7.5,
          material: Cesium.Color.fromCssColorString(facadeColor).withAlpha(facadeAlpha),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(outlineColor).withAlpha(0.85),
          outlineWidth: 1,
        },
        position: Cesium.Cartesian3.fromDegrees(center[0], center[1], (bldg.roofElevationMsl || 50) + 6),
      })
    })
    viewerRef.current?.scene.requestRender()
  }, [activeRegion, regionBuildings])

  // -------------------------------------------------------------
  // 2. RENDER ACTIVE TOWER FLOOR SLABS & UNITS (Updates in <3ms!)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!viewerRef.current || !towerDataSourceRef.current || !cityDataSourceRef.current) return
    const towerSource = towerDataSourceRef.current
    const citySource = cityDataSourceRef.current
    towerSource.entities.removeAll()

    if (!currentBuilding) return

    const bldg = currentBuilding
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

    const buildingFloors = currentBuildingFloors
    const totalFloors = buildingFloors?.length || bldg.floorsCount || 4
    const maxExplosion = explosionOffset * (totalFloors * 0.75)

    // Hide or ghost the solid city envelope of the active building so inner flats are visible
    const cityBldg = citySource.entities.getById(bldg.id)
    if (cityBldg) {
      cityBldg.show = false
    }

    // Outer translucent glass shell
    towerSource.entities.add({
      id: `envelope-${bldg.id}`,
      name: `${bldg.name} (${totalFloors} Storeys)`,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flatDegrees),
        extrudedHeight: (bldg.roofElevationMsl || (bldg.baseElevationMsl + totalFloors * 3.2)) + maxExplosion,
        height: bldg.baseElevationMsl || 7.5,
        material: Cesium.Color.fromCssColorString('#06b6d4').withAlpha(xrayMode ? 0.08 : 0.45),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#00e5ff').withAlpha(0.6),
        outlineWidth: 2,
      },
      label: {
        text: `🏢 ${bldg.name}\n${totalFloors} Storeys Mapped`,
        font: 'bold 12px Inter, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#0f172a'),
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000),
      },
      position: Cesium.Cartesian3.fromDegrees(center[0], center[1], (bldg.roofElevationMsl || 50) + maxExplosion + 8),
    })

    // Central Lift & Core Shaft
    if (showElevatorCore) {
      const coreFactor = 0.28
      const m01 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
      const m12 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
      const c0 = [center[0] - (m01[0] - center[0]) * coreFactor, center[1] - (m01[1] - center[1]) * coreFactor]
      const c1 = [center[0] + (m01[0] - center[0]) * coreFactor, center[1] + (m01[1] - center[1]) * coreFactor]
      const c2 = [center[0] + (m12[0] - center[0]) * coreFactor, center[1] + (m12[1] - center[1]) * coreFactor]
      const c3 = [center[0] - (m12[0] - center[0]) * coreFactor, center[1] - (m12[1] - center[1]) * coreFactor]

      towerSource.entities.add({
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

    // Render floor slabs and rooms
    if (buildingFloors && buildingFloors.length > 0) {
      buildingFloors.forEach((floor, fIdx) => {
        const elevParts = floor.elevation ? floor.elevation.split('-') : []
        const rawBase = parseFloat(elevParts[0]) || ((bldg.baseElevationMsl || 7.5) + fIdx * 3.2)
        const rawTop = parseFloat(elevParts[1]) || (rawBase + 3.2)

        const explodedBase = rawBase + explosionOffset * (fIdx * 0.75)
        const explodedTop = rawTop + explosionOffset * (fIdx * 0.75)

        const isTargetFloor = floor.level === (externalFloorLevel || internalFloorLevel)
        if (isolateFloorOnly && !isTargetFloor) return

        // 1. 3D Floor Slab Plate
        towerSource.entities.add({
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

            towerSource.entities.add(unitEntity)
          })
        }
      })
    }

    viewerRef.current?.scene.requestRender()

    return () => {
      if (cityBldg) cityBldg.show = true
      viewerRef.current?.scene.requestRender()
    }
  }, [
    currentBuilding,
    currentBuildingFloors,
    internalFloorLevel,
    externalFloorLevel,
    selectedUnit,
    explosionOffset,
    isolateFloorOnly,
    isolateBuildingMode,
    xrayMode,
    showFlats,
    showElevatorCore,
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
      viewer.scene.requestRender()
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
          <button
            className={`hud-btn ${showPointCloud ? 'active' : ''}`}
            onClick={() => setShowPointCloud(!showPointCloud)}
            title="Toggle Drone LiDAR WebGL Point Cloud Overlay"
            style={{
              color: showPointCloud ? '#38bdf8' : '#cbd5e1',
              borderColor: showPointCloud ? '#0284c7' : 'rgba(255,255,255,0.15)',
              background: showPointCloud ? 'rgba(2, 132, 199, 0.25)' : 'rgba(15, 23, 42, 0.65)',
              fontWeight: '600',
            }}
          >
            ☁️ LiDAR {showPointCloud ? 'ON' : 'OFF'}
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

      {/* Interactive LiDAR Point Cloud Studio Toolbar */}
      {showPointCloud && (
        <div className="cesium-lidar-toolbar">
          <div className="lidar-toolbar-header">
            <div className="lidar-title">
              <span className="lidar-dot"></span>
              <strong>DRONE LIDAR POINT CLOUD STUDIO</strong>
              <small>
                {lidarData?.sensor_metadata?.sensor || 'Riegl VUX-1UAV (550 kHz)'} •{' '}
                {activeRegion === 'auckland' ? 'EPSG:4979 NZGD2000' : 'EPSG:32643 WGS84'}
              </small>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="lidar-badge">
                {lidarLoading ? '⏳ Fetching Points...' : `⚡ ${(lidarData?.rendered_points_count || 12000).toLocaleString()} Points Active`}
              </span>
              <button
                className="hud-btn"
                onClick={() => setShowElevationModal(true)}
                title="Open Dynamic Elevation Cross-Section Chart"
                style={{ fontSize: '10px', padding: '3px 8px', borderColor: '#38bdf8' }}
              >
                📈 Elevation Profile
              </button>
              <button
                className="hud-btn"
                onClick={() => setShowPointCloud(false)}
                title="Close LiDAR Studio"
                style={{ fontSize: '10px', padding: '3px 8px' }}
              >
                ✕ Close
              </button>
            </div>
          </div>

          <div className="lidar-toolbar-controls">
            {/* Color Mode Switcher */}
            <div className="lidar-control-item">
              <span>COLOR RAMP:</span>
              <div className="lidar-pill-group">
                <button
                  className={`lidar-btn ${lidarColorMode === 'classification' ? 'active' : ''}`}
                  onClick={() => setLidarColorMode('classification')}
                  title="ASPRS Standard (Ground: Orange, Building: Blue, Tree: Green)"
                >
                  ASPRS Class
                </button>
                <button
                  className={`lidar-btn ${lidarColorMode === 'elevation' ? 'active' : ''}`}
                  onClick={() => setLidarColorMode('elevation')}
                  title="Hypsometric Elevation Tint (Blue to Red)"
                >
                  Elevation (Z)
                </button>
                <button
                  className={`lidar-btn ${lidarColorMode === 'intensity' ? 'active' : ''}`}
                  onClick={() => setLidarColorMode('intensity')}
                  title="Laser Return Reflectance / Intensity"
                >
                  Intensity
                </button>
              </div>
            </div>

            {/* Point Size Slider */}
            <div className="lidar-control-item">
              <span>POINT SIZE: <strong>{pointSize}px</strong></span>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={pointSize}
                onChange={(e) => setPointSize(Number(e.target.value))}
                className="lidar-slider"
                style={{ width: '90px' }}
              />
            </div>

            {/* Vertical Elevation Slicing Slider */}
            <div className="lidar-control-item wide">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Z-ELEVATION SLICING CUTOFF:</span>
                <strong>{sliceMaxElevation}m MSL</strong>
              </div>
              <input
                type="range"
                min={lidarData?.min_elevation_msl || 0}
                max={lidarData?.max_elevation_msl || 200}
                step="1"
                value={sliceMaxElevation}
                onChange={(e) => setSliceMaxElevation(Number(e.target.value))}
                className="lidar-slider"
              />
            </div>

            {/* Quick Zoom to LiDAR Point Cloud */}
            <div className="lidar-control-item">
              <span>CAMERA:</span>
              <button
                className="hud-btn"
                onClick={() => {
                  if (viewerRef.current) {
                    if (activeRegion === 'auckland') {
                      viewerRef.current.camera.flyTo({
                        destination: Cesium.Cartesian3.fromDegrees(174.767, -36.844, 210),
                        orientation: {
                          heading: Cesium.Math.toRadians(30),
                          pitch: Cesium.Math.toRadians(-22),
                          roll: 0.0,
                        },
                        duration: 1.0,
                      })
                    } else {
                      viewerRef.current.camera.flyTo({
                        destination: Cesium.Cartesian3.fromDegrees(73.733, 18.591, 680),
                        orientation: {
                          heading: Cesium.Math.toRadians(25),
                          pitch: Cesium.Math.toRadians(-25),
                          roll: 0.0,
                        },
                        duration: 1.0,
                      })
                    }
                  }
                }}
                style={{ fontSize: '10px', padding: '4px 10px', color: '#38bdf8' }}
              >
                🔍 Focus Point Cloud
              </button>
            </div>
          </div>
        </div>
      )}

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
