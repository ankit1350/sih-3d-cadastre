import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useEffect, useRef, useState } from 'react'

const BASE_LAYERS = {
  satellite: {
    id: 'satellite',
    name: '🛰️ Satellite Imagery (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    credit: '© Esri, Maxar, Earthstar Geographics',
  },
  dark: {
    id: 'dark',
    name: '🌑 Dark Cadastre (CartoDB)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    credit: '© OpenStreetMap contributors, © CARTO',
  },
  streets: {
    id: 'streets',
    name: '🗺️ Streets & Roads (OSM)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    credit: '© OpenStreetMap contributors',
  },
}

export function Cesium3DViewer({
  onSelectObject,
  activeObjectId,
}) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const currentBaseLayerRef = useRef(null)

  const [activeBaseLayer, setActiveBaseLayer] = useState('satellite')
  const [sceneDimension, setSceneDimension] = useState('3d') // '3d' | '2d' | 'columbus'
  const [showUnderground, setShowUnderground] = useState(true)

  useEffect(() => {
    if (!containerRef.current) return

    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
    if (ionToken) {
      Cesium.Ion.defaultAccessToken = ionToken
    }

    // Initialize Cesium Viewer with clean, reliable settings
    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      scene3DOnly: false, // Allows 2D/3D morphing
    })

    viewerRef.current = viewer

    // Setup High-Res Base Imagery (Default: Esri Satellite)
    const initialLayer = new Cesium.ImageryLayer(
      new Cesium.UrlTemplateImageryProvider({
        url: BASE_LAYERS.satellite.url,
        credit: BASE_LAYERS.satellite.credit,
      })
    )
    viewer.imageryLayers.removeAll()
    viewer.imageryLayers.add(initialLayer)
    currentBaseLayerRef.current = initialLayer

    // Enable underground view, terrain lighting, and alpha transparency for ground surface
    viewer.scene.globe.depthTestAgainstTerrain = true
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = false
    viewer.scene.globe.translucency.enabled = true
    viewer.scene.globe.translucency.frontFaceAlpha = 0.88
    viewer.scene.globe.translucency.backFaceAlpha = 0.6

    // Coordinates for Hinjewadi Phase 1, Blue Ridge, Pune
    const centerLon = 73.7335
    const centerLat = 18.5916

    // Fly camera smoothly to Hinjewadi
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat - 0.005, 850),
      orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: Cesium.Math.toRadians(-40.0),
        roll: 0.0,
      },
      duration: 1.2,
    })

    // -------------------------------------------------------------
    // 1. ADD SURFACE PARCELS (2D Base Polygons)
    // -------------------------------------------------------------
    viewer.entities.add({
      id: 'p-hinj-0841',
      name: 'Blue Ridge Sector A (Residential)',
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([
          73.7315, 18.5895,
          73.7365, 18.5898,
          73.7362, 18.5942,
          73.7310, 18.5938,
        ]),
        material: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.28),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#60a5fa'),
        outlineWidth: 3,
        height: 560.2,
      },
    })

    viewer.entities.add({
      id: 'p-hinj-0842',
      name: 'Blue Ridge IT / ITES SEZ Park',
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([
          73.7370, 18.5900,
          73.7425, 18.5904,
          73.7420, 18.5955,
          73.7368, 18.5948,
        ]),
        material: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.2),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#93c5fd'),
        outlineWidth: 2,
        height: 561.0,
      },
    })

    viewer.entities.add({
      id: 'p-hinj-0843',
      name: 'Mula River Riparian Buffer Zone',
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([
          73.7290, 18.5880,
          73.7430, 18.5885,
          73.7432, 18.5897,
          73.7288, 18.5892,
        ]),
        material: Cesium.Color.fromCssColorString('#0284c7').withAlpha(0.35),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#38bdf8'),
        outlineWidth: 2,
        height: 556.5,
      },
    })

    // -------------------------------------------------------------
    // 2. ADD 3D VOLUMETRIC BUILDINGS (Extruded Solids)
    // -------------------------------------------------------------
    // Blue Ridge Tower 5 (T5) - 26 Storeys (76.8m high)
    viewer.entities.add({
      id: 'b-hinj-0501',
      name: 'Blue Ridge Tower 5 (T5)',
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([
          73.7328, 18.5910,
          73.7336, 18.5910,
          73.7336, 18.5922,
          73.7328, 18.5922,
        ]),
        extrudedHeight: 638.0,
        height: 561.2,
        material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.72),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#fbbf24'),
      },
      label: {
        text: 'Tower 5 (T5)\n26 Storeys (76.8m)',
        font: '12px Inter, sans-serif',
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3500),
      },
      position: Cesium.Cartesian3.fromDegrees(73.7332, 18.5916, 642.0),
    })

    // Blue Ridge Tower 6 (T6) - 26 Storeys (76.8m high)
    viewer.entities.add({
      id: 'b-hinj-0502',
      name: 'Blue Ridge Tower 6 (T6)',
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([
          73.7342, 18.5910,
          73.7350, 18.5910,
          73.7350, 18.5922,
          73.7342, 18.5922,
        ]),
        extrudedHeight: 638.1,
        height: 561.3,
        material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.65),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#fde68a'),
      },
      label: {
        text: 'Tower 6 (T6)',
        font: '11px Inter, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3500),
      },
      position: Cesium.Cartesian3.fromDegrees(73.7346, 18.5916, 642.0),
    })

    // SEZ Tech Park Block B1 (12 Storeys, 48m high)
    viewer.entities.add({
      id: 'b-hinj-0611',
      name: 'SEZ IT Tech Park - Block B1',
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([
          73.7385, 18.5915,
          73.7408, 18.5915,
          73.7408, 18.5938,
          73.7385, 18.5938,
        ]),
        extrudedHeight: 610.0,
        height: 562.0,
        material: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.68),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#93c5fd'),
      },
      label: {
        text: 'SEZ IT Park (Block B1)\n12 Storeys (48m)',
        font: '11px Inter, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3500),
      },
      position: Cesium.Cartesian3.fromDegrees(73.7396, 18.5926, 615.0),
    })

    // -------------------------------------------------------------
    // 3. VERTICAL FLOOR SLICES (Cadastral Levels)
    // -------------------------------------------------------------
    // Floor 14 (Level +14)
    viewer.entities.add({
      id: 'f-hinj-0501-14',
      name: 'Tower 5 - Floor 14 (Level +14)',
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([
          73.7327, 18.5909,
          73.7337, 18.5909,
          73.7337, 18.5923,
          73.7327, 18.5923,
        ]),
        extrudedHeight: 607.4,
        height: 604.4,
        material: Cesium.Color.fromCssColorString('#10b981').withAlpha(0.9),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
    })

    // Floor 24 Penthouse Sky Suite
    viewer.entities.add({
      id: 'f-hinj-0501-24',
      name: 'Tower 5 - Floor 24 Penthouse',
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([
          73.7327, 18.5909,
          73.7337, 18.5909,
          73.7337, 18.5923,
          73.7327, 18.5923,
        ]),
        extrudedHeight: 638.0,
        height: 634.4,
        material: Cesium.Color.fromCssColorString('#ec4899').withAlpha(0.92),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
    })

    // -------------------------------------------------------------
    // 4. SUB-SURFACE UTILITIES (Underground Pipes & Cables)
    // -------------------------------------------------------------
    // MNGL High Pressure Gas Trunk Line (-2.2m Depth)
    viewer.entities.add({
      id: 'ut-hinj-0091',
      name: 'MNGL Gas Trunk Line (-2.2m)',
      polylineVolume: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          73.7315, 18.5898, 558.0,
          73.7365, 18.5902, 558.4,
          73.7420, 18.5908, 559.2,
        ]),
        shape: computeCircle(2.2),
        material: Cesium.Color.fromCssColorString('#a855f7').withAlpha(0.95),
      },
    })

    // 33kV MSEDCL Electrical Power Feeder (-1.5m Depth)
    viewer.entities.add({
      id: 'ut-hinj-0104',
      name: '33kV Electrical Power Line (-1.5m)',
      polylineVolume: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          73.7360, 18.5912, 558.8,
          73.7400, 18.5916, 559.2,
          73.7425, 18.5920, 559.6,
        ]),
        shape: computeCircle(1.6),
        material: Cesium.Color.fromCssColorString('#06b6d4').withAlpha(0.95),
      },
    })

    // -------------------------------------------------------------
    // 5. INTERACTIVE 3D ENTITY PICKING
    // -------------------------------------------------------------
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction((movement) => {
      const picked = viewer.scene.pick(movement.position)
      if (Cesium.defined(picked) && picked.id) {
        const entityId = picked.id.id
        if (onSelectObject) {
          onSelectObject(entityId)
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    return () => {
      handler.destroy()
      viewer.destroy()
    }
  }, [onSelectObject])

  // Switch Base Imagery Layer dynamically
  const switchBaseLayer = (layerKey) => {
    if (!viewerRef.current) return
    const layerConfig = BASE_LAYERS[layerKey]
    if (!layerConfig) return

    const viewer = viewerRef.current
    viewer.imageryLayers.removeAll()

    const providerOptions = {
      url: layerConfig.url,
      credit: layerConfig.credit,
    }
    if (layerConfig.subdomains) {
      providerOptions.subdomains = layerConfig.subdomains
    }

    const newLayer = new Cesium.ImageryLayer(
      new Cesium.UrlTemplateImageryProvider(providerOptions)
    )
    viewer.imageryLayers.add(newLayer)
    currentBaseLayerRef.current = newLayer
    setActiveBaseLayer(layerKey)
  }

  // Morph between 3D Globe, 2D Flat Map, and 2.5D Columbus View
  const changeSceneDimension = (mode) => {
    if (!viewerRef.current) return
    const viewer = viewerRef.current

    if (mode === '2d') {
      viewer.scene.morphTo2D(1.0)
    } else if (mode === '3d') {
      viewer.scene.morphTo3D(1.0)
    } else if (mode === 'columbus') {
      viewer.scene.morphToColumbusView(1.0)
    }
    setSceneDimension(mode)
  }

  // Toggle Sub-surface ground transparency
  const toggleUnderground = () => {
    if (!viewerRef.current) return
    const viewer = viewerRef.current
    const nextState = !showUnderground
    viewer.scene.globe.translucency.enabled = nextState
    setShowUnderground(nextState)
  }

  // Smooth zoom to active object
  useEffect(() => {
    if (!viewerRef.current || !activeObjectId) return
    const entity = viewerRef.current.entities.getById(activeObjectId)
    if (entity) {
      viewerRef.current.flyTo(entity, {
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(0),
          Cesium.Math.toRadians(-35),
          320
        ),
        duration: 1.0,
      })
    }
  }, [activeObjectId])

  const flyToReset = () => {
    if (!viewerRef.current) return
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(73.7335, 18.5916 - 0.005, 850),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-40),
        roll: 0,
      },
      duration: 1.0,
    })
  }

  return (
    <div className="cesium-wrapper">
      <div className="cesium-container" ref={containerRef} />

      {/* Floating Control Toolbar */}
      <div className="cesium-floating-controls">
        {/* Dimension Switcher (2D / 3D / 2.5D) */}
        <div className="cesium-ctrl-group">
          <button
            className={`cesium-btn ${sceneDimension === '3d' ? 'active' : ''}`}
            onClick={() => changeSceneDimension('3d')}
            title="3D Volumetric Globe"
          >
            🌐 3D Globe
          </button>
          <button
            className={`cesium-btn ${sceneDimension === '2d' ? 'active' : ''}`}
            onClick={() => changeSceneDimension('2d')}
            title="Flat 2D Cadastral Orthographic View"
          >
            🗺️ 2D Map
          </button>
          <button
            className={`cesium-btn ${sceneDimension === 'columbus' ? 'active' : ''}`}
            onClick={() => changeSceneDimension('columbus')}
            title="2.5D Columbus View"
          >
            📐 2.5D Plan
          </button>
        </div>

        {/* Base Layer Switcher */}
        <div className="cesium-ctrl-group">
          <button
            className={`cesium-btn ${activeBaseLayer === 'satellite' ? 'active' : ''}`}
            onClick={() => switchBaseLayer('satellite')}
            title="High-Res Real Satellite Imagery"
          >
            🛰️ Satellite
          </button>
          <button
            className={`cesium-btn ${activeBaseLayer === 'streets' ? 'active' : ''}`}
            onClick={() => switchBaseLayer('streets')}
            title="OpenStreetMap Roads & Parcels"
          >
            🛣️ Streets
          </button>
          <button
            className={`cesium-btn ${activeBaseLayer === 'dark' ? 'active' : ''}`}
            onClick={() => switchBaseLayer('dark')}
            title="High-Contrast Dark Cadastral Theme"
          >
            🌑 Dark
          </button>
        </div>

        {/* Feature Tools */}
        <div className="cesium-ctrl-group">
          <button
            className={`cesium-btn ${showUnderground ? 'active' : ''}`}
            onClick={toggleUnderground}
            title="Toggle Sub-surface Ground Translucency"
          >
            🚇 {showUnderground ? 'X-Ray (On)' : 'X-Ray (Off)'}
          </button>
          <button
            className="cesium-btn"
            onClick={flyToReset}
            title="Reset Camera to Hinjewadi Blue Ridge"
          >
            🎯 Re-center
          </button>
        </div>
      </div>

      {/* Coordinate & Reference Overlay */}
      <div className="cesium-bottom-info">
        <span className="info-badge">📍 Pune (Hinjewadi Phase 1)</span>
        <span className="info-badge">🌐 EPSG:32643 / WGS84</span>
        <span className="info-badge">⚡ Live WebGL Engine</span>
      </div>
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
