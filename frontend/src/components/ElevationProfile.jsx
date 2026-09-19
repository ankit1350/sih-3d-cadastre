import React, { useState } from 'react'

export function ElevationProfile({ activeRegion = 'auckland', onClose }) {
  const [sliceDepth, setSliceDepth] = useState(-30)
  const [selectedLayer, setSelectedLayer] = useState(null)

  const layers = [
    {
          id: 'air-rights',
          name: 'Air-Rights Ceiling (Auckland District Plan)',
          type: 'air',
          topMsl: 190.0,
          baseMsl: 182.4,
          color: 'rgba(236, 72, 153, 0.25)',
          borderColor: '#ec4899',
          detail: 'Protected Viewshaft to Rangitoto Island. Max height envelope: 190.0m MSL.',
        },
        {
          id: 'tower-superstructure',
          name: 'The Pacifica Tower (57 Storeys Superstructure)',
          type: 'building',
          topMsl: 182.4,
          baseMsl: 7.2,
          color: 'rgba(56, 189, 248, 0.25)',
          borderColor: '#38bdf8',
          detail: '273 Stratum Units. Reinforced concrete core & curtain glass wall.',
        },
        {
          id: 'ground-surface',
          name: 'Commerce St Ground Surface & Parcel 102',
          type: 'ground',
          topMsl: 7.2,
          baseMsl: 0.0,
          color: 'rgba(217, 119, 6, 0.35)',
          borderColor: '#d97706',
          detail: 'Surface cadastral parcel boundary DP 549102. Auckland 1946 Datum.',
        },
        {
          id: 'stormwater-main',
          name: 'Quay Street Stormwater Trunk Main',
          type: 'utility',
          topMsl: 2.7,
          baseMsl: 0.5,
          color: 'rgba(2, 132, 199, 0.5)',
          borderColor: '#0284c7',
          detail: 'Ø 2.2m Sub-surface Box Culvert. Clearance to piles: 4.8m.',
        },
        {
          id: 'basement-parking',
          name: 'Basement Parking Podiums (B1 to B3)',
          type: 'basement',
          topMsl: 0.0,
          baseMsl: -10.5,
          color: 'rgba(100, 116, 139, 0.4)',
          borderColor: '#94a3b8',
          detail: '3 Subterranean parking levels. Watertight diaphragm slurry wall.',
        },
        {
          id: 'foundation-piles',
          name: 'Drilled Bored Foundation Piles',
          type: 'foundation',
          topMsl: -10.5,
          baseMsl: -16.0,
          color: 'rgba(148, 163, 184, 0.3)',
          borderColor: '#64748b',
          detail: 'Socketed into Waitematā Sandstone bedrock.',
        },
        {
          id: 'crl-tunnel',
          name: 'City Rail Link (CRL) Sub-surface Twin Tunnel',
          type: 'transit',
          topMsl: -14.0,
          baseMsl: -21.2,
          color: 'rgba(239, 68, 68, 0.6)',
          borderColor: '#ef4444',
          detail: 'Twin bored Ø 7.2m TBM tubes. Depth: -24.0m below ground. Clearance to Pacifica piles: >12.4m (PASSED).',
        },
      ]

  return (
    <div className="elevation-profile-modal-backdrop" onClick={onClose}>
      <div className="elevation-profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-header">
          <div>
            <span className="profile-badge">3D VOLUMETRIC VERTICAL SLICER</span>
            <h3>Sub-Surface Infrastructure & Air-Rights Elevation Cross-Section</h3>
            <small style={{ color: '#94a3b8' }}>
              📍 Auckland CBD Waterfront (The Pacifica & CRL Tunnel)
            </small>
          </div>
          {onClose && (
            <button className="profile-close-btn" onClick={onClose} title="Close">
              ✕
            </button>
          )}
        </div>

        <div className="profile-body">
          {/* Visual Cross-Section Diagram */}
          <div className="profile-diagram-container">
            <div className="profile-ruler">
              <span>{isAuckland ? '+190m' : '+650m'}</span>
              <span>{isAuckland ? '+100m' : '+600m'}</span>
              <span>{isAuckland ? '0m (Ground)' : '+560m (Ground)'}</span>
              <span>{isAuckland ? '-15m' : '+550m'}</span>
              <span>{isAuckland ? '-30m (Deep)' : '+540m'}</span>
            </div>

            <div className="profile-layers-stack">
              {layers.map((layer) => {
                const isSelected = selectedLayer?.id === layer.id
                return (
                  <div
                    key={layer.id}
                    className={`profile-layer-bar ${isSelected ? 'selected' : ''} ${layer.type}`}
                    style={{
                      backgroundColor: layer.color,
                      borderColor: layer.borderColor,
                    }}
                    onClick={() => setSelectedLayer(layer)}
                  >
                    <div className="layer-bar-header">
                      <strong>{layer.name}</strong>
                      <span className="layer-elev-tag">
                        {layer.baseMsl}m to {layer.topMsl}m MSL
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Slicing Controls & Clearance Details */}
          <div className="profile-info-sidebar">
            <div className="sidebar-section">
              <div className="section-label">DEPTH SLICE CUTTER</div>
              <div className="depth-slider-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>Interactive Slicing Depth:</span>
                  <strong className="text-cyan">{sliceDepth}m MSL</strong>
                </div>
                <input
                  type="range"
                  min="-35"
                  max="200"
                  value={sliceDepth}
                  onChange={(e) => setSliceDepth(Number(e.target.value))}
                  className="profile-slider"
                />
              </div>
            </div>

            <div className="sidebar-section">
              <div className="section-label">SELECTED SPATIAL LAYER DETAILS</div>
              {selectedLayer ? (
                <div className="selected-layer-card">
                  <h4>{selectedLayer.name}</h4>
                  <p className="layer-detail-text">{selectedLayer.detail}</p>
                  <div className="layer-metrics">
                    <div>
                      <span className="metric-label">Elevation Base:</span>
                      <strong>{selectedLayer.baseMsl}m MSL</strong>
                    </div>
                    <div>
                      <span className="metric-label">Elevation Top:</span>
                      <strong>{selectedLayer.topMsl}m MSL</strong>
                    </div>
                    <div>
                      <span className="metric-label">Vertical Thickness:</span>
                      <strong>{Math.round(selectedLayer.topMsl - selectedLayer.baseMsl)}m</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="select-prompt">
                  Click on any elevation layer in the diagram to inspect depth, underground clearances, and air-rights constraints.
                </div>
              )}
            </div>

            <div className="sidebar-section">
              <div className="section-label">3D SPATIAL CLEARANCE AUDIT</div>
              <div className="clearance-audit-list">
                <div className="audit-item pass">
                  <span className="audit-icon">✓</span>
                  <div>
                    <strong>{isAuckland ? 'CRL Tunnel vs Pile Clearance' : 'Air-Rights Permitted Ceiling'}</strong>
                    <p>{isAuckland ? '>12.4m clearance (Safety threshold: 5.0m)' : '638.0m ≤ 650.0m Permitted Envelope'}</p>
                  </div>
                </div>
                <div className={`audit-item ${isAuckland ? 'pass' : 'warn'}`}>
                  <span className="audit-icon">{isAuckland ? '✓' : '⚠️'}</span>
                  <div>
                    <strong>{isAuckland ? 'Stormwater vs Diaphragm Wall' : 'Gas Line vs T5 Podium 1'}</strong>
                    <p>{isAuckland ? '4.8m clearance (Clear)' : '1.8m clearance (2.0m buffer required)'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
