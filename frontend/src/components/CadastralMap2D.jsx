import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { REGIONS, BUILDINGS_DATABASE } from '../data/mockCadastral'

// Fix default Leaflet icon paths in Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const TILE_LAYERS = {
  satellite: {
    name: '🛰️ Satellite (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri World Imagery',
  },
  streets: {
    name: '🗺️ Streets (OSM)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
}

export function CadastralMap2D({
  activeRegion = 'auckland',
  onSelectBuilding,
  onSelectObject,
  activeObjectId,
  parcels = [],
}) {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const [baseTile, setBaseTile] = useState('satellite')
  const [showParcels, setShowParcels] = useState(true)
  const [showBuildings, setShowBuildings] = useState(true)
  const [showUtilities, setShowUtilities] = useState(true)
  const [showCors, setShowCors] = useState(true)

  const regionConfig = REGIONS[activeRegion] || REGIONS.auckland
  const centerLat = activeRegion === 'auckland' ? -36.8445 : 18.5916
  const centerLon = activeRegion === 'auckland' ? 174.7663 : 73.7335

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLon],
      zoom: activeRegion === 'auckland' ? 16 : 15,
      zoomControl: false,
    })

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    // Base Tile Layer
    const tileConfig = TILE_LAYERS[baseTile] || TILE_LAYERS.dark
    const tileLayer = L.tileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      maxZoom: 20,
    }).addTo(map)

    mapInstanceRef.current = { map, tileLayer, layersGroup: L.layerGroup().addTo(map) }

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [activeRegion])

  // Update Base Tile Layer when baseTile changes
  useEffect(() => {
    if (!mapInstanceRef.current) return
    const { map, tileLayer } = mapInstanceRef.current
    map.removeLayer(tileLayer)
    const newTile = TILE_LAYERS[baseTile] || TILE_LAYERS.dark
    mapInstanceRef.current.tileLayer = L.tileLayer(newTile.url, {
      attribution: newTile.attribution,
      maxZoom: 20,
    }).addTo(map)
  }, [baseTile])

  // Render Cadastral Layers (Parcels, Buildings, Utilities, CORS)
  useEffect(() => {
    if (!mapInstanceRef.current) return
    const { map, layersGroup } = mapInstanceRef.current
    layersGroup.clearLayers()

    // 1. Surface Parcels
    if (showParcels) {
      if (activeRegion === 'auckland') {
        const auckParcels = [
          {
            id: 'p-auk-101',
            name: 'Commercial Bay Precinct (Lot 1 DP 523190)',
            ulpin: 'NZ-AUK-CBD-PL-000101-4',
            coords: [
              [-36.8445, 174.765],
              [-36.8442, 174.7675],
              [-36.8428, 174.7672],
              [-36.8431, 174.7646],
            ],
            color: '#3b82f6',
            area: '12,850 m²',
            landUse: 'Commercial High-Density',
          },
          {
            id: 'p-auk-102',
            name: 'The Pacifica Parcel (DP 549102)',
            ulpin: 'NZ-AUK-CBD-PL-000102-2',
            coords: [
              [-36.8456, 174.7676],
              [-36.8454, 174.7692],
              [-36.8442, 174.769],
              [-36.8444, 174.7674],
            ],
            color: '#06b6d4',
            area: '4,200 m²',
            landUse: 'Residential Stratum',
          },
          {
            id: 'p-auk-103',
            name: 'Britomart Civic Transport Reserve',
            ulpin: 'NZ-AUK-CBD-PL-000103-9',
            coords: [
              [-36.8435, 174.7635],
              [-36.8427, 174.77],
              [-36.8415, 174.7698],
              [-36.8423, 174.7632],
            ],
            color: '#10b981',
            area: '28,400 m²',
            landUse: 'Public Transit / Reserve',
          },
        ]

        auckParcels.forEach((p) => {
          const poly = L.polygon(p.coords, {
            color: p.color,
            weight: 2,
            fillColor: p.color,
            fillOpacity: 0.25,
            dashArray: '4, 4',
          }).bindPopup(`
            <div style="font-family: sans-serif; min-width: 180px;">
              <strong style="color: ${p.color}; font-size: 14px;">${p.name}</strong>
              <div style="margin: 6px 0; font-size: 12px; color: #334155;">
                <div><strong>ULPIN:</strong> <code>${p.ulpin}</code></div>
                <div><strong>Area:</strong> ${p.area}</div>
                <div><strong>Land Use:</strong> ${p.landUse}</div>
              </div>
            </div>
          `)
          poly.on('click', () => {
            if (onSelectObject) onSelectObject(p.id)
          })
          layersGroup.addLayer(poly)
        })
      }
    }

    // 2. Building Footprints
    if (showBuildings) {
      const bldgs = BUILDINGS_DATABASE[activeRegion] || []
      bldgs.forEach((b) => {
        let coords = []
        if (b.id === 'b-auk-pacifica') coords = [[-36.8453, 174.7677], [-36.8451, 174.7687], [-36.8444, 174.7685], [-36.8446, 174.7675]]
        else if (b.id === 'b-auk-seascape') coords = [[-36.8459, 174.7688], [-36.8458, 174.7696], [-36.8452, 174.7694], [-36.8453, 174.7686]]
        else if (b.id === 'b-auk-51albert') coords = [[-36.8466, 174.7635], [-36.8465, 174.7645], [-36.8459, 174.7643], [-36.846, 174.7633]]
        else if (b.id === 'b-auk-commbay') coords = [[-36.8441, 174.7652], [-36.8439, 174.7668], [-36.8431, 174.7666], [-36.8433, 174.765]]
        else if (b.id === 'b-hinj-0501' || b.id === 'b-pun-t05') coords = [[18.591, 73.7328], [18.591, 73.7336], [18.5922, 73.7336], [18.5922, 73.7328]]
        else if (b.id === 'b-hinj-0502' || b.id === 'b-pun-t06') coords = [[18.591, 73.7342], [18.591, 73.735], [18.5922, 73.735], [18.5922, 73.7342]]
        else if (b.id === 'b-hinj-0611' || b.id === 'b-pun-t07') coords = [[18.592, 73.7388], [18.592, 73.7404], [18.5932, 73.7404], [18.5932, 73.7388]]

        if (coords.length > 0) {
          const poly = L.polygon(coords, {
            color: '#f97316',
            weight: 2,
            fillColor: '#ea580c',
            fillOpacity: 0.65,
          }).bindPopup(`
            <div style="font-family: sans-serif; min-width: 180px;">
              <strong style="color: #ea580c; font-size: 14px;">🏢 ${b.name}</strong>
              <div style="margin: 6px 0; font-size: 12px; color: #334155;">
                <div><strong>Height:</strong> ${b.heightM || 180}m (${b.floorsCount} Storeys)</div>
                <div><strong>Registered Units:</strong> ${b.unitsCount || 192} Flats</div>
                <div><strong>Roof MSL:</strong> +${b.roofElevationMsl}m</div>
              </div>
            </div>
          `)
          poly.on('click', () => {
            if (onSelectBuilding) onSelectBuilding(b.id)
            if (onSelectObject) onSelectObject(b.id)
          })
          layersGroup.addLayer(poly)
        }
      })
    }

    // 3. Sub-surface Utilities
    if (showUtilities) {
      if (activeRegion === 'auckland') {
        // CRL Twin Rail Tunnel
        const crlLine = L.polyline(
          [
            [-36.8432, 174.7635],
            [-36.8445, 174.7655],
            [-36.8465, 174.767],
            [-36.8495, 174.7685],
          ],
          {
            color: '#a855f7',
            weight: 5,
            dashArray: '8, 8',
          }
        ).bindPopup('<strong>🚇 City Rail Link (CRL) Subterranean Twin Rail Tunnel</strong><br>Depth: -24.0m MSL | Diameter: 3.6m')
        layersGroup.addLayer(crlLine)
      } else {
        // MNGL Gas Line
        const gasLine = L.polyline(
          [
            [18.5898, 73.7315],
            [18.5902, 73.7365],
            [18.5908, 73.742],
          ],
          {
            color: '#eab308',
            weight: 4,
            dashArray: '6, 6',
          }
        ).bindPopup('<strong>⚡ MNGL High-Pressure Natural Gas Pipeline</strong><br>Depth: -2.2m | Elevation: 558.0m MSL')
        layersGroup.addLayer(gasLine)
      }
    }

    // 4. GNSS CORS Reference Stations
    if (showCors) {
      const corsLat = -36.8415
      const corsLon = 174.7663
      const corsName = 'PositioNZ CORS Station AUCK'

      const circle = L.circle([corsLat, corsLon], {
        radius: 350,
        color: '#a855f7',
        fillColor: '#c084fc',
        fillOpacity: 0.12,
        dashArray: '4, 4',
      })
      layersGroup.addLayer(circle)

      const marker = L.circleMarker([corsLat, corsLon], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#9333ea',
        fillOpacity: 1.0,
      }).bindPopup(`<strong>📡 ${corsName}</strong><br>Status: Fixed RTK (±1.2cm accuracy)<br>Broadcast Range: 35 km`)
      layersGroup.addLayer(marker)
    }
  }, [activeRegion, showParcels, showBuildings, showUtilities, showCors, baseTile])

  return (
    <div className="cadastral-map-2d-container" style={{ position: 'relative', width: '100%', height: '720px', borderRadius: '12px', overflow: 'hidden' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating 2D Map Controls */}
      <div
        className="map-2d-toolbar"
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          zIndex: 1000,
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '8px',
          padding: '10px 14px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <select
          value={baseTile}
          onChange={(e) => setBaseTile(e.target.value)}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            color: '#f8fafc',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '12px',
          }}
        >
          <option value="satellite">🛰️ Satellite (Esri)</option>
          <option value="streets">🗺️ Streets (OSM)</option>
        </select>

        <button
          className={`hud-btn ${showParcels ? 'active' : ''}`}
          onClick={() => setShowParcels(!showParcels)}
          style={{
            background: showParcels ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.05)',
            borderColor: showParcels ? '#3b82f6' : 'rgba(255,255,255,0.15)',
            color: showParcels ? '#93c5fd' : '#cbd5e1',
            padding: '6px 10px',
            fontSize: '12px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          📦 Parcels
        </button>

        <button
          className={`hud-btn ${showBuildings ? 'active' : ''}`}
          onClick={() => setShowBuildings(!showBuildings)}
          style={{
            background: showBuildings ? 'rgba(234, 88, 12, 0.25)' : 'rgba(255,255,255,0.05)',
            borderColor: showBuildings ? '#ea580c' : 'rgba(255,255,255,0.15)',
            color: showBuildings ? '#fdba74' : '#cbd5e1',
            padding: '6px 10px',
            fontSize: '12px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          🏢 Footprints
        </button>

        <button
          className={`hud-btn ${showUtilities ? 'active' : ''}`}
          onClick={() => setShowUtilities(!showUtilities)}
          style={{
            background: showUtilities ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255,255,255,0.05)',
            borderColor: showUtilities ? '#a855f7' : 'rgba(255,255,255,0.15)',
            color: showUtilities ? '#d8b4fe' : '#cbd5e1',
            padding: '6px 10px',
            fontSize: '12px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          🚇 Utilities
        </button>

        <button
          className={`hud-btn ${showCors ? 'active' : ''}`}
          onClick={() => setShowCors(!showCors)}
          style={{
            background: showCors ? 'rgba(147, 51, 234, 0.25)' : 'rgba(255,255,255,0.05)',
            borderColor: showCors ? '#9333ea' : 'rgba(255,255,255,0.15)',
            color: showCors ? '#c084fc' : '#cbd5e1',
            padding: '6px 10px',
            fontSize: '12px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          📡 GNSS CORS
        </button>
      </div>
    </div>
  )
}
export default CadastralMap2D

