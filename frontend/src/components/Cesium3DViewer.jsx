import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useEffect, useRef, useState } from 'react'

export function Cesium3DViewer({
  onSelectObject,
  activeObjectId,
}) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const [tokenStatus] = useState(() => {
    return import.meta.env.VITE_CESIUM_ION_TOKEN
      ? 'Cesium Ion Connected'
      : 'Using OpenStreetMap / Ellipsoid Terrain'
  })

  useEffect(() => {
    if (!containerRef.current) return

    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
    if (ionToken) {
      Cesium.Ion.defaultAccessToken = ionToken
    }

    // Initialize Cesium Viewer
    const viewer = new Cesium.Viewer(containerRef.current, {
      terrainProvider: ionToken
        ? undefined // Will use default WorldTerrain if token is valid
        : new Cesium.EllipsoidTerrainProvider(),
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
    })

    viewerRef.current = viewer

    // Enable underground view and depth testing
    viewer.scene.globe.depthTestAgainstTerrain = true
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = false

    // Coordinates for Hinjewadi Blue Ridge, Pune
    const centerLon = 73.7335
    const centerLat = 18.5916

    // Fly camera to Hinjewadi Phase 1
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat - 0.006, 950),
      orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: Cesium.Math.toRadians(-45.0),
        roll: 0.0,
      },
      duration: 1.5,
    })

    // 1. Add Surface Parcels
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
        material: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.25),
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

    // 2. Add 3D Extruded Buildings (Tower 5 & 6, SEZ B1)
    // Tower 5 (76.8m tall, 26 storeys)
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
        material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.75),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#fbbf24'),
      },
    })

    // Tower 6 (76.8m tall)
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
    })

    // SEZ Commercial Block B1 (48m tall)
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
        material: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.65),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#93c5fd'),
      },
    })

    // 3. Vertical Floor Slices (Floor 14 and Penthouse Floor 24)
    viewer.entities.add({
      id: 'f-hinj-0501-14',
      name: 'Tower 5 - Floor 14',
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([
          73.7327, 18.5909,
          73.7337, 18.5909,
          73.7337, 18.5923,
          73.7327, 18.5923,
        ]),
        extrudedHeight: 607.4,
        height: 604.4,
        material: Cesium.Color.fromCssColorString('#10b981').withAlpha(0.85),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
      },
    })

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
        material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.9),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
      },
    })

    // 4. Sub-surface Utilities (MNGL Gas Pipe & 33kV Cable)
    viewer.entities.add({
      id: 'ut-hinj-0091',
      name: 'MNGL Natural Gas Trunk Line (-2.2m)',
      polylineVolume: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          73.7315, 18.5898, 558.0,
          73.7365, 18.5902, 558.4,
          73.7420, 18.5908, 559.2,
        ]),
        shape: computeCircle(2.5),
        material: Cesium.Color.fromCssColorString('#a855f7').withAlpha(0.9),
      },
    })

    viewer.entities.add({
      id: 'ut-hinj-0104',
      name: '33kV MSEDCL Power Cable (-1.5m)',
      polylineVolume: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          73.7360, 18.5912, 558.8,
          73.7400, 18.5916, 559.2,
          73.7425, 18.5920, 559.6,
        ]),
        shape: computeCircle(1.8),
        material: Cesium.Color.fromCssColorString('#ec4899').withAlpha(0.9),
      },
    })

    // Click handler for 3D feature picking
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction((movement) => {
      const pickedObject = viewer.scene.pick(movement.position)
      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entityId = pickedObject.id.id
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

  // Update entity highlight when activeObjectId changes
  useEffect(() => {
    if (!viewerRef.current || !activeObjectId) return
    const entity = viewerRef.current.entities.getById(activeObjectId)
    if (entity) {
      viewerRef.current.flyTo(entity, {
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(0),
          Cesium.Math.toRadians(-35),
          300
        ),
        duration: 1.0,
      })
    }
  }, [activeObjectId])

  const flyToTopDown = () => {
    if (!viewerRef.current) return
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(73.7335, 18.5916, 1200),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
      duration: 1.0,
    })
  }

  const flyToOblique = () => {
    if (!viewerRef.current) return
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(73.7335, 18.5860, 750),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-30),
        roll: 0,
      },
      duration: 1.0,
    })
  }

  const flyToUnderground = () => {
    if (!viewerRef.current) return
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(73.7365, 18.5885, 580),
      orientation: {
        heading: Cesium.Math.toRadians(45),
        pitch: Cesium.Math.toRadians(-15),
        roll: 0,
      },
      duration: 1.0,
    })
  }

  return (
    <div className="cesium-wrapper">
      <div className="cesium-container" ref={containerRef} />
      <div className="cesium-overlay-toolbar">
        <button className="cesium-btn" onClick={flyToOblique}>
          🏙️ 3D Perspective
        </button>
        <button className="cesium-btn" onClick={flyToTopDown}>
          🗺️ 2D Nadir (Top-Down)
        </button>
        <button className="cesium-btn" onClick={flyToUnderground}>
          🚇 Sub-surface X-Ray
        </button>
        <div className="cesium-token-status">
          <span className="status-dot" />
          <span>{tokenStatus}</span>
        </div>
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
