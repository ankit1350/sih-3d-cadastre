import { useMemo, useState } from 'react'
import './App.css'
import { Cesium3DViewer } from './components/Cesium3DViewer'
import {
  aiPipelineStages,
  cadastralObjects,
  dashboardStats,
  pilotAreaInfo,
  sampleTowerFloors,
  validationResults,
} from './data/mockCadastral'

const layers = [
  { id: 'parcels', label: 'Surface Parcels', color: '#79a7ff', count: 3 },
  { id: 'buildings', label: '3D Buildings', color: '#ffb454', count: 3 },
  { id: 'floors', label: 'Vertical Floors', color: '#66d3b0', count: 2 },
  { id: 'units', label: '3D Units (Apartments)', color: '#ff7eb6', count: 2 },
  { id: 'utilities', label: 'Sub-surface Utilities', color: '#c591ff', count: 2 },
]

function App() {
  const [activeTab, setActiveTab] = useState('spatial') // 'spatial' | 'ai-pipeline' | 'generator' | 'topology' | 'card'
  const [activeObject, setActiveObject] = useState(cadastralObjects[0])
  const [query, setQuery] = useState('')
  const [activeLayer, setActiveLayer] = useState('all')
  const [showLayers, setShowLayers] = useState(true)
  const [viewMode, setViewMode] = useState('cesium') // 'cesium' | '2d' | '3d-stack'
  const [copied, setCopied] = useState(false)
  const [selectedFloor, setSelectedFloor] = useState('F14')

  // State for interactive 3D ULPIN Generator
  const [genState, setGenState] = useState({
    stateCode: 'MH',
    distCode: 'PUN',
    talukaCode: 'HINJ',
    layerType: 'UN',
    buildingSeq: '000501',
    floorSeq: '14',
    unitSeq: '02',
    ownerName: '',
  })

  const generatedUlpin = useMemo(() => {
    const raw = `IN-${genState.stateCode}-${genState.distCode}-${genState.talukaCode}-${genState.layerType}-${genState.buildingSeq}-${genState.floorSeq}${genState.unitSeq}`
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
  }, [activeLayer, query])

  const handleCopyUlpin = (ulpinText) => {
    navigator.clipboard?.writeText(ulpinText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleFloorClick = (floor) => {
    setSelectedFloor(floor.level)
    const matchingFloorObj = cadastralObjects.find(
      (obj) => obj.type === 'floors' && obj.name.includes(floor.level.replace('F', 'Floor '))
    )
    if (matchingFloorObj) {
      setActiveObject(matchingFloorObj)
    }
  }

  const handleSelectCesiumEntity = (entityId) => {
    const matched = cadastralObjects.find((o) => o.id === entityId)
    if (matched) {
      setActiveObject(matched)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">3D</div>
          <div>
            <strong>3D ULPIN Cadastre</strong>
            <span>Pune Pilot (Hinjewadi)</span>
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
              <div className="crs-badge">EPSG:32643 (UTM 43N)</div>
            </div>
          </div>
        </div>

        <div className="sidebar-stats">
          <div className="mini-stat-row">
            <span>Datum:</span>
            <strong>MSL / WGS84</strong>
          </div>
          <div className="mini-stat-row">
            <span>GNSS CORS:</span>
            <strong>{pilotAreaInfo.gnssRefStation}</strong>
          </div>
          <div className="mini-stat-row">
            <span>Area Mapped:</span>
            <strong>{pilotAreaInfo.totalAreaHa}</strong>
          </div>
          <div className="mini-stat-row">
            <span>3D Units:</span>
            <strong>{pilotAreaInfo.activeUnits} Flats</strong>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="user-avatar">PM</div>
          <div>
            <strong>PMRDA GIS Cell</strong>
            <small>Hinjewadi 3D Cadastre</small>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              Maharashtra 3D Land Cadastre / Pune District / Mulshi / Hinjewadi / {pilotAreaInfo.name}
            </div>
            <h1>
              {activeTab === 'spatial' && '3D Cadastral & Vertical Property Workspace'}
              {activeTab === 'ai-pipeline' && 'AI/ML Automated 3D Feature Extraction Studio'}
              {activeTab === 'generator' && 'Standardized 3D ULPIN (Bhu-Aadhaar 3D) Generator'}
              {activeTab === 'topology' && '3D Topology Validation & ISO 19152 RRR Ledger'}
              {activeTab === 'card' && 'Digital 3D Property Card (Volumetric 7/12 Extract)'}
            </h1>
          </div>
          <div className="topbar-actions">
            {activeTab === 'spatial' && (
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
                  🏢 Vertical Floor Stack
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
            <section className="stats-grid" aria-label="Workspace summary">
              {dashboardStats.map((stat) => (
                <article className="stat-card" key={stat.label}>
                  <div className="stat-heading">
                    <span>{stat.label}</span>
                    <span className="stat-icon">●</span>
                  </div>
                  <strong>{stat.value}</strong>
                  <small className={stat.tone}>{stat.detail}</small>
                </article>
              ))}
            </section>

            <section className="workspace-grid">
              <div className="map-card card">
                <div className="card-toolbar">
                  <div>
                    <h2>
                      {viewMode === 'cesium' && 'CesiumJS WebGL 3D Cadastral Globe & Volumetric Scene'}
                      {viewMode === '2d' && '2D Spatial & Parcel Boundary Map'}
                      {viewMode === '3d-stack' && '3D Volumetric Tower & Vertical Floor Stack'}
                    </h2>
                    <p>
                      {viewMode === 'cesium' && 'Real-world 3D extruded solids, MSL elevation heights & sub-surface utility pipes'}
                      {viewMode === '2d' && 'Hinjewadi Phase 1 - Blue Ridge Township & SEZ Corridor'}
                      {viewMode === '3d-stack' && 'Interactive 3D elevation profile with floor-by-floor ULPIN indexing'}
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
                      Floor Stack
                    </button>
                  </div>
                </div>

                <div className="map-toolbar">
                  <div className="search-box">
                    <span className="search-icon">🔍</span>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search by ULPIN (e.g. IN-MH-PUN...), Owner, Tower, Flat #, or Land Use..."
                    />
                    {query && (
                      <button className="clear-btn" onClick={() => setQuery('')}>
                        ×
                      </button>
                    )}
                  </div>
                  <button
                    className="map-tool"
                    onClick={() => setShowLayers((value) => !value)}
                  >
                    Layers {showLayers ? '▲' : '▼'}
                  </button>
                  <button
                    className="map-tool"
                    onClick={() => {
                      setQuery('')
                      setActiveLayer('all')
                    }}
                  >
                    Reset Filter
                  </button>
                </div>

                {viewMode === 'cesium' && (
                  <Cesium3DViewer
                    onSelectObject={handleSelectCesiumEntity}
                    activeObjectId={activeObject?.id}
                    activeLayer={activeLayer}
                  />
                )}

                {viewMode === '2d' && (
                  <div className="map-area">
                    <div className="map-grid" />
                    <div className="map-river">
                      <span>Mula River Natural Boundary (Riparian Zone)</span>
                    </div>
                    <div className="map-road road-spine">
                      <span>Blue Ridge Main Spine Road (24m D.P. Road)</span>
                    </div>
                    <div className="map-road road-hinj">
                      <span>Hinjewadi-Wakad Link Road</span>
                    </div>

                    {filteredObjects
                      .filter((object) => object.mapPosition)
                      .map((object) => (
                        <button
                          className={`map-object ${object.type} ${
                            activeObject.id === object.id ? 'selected-object' : ''
                          }`}
                          key={object.id}
                          style={{
                            left: `${object.mapPosition.left}%`,
                            top: `${object.mapPosition.top}%`,
                            width: `${object.mapPosition.width}%`,
                            height: `${object.mapPosition.height}%`,
                          }}
                          onClick={() => setActiveObject(object)}
                          aria-label={`Select ${object.name}`}
                        >
                          <span className="object-tag-label">{object.shortLabel}</span>
                          <small className="object-tooltip-label">{object.name}</small>
                        </button>
                      ))}

                    <div className="map-scale">100 m | EPSG:32643</div>
                    <div className="map-compass">N ↑</div>

                    {showLayers && (
                      <div className="layer-legend">
                        <strong>Cadastral Layers</strong>
                        {layers.map((layer) => (
                          <button
                            key={layer.id}
                            onClick={() =>
                              setActiveLayer(activeLayer === layer.id ? 'all' : layer.id)
                            }
                            className={activeLayer === layer.id ? 'layer-active' : ''}
                          >
                            <i style={{ background: layer.color }} />
                            <span>{layer.label}</span>
                            <span className="layer-count">({layer.count})</span>
                          </button>
                        ))}
                        {activeLayer !== 'all' && (
                          <button
                            className="show-all-layers-btn"
                            onClick={() => setActiveLayer('all')}
                          >
                            Reset to All Layers
                          </button>
                        )}
                      </div>
                    )}
                    <div className="map-empty">
                      Showing {filteredObjects.length} of {cadastralObjects.length} spatial entities
                    </div>
                  </div>
                )}

                {viewMode === '3d-stack' && (
                  <div className="three-d-explorer">
                    <div className="tower-header">
                      <div>
                        <span className="tower-badge">3D Volumetric Model</span>
                        <h3>Blue Ridge Tower 5 (T5) — Vertical Cadastre</h3>
                        <p>Base: 561.2 m MSL | Roof: 638.0 m MSL | 26 Storeys | 192 Title Units</p>
                      </div>
                      <button
                        className="view-2d-link"
                        onClick={() => {
                          const t5 = cadastralObjects.find((o) => o.id === 'b-hinj-0501')
                          if (t5) setActiveObject(t5)
                        }}
                      >
                        Select Tower Entity
                      </button>
                    </div>

                    <div className="tower-stack-container">
                      <div className="elevation-axis">
                        <span>638m (Roof)</span>
                        <span>610m (Refuge)</span>
                        <span>586m (Refuge)</span>
                        <span>561m (Podium)</span>
                        <span>557m (Basement)</span>
                      </div>

                      <div className="floors-stack">
                        {sampleTowerFloors.map((fl) => (
                          <div
                            key={fl.level}
                            className={`floor-slice ${fl.type} ${
                              selectedFloor === fl.level ? 'active-floor-slice' : ''
                            }`}
                            onClick={() => handleFloorClick(fl)}
                          >
                            <div className="floor-level-tag">{fl.level}</div>
                            <div className="floor-info">
                              <strong>{fl.name}</strong>
                              <small>Elevation: {fl.elevation} MSL</small>
                            </div>
                            <div className="floor-units-badge">
                              {fl.units > 0 ? `${fl.units} 3D Units` : 'Common / Parking'}
                            </div>
                            <button
                              className="inspect-floor-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleFloorClick(fl)
                              }}
                            >
                              Inspect 3D ULPIN →
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="volumetric-guide">
                      <div className="guide-item">
                        <span className="color-box penthouse" /> Penthouse Sky Suite (MSL +634m)
                      </div>
                      <div className="guide-item">
                        <span className="color-box standard" /> Residential Floor (3m Slabs)
                      </div>
                      <div className="guide-item">
                        <span className="color-box refuge" /> Mandatory Fire Refuge Floor
                      </div>
                      <div className="guide-item">
                        <span className="color-box basement" /> Underground Foundation & Parking
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <aside className="detail-card card">
                <div className="detail-header">
                  <div>
                    <span className={`object-type ${activeObject.type}`}>
                      {activeObject.typeLabel}
                    </span>
                    <h2>{activeObject.name}</h2>
                  </div>
                  <span className={`status-pill ${activeObject.statusTone}`}>
                    {activeObject.status}
                  </span>
                </div>

                <div className="ulpin-block">
                  <div className="ulpin-header">
                    <span>ASSIGNED 3D ULPIN (Bhu-Aadhaar 3D)</span>
                    <button
                      className="copy-btn"
                      onClick={() => handleCopyUlpin(activeObject.ulpin)}
                      aria-label="Copy ULPIN"
                    >
                      {copied ? '✓ Copied!' : '📋 Copy'}
                    </button>
                  </div>
                  <strong className="ulpin-code">{activeObject.ulpin}</strong>

                  {activeObject.ulpinBreakdown && (
                    <div className="ulpin-breakdown-grid">
                      <div>
                        <small>Country</small>
                        <span>{activeObject.ulpinBreakdown.country || 'IN'}</span>
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
                        <small>Sub-Dist</small>
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

                <div className="detail-status">
                  <span className="status-dot" />
                  <span>GNSS RTK Coordinate: </span>
                  <strong className="confidence">{activeObject.gnssCoordinates}</strong>
                </div>

                {activeObject.tags && (
                  <div className="tags-row">
                    {activeObject.tags.map((tag) => (
                      <span className="tag-pill" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <dl className="property-list">
                  <div>
                    <dt>Address / Location</dt>
                    <dd>{activeObject.address}</dd>
                  </div>
                  <div>
                    <dt>Dimension / Extent</dt>
                    <dd>{activeObject.area}</dd>
                  </div>
                  <div>
                    <dt>3D Elevation Bound</dt>
                    <dd className="elevation-val">{activeObject.elevation}</dd>
                  </div>
                  <div>
                    <dt>Solid 3D Volume</dt>
                    <dd className="elevation-val">{activeObject.volume}</dd>
                  </div>
                  <div>
                    <dt>Undivided Land Share</dt>
                    <dd className="highlight-uds">{activeObject.udsTotal}</dd>
                  </div>
                  <div>
                    <dt>ISO 19152 Class</dt>
                    <dd className="ladm-tag">{activeObject.ladmClass}</dd>
                  </div>
                </dl>

                <div className="detail-divider" />

                <div className="mini-title">Rights, Ownership & Legal Title</div>
                <div className="rights-row">
                  <div className="rights-icon">📜</div>
                  <div>
                    <strong>{activeObject.right}</strong>
                    <small>{activeObject.rightHolder}</small>
                  </div>
                  <span className="verified-badge">Legally Verified</span>
                </div>

                <div className="detail-action-buttons">
                  <button
                    className="full-button"
                    onClick={() => setActiveTab('card')}
                  >
                    View Official 3D Property Card Certificate →
                  </button>
                </div>
              </aside>
            </section>

            <section className="bottom-grid">
              <div className="card objects-card">
                <div className="card-toolbar">
                  <div>
                    <h2>Cadastral Feature Registry (Hinjewadi Pilot)</h2>
                    <p>Surface parcels, vertical high-rise apartments, and sub-surface networks</p>
                  </div>
                  <div className="filter-count">{filteredObjects.length} features indexed</div>
                </div>
                <div className="object-table">
                  {filteredObjects.map((object) => (
                    <button
                      className={`object-row ${
                        activeObject.id === object.id ? 'row-selected' : ''
                      }`}
                      key={object.id}
                      onClick={() => {
                        setActiveObject(object)
                        if (object.type === 'floors' || object.type === 'units') {
                          setSelectedFloor(
                            object.name.includes('Floor 24') || object.name.includes('Penthouse')
                              ? 'F24'
                              : 'F14'
                          )
                        }
                      }}
                    >
                      <span className={`row-symbol ${object.type}`}>{object.shortLabel}</span>
                      <span className="row-main">
                        <strong>{object.name}</strong>
                        <small>{object.ulpin}</small>
                      </span>
                      <span className="row-meta">{object.area}</span>
                      <span className="row-elevation">{object.elevation.split(' ')[0]} MSL</span>
                      <span className={`row-status ${object.statusTone}`}>
                        {object.status}
                      </span>
                      <span className="row-arrow">→</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="card validation-card">
                <div className="card-toolbar">
                  <div>
                    <h2>3D Topology & Rules Health</h2>
                    <p>PostGIS 3D & ISO 19152 LADM validation</p>
                  </div>
                  <span className="health-score">99.1%</span>
                </div>
                <div className="health-bar">
                  <span style={{ width: '99.1%' }} />
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
            <div className="studio-header card">
              <h2>Automated 3D Cadastral Feature Extraction Pipeline</h2>
              <p>
                Deep learning & geometric point cloud processing workflows converting raw drone
                imagery, LiDAR LAS, and CAD floor plans into watertight 3D property volumes.
              </p>
            </div>

            <div className="pipeline-steps-grid">
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

            <div className="ai-demo-box card">
              <div className="card-toolbar">
                <div>
                  <h2>LiDAR Elevation Histogram & Floor Height Slicer</h2>
                  <p>Kernel Density Estimation (KDE) on vertical point cloud density (Tower 5)</p>
                </div>
                <span className="badge-ai">AI Automated</span>
              </div>
              <div className="kde-visualizer">
                <div className="kde-bars">
                  <div className="kde-bar" style={{ height: '95%' }}><span>F24 (634m)</span></div>
                  <div className="kde-bar" style={{ height: '70%' }}><span>F20 (622m)</span></div>
                  <div className="kde-bar refuge-bar" style={{ height: '85%' }}><span>F16 Refuge (610m)</span></div>
                  <div className="kde-bar" style={{ height: '65%' }}><span>F14 (604m)</span></div>
                  <div className="kde-bar refuge-bar" style={{ height: '88%' }}><span>F08 Refuge (586m)</span></div>
                  <div className="kde-bar" style={{ height: '60%' }}><span>F04 (574m)</span></div>
                  <div className="kde-bar" style={{ height: '55%' }}><span>F01 (565m)</span></div>
                  <div className="kde-bar podium-bar" style={{ height: '98%' }}><span>Podium (561m)</span></div>
                  <div className="kde-bar basement-bar" style={{ height: '40%' }}><span>Basement (557m)</span></div>
                </div>
                <div className="kde-caption">
                  Z-Elevation Axis (Meters Above Mean Sea Level MSL) — Inter-floor spacing accurately classified at 3.00m ± 0.02m.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: 3D ULPIN Generator */}
        {activeTab === 'generator' && (
          <div className="generator-studio">
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
                  <label>State Code</label>
                  <input
                    value={genState.stateCode}
                    onChange={(e) => setGenState({ ...genState, stateCode: e.target.value.toUpperCase() })}
                  />
                  <small>MH = Maharashtra</small>
                </div>
                <div className="input-group">
                  <label>District Code</label>
                  <input
                    value={genState.distCode}
                    onChange={(e) => setGenState({ ...genState, distCode: e.target.value.toUpperCase() })}
                  />
                  <small>PUN = Pune</small>
                </div>
                <div className="input-group">
                  <label>Taluka / Locality Code</label>
                  <input
                    value={genState.talukaCode}
                    onChange={(e) => setGenState({ ...genState, talukaCode: e.target.value.toUpperCase() })}
                  />
                  <small>HINJ = Hinjewadi</small>
                </div>
                <div className="input-group">
                  <label>Spatial Layer Type</label>
                  <select
                    value={genState.layerType}
                    onChange={(e) => setGenState({ ...genState, layerType: e.target.value })}
                  >
                    <option value="PL">PL (Surface Land Parcel)</option>
                    <option value="BL">BL (3D Building Envelope)</option>
                    <option value="FL">FL (Vertical Floor Plane)</option>
                    <option value="UN">UN (3D Apartment Unit)</option>
                    <option value="UT">UT (Sub-surface Utility)</option>
                    <option value="AR">AR (Air Rights / Sky Corridor)</option>
                  </select>
                  <small>Cadastral Dimension</small>
                </div>
                <div className="input-group">
                  <label>Building / Parent ID</label>
                  <input
                    value={genState.buildingSeq}
                    onChange={(e) => setGenState({ ...genState, buildingSeq: e.target.value })}
                  />
                  <small>Tower sequence</small>
                </div>
                <div className="input-group">
                  <label>Floor / Level Code</label>
                  <input
                    value={genState.floorSeq}
                    onChange={(e) => setGenState({ ...genState, floorSeq: e.target.value })}
                  />
                  <small>e.g. 14, 24, B1, 00</small>
                </div>
                <div className="input-group">
                  <label>Unit / Flat Number</label>
                  <input
                    value={genState.unitSeq}
                    onChange={(e) => setGenState({ ...genState, unitSeq: e.target.value })}
                  />
                  <small>e.g. 01, 02, PH1</small>
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
                    onClick={() => alert(`Registered 3D ULPIN ${generatedUlpin} in Local Registry.`)}
                  >
                    Register in PostGIS Ledger
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Topology & RRR */}
        {activeTab === 'topology' && (
          <div className="topology-studio">
            <div className="card">
              <div className="card-toolbar">
                <div>
                  <h2>3D Spatial Topology & Collision Matrix</h2>
                  <p>Automated verification against overlap, enclosure, and air-rights violations</p>
                </div>
                <span className="health-score">99.1% Compliance</span>
              </div>
              <div className="rules-grid">
                <div className="rule-card passed">
                  <div className="rule-header">
                    <span className="rule-icon">✓</span>
                    <strong>Volumetric Enclosure Check</strong>
                  </div>
                  <p>All 432 vertical units strictly enclosed within sanctioned building envelope `BLD-BR-T05`.</p>
                  <small className="rule-status-text">ST_3DIntersects & ST_3DWithin Verified</small>
                </div>
                <div className="rule-card passed">
                  <div className="rule-header">
                    <span className="rule-icon">✓</span>
                    <strong>Vertical Overlap & Slab Collision</strong>
                  </div>
                  <p>Zero overlapping unit polyhedrals. Floor slabs maintain 3.00m clearance without intersections.</p>
                  <small className="rule-status-text">Watertight 2-Manifold Solids</small>
                </div>
                <div className="rule-card warning-card">
                  <div className="rule-header">
                    <span className="rule-icon">!</span>
                    <strong>Sub-surface Utility vs Foundation Clearance</strong>
                  </div>
                  <p>MNGL Gas Line runs 1.8m from Tower 5 basement piling. Mandatory safety buffer is 2.0m.</p>
                  <small className="rule-status-text warning">Action Required: Flagged to PMRDA Utility Cell</small>
                </div>
                <div className="rule-card passed">
                  <div className="rule-header">
                    <span className="rule-icon">✓</span>
                    <strong>Undivided Share of Land (UDS) Balance</strong>
                  </div>
                  <p>Sum of all 192 flat title land shares equals precisely 100.00% of parcel Sur. 154/1pt.</p>
                  <small className="rule-status-text">Mathematical Co-op Reconciliation Exact</small>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: 3D Property Card */}
        {activeTab === 'card' && (
          <div className="property-card-view">
            <div className="govt-card-frame">
              <div className="govt-header">
                <div className="emblem-placeholder">🏛️</div>
                <div className="govt-title">
                  <h3>GOVERNMENT OF MAHARASHTRA</h3>
                  <h4>PUNE METROPOLITAN REGION DEVELOPMENT AUTHORITY (PMRDA)</h4>
                  <p>DIGITAL 3D CADASTRAL PROPERTY TITLE CARD (BHU-AADHAAR 3D)</p>
                </div>
                <div className="qr-code-box">
                  <div className="qr-placeholder">QR CODE<br />[VERIFIED]</div>
                  <small>Scan for 3D Mesh</small>
                </div>
              </div>

              <div className="certificate-ulpin-box">
                <span>ASSIGNED 3D ULPIN</span>
                <strong>{activeObject.ulpin}</strong>
              </div>

              <div className="cert-grid">
                <div className="cert-section">
                  <h4>1. SPATIAL & VOLUMETRIC EXTENT</h4>
                  <div className="cert-row">
                    <span>Feature Class:</span>
                    <strong>{activeObject.typeLabel}</strong>
                  </div>
                  <div className="cert-row">
                    <span>GNSS RTK Coordinates:</span>
                    <strong>{activeObject.gnssCoordinates}</strong>
                  </div>
                  <div className="cert-row">
                    <span>Elevation Range (MSL):</span>
                    <strong>{activeObject.elevation}</strong>
                  </div>
                  <div className="cert-row">
                    <span>3D Solid Volume:</span>
                    <strong>{activeObject.volume}</strong>
                  </div>
                  <div className="cert-row">
                    <span>Floor / Carpet Area:</span>
                    <strong>{activeObject.area}</strong>
                  </div>
                </div>

                <div className="cert-section">
                  <h4>2. RIGHTS, OWNERSHIP & TITLE</h4>
                  <div className="cert-row">
                    <span>Right Holder(s):</span>
                    <strong>{activeObject.rightHolder}</strong>
                  </div>
                  <div className="cert-row">
                    <span>Nature of Tenure:</span>
                    <strong>{activeObject.right}</strong>
                  </div>
                  <div className="cert-row">
                    <span>Undivided Land Share (UDS):</span>
                    <strong>{activeObject.udsTotal}</strong>
                  </div>
                  <div className="cert-row">
                    <span>Registration Ref:</span>
                    <strong>{activeObject.jurisdiction}</strong>
                  </div>
                </div>
              </div>

              <div className="cert-footer">
                <div>
                  <small>Generated on 17 Sep 2026 | ISO 19152 LADM Compliant</small>
                  <small>Digitally signed by PMRDA Land Records Authority</small>
                </div>
                <button
                  className="primary-button"
                  onClick={() => window.print()}
                >
                  🖨️ Print / Save Official PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
