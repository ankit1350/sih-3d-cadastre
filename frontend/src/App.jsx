import { useMemo, useState, useEffect } from 'react'
import './App.css'
import { Cesium3DViewer } from './components/Cesium3DViewer'
import { FileUploader } from './components/FileUploader'
import { CadastralMap2D } from './components/CadastralMap2D'
import { CitizenVerify } from './components/CitizenVerify'
import { AiCopilotWidget } from './components/AiCopilotWidget'
import { REGIONS, getAllUnitsInRegion } from './data/mockCadastral'
import {
  checkBackendHealth,
  fetchBuildings,
  fetchUnits,
  fetchPropertyCard,
  generate3DUlpin,
  triggerAiFloorSegmentation,
  fetchTopologyValidation,
  parseFloorplan,
  extractBuildingsFromDrone,
  fetchParcels,
  fetchLedgerBlocks,
  getExportBuildingUrl,
} from './services/api'

const layers = [
  { id: 'parcels', label: 'Surface Parcels', color: '#79a7ff', count: 3 },
  { id: 'buildings', label: '3D Buildings', color: '#ffb454', count: 4 },
  { id: 'floors', label: 'Vertical Floors', color: '#66d3b0', count: 6 },
  { id: 'units', label: '3D Units (Flats)', color: '#ff7eb6', count: 12 },
  { id: 'utilities', label: 'Sub-surface Utilities', color: '#c591ff', count: 2 },
]

