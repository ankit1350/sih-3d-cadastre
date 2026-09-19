import React, { useState, useEffect, useRef } from 'react'
import { queryAiCopilot, fetchSuggestedPrompts } from '../services/api'

export function AiCopilotWidget({ activeRegion = 'auckland', onNavigateTab, onInspectUnit, onSelectBuilding }) {
  const [isOpen, setIsOpen] = useState(false)
  const [promptInput, setPromptInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestedPrompts, setSuggestedPrompts] = useState([])
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: '👋 **Hello! I am your AI 3D Cadastre Assistant.**\n\nAsk me anything about 3D ULPIN titles, LiDAR floor slicing, 3D topology compliance, or drone footprint extraction in **Auckland CBD**.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])

  const chatEndRef = useRef(null)

  useEffect(() => {
    fetchSuggestedPrompts().then((prompts) => {
      if (prompts) setSuggestedPrompts(prompts)
    })
  }, [])

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  const handleSendQuery = async (queryText) => {
    const text = queryText || promptInput
    if (!text || !text.trim()) return

    const userTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userMsg = { sender: 'user', text, time: userTime }

    setMessages((prev) => [...prev, userMsg])
    if (!queryText) setPromptInput('')
    setLoading(true)

    const res = await queryAiCopilot(text, activeRegion)
    const aiTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    if (res) {
      const aiMsg = {
        sender: 'ai',
        text: res.text_response,
        time: aiTime,
        actionRecommended: res.action_recommended,
        actionPayload: res.action_payload,
        confidence: res.confidence,
      }
      setMessages((prev) => [...prev, aiMsg])
    } else {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: '⚠️ Unable to connect to backend AI Copilot service. Please verify server status on `http://localhost:8000`.',
          time: aiTime,
        },
      ])
    }
    setLoading(false)
  }

  const handleExecuteAction = (action, payload) => {
    if (action === 'VIEW_PROPERTY_CARD') {
      if (onInspectUnit) onInspectUnit('u-auk-pac-5601')
      if (onNavigateTab) onNavigateTab('card')
    } else if (action === 'OPEN_TOPOLOGY_TAB') {
      if (onNavigateTab) onNavigateTab('topology')
    } else if (action === 'RUN_LIDAR_SLICER' || action === 'RUN_DRONE_CV') {
      if (onNavigateTab) onNavigateTab('ai-pipeline')
    } else if (action === 'SELECT_BUILDING') {
      if (onSelectBuilding) onSelectBuilding(payload?.building_id || 'b-auk-pacifica')
      if (onNavigateTab) onNavigateTab('spatial')
    }
    setIsOpen(false)
  }

  return (
    <div className="copilot-widget-container">
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          className="copilot-floating-btn"
          onClick={() => setIsOpen(true)}
          title="Open AI 3D Cadastre Assistant"
        >
          <span className="copilot-sparkle">🤖</span>
          <span className="copilot-btn-text">AI Cadastre Assistant</span>
          <span className="copilot-badge-pulse" />
        </button>
      )}

      {/* Floating Chat Drawer */}
      {isOpen && (
        <div className="copilot-drawer">
          <div className="copilot-drawer-header">
            <div className="copilot-brand">
              <span className="copilot-avatar">🤖</span>
              <div>
                <strong>AI Cadastre Copilot</strong>
                <span>ISO 19152 LADM 3D Reasoning Engine</span>
              </div>
            </div>
            <button className="copilot-close-btn" onClick={() => setIsOpen(false)} title="Close Assistant">
              ✕
            </button>
          </div>

          {/* Quick Prompts Bar */}
          <div className="copilot-suggested-bar">
            <span className="suggested-label">SUGGESTED PROMPTS:</span>
            <div className="suggested-chips">
              {suggestedPrompts.slice(0, 4).map((p, idx) => (
                <button
                  key={idx}
                  className="suggested-chip"
                  onClick={() => handleSendQuery(p.prompt)}
                  disabled={loading}
                >
                  <span>{p.icon}</span> {p.prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Messages Stream */}
          <div className="copilot-messages-list">
            {messages.map((msg, i) => (
              <div key={i} className={`copilot-msg-bubble ${msg.sender}`}>
                <div className="msg-header">
                  <span className="msg-sender-name">{msg.sender === 'ai' ? '🤖 CadastreAI' : '👤 You'}</span>
                  <span className="msg-time">{msg.time}</span>
                </div>
                <div className="msg-content">
                  {msg.text.split('\n').map((line, idx) => (
                    <p key={idx}>{line}</p>
                  ))}
                </div>

                {/* Recommended Interactive Action Button */}
                {msg.actionRecommended && (
                  <div className="msg-action-box">
                    <button
                      className="copilot-action-btn"
                      onClick={() => handleExecuteAction(msg.actionRecommended, msg.actionPayload)}
                    >
                      {msg.actionRecommended === 'VIEW_PROPERTY_CARD' && '📜 View 3D Property Card & QR →'}
                      {msg.actionRecommended === 'OPEN_TOPOLOGY_TAB' && '📐 Open 3D Topology Audit →'}
                      {msg.actionRecommended === 'RUN_LIDAR_SLICER' && '⚡ Open AI Slicer Studio →'}
                      {msg.actionRecommended === 'RUN_DRONE_CV' && '🚁 Open Drone Vision Studio →'}
                      {msg.actionRecommended === 'SELECT_BUILDING' && '🏢 Inspect Pacifica Tower →'}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="copilot-msg-bubble ai loading">
                <span className="typing-dots">
                  <span>.</span><span>.</span><span>.</span> AI Spatial Engine Reasoning
                </span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Query Input Bar */}
          <form
            className="copilot-input-form"
            onSubmit={(e) => {
              e.preventDefault()
              handleSendQuery()
            }}
          >
            <input
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="Ask AI about penthouses, 3D ULPINs, LiDAR..."
              disabled={loading}
            />
            <button type="submit" disabled={loading || !promptInput.trim()} className="copilot-send-btn">
              {loading ? '⏳' : '➔'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