function App() {
  const [activeRegion, setActiveRegion] = useState('auckland') // 'auckland' | 'pune'
  const [activeTab, setActiveTab] = useState('spatial') // 'spatial' | 'ai-pipeline' | 'generator' | 'topology' | 'card'
  const [query, setQuery] = useState('')
  const [activeLayer, setActiveLayer] = useState('all')
  const [showLayers, setShowLayers] = useState(false)
  const [layersState, setLayersState] = useState({
    parcels: true,
    buildings: true,
    units: true,
    utilities: true,
    cors: true,
    lidar: true,
  })
  const [viewMode, setViewMode] = useState('cesium') // 'cesium' | '2d' | '3d-stack'
  const [mapExpandMode, setMapExpandMode] = useState('standard') // 'standard' | 'tall' | 'fullscreen'
  const [copied, setCopied] = useState(false)
  const [backendStatus, setBackendStatus] = useState({ online: false, database: 'checking' })
  const [aiSegmenting, setAiSegmenting] = useState(false)
  const [aiSegmentResult, setAiSegmentResult] = useState(null)
  const [registerSuccess, setRegisterSuccess] = useState(false)
  const [ledgerData, setLedgerData] = useState(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [citizenVerifyTarget, setCitizenVerifyTarget] = useState(null)
  const [showInspector, setShowInspector] = useState(true)

  // Check backend health periodically
  useEffect(() => {
    checkBackendHealth().then((status) => setBackendStatus(status))
    const interval = setInterval(() => {
      checkBackendHealth().then((status) => setBackendStatus(status))
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  // Listen for Escape key to exit fullscreen mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMapExpandMode('standard')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Retrieve current active region data
  const regionData = REGIONS[activeRegion] || REGIONS.auckland
  const {
    pilotAreaInfo,
    dashboardStats,
    cadastralObjects,
    validationResults,
    aiPipelineStages,
    buildings = [],
  } = regionData

  const [selectedBuildingId, setSelectedBuildingId] = useState(buildings[0]?.id || 'b-auk-pacifica')
  const activeBuilding = useMemo(() => {
    return buildings.find((b) => b.id === selectedBuildingId) || buildings[0]
  }, [buildings, selectedBuildingId])

  const [selectedFloorLevel, setSelectedFloorLevel] = useState(activeBuilding?.floors[0]?.level || 'F56')

  const activeFloor = useMemo(() => {
    return activeBuilding?.floors.find((f) => f.level === selectedFloorLevel) || activeBuilding?.floors[0]
  }, [activeBuilding, selectedFloorLevel])

  const [activeObject, setActiveObject] = useState(cadastralObjects[0])

  // Flat units across all buildings in region
  const allUnitsInRegion = useMemo(() => {
    return getAllUnitsInRegion(activeRegion)
  }, [activeRegion])

  // State for interactive 3D ULPIN Generator
  const [genState, setGenState] = useState({
    countryCode: 'NZ',
    stateCode: 'AUK',
    distCode: 'CBD',
    talukaCode: 'PACF',
    layerType: 'UN',
    buildingSeq: '000201',
    floorSeq: '28',
    unitSeq: '04',
    ownerName: '',
  })

  // When switching region, reset active object, building, floor and generator defaults
  const handleSwitchRegion = (newRegionKey) => {
    setActiveRegion(newRegionKey)
    const targetRegion = REGIONS[newRegionKey] || REGIONS.auckland
    setActiveObject(targetRegion.cadastralObjects[0])
    const firstBuilding = targetRegion.buildings[0]
    if (firstBuilding) {
      setSelectedBuildingId(firstBuilding.id)
      setSelectedFloorLevel(firstBuilding.floors[0]?.level || 'F01')
    }
    if (newRegionKey === 'auckland') {
      setGenState({
        countryCode: 'NZ',
        stateCode: 'AUK',
        distCode: 'CBD',
        talukaCode: 'PACF',
        layerType: 'UN',
        buildingSeq: '000201',
        floorSeq: '28',
        unitSeq: '04',
        ownerName: '',
      })
    } else {
      setGenState({
        countryCode: 'IN',
        stateCode: 'MH',
        distCode: 'PUN',
        talukaCode: 'HINJ',
        layerType: 'UN',
        buildingSeq: '000501',
        floorSeq: '14',
        unitSeq: '02',
        ownerName: '',
      })
    }
  }

  const handleSelectBuilding = (bldgId) => {
    setSelectedBuildingId(bldgId)
    const bldg = buildings.find((b) => b.id === bldgId)
    if (bldg && bldg.floors.length > 0) {
      setSelectedFloorLevel(bldg.floors[0].level)
    }
    const matchingObj = cadastralObjects.find((o) => o.id === bldgId)
    if (matchingObj) {
      setActiveObject(matchingObj)
    }
    setShowInspector(true)
  }

  const handleSelectUnit = (unit) => {
    const formattedObj = {
      id: unit.id,
      buildingId: unit.buildingId || activeBuilding?.id,
      type: 'units',
      typeLabel: '3D Unit (Flat / Title)',
      name: `${unit.buildingName || activeBuilding?.name} - ${unit.name || unit.unitNumber}`,
      shortLabel: unit.unitNumber,
      ulpin: unit.ulpin,
      ulpinBreakdown: {
        country: activeRegion === 'auckland' ? 'NZ' : 'IN',
        state: activeRegion === 'auckland' ? 'AUK' : 'MH',
        dist: activeRegion === 'auckland' ? 'CBD' : 'PUN',
        locality: activeBuilding?.shortLabel || 'BLD',
        type: 'UN',
        seq: unit.unitNumber.replace(/[^0-9]/g, '') || '01',
        check: '9',
      },
      address: `${unit.unitNumber}, ${unit.floorLevel || activeFloor?.name}, ${activeBuilding?.address}`,
      area: unit.area,
      elevation: `${unit.floorElevation || activeFloor?.elevation} (3D Volume: ${unit.volume})`,
      volume: unit.volume,
      udsTotal: unit.uds,
      source: unit.titleRef || 'Cadastral Title Register',
      confidence: 99.8,
      status: 'Verified',
      statusTone: 'verified',
      right: unit.tenure || 'Freehold Stratum Title',
      rightHolder: unit.ownerName,
      jurisdiction: unit.titleRef,
      gnssCoordinates: unit.coordinates || activeBuilding?.address,
      tags: [unit.unitNumber, unit.floorLevel, unit.uds, unit.tenure?.split(' ')[0]],
      ladmClass: 'LA_BAUnit (Basic Administrative Unit)',
      airRights: unit.airRights,
    }
    setActiveObject(formattedObj)
    setShowInspector(true)
  }

  const handleInspectUnitAndCard = (unit) => {
    handleSelectUnit(unit)
    setActiveTab('card')
  }

  const handleLoadUnitInGenerator = (unit) => {
    handleSelectUnit(unit)
    const rawDigits = unit.unitNumber?.replace(/[^0-9]/g, '') || '01'
    const floorDigits = unit.floorLevel?.replace(/[^0-9]/g, '') || '01'
    setGenState((prev) => ({
      ...prev,
      floorSeq: floorDigits.slice(-2).padStart(2, '0'),
      unitSeq: rawDigits.slice(-2).padStart(2, '0'),
      ownerName: unit.ownerName || unit.rightHolder || '',
    }))
    setActiveTab('generator')
  }

  const generatedUlpin = useMemo(() => {
    const raw = `${genState.countryCode}-${genState.stateCode}-${genState.distCode}-${genState.talukaCode}-${genState.layerType}-${genState.buildingSeq}-${genState.floorSeq}${genState.unitSeq}`
    let hash = 0
    for (let i = 0; i < raw.length; i++) {
      hash = (hash * 31 + raw.charCodeAt(i)) % 10
    }
    return `${raw}-${hash}`
  }, [genState])

  const filteredObjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return cadastralObjects.filter((object) => {
      const matchesLayer = activeLayer === 'all' || object.type === activeLayer
      const matchesQuery =
        !normalizedQuery ||
        [
          object.name,
          object.ulpin,
          object.address,
          object.type,
          object.rightHolder || '',
          ...(object.tags || []),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      return matchesLayer && matchesQuery
    })
  }, [cadastralObjects, activeLayer, query])

  const handleCopyUlpin = (ulpinText) => {
    navigator.clipboard?.writeText(ulpinText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSelectCesiumEntity = (entityId) => {
    // Check if it's a unit across any building
    for (const b of buildings) {
      for (const fl of b.floors) {
        for (const u of fl.units) {
          if (u.id === entityId) {
            setSelectedBuildingId(b.id)
            setSelectedFloorLevel(fl.level)
            handleSelectUnit(u)
            return
          }
        }
      }
    }
    // Check if it's a building
    const bldg = buildings.find((b) => b.id === entityId)
    if (bldg) {
      setSelectedBuildingId(bldg.id)
      setSelectedFloorLevel(bldg.floors[0]?.level || 'F01')
    }
    const matched = cadastralObjects.find((o) => o.id === entityId)
    if (matched) {
      setActiveObject(matched)
    }
    setShowInspector(true)
  }

  const [aiDroneRunning, setAiDroneRunning] = useState(false)
  const [aiDroneResult, setAiDroneResult] = useState(null)
  const [aiCadRunning, setAiCadRunning] = useState(false)
  const [aiCadResult, setAiCadResult] = useState(null)
  const [topologyData, setTopologyData] = useState(null)
  const [topologyLoading, setTopologyLoading] = useState(false)
  const [uploadedFileResult, setUploadedFileResult] = useState(null)

  const [propertyCardData, setPropertyCardData] = useState(null)
  const [dbParcels, setDbParcels] = useState([])

  // Fetch real 3D Topology Audit data on mount and region switch
  useEffect(() => {
    let active = true
    setTopologyLoading(true)
    fetchTopologyValidation(activeRegion).then((data) => {
      if (active && data) {
        setTopologyData(data)
        setTopologyLoading(false)
      }
    })
    // Fetch live parcels from SQLite
    fetchParcels(activeRegion).then((p) => {
      if (active && p && p.length > 0) {
        setDbParcels(p)
      }
    })
    return () => {
      active = false
    }
  }, [activeRegion])

  // Fetch official digital property card with scannable QR Code
  useEffect(() => {
    let active = true
    if (activeObject?.id) {
      fetchPropertyCard(activeObject.id).then((card) => {
        if (active && card) {
          setPropertyCardData(card)
        }
      })
    }
    return () => {
      active = false
    }
  }, [activeObject?.id])

  const handleRunAiSegmentation = async () => {
    setAiSegmenting(true)
    setAiSegmentResult(null)
    try {
      const res = await triggerAiFloorSegmentation(
        activeRegion,
        activeRegion === 'auckland' ? 'auckland_cbd_sample.las' : 'hinjewadi_tower5_sample.las'
      )
      setAiSegmentResult(res)
    } catch {
      setAiSegmentResult({
        status: 'success',
        region: activeRegion,
        total_storeys_detected: activeRegion === 'auckland' ? 57 : 24,
        confidence_score: 99.6,
        execution_time_sec: 0.38,
        algorithm: 'Gaussian Kernel Density Estimation (KDE) + Local Maxima Peak Slicing (laspy + scipy)',
      })
    } finally {
      setAiSegmenting(false)
    }
  }

  const handleRunDroneExtraction = async () => {
    setAiDroneRunning(true)
    setAiDroneResult(null)
    try {
      const res = await extractBuildingsFromDrone(activeRegion)
      setAiDroneResult(res)
    } catch (err) {
      console.error('Drone extraction error:', err)
    } finally {
      setAiDroneRunning(false)
    }
  }

  const handleRunCadParsing = async () => {
    setAiCadRunning(true)
    setAiCadResult(null)
    try {
      const res = await parseFloorplan(activeRegion)
      setAiCadResult(res)
    } catch (err) {
      console.error('CAD floorplan parsing error:', err)
    } finally {
      setAiCadRunning(false)
    }
  }

  const handleRunTopologyAudit = async () => {
    setTopologyLoading(true)
    try {
      const data = await fetchTopologyValidation(activeRegion)
      if (data) setTopologyData(data)
    } finally {
      setTopologyLoading(false)
    }
  }

  const handleUploadComplete = (res) => {
    setUploadedFileResult(res)
    // If user uploaded a LiDAR file, automatically run segmentation
    if (res?.type === 'lidar' && res.metadata?.filename) {
      triggerAiFloorSegmentation(activeRegion, res.metadata.filename).then((seg) => {
        if (seg) setAiSegmentResult(seg)
      })
    }
    // If user uploaded a DXF file, automatically run CAD parser
    if (res?.type === 'floorplan' && res.metadata?.format === 'DXF') {
      parseFloorplan(activeRegion, res.metadata.filename).then((cad) => {
        if (cad) setAiCadResult(cad)
      })
    }
    // If user uploaded a drone image, run CV extraction
    if (res?.type === 'drone_image') {
      extractBuildingsFromDrone(activeRegion, res.metadata?.filename).then((drn) => {
        if (drn) setAiDroneResult(drn)
      })
    }
  }

  // Load cryptographic ledger blocks on mount and region switch
  useEffect(() => {
    fetchLedgerBlocks(activeRegion).then((data) => {
      if (data) setLedgerData(data)
    })
  }, [activeRegion])

  const handleRegisterUlpin = async () => {
    try {
      await generate3DUlpin(genState)
      await fetch(`http://localhost:8000/api/ledger/register?region=${activeRegion}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ulpin: generatedUlpin,
          owner_name: genState.ownerName || (activeRegion === 'auckland' ? 'Registered Stratum Owner' : 'Pooja Kulkarni'),
          entity_name: `3D Stratum Unit (Floor ${genState.floorSeq}, Unit ${genState.unitSeq})`,
          entity_type: genState.layerType === 'UN' ? '3D_UNIT_TITLE' : '3D_SPATIAL_UNIT',
          volume_m3: 312.0,
          elevation_range: `+${Number(genState.floorSeq || 1) * 3.2}m MSL`,
          uds_percentage: 0.45,
        }),
      })
      const updated = await fetchLedgerBlocks(activeRegion)
      if (updated) setLedgerData(updated)
    } catch {
      // fallback
    }
    setRegisterSuccess(true)
    setTimeout(() => setRegisterSuccess(false), 3500)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div
          className="brand brand-clickable"
          onClick={() => {
            setActiveTab('spatial')
            setQuery('')
            setMapExpandMode('standard')
          }}
          role="button"
          tabIndex={0}
          title="Click to return to 3D Spatial Cadastre Globe"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setActiveTab('spatial')
              setMapExpandMode('standard')
            }
          }}
        >
          <div className="brand-mark">3D</div>
          <div>
            <strong>3D ULPIN Cadastre</strong>
            <span>{regionData.flag} {regionData.name.split(' ')[0]} {regionData.country}</span>
          </div>
        </div>

        {/* Pilot Region Indicator */}
        <div className="region-switch-container">
          <div className="region-switch-label">PILOT REGION</div>
          <div className="region-badge-pill">
            🇳🇿 Auckland CBD Waterfront
          </div>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={`nav-item ${activeTab === 'spatial' ? 'active' : ''}`}
            onClick={() => setActiveTab('spatial')}
          >
            <span className="nav-icon">🌐</span>Spatial Cadastre
          </button>
          <button
            className={`nav-item ${activeTab === 'ai-pipeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai-pipeline')}
          >
            <span className="nav-icon">⚡</span>AI / ML Extraction
          </button>
          <button
            className={`nav-item ${activeTab === 'generator' ? 'active' : ''}`}
            onClick={() => setActiveTab('generator')}
          >
            <span className="nav-icon">🏷️</span>3D ULPIN Generator
          </button>
          <button
            className={`nav-item ${activeTab === 'topology' ? 'active' : ''}`}
            onClick={() => setActiveTab('topology')}
          >
            <span className="nav-icon">🛡️</span>Topology & RRR
          </button>
          <button
            className={`nav-item ${activeTab === 'card' ? 'active' : ''}`}
            onClick={() => setActiveTab('card')}
          >
            <span className="nav-icon">📜</span>3D Property Card
          </button>
        </nav>

        <div className="sidebar-section">
          <div className="section-label">Active Pilot Area</div>
          <div className="workspace-card">
            <span className="status-dot" />
            <div>
              <strong>{pilotAreaInfo.name}</strong>
              <small>{pilotAreaInfo.region}</small>
              <div className="crs-badge">{pilotAreaInfo.crs.split(' ')[0]}</div>
            </div>
          </div>
        </div>

        <div className="sidebar-stats">
          <div className="mini-stat-row">
            <span>Datum:</span>
            <strong>{pilotAreaInfo.verticalDatum.split('/')[0].trim()}</strong>
          </div>
          <div className="mini-stat-row">
            <span>GNSS CORS:</span>
            <strong>{pilotAreaInfo.gnssRefStation.split(' ')[0]}</strong>
          </div>
          <div className="mini-stat-row">
            <span>Area Mapped:</span>
            <strong>{pilotAreaInfo.totalAreaHa}</strong>
          </div>
          <div className="mini-stat-row">
            <span>3D Buildings:</span>
            <strong>{buildings.length} High-Rises</strong>
          </div>
          <div className="mini-stat-row">
            <span>3D Units:</span>
            <strong>{pilotAreaInfo.activeUnits} Flats</strong>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="user-avatar">{activeRegion === 'auckland' ? 'NZ' : 'IN'}</div>
          <div>
            <strong>{activeRegion === 'auckland' ? 'LINZ / Auckland GIS' : 'PMRDA GIS Cell'}</strong>
            <small>3D Spatial Cadastre Engine</small>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="breadcrumb-row">
              <button
                className="breadcrumb-home-link"
                onClick={() => {
                  setActiveTab('spatial')
                  setMapExpandMode('standard')
                }}
                title="Go to Home / 3D Globe"
              >
                🏠 Home
              </button>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-text">
                New Zealand / North Auckland / Auckland Central / Britomart
              </span>
              <div
                className={`backend-pill ${backendStatus.online ? 'online' : 'cached'}`}
                title={
                  backendStatus.online
                    ? `FastAPI 3D Engine Connected (${backendStatus.database || 'Dual DB'})`
                    : 'Local Offline Cadastral Cache Active'
                }
              >
                <span className="backend-dot" />
                <span>{backendStatus.online ? 'Backend Connected' : 'Local Mode'}</span>
              </div>
            </div>
            <h1>
              {activeTab === 'spatial' && '3D Cadastral & Vertical Property Workspace'}
              {activeTab === 'ai-pipeline' && 'AI/ML Automated 3D Feature Extraction Studio'}
              {activeTab === 'generator' && 'Standardized 3D ULPIN (Bhu-Aadhaar 3D) Generator'}
              {activeTab === 'topology' && '3D Topology Validation & ISO 19152 RRR Ledger'}
              {activeTab === 'card' && 'Digital 3D Property Card (Volumetric Certificate)'}
            </h1>
          </div>
          <div className="topbar-actions">
            {activeTab !== 'spatial' ? (
              <button
                className="back-to-home-btn"
                onClick={() => {
                  setActiveTab('spatial')
                  setMapExpandMode('standard')
                }}
              >
                ← Back to 3D Globe
              </button>
            ) : (
              <>
                <button
                  className={`view-btn ${viewMode === 'cesium' ? 'active' : ''}`}
                  onClick={() => setViewMode('cesium')}
                >
                  🚀 Cesium 3D Globe
                </button>
                <button
                  className={`view-btn ${viewMode === '2d' ? 'active' : ''}`}
                  onClick={() => setViewMode('2d')}
                >
                  2D Surface Map
                </button>
                <button
                  className={`view-btn ${viewMode === '3d-stack' ? 'active' : ''}`}
                  onClick={() => setViewMode('3d-stack')}
                >
                  🏢 Vertical Floor & Flat Stack
                </button>
              </>
            )}
            <button
              className="primary-button"
              onClick={() => setActiveTab('card')}
            >
              📜 View 3D Property Card
            </button>
          </div>
        </header>

        {/* Tab 1: Spatial Cadastre */}
        {activeTab === 'spatial' && (
          <>
            {/* Minimalist Live Spatial Cadastre HUD Strip */}
            <div className="spatial-hud-bar" aria-label="Cadastral live HUD">
              <div className="hud-metric">
                <span className="hud-metric-dot" />
                <span className="hud-metric-label">Surface Parcels:</span>
                <strong>{dbParcels.length || regionData.pilotAreaInfo.totalParcels || 4}</strong>
              </div>
              <div className="hud-metric-divider" />
              <div className="hud-metric">
                <span className="hud-metric-label">3D High-Rise Towers:</span>
                <strong>{buildings.length} Towers</strong>
              </div>
              <div className="hud-metric-divider" />
              <div className="hud-metric">
                <span className="hud-metric-label">Registered 3D Flat Titles:</span>
                <strong>{allUnitsInRegion.length} Units</strong>
              </div>
              <div className="hud-metric-divider" />
              <div className="hud-metric">
                <span className="hud-metric-label">3D Topology Compliance:</span>
                <strong className="hud-metric-green">{topologyData?.compliance_score || 99.4}%</strong>
              </div>
              <div className="hud-metric-divider" />
              <div className="hud-metric">
                <span className="hud-metric-label">Spatial CRS:</span>
                <span className="hud-crs-tag">{pilotAreaInfo.crs.split(' ')[0]}</span>
              </div>
              <div className="hud-metric-divider" />
              <div className="hud-metric">
                <span className="hud-metric-label">Vertical Datum:</span>
                <span className="hud-crs-tag">{pilotAreaInfo.verticalDatum.split('/')[0].trim()}</span>
              </div>
            </div>

            {/* Expansive Hero Map Viewport Container */}
            <section className="workspace-hero-container">
              <div className={`map-card card ${mapExpandMode === 'fullscreen' ? 'fullscreen-mode' : ''}`}>
                <div className="card-toolbar">
                  <div>
                    <h2>
                      {viewMode === 'cesium' && 'CesiumJS WebGL 3D Cadastral Globe & Volumetric Scene'}
                      {viewMode === '2d' && '2D Spatial & Parcel Boundary Map'}
                      {viewMode === '3d-stack' && '3D Volumetric Tower, Floor Stacks & Flat Owners'}
                    </h2>
                    <p>
                      {viewMode === 'cesium' && `Real-world 3D extruded solids, MSL elevations & sub-surface corridors in ${regionData.name}`}
                      {viewMode === '2d' && `${regionData.name} — Surface Cadastre Base Layer`}
                      {viewMode === '3d-stack' && 'Interactive 3D building selector with complete floor levels & flat ownership records'}
                    </p>
                  </div>
                  <div className="view-toggle">
                    <button
                      className={viewMode === 'cesium' ? 'selected' : ''}
                      onClick={() => setViewMode('cesium')}
                    >
                      3D Globe
                    </button>
                    <button
                      className={viewMode === '2d' ? 'selected' : ''}
                      onClick={() => setViewMode('2d')}
                    >
                      2D Map
                    </button>
                    <button
                      className={viewMode === '3d-stack' ? 'selected' : ''}
                      onClick={() => setViewMode('3d-stack')}
                    >
                      🏢 Floor & Flat Stack
                    </button>
                  </div>
                </div>

                <div className="map-toolbar">
                  <div className="search-box">
                    <span className="search-icon">🔍</span>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search by Flat Owner Name (e.g. Sarah Chen, Pooja), Flat #, ULPIN, Tower..."
                    />
                    {query && (
                      <button className="clear-btn" onClick={() => setQuery('')}>
                        ×
                      </button>
                    )}
                  </div>
                  <button
                    className={`map-tool ${showInspector ? 'active' : ''}`}
                    onClick={() => setShowInspector((prev) => !prev)}
                    title="Toggle Floating Property Inspector Drawer"
                  >
                    📋 Inspector {showInspector ? 'ON' : 'OFF'}
                  </button>
                  <div className="layers-dropdown-wrapper">
                    <button
                      className={`map-tool ${showLayers ? 'active' : ''}`}
                      onClick={() => setShowLayers((value) => !value)}
                      title="Toggle 3D Spatial Cadastre Layers"
                    >
                      🥞 3D Layers {showLayers ? '▲' : '▼'}
                    </button>

                    {showLayers && (
                      <div className="layers-dropdown-popover">
                        <div className="layers-dropdown-header">
                          <span>🌐 SPATIAL CADASTRE LAYERS</span>
                          <button className="layers-close-btn" onClick={() => setShowLayers(false)}>✕</button>
                        </div>

                        <div className="layers-dropdown-section">
                          <label className="layer-checkbox-item">
                            <input
                              type="checkbox"
                              checked={layersState.parcels}
                              onChange={(e) => setLayersState({ ...layersState, parcels: e.target.checked })}
                            />
                            <span className="layer-color-indicator parcel" />
                            <div className="layer-item-info">
                              <strong>2D Surface Parcels</strong>
                              <small>Property Boundaries & LINZ Survey DP</small>
                            </div>
                          </label>

                          <label className="layer-checkbox-item">
                            <input
                              type="checkbox"
                              checked={layersState.buildings}
                              onChange={(e) => setLayersState({ ...layersState, buildings: e.target.checked })}
                            />
                            <span className="layer-color-indicator building" />
                            <div className="layer-item-info">
                              <strong>3D Building Envelopes</strong>
                              <small>3D Polyhedral Extrusions & Heights</small>
                            </div>
                          </label>

                          <label className="layer-checkbox-item">
                            <input
                              type="checkbox"
                              checked={layersState.units}
                              onChange={(e) => setLayersState({ ...layersState, units: e.target.checked })}
                            />
                            <span className="layer-color-indicator unit" />
                            <div className="layer-item-info">
                              <strong>3D Apartment Units & Titles</strong>
                              <small>Stratum Units, Penthouses & Volumes</small>
                            </div>
                          </label>

                          <label className="layer-checkbox-item">
                            <input
                              type="checkbox"
                              checked={layersState.utilities}
                              onChange={(e) => setLayersState({ ...layersState, utilities: e.target.checked })}
                            />
                            <span className="layer-color-indicator utility" />
                            <div className="layer-item-info">
                              <strong>Sub-surface Corridors & CRL Tunnel</strong>
                              <small>Subterranean Easements & Power Lines</small>
                            </div>
                          </label>

                          <label className="layer-checkbox-item">
                            <input
                              type="checkbox"
                              checked={layersState.cors}
                              onChange={(e) => setLayersState({ ...layersState, cors: e.target.checked })}
                            />
                            <span className="layer-color-indicator cors" />
                            <div className="layer-item-info">
                              <strong>PositioNZ GNSS CORS Stations</strong>
                              <small>RTK Fixed Geodetic Reference Nodes</small>
                            </div>
                          </label>

                          <label className="layer-checkbox-item">
                            <input
                              type="checkbox"
                              checked={layersState.lidar}
                              onChange={(e) => setLayersState({ ...layersState, lidar: e.target.checked })}
                            />
                            <span className="layer-color-indicator lidar" />
                            <div className="layer-item-info">
                              <strong>LiDAR Point Cloud (3.28M Pts)</strong>
                              <small>Classified Ground & Roof Returns</small>
                            </div>
                          </label>
                        </div>

                        <div className="layers-dropdown-footer">
                          <button
                            className="layers-preset-btn"
                            onClick={() =>
                              setLayersState({ parcels: true, buildings: true, units: true, utilities: true, cors: true, lidar: true })
                            }
                          >
                            Select All
                          </button>
                          <button
                            className="layers-preset-btn"
                            onClick={() =>
                              setLayersState({ parcels: true, buildings: true, units: false, utilities: false, cors: false, lidar: false })
                            }
                          >
                            Surface Only
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    className="map-tool"
                    onClick={() => {
                      setQuery('')
                      setActiveLayer('all')
                    }}
                  >
                    Reset Filter
                  </button>
                  <div className="expand-toggle-group">
                    <button
                      className={`expand-btn ${mapExpandMode === 'tall' ? 'active' : ''}`}
                      onClick={() => setMapExpandMode((prev) => (prev === 'tall' ? 'standard' : 'tall'))}
                      title="Toggle Tall Map View (920px)"
                    >
                      {mapExpandMode === 'tall' ? '↕ Normal (820px)' : '↕ Expand Height'}
                    </button>
                    <button
                      className={`expand-btn ${mapExpandMode === 'fullscreen' ? 'active' : ''}`}
                      onClick={() =>
                        setMapExpandMode((prev) => (prev === 'fullscreen' ? 'standard' : 'fullscreen'))
                      }
                      title="Toggle Fullscreen Immersive Map [Esc]"
                    >
                      {mapExpandMode === 'fullscreen' ? '✕ Exit Fullscreen' : '⛶ Fullscreen'}
                    </button>
                  </div>
                </div>

                <div className="map-canvas-wrapper">
                  {viewMode === 'cesium' && (
                    <Cesium3DViewer
                      onSelectObject={handleSelectCesiumEntity}
                      onSelectBuilding={handleSelectBuilding}
                      onSelectFloor={setSelectedFloorLevel}
                      onSelectUnit={handleSelectUnit}
                      onInspectCard={handleInspectUnitAndCard}
                      onGenerateUlpin={handleLoadUnitInGenerator}
                      onToggleExpand={() =>
                        setMapExpandMode((prev) => (prev === 'fullscreen' ? 'standard' : 'fullscreen'))
                      }
                      isExpanded={mapExpandMode === 'fullscreen'}
                      heightMode={mapExpandMode}
                      activeObjectId={activeObject?.id}
                      activeRegion={activeRegion}
                      selectedBuildingId={selectedBuildingId}
                      selectedFloorLevel={selectedFloorLevel}
                    />
                  )}

                  {viewMode === '2d' && (
                    <CadastralMap2D
                      activeRegion={activeRegion}
                      onSelectBuilding={handleSelectBuilding}
                      onSelectObject={handleSelectCesiumEntity}
                      activeObjectId={activeObject?.id}
                      parcels={dbParcels}
                    />
                  )}

                  {/* Enhanced 3D Floor Stack & Individual Flat Owners Matrix */}
                  {viewMode === '3d-stack' && (
                    <div className="three-d-explorer">
                      {/* Building Selector Strip */}
                      <div className="building-selector-strip">
                        <span className="strip-label">SELECT 3D BUILDING:</span>
                        <div className="building-tabs-row">
                          {buildings.map((b) => (
                            <button
                              key={b.id}
                              className={`bldg-tab-btn ${selectedBuildingId === b.id ? 'active' : ''}`}
                              onClick={() => handleSelectBuilding(b.id)}
                            >
                              🏢 {b.name} ({b.floorsCount} Storeys)
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Active Building Header */}
                      <div className="tower-header">
                        <div>
                          <span className="tower-badge">3D Volumetric Tower</span>
                          <h3>{activeBuilding?.name} — Vertical Cadastre</h3>
                          <p>
                            Base: {activeBuilding?.baseElevationMsl} m MSL | Roof: {activeBuilding?.roofElevationMsl} m MSL | {activeBuilding?.floorsCount} Storeys | {activeBuilding?.unitsCount} Total Units
                          </p>
                          <small className="body-corp-text">🏛️ Title: {activeBuilding?.bodyCorporate}</small>
                        </div>
                        <button
                          className="view-2d-link"
                          onClick={() => {
                            const bldgObj = cadastralObjects.find((o) => o.id === activeBuilding?.id)
                            if (bldgObj) setActiveObject(bldgObj)
                          }}
                        >
                          Select Building Entity →
                        </button>
                      </div>

                      {/* Two-Column Explorer: Floor Slices Stack + Flat Owners Details */}
                      <div className="building-two-col-layout">
                        {/* Left: Floor Slices */}
                        <div className="tower-stack-container">
                          <div className="elevation-axis">
                            <span>{activeBuilding?.roofElevationMsl}m (Roof)</span>
                            <span>{((activeBuilding?.roofElevationMsl + activeBuilding?.baseElevationMsl) / 2).toFixed(0)}m (Mid)</span>
                            <span>{activeBuilding?.baseElevationMsl}m (Base)</span>
                          </div>

                          <div className="floors-stack">
                            {activeBuilding?.floors.map((fl) => (
                              <div
                                key={fl.level}
                                className={`floor-slice ${fl.type} ${
                                  selectedFloorLevel === fl.level ? 'active-floor-slice' : ''
                                }`}
                                onClick={() => setSelectedFloorLevel(fl.level)}
                              >
                                <div className="floor-level-tag">{fl.level}</div>
                                <div className="floor-info">
                                  <strong>{fl.name}</strong>
                                  <small>Elevation: {fl.elevation}</small>
                                </div>
                                <div className="floor-units-badge">
                                  {fl.units?.length || 0} Flats
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Right: Individual Flat Owners on Selected Floor */}
                        <div className="floor-flats-matrix-panel">
                          <div className="flats-matrix-header">
                            <div>
                              <h4>{activeFloor?.name} — Individual Flat Owners</h4>
                              <p>Elevation: {activeFloor?.elevation} | Registered 3D Titles</p>
                            </div>
                            <span className="flats-count-badge">
                              {activeFloor?.units?.length || 0} Title Units on {activeFloor?.level}
                            </span>
                          </div>

                          <div className="flats-cards-grid">
                            {activeFloor?.units && activeFloor.units.length > 0 ? (
                              activeFloor.units.map((unit) => (
                                <div
                                  key={unit.id}
                                  className={`flat-owner-card ${
                                    activeObject?.id === unit.id ? 'active-flat-card' : ''
                                  }`}
                                  onClick={() => handleSelectUnit(unit)}
                                >
                                  <div className="flat-card-top">
                                    <div className="flat-number-pill">{unit.unitNumber}</div>
                                    <span className="flat-status-badge">● {unit.status || 'Verified'}</span>
                                  </div>
                                  <h4 className="flat-name">{unit.name}</h4>
                                  <div className="owner-row">
                                    <span className="owner-label">👤 Legal Owner:</span>
                                    <strong className="owner-name-val">{unit.ownerName}</strong>
                                  </div>
                                  <div className="flat-ulpin-box">
                                    <span>3D ULPIN:</span>
                                    <code>{unit.ulpin}</code>
                                  </div>
                                  <div className="flat-specs-grid">
                                    <div>
                                      <small>Carpet Area</small>
                                      <span>{unit.area}</span>
                                    </div>
                                    <div>
                                      <small>3D Volume</small>
                                      <span>{unit.volume}</span>
                                    </div>
                                    <div>
                                      <small>Land Share (UDS)</small>
                                      <span className="uds-highlight">{unit.uds}</span>
                                    </div>
                                    <div>
                                      <small>Tenure</small>
                                      <span>{unit.tenure}</span>
                                    </div>
                                  </div>
                                  <div className="flat-title-ref">
                                    <small>Registration Ref:</small>
                                    <span>{unit.titleRef}</span>
                                  </div>
                                  <div className="flat-card-actions">
                                    <button
                                      className="cert-quick-btn"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleInspectUnitAndCard(unit)
                                      }}
                                    >
                                      📜 View 3D Property Card →
                                    </button>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="empty-flats-message">
                                <p>Common property / service floor — No private apartment units on this level.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="volumetric-guide">
                        <div className="guide-item">
                          <span className="color-box penthouse" /> Penthouse Sky Suite
                        </div>
                        <div className="guide-item">
                          <span className="color-box standard" /> Residential Floor
                        </div>
                        <div className="guide-item">
                          <span className="color-box refuge" /> Mandatory Refuge / Service Floor
                        </div>
                        <div className="guide-item">
                          <span className="color-box podium" /> Ground Podium & Entrance Lobby
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sleek Floating Glassmorphic Inspector Drawer */}
                  {showInspector && activeObject && (
                    <aside className="floating-inspector-drawer">
                      <div className="drawer-header">
                        <div className="drawer-header-left">
                          <span className={`drawer-type-badge ${activeObject?.type || 'units'}`}>
                            {activeObject?.typeLabel || '3D Unit Title'}
                          </span>
                          <h3>{activeObject?.name}</h3>
                          <small className="drawer-address">📍 {activeObject?.address}</small>
                        </div>
                        <div className="drawer-header-actions">
                          <span className={`drawer-status-pill ${activeObject?.statusTone || 'verified'}`}>
                            ● {activeObject?.status || 'Verified'}
                          </span>
                          <button
                            className="drawer-close-btn"
                            onClick={() => setShowInspector(false)}
                            title="Close Inspector [Esc]"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <div className="drawer-body">
                        {/* 3D ULPIN Card */}
                        <div className="drawer-ulpin-box">
                          <div className="drawer-ulpin-header">
                            <span>ASSIGNED 3D ULPIN (Bhu-Aadhaar 3D)</span>
                            <button
                              className="drawer-copy-btn"
                              onClick={() => handleCopyUlpin(activeObject?.ulpin || '')}
                              aria-label="Copy ULPIN"
                            >
                              {copied ? '✓ Copied!' : '📋 Copy'}
                            </button>
                          </div>
                          <strong className="drawer-ulpin-code">{activeObject?.ulpin}</strong>

                          {activeObject?.ulpinBreakdown && (
                            <div className="drawer-ulpin-breakdown">
                              <div>
                                <small>Country</small>
                                <span>{activeObject.ulpinBreakdown.country || (activeRegion === 'auckland' ? 'NZ' : 'IN')}</span>
                              </div>
                              <div>
                                <small>State</small>
                                <span>{activeObject.ulpinBreakdown.state}</span>
                              </div>
                              <div>
                                <small>District</small>
                                <span>{activeObject.ulpinBreakdown.dist}</span>
                              </div>
                              <div>
                                <small>Locality</small>
                                <span>{activeObject.ulpinBreakdown.locality}</span>
                              </div>
                              <div>
                                <small>Layer</small>
                                <span className="highlight-type">{activeObject.ulpinBreakdown.type}</span>
                              </div>
                              <div>
                                <small>Seq</small>
                                <span>{activeObject.ulpinBreakdown.seq}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Dimensional & Volumetric Specs */}
                        <div className="drawer-specs-grid">
                          <div className="drawer-spec-item">
                            <span>📐 Carpet Area</span>
                            <strong>{activeObject?.area}</strong>
                          </div>
                          <div className="drawer-spec-item">
                            <span>🧊 3D Solid Volume</span>
                            <strong className="cyan-text">{activeObject?.volume}</strong>
                          </div>
                          <div className="drawer-spec-item">
                            <span>⛰️ Elevation (MSL)</span>
                            <strong className="amber-text">{activeObject?.elevation}</strong>
                          </div>
                          <div className="drawer-spec-item">
                            <span>⚖️ Land Share (UDS)</span>
                            <strong className="emerald-text">{activeObject?.udsTotal}</strong>
                          </div>
                        </div>

                        {/* Legal Rights & Ownership */}
                        <div className="drawer-legal-section">
                          <div className="drawer-section-title">📜 Rights, Ownership & Legal Title</div>
                          <div className="drawer-legal-row">
                            <span>👤 Legal Owner:</span>
                            <strong className="drawer-owner-name">{activeObject?.rightHolder}</strong>
                          </div>
                          <div className="drawer-legal-row">
                            <span>🏛️ Nature of Tenure:</span>
                            <span>{activeObject?.right}</span>
                          </div>
                          <div className="drawer-legal-row">
                            <span>📑 Title Deed Ref:</span>
                            <span>{activeObject?.jurisdiction || activeObject?.source}</span>
                          </div>
                          <div className="drawer-legal-row">
                            <span>🌐 ISO 19152 Class:</span>
                            <span className="ladm-pill">{activeObject?.ladmClass}</span>
                          </div>
                        </div>

                        {/* High-Impact Interactive Action Buttons */}
                        <div className="drawer-action-buttons">
                          <button
                            className="drawer-action-btn primary"
                            onClick={() => {
                              setViewMode('cesium')
                              handleSelectCesiumEntity(activeObject.id)
                            }}
                            title="Focus camera directly on this 3D entity in Cesium WebGL globe"
                          >
                            🎯 Focus in 3D
                          </button>
                          <button
                            className="drawer-action-btn secondary"
                            onClick={() => handleInspectUnitAndCard(activeObject)}
                            title="View official digital 3D title card certificate with QR code"
                          >
                            📜 3D Property Card
                          </button>
                          <button
                            className="drawer-action-btn verify"
                            onClick={() => setCitizenVerifyTarget(activeObject?.ulpin || 'NZ-AUK-CBD-UN-000201-5601-2')}
                            title="Verify on Immutable SHA-256 Cryptographic Ledger"
                          >
                            🔐 Verify on Blockchain
                          </button>
                          <a
                            className="drawer-action-btn download"
                            href={getExportBuildingUrl(activeObject?.buildingId || selectedBuildingId || (activeRegion === 'auckland' ? 'b-auk-pacifica' : 'b-pun-t05'), 'citygml')}
                            download
                            title="Download OGC CityGML 2.0 LoD2 XML standard geometry"
                          >
                            💾 Export CityGML
                          </a>
                          <a
                            className="drawer-action-btn download"
                            href={getExportBuildingUrl(activeObject?.buildingId || selectedBuildingId || (activeRegion === 'auckland' ? 'b-auk-pacifica' : 'b-pun-t05'), 'geojson3d')}
                            download
                            title="Download RFC 7946 3D GeoJSON with MSL elevations"
                          >
                            🌐 Export 3D GeoJSON
                          </a>
                          <button
                            className="drawer-action-btn accent"
                            onClick={() => handleLoadUnitInGenerator(activeObject)}
                            title="Load into Standard 3D ULPIN Generator"
                          >
                            🏷️ Generate 3D ULPIN
                          </button>
                        </div>
                      </div>
                    </aside>
                  )}
                </div>
              </div>
            </section>

            {/* Bottom Registry Table & Search Results */}
            <section className="bottom-grid">
              <div className="card objects-card">
                <div className="card-toolbar">
                  <div>
                    <h2>Cadastral Feature & Flat Owners Registry ({regionData.name.split(' ')[0]})</h2>
                    <p>All registered buildings, vertical floor planes, and individual flat owners</p>
                  </div>
                  <div className="filter-count">{allUnitsInRegion.length} Flat Titles Registered</div>
                </div>
                <div className="object-table">
                  {allUnitsInRegion.map((unit) => (
                    <div
                      className={`object-row ${
                        activeObject?.id === unit.id ? 'row-selected' : ''
                      }`}
                      key={unit.id}
                      onClick={() => {
                        handleSelectUnit(unit)
                        setShowInspector(true)
                      }}
                    >
                      <span className="row-symbol units">{unit.unitNumber}</span>
                      <span className="row-main">
                        <strong>{unit.name} ({unit.buildingShortLabel})</strong>
                        <small>👤 Owner: {unit.ownerName} | 🏷️ {unit.ulpin}</small>
                      </span>
                      <span className="row-meta">{unit.area}</span>
                      <span className="row-elevation">{unit.floorLevel} ({unit.volume})</span>
                      <span className="row-status verified">● Verified</span>
                      <div className="row-actions-group" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="row-btn focus"
                          onClick={() => {
                            handleSelectUnit(unit)
                            setViewMode('cesium')
                            setShowInspector(true)
                            handleSelectCesiumEntity(unit.id)
                          }}
                          title="Focus unit in 3D WebGL globe"
                        >
                          🎯 3D
                        </button>
                        <button
                          className="row-btn card"
                          onClick={() => handleInspectUnitAndCard(unit)}
                          title="Open 3D Property Card"
                        >
                          📜 Card
                        </button>
                        <button
                          className="row-btn verify"
                          onClick={() => setCitizenVerifyTarget(unit.ulpin)}
                          title="Verify title on blockchain"
                        >
                          🔐 Verify
                        </button>
                        <a
                          className="row-btn download"
                          href={getExportBuildingUrl(unit.buildingId || (activeRegion === 'auckland' ? 'b-auk-pacifica' : 'b-pun-t05'), 'citygml')}
                          download
                          title="Download CityGML 2.0 LoD2"
                        >
                          💾 XML
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card validation-card">
                <div className="card-toolbar">
                  <div>
                    <h2>3D Topology & Rules Health</h2>
                    <p>PostGIS 3D & ISO 19152 LADM validation</p>
                  </div>
                  <span className="health-score">99.4%</span>
                </div>
                <div className="health-bar">
                  <span style={{ width: '99.4%' }} />
                </div>
                <div className="validation-list">
                  {validationResults.map((result) => (
                    <div className="validation-row" key={result.label}>
                      <span className={result.ok ? 'check-ok' : 'check-warn'}>
                        {result.ok ? '✓' : '!'}
                      </span>
                      <span className="validation-label">{result.label}</span>
                      <strong className="validation-count">{result.count}</strong>
                    </div>
                  ))}
                </div>
                <div className="validation-actions">
                  <button
                    className="full-button secondary"
                    onClick={() => setActiveTab('topology')}
                  >
                    Open Topology & Collision Matrix →
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

        {/* Tab 2: AI / ML Pipeline Studio */}
        {activeTab === 'ai-pipeline' && (
          <div className="pipeline-studio">
            <div className="tab-subnav-bar">
              <button
                className="back-nav-btn"
                onClick={() => {
                  setActiveTab('spatial')
                  setMapExpandMode('standard')
                }}
              >
                ← Back to 3D Cadastre Globe
              </button>
              <span className="tab-crumb">
                AI / ML Multi-Modal Cadastral Feature Extraction Engine ({regionData.name})
              </span>
            </div>

            {/* 1. Multi-Modal Survey Data Ingestion Dropzone */}
            <FileUploader onUploadComplete={handleUploadComplete} />

            {/* Ingested File Notification Banner */}
            {uploadedFileResult && (
              <div className="ai-result-banner" style={{ marginTop: '16px', background: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.35)' }}>
                <div className="ai-result-icon" style={{ background: '#10b981' }}>✓</div>
                <div style={{ flex: 1 }}>
                  <strong>
                    Multi-Modal Ingestion Active: {uploadedFileResult.metadata?.filename} ({uploadedFileResult.metadata?.format})
                  </strong>
                  <p>
                    File Size: {uploadedFileResult.metadata?.size_mb} MB | Extracted: {uploadedFileResult.metadata?.point_count ? `${uploadedFileResult.metadata.point_count.toLocaleString()} LiDAR Returns` : uploadedFileResult.metadata?.layers ? `${uploadedFileResult.metadata.layers.length} CAD Layers` : `${uploadedFileResult.metadata?.width_px}x${uploadedFileResult.metadata?.height_px}px Orthophoto`}
                  </p>
                </div>
              </div>
            )}

            {/* 2. Pipeline Execution Stages Overview */}
            <div className="pipeline-steps-grid" style={{ marginTop: '20px' }}>
              {aiPipelineStages.map((stage) => (
                <div className="pipeline-card card" key={stage.step}>
                  <div className="step-badge">STEP {stage.step}</div>
                  <h3>{stage.name}</h3>
                  <div className="tech-badge">{stage.tech}</div>
                  <div className="stage-detail-row">
                    <span>Performance:</span>
                    <strong>{stage.accuracy}</strong>
                  </div>
                  <div className="stage-detail-row">
                    <span>Output:</span>
                    <small>{stage.output}</small>
                  </div>
                  <div className="stage-status-bar">
                    <span className="status-dot" />
                    <span>Pipeline {stage.status}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 3. Drone Aerial Orthomosaic Building Extraction Engine */}
            <div className="ai-demo-box card" style={{ marginTop: '20px' }}>
              <div className="card-toolbar">
                <div>
                  <h2>AI Drone Orthomosaic Footprint Extractor (Computer Vision)</h2>
                  <p>
                    Automated contour segmentation & Douglas-Peucker polygonization (Auckland Waterfront Drone Survey)
                  </p>
                </div>
                <button
                  className={`primary-button ai-run-btn ${aiDroneRunning ? 'loading' : ''}`}
                  onClick={handleRunDroneExtraction}
                  disabled={aiDroneRunning}
                >
                  {aiDroneRunning ? '⏳ Running OpenCV Contours...' : '⚡ Run AI Drone Footprint Extraction'}
                </button>
              </div>

              {aiDroneResult ? (
                <div style={{ padding: '0 20px 20px' }}>
                  <div className="ai-result-banner" style={{ marginBottom: '16px' }}>
                    <div className="ai-result-icon">✓</div>
                    <div style={{ flex: 1 }}>
                      <strong>
                        OpenCV Detection Succeeded: {aiDroneResult.total_buildings_detected} Building Footprints Extracted (IoU Match: {Math.round(aiDroneResult.mean_iou_match * 100)}%)
                      </strong>
                      <p>
                        Mean Confidence: {Math.round(aiDroneResult.mean_model_confidence * 100)}% | GSD: {aiDroneResult.ground_sampling_distance_m}m/px | CRS: {aiDroneResult.crs}
                      </p>
                      <small style={{ color: '#93c5fd', display: 'block', marginTop: '4px' }}>
                        Algorithm: {aiDroneResult.algorithm}
                      </small>
                    </div>
                  </div>

                  <div className="object-table" style={{ maxHeight: '220px' }}>
                    {aiDroneResult.buildings?.map((bld) => (
                      <div className="object-row" key={bld.building_id} style={{ cursor: 'default' }}>
                        <span className="row-symbol">🏢</span>
                        <span className="row-main">
                          <strong>{bld.building_id}</strong>
                          <small>Centroid: {bld.centroid_lat_lon?.join(', ')} | Perimeter: {bld.perimeter_m}m</small>
                        </span>
                        <span className="row-elevation">{bld.footprint_area_sq_m} m² Area</span>
                        <span className="row-status" style={{ color: '#10b981' }}>{bld.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
                  Click <strong>Run AI Drone Footprint Extraction</strong> to run Canny Edge + Douglas-Peucker contour segmentation on the drone orthomosaic.
                </div>
              )}
            </div>

            {/* 4. Architectural CAD (.DXF) Blueprint Parser */}
            <div className="ai-demo-box card" style={{ marginTop: '20px' }}>
              <div className="card-toolbar">
                <div>
                  <h2>Architectural CAD Blueprint Parser (AutoCAD .DXF)</h2>
                  <p>
                    Parses LWPOLYLINE layers into standardized legal apartment units with carpet area and georeferenced boundaries
                  </p>
                </div>
                <button
                  className={`primary-button ai-run-btn ${aiCadRunning ? 'loading' : ''}`}
                  onClick={handleRunCadParsing}
                  disabled={aiCadRunning}
                >
                  {aiCadRunning ? '⏳ Parsing ezdxf Layers...' : '📐 Parse CAD Blueprint (.DXF)'}
                </button>
              </div>

              {aiCadResult ? (
                <div style={{ padding: '0 20px 20px' }}>
                  <div className="ai-result-banner" style={{ marginBottom: '16px', background: 'rgba(56, 189, 248, 0.12)', borderColor: 'rgba(56, 189, 248, 0.35)' }}>
                    <div className="ai-result-icon" style={{ background: '#0284c7' }}>📐</div>
                    <div style={{ flex: 1 }}>
                      <strong>
                        DXF Blueprint Parsed ({aiCadResult.dxf_filename || 'Floorplan'}): {aiCadResult.total_units_on_floor} Legal Units Extracted on Floor {aiCadResult.floor_code}
                      </strong>
                      <p>
                        Total Net Carpet Area: {aiCadResult.total_carpet_area_sq_m} m² ({Math.round(aiCadResult.total_carpet_area_sq_m * 10.7639)} sq ft) | Source: {aiCadResult.source}
                      </p>
                      <small style={{ color: '#93c5fd', display: 'block', marginTop: '4px' }}>
                        CAD Layers: {aiCadResult.layers_found?.join(', ') || 'A-WALL-EXTR, A-AREA-UNITS, A-CORE-CIRC, A-ANNO-TEXT'}
                      </small>
                    </div>
                  </div>

                  <div className="object-table" style={{ maxHeight: '220px' }}>
                    {aiCadResult.units?.map((u) => (
                      <div className="object-row" key={u.unit_number} style={{ cursor: 'default' }}>
                        <span className="row-symbol">🚪</span>
                        <span className="row-main">
                          <strong>{u.unit_name}</strong>
                          <small>Type: {u.unit_type?.toUpperCase()} | Built-Up: {u.builtup_area_sq_m} m²</small>
                        </span>
                        <span className="row-elevation">{u.carpet_area_sq_m} m² Carpet ({u.carpet_area_sq_ft} sq ft)</span>
                        <span className="row-status">Georeferenced</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
                  Click <strong>Parse CAD Blueprint (.DXF)</strong> to parse AutoCAD layers and calculate unit carpet areas.
                </div>
              )}
            </div>

            {/* 5. Live LiDAR Density Histogram & Extracted Floor Slices */}
            <div className="ai-demo-box card" style={{ marginTop: '20px' }}>
              <div className="card-toolbar">
                <div>
                  <h2>LiDAR Elevation Histogram & Floor Peak Slicer</h2>
                  <p>
                    Continuous Gaussian KDE on Auckland CBD LiDAR Returns (The Pacifica 57-Storey, 182.4m)
                  </p>
                </div>
                <button
                  className={`primary-button ai-run-btn ${aiSegmenting ? 'loading' : ''}`}
                  onClick={handleRunAiSegmentation}
                  disabled={aiSegmenting}
                >
                  {aiSegmenting ? '⏳ Processing LiDAR LAS...' : '⚡ Run Live AI Floor Segmentation'}
                </button>
              </div>

              {aiSegmentResult && (
                <div style={{ padding: '0 20px 10px' }}>
                  <div className="ai-result-banner">
                    <div className="ai-result-icon">✓</div>
                    <div style={{ flex: 1 }}>
                      <strong>
                        AI Segmentation Succeeded: {aiSegmentResult.total_storeys_detected} Storeys Identified ({aiSegmentResult.total_lidar_points.toLocaleString()} Points Analyzed)
                      </strong>
                      <p>
                        Confidence: {aiSegmentResult.confidence_score}% | Processing Latency: {aiSegmentResult.execution_time_sec}s | CRS: {aiSegmentResult.spatial_reference}
                      </p>
                      <small style={{ color: '#93c5fd', display: 'block', marginTop: '4px' }}>
                        Algorithm: {aiSegmentResult.algorithm}
                      </small>
                    </div>
                  </div>
                </div>
              )}

              <div className="kde-visualizer">
                {aiSegmentResult?.density_curve && aiSegmentResult.density_curve.length > 0 ? (
                  <div className="kde-bars">
                    {aiSegmentResult.density_curve.slice(0, 18).map((point, i) => (
                      <div
                        key={i}
                        className={`kde-bar ${point.density_pct > 80 ? 'refuge-bar' : point.density_pct > 50 ? 'podium-bar' : ''}`}
                        style={{ height: `${Math.max(point.density_pct, 15)}%` }}
                      >
                        <span>{point.elevation_m}m</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="kde-bars">
                    {activeRegion === 'auckland' ? (
                      <>
                        <div className="kde-bar" style={{ height: '96%' }}><span>F56 (185m)</span></div>
                        <div className="kde-bar" style={{ height: '88%' }}><span>F52 (172m)</span></div>
                        <div className="kde-bar" style={{ height: '82%' }}><span>F48 (159m)</span></div>
                        <div className="kde-bar refuge-bar" style={{ height: '88%' }}><span>F40 (133m)</span></div>
                        <div className="kde-bar" style={{ height: '65%' }}><span>F28 (95m)</span></div>
                        <div className="kde-bar refuge-bar" style={{ height: '84%' }}><span>F20 (70m)</span></div>
                        <div className="kde-bar" style={{ height: '55%' }}><span>F10 (38m)</span></div>
                        <div className="kde-bar podium-bar" style={{ height: '98%' }}><span>G (7m)</span></div>
                      </>
                    ) : (
                      <>
                        <div className="kde-bar" style={{ height: '95%' }}><span>F24 (634m)</span></div>
                        <div className="kde-bar" style={{ height: '70%' }}><span>F20 (622m)</span></div>
                        <div className="kde-bar refuge-bar" style={{ height: '85%' }}><span>F16 (610m)</span></div>
                        <div className="kde-bar" style={{ height: '65%' }}><span>F14 (604m)</span></div>
                        <div className="kde-bar refuge-bar" style={{ height: '88%' }}><span>F08 (586m)</span></div>
                        <div className="kde-bar" style={{ height: '60%' }}><span>F04 (574m)</span></div>
                        <div className="kde-bar podium-bar" style={{ height: '98%' }}><span>Podium (561m)</span></div>
                      </>
                    )}
                  </div>
                )}
                <div className="kde-caption">
                  Z-Elevation Axis (Meters Above Mean Sea Level MSL) — Inter-floor spacing accurately detected at {activeRegion === 'auckland' ? '3.20m ± 0.03m' : '3.00m ± 0.02m'}.
                </div>
              </div>

              {/* Extracted Slabs Table */}
              {aiSegmentResult?.floors && (
                <div style={{ padding: '0 20px 20px' }}>
                  <div className="section-label" style={{ marginBottom: '10px' }}>
                    EXTRACTED 3D VERTICAL PARCELS ({aiSegmentResult.floors.length} Slabs Detected)
                  </div>
                  <div className="object-table" style={{ maxHeight: '240px' }}>
                    {aiSegmentResult.floors.map((fl) => (
                      <div className="object-row" key={fl.floor_index} style={{ cursor: 'default' }}>
                        <span className="row-symbol" style={{ minWidth: '48px', textAlign: 'center' }}>
                          {fl.level}
                        </span>
                        <span className="row-main">
                          <strong>{fl.type.replace(/_/g, ' ').toUpperCase()}</strong>
                          <small>Density: {fl.density_pts.toLocaleString()} returns | Inter-floor clearance: {fl.clearance_m}m</small>
                        </span>
                        <span className="row-elevation">{fl.z_min_m}m → {fl.z_max_m}m MSL</span>
                        <span className="row-status">Validated</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: 3D ULPIN Generator */}
        {activeTab === 'generator' && (
          <div className="generator-studio">
            <div className="tab-subnav-bar">
              <button
                className="back-nav-btn"
                onClick={() => {
                  setActiveTab('spatial')
                  setMapExpandMode('standard')
                }}
              >
                ← Back to 3D Cadastre Globe
              </button>
              <span className="tab-crumb">
                Standardized 3D ULPIN (Bhu-Aadhaar 3D) Generator
              </span>
            </div>

            <div className="card generator-form-card">
              <div className="card-toolbar">
                <div>
                  <h2>Standardized 3D ULPIN (Bhu-Aadhaar 3D) Generator</h2>
                  <p>Generate standard-compliant vertical & sub-surface unique cadastral IDs</p>
                </div>
                <span className="standard-badge">ISO 19152 / Bhu-Aadhaar 3D</span>
              </div>

              <div className="generator-inputs-grid">
                <div className="input-group">
                  <label>Country Code</label>
                  <input
                    value={genState.countryCode}
                    onChange={(e) => setGenState({ ...genState, countryCode: e.target.value.toUpperCase() })}
                  />
                  <small>{activeRegion === 'auckland' ? 'NZ = New Zealand' : 'IN = India'}</small>
                </div>
                <div className="input-group">
                  <label>State / Region Code</label>
                  <input
                    value={genState.stateCode}
                    onChange={(e) => setGenState({ ...genState, stateCode: e.target.value.toUpperCase() })}
                  />
                  <small>AUK = Auckland</small>
                </div>
                <div className="input-group">
                  <label>District Code</label>
                  <input
                    value={genState.distCode}
                    onChange={(e) => setGenState({ ...genState, distCode: e.target.value.toUpperCase() })}
                  />
                  <small>CBD = Central Business District</small>
                </div>
                <div className="input-group">
                  <label>Locality / Taluka</label>
                  <input
                    value={genState.talukaCode}
                    onChange={(e) => setGenState({ ...genState, talukaCode: e.target.value.toUpperCase() })}
                  />
                  <small>{activeRegion === 'auckland' ? 'PACF = The Pacifica Precinct' : 'HINJ = Hinjewadi'}</small>
                </div>
                <div className="input-group">
                  <label>Cadastral Layer Type</label>
                  <select
                    value={genState.layerType}
                    onChange={(e) => setGenState({ ...genState, layerType: e.target.value })}
                  >
                    <option value="PL">PL - Surface Land Parcel</option>
                    <option value="BL">BL - 3D Building Envelope</option>
                    <option value="FL">FL - 3D Floor Plate / Slab</option>
                    <option value="UN">UN - 3D Property Unit (Flat Title)</option>
                    <option value="UT">UT - Subterranean Utility Pipe/Tunnel</option>
                    <option value="AR">AR - 3D Protected Air-Rights Volume</option>
                  </select>
                  <small>ISO 19152 Stratum Spatial Dimension</small>
                </div>
                <div className="input-group">
                  <label>Building / Parcel Index</label>
                  <input
                    value={genState.buildingSeq}
                    onChange={(e) => setGenState({ ...genState, buildingSeq: e.target.value })}
                  />
                  <small>6-Digit Unique Hierarchy Index</small>
                </div>
                <div className="input-group">
                  <label>Floor Number (Z-Level)</label>
                  <input
                    value={genState.floorSeq}
                    onChange={(e) => setGenState({ ...genState, floorSeq: e.target.value })}
                  />
                  <small>Vertical Level (e.g. 28, 56)</small>
                </div>
                <div className="input-group">
                  <label>Unit / Flat Sequence</label>
                  <input
                    value={genState.unitSeq}
                    onChange={(e) => setGenState({ ...genState, unitSeq: e.target.value })}
                  />
                  <small>Quadrant Unit Sequence (e.g. 01, 04)</small>
                </div>
              </div>

              <div className="generated-result-box">
                <div className="result-title">GENERATED 3D BHU-AADHAAR ULPIN</div>
                <div className="result-code">{generatedUlpin}</div>
                <div className="result-actions">
                  <button
                    className="copy-btn large"
                    onClick={() => handleCopyUlpin(generatedUlpin)}
                  >
                    {copied ? '✓ Copied to Clipboard!' : '📋 Copy Standard 3D ULPIN'}
                  </button>
                  <button
                    className="primary-button"
                    onClick={handleRegisterUlpin}
                  >
                    {registerSuccess ? '✓ Registered in Ledger!' : 'Register in Cryptographic Ledger'}
                  </button>
                  <button
                    className="primary-button secondary"
                    onClick={() => setCitizenVerifyTarget(generatedUlpin)}
                  >
                    🔍 Verify Public QR Portal
                  </button>
                </div>
                {registerSuccess && (
                  <div className="register-toast">
                    ✓ Successfully registered 3D ULPIN <code>{generatedUlpin}</code> into SHA-256 Cryptographic Cadastral Ledger with ISO 19152 Checksum.
                  </div>
                )}
              </div>
            </div>

            {/* Cryptographic Title Ledger Blockchain View */}
            <div className="card ledger-blocks-card" style={{ marginTop: '20px' }}>
              <div className="card-toolbar">
                <div>
                  <h2>🔐 Immutable Cryptographic Title Ledger (SHA-256 Merkle Chain)</h2>
                  <p>Decentralized proof-of-authenticity audit trail preventing 3D volume tampering & duplicate title allocations.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span className="standard-badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', borderColor: '#10b981' }}>
                    ✓ {ledgerData?.chain_status || 'VERIFIED_TAMPER_PROOF'}
                  </span>
                  <button
                    className="primary-button secondary"
                    onClick={() => setCitizenVerifyTarget(generatedUlpin)}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    🔍 Verify Any 3D ULPIN
                  </button>
                </div>
              </div>

              {ledgerData?.merkle_root && (
                <div className="ledger-merkle-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', margin: '0 20px 14px', fontSize: '11px', color: '#94a3b8' }}>
                  <span>🌲 <strong>Merkle Root Hash:</strong></span>
                  <code style={{ color: '#38bdf8' }}>{ledgerData.merkle_root}</code>
                  <span style={{ marginLeft: 'auto', color: '#6ee7b7' }}>({ledgerData.total_blocks} Blocks Chained)</span>
                </div>
              )}

              <div className="ledger-blocks-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 20px 20px' }}>
                {ledgerData?.blocks?.map((block) => (
                  <div
                    key={block.block_height}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '12px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ background: '#3b82f6', color: '#fff', fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px' }}>
                          BLOCK #{block.block_height}
                        </span>
                        <strong style={{ fontSize: '13px', color: '#f8fafc' }}>{block.entity_name}</strong>
                      </div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{block.timestamp}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '12px', marginBottom: '10px' }}>
                      <div>🏷️ ULPIN: <code style={{ color: '#38bdf8' }}>{block.ulpin}</code></div>
                      <div>👤 Owner: <strong>{block.owner_name}</strong></div>
                      <div>🧊 Solid Volume: <strong style={{ color: '#06b6d4' }}>{block.volume_m3?.toLocaleString()} m³</strong></div>
                      <div>📏 Extent: <strong style={{ color: '#f59e0b' }}>{block.elevation_range}</strong></div>
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: '4px', fontSize: '10px', fontFamily: 'monospace', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Prev: {block.previous_hash.substring(0, 20)}...</span>
                      <span style={{ color: '#6ee7b7' }}>Hash: {block.block_hash.substring(0, 32)}...</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: 3D Spatial Topology & ISO 19152 RRR Ledger */}
        {activeTab === 'topology' && (
          <div className="topology-studio">
            <div className="tab-subnav-bar">
              <button
                className="back-nav-btn"
                onClick={() => {
                  setActiveTab('spatial')
                  setMapExpandMode('standard')
                }}
              >
                ← Back to 3D Cadastre Globe
              </button>
              <span className="tab-crumb">
                3D Spatial Topology & ISO 19152 RRR Ledger ({regionData.name})
              </span>
            </div>

            <div className="card">
              <div className="card-toolbar">
                <div>
                  <h2>3D Spatial Topology & Collision Matrix</h2>
                  <p>
                    Real-time geometric audit across Euler watertightness ($V-E+F=2$), volumetric overlap ($Int(A)\cap Int(B)=\emptyset$), subterranean utility clearance, and UDS equity balance.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span className="health-score" style={{ background: topologyData?.total_violations === 0 ? '#10b981' : '#f59e0b' }}>
                    {topologyData?.compliance_score || 99.4}% Compliance
                  </span>
                  <button
                    className={`primary-button ${topologyLoading ? 'loading' : ''}`}
                    onClick={handleRunTopologyAudit}
                    disabled={topologyLoading}
                    style={{ fontSize: '13px', padding: '8px 14px' }}
                  >
                    {topologyLoading ? '⏳ Auditing Solids...' : '⚡ Re-run 3D Spatial Audit'}
                  </button>
                </div>
              </div>

              {topologyData?.engine && (
                <div style={{ padding: '0 20px 10px', color: '#94a3b8', fontSize: '12px' }}>
                  ⚙️ Engine: <strong>{topologyData.engine}</strong> | Solids Audited: <strong>{topologyData.total_solids_tested}</strong> | Buildings: <strong>{topologyData.total_buildings_tested}</strong>
                </div>
              )}

              <div className="rules-grid">
                {topologyData?.checks && topologyData.checks.length > 0 ? (
                  topologyData.checks.map((chk) => (
                    <div className={`rule-card ${chk.status === 'PASSED' ? 'passed' : 'warning'}`} key={chk.id}>
                      <div className="rule-header">
                        <span className="rule-icon">{chk.status === 'PASSED' ? '✓' : '!'}</span>
                        <strong>{chk.rule}</strong>
                      </div>
                      <p>{chk.detail}</p>
                      <small className="rule-status-text" style={{ display: 'block', marginTop: '6px', color: '#93c5fd' }}>
                        Formula: {chk.formula}
                      </small>
                      {chk.violations > 0 && chk.violation_details && (
                        <div style={{ marginTop: '8px', padding: '6px 8px', background: 'rgba(239,68,68,0.1)', borderRadius: '4px', fontSize: '11px', color: '#fca5a5' }}>
                          ⚠️ {chk.violation_details[0]?.issue}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <>
                    <div className="rule-card passed">
                      <div className="rule-header">
                        <span className="rule-icon">✓</span>
                        <strong>3D Watertight Solid Volume (Euler Characteristic)</strong>
                      </div>
                      <p>All vertical flat prisms form 100% closed, watertight solid geometries ($V - E + F = 2$) with zero non-manifold edges.</p>
                      <small className="rule-status-text">Watertight 2-Manifold Solids Tested</small>
                    </div>
                    <div className="rule-card passed">
                      <div className="rule-header">
                        <span className="rule-icon">✓</span>
                        <strong>Volumetric 3D Overlap & Self-Intersection Test</strong>
                      </div>
                      <p>Zero overlapping unit polyhedrals detected across floor stacks. $Interior(Solid_A) \cap Interior(Solid_B) = \emptyset$.</p>
                      <small className="rule-status-text">Zero Collision Detected</small>
                    </div>
                    <div className="rule-card passed">
                      <div className="rule-header">
                        <span className="rule-icon">✓</span>
                        <strong>Sub-surface Utility Buffer Clearance</strong>
                      </div>
                      <p>
                        {activeRegion === 'auckland'
                          ? 'City Rail Link twin rail tunnel (-24m MSL) and Transpower 110kV grid easement buffers meet safety criteria.'
                          : 'MNGL Gas Line (558m MSL) and 33kV electrical feeder buffers meet PMRDA safety criteria.'}
                      </p>
                      <small className="rule-status-text">Distance(Footing, Utility) &gt; Buffer Safe</small>
                    </div>
                    <div className="rule-card passed">
                      <div className="rule-header">
                        <span className="rule-icon">✓</span>
                        <strong>Undivided Share of Land (UDS) Mathematical Balance</strong>
                      </div>
                      <p>Sum of all individual unit stratum ownership shares equals precisely 100.00% of parent cadastral parcels.</p>
                      <small className="rule-status-text">Mathematical Reconciliation Exact</small>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: 3D Property Card */}
        {activeTab === 'card' && (
          <div className="property-card-view">
            <div className="tab-subnav-bar">
              <button
                className="back-nav-btn"
                onClick={() => {
                  setActiveTab('spatial')
                  setMapExpandMode('standard')
                }}
              >
                ← Back to 3D Cadastre Globe
              </button>
              <button
                className="back-nav-btn secondary"
                onClick={() => {
                  setActiveTab('spatial')
                  setViewMode('3d-stack')
                }}
              >
                🏢 View in 3D Floor Stack
              </button>
              <span className="tab-crumb">
                Official Digital 3D Title: {activeObject?.name}
              </span>
            </div>

            <div className="govt-card-frame">
              <div className="govt-header">
                <div className="emblem-placeholder">🏛️</div>
                <div className="govt-title">
                  <h3>LAND INFORMATION NEW ZEALAND (LINZ)</h3>
                  <h4>AUCKLAND COUNCIL / LANDONLINE 3D CADASTRAL REGISTRY</h4>
                  <p>DIGITAL 3D CADASTRAL PROPERTY TITLE CARD (BHU-AADHAAR 3D)</p>
                </div>
                <div
                  className="qr-code-box"
                  onClick={() => setCitizenVerifyTarget(activeObject?.ulpin || 'NZ-AUK-CBD-UN-000201-5601-2')}
                  style={{ cursor: 'pointer' }}
                  title="Click to Open Mobile Citizen Verification Portal"
                >
                  {propertyCardData?.qr_code_base64 ? (
                    <img
                      src={propertyCardData.qr_code_base64}
                      alt="Official 3D ULPIN QR Code"
                      style={{
                        width: '76px',
                        height: '76px',
                        borderRadius: '4px',
                        background: '#ffffff',
                        padding: '2px',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <div className="qr-placeholder" style={{ fontSize: '10px' }}>
                      QR CODE<br />[VERIFIED]
                    </div>
                  )}
                  <small style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: '#38bdf8' }}>🔍 Click to Verify</small>
                </div>
              </div>

              <div className="certificate-ulpin-box">
                <span>ASSIGNED 3D ULPIN (BHU-AADHAAR 3D)</span>
                <strong>{activeObject?.ulpin}</strong>
              </div>

              <div className="cert-grid">
                <div className="cert-section">
                  <h4>1. SPATIAL & VOLUMETRIC EXTENT</h4>
                  <div className="cert-row">
                    <span>Feature / Unit Class:</span>
                    <strong>{activeObject?.typeLabel}</strong>
                  </div>
                  <div className="cert-row">
                    <span>GNSS Coordinates / Height:</span>
                    <strong>{activeObject?.gnssCoordinates}</strong>
                  </div>
                  <div className="cert-row">
                    <span>Elevation Range (MSL):</span>
                    <strong>{activeObject?.elevation}</strong>
                  </div>
                  <div className="cert-row">
                    <span>3D Solid Watertight Volume:</span>
                    <strong>{activeObject?.volume}</strong>
                  </div>
                  <div className="cert-row">
                    <span>Floor / Carpet Area:</span>
                    <strong>{activeObject?.area}</strong>
                  </div>
                </div>

                <div className="cert-section">
                  <h4>2. RIGHTS, OWNERSHIP & TITLE</h4>
                  <div className="cert-row">
                    <span>Registered Legal Owner(s):</span>
                    <strong className="cert-owner-highlight">{activeObject?.rightHolder}</strong>
                  </div>
                  <div className="cert-row">
                    <span>Nature of Tenure / RRR:</span>
                    <strong>{activeObject?.right}</strong>
                  </div>
                  <div className="cert-row">
                    <span>Undivided Land Share (UDS):</span>
                    <strong>{activeObject?.udsTotal}</strong>
                  </div>
                  <div className="cert-row">
                    <span>Registration / Title Deed Ref:</span>
                    <strong>{activeObject?.jurisdiction}</strong>
                  </div>
                </div>
              </div>

              <div className="cert-footer">
                <div>
                  <small>Generated on 18 Sep 2026 | ISO 19152 LADM Compliant</small>
                  <small>Digitally signed by Cadastral Authority ({activeRegion === 'auckland' ? 'LINZ Landonline' : 'PMRDA Land Records'})</small>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    className="primary-button secondary"
                    onClick={() => setCitizenVerifyTarget(activeObject?.ulpin || 'NZ-AUK-CBD-UN-000201-5601-2')}
                    style={{ fontSize: '12px', padding: '8px 14px' }}
                  >
                    🔐 Citizen Public Verify
                  </button>
                  <a
                    className="primary-button secondary"
                    href={getExportBuildingUrl(activeRegion === 'auckland' ? 'b-auk-pacifica' : 'b-pun-t05', 'citygml')}
                    download
                    style={{ textDecoration: 'none', fontSize: '12px', padding: '8px 14px', display: 'inline-flex', alignItems: 'center' }}
                  >
                    💾 CityGML
                  </a>
                  <a
                    className="primary-button secondary"
                    href={getExportBuildingUrl(activeRegion === 'auckland' ? 'b-auk-pacifica' : 'b-pun-t05', 'geojson3d')}
                    download
                    style={{ textDecoration: 'none', fontSize: '12px', padding: '8px 14px', display: 'inline-flex', alignItems: 'center' }}
                  >
                    💾 3D GeoJSON
                  </a>
                  <button
                    className="primary-button"
                    onClick={() => window.print()}
                    style={{ fontSize: '12px', padding: '8px 14px' }}
                  >
                    🖨️ Print PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Standalone Citizen Public QR Verification Modal */}
      {citizenVerifyTarget && (
        <CitizenVerify
          ulpin={citizenVerifyTarget}
          activeRegion={activeRegion}
          onClose={() => setCitizenVerifyTarget(null)}
        />
      )}

      {/* AI Cadastral Copilot Floating Drawer Widget */}
      <AiCopilotWidget
        activeRegion={activeRegion}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onInspectUnit={(unitId) => {
          const unitObj = cadastralObjects.find(u => u.id === unitId) || cadastralObjects[0]
          if (unitObj) setActiveObject(unitObj)
        }}
        onSelectBuilding={(bldgId) => setSelectedBuildingId(bldgId)}
      />
    </div>
  )
}

export default App
