import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Send, Zap, MessageSquare, Activity, ChevronRight } from 'lucide-react'

// ─── Agent definitions (mirrors lib/agents.js for the frontend) ──────────────
const AGENTS = [
  { id: 'agent-organizer',          name: 'Agent Organizer',      emoji: '🧭', color: '#6366f1', role: 'Multi-agent orchestration' },
  { id: 'task-decomposition-expert',name: 'Task Decomposer',       emoji: '🧩', color: '#8b5cf6', role: 'Goal breakdown & workflows' },
  { id: 'senior-backend',           name: 'Senior Backend',        emoji: '⚙️', color: '#10b981', role: 'Node, Go, Python, APIs, DBs' },
  { id: 'frontend-developer',       name: 'Frontend Dev',          emoji: '🎨', color: '#f59e0b', role: 'React, Vue, Angular, UI' },
  { id: 'data-engineer',            name: 'Data Engineer',         emoji: '🗄️', color: '#06b6d4', role: 'Pipelines, ETL, infrastructure' },
  { id: 'llm-architect',            name: 'LLM Architect',         emoji: '🤖', color: '#ec4899', role: 'LLM systems, RAG, fine-tuning' },
  { id: 'prompt-engineer',          name: 'Prompt Engineer',       emoji: '✍️', color: '#f97316', role: 'Prompt design & optimization' },
  { id: 'model-evaluator',          name: 'Model Evaluator',       emoji: '📊', color: '#84cc16', role: 'Benchmarking & cost analysis' },
  { id: 'security-engineer',        name: 'Security Engineer',     emoji: '🔐', color: '#ef4444', role: 'Security & vulnerability analysis' },
  { id: 'error-detective',          name: 'Error Detective',       emoji: '🔍', color: '#a855f7', role: 'Root cause & error diagnosis' },
  { id: 'search-specialist',        name: 'Search Specialist',     emoji: '🌐', color: '#14b8a6', role: 'Research & trend analysis' },
  { id: 'report-generator',         name: 'Report Generator',      emoji: '📄', color: '#64748b', role: 'Reports & synthesis' },
]

const AGENT_MAP = Object.fromEntries(AGENTS.map((a) => [a.id, a]))

// ─── Supabase realtime helper ─────────────────────────────────────────────────
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

async function fetchRecentActivity(sessionId) {
  if (!SUPABASE_URL || !SUPABASE_ANON) return []
  const params = sessionId
    ? `session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.asc&limit=100`
    : `order=created_at.desc&limit=50`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_messages?${params}`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
  })
  if (!res.ok) return []
  return res.json()
}

// ─── Generate a short session ID ─────────────────────────────────────────────
function newSessionId() {
  return `studio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser     = msg.role === 'user'
  const isHandoff  = msg.type === 'handoff'
  const isConsult  = msg.type === 'consultant_text'
  const agent      = AGENT_MAP[msg.agent] || {}
  const fromAgent  = AGENT_MAP[msg.fromAgent] || {}
  const toAgent    = AGENT_MAP[msg.toAgent] || {}

  if (isHandoff) {
    return (
      <div className="flex items-center gap-2 py-1 px-3 my-1 text-xs text-gray-400 bg-gray-800/40 rounded-lg border border-gray-700/40">
        <span style={{ color: fromAgent.color || '#6366f1' }}>{fromAgent.emoji || '🤖'} {fromAgent.name || msg.fromAgent}</span>
        <ChevronRight size={12} />
        <span style={{ color: toAgent.color || '#10b981' }}>{toAgent.emoji || '🤖'} {toAgent.name || msg.toAgent}</span>
        <span className="text-gray-500 ml-1 truncate">{msg.content}</span>
      </div>
    )
  }

  if (isConsult) {
    return (
      <div className="ml-4 my-1 border-l-2 pl-3" style={{ borderColor: agent.color || '#6366f1' }}>
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs font-medium" style={{ color: agent.color }}>{agent.emoji} {agent.name}</span>
          <span className="text-xs text-gray-500">consulting</span>
        </div>
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{msg.content}</p>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 my-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 mt-1"
          style={{ background: `${agent.color}22`, border: `1px solid ${agent.color}55` }}
        >
          {agent.emoji || '🤖'}
        </div>
      )}
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isUser && (
          <span className="text-xs mb-1 font-medium" style={{ color: agent.color }}>{agent.name}</span>
        )}
        <div
          className={`rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
            isUser
              ? 'bg-indigo-600 text-white rounded-tr-sm'
              : 'bg-gray-800 text-gray-100 rounded-tl-sm border border-gray-700/50'
          }`}
        >
          {msg.content}
          {msg.streaming && <span className="inline-block w-1.5 h-4 bg-current ml-1 animate-pulse rounded-sm" />}
        </div>
      </div>
    </div>
  )
}

// ─── Live feed item ───────────────────────────────────────────────────────────
function FeedItem({ item }) {
  const agent = AGENT_MAP[item.agent] || {}
  const isHandoff = item.role === 'handoff'
  const fromA = AGENT_MAP[item.from_agent] || {}
  const toA   = AGENT_MAP[item.to_agent] || {}

  const time = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="flex gap-2 py-2 px-3 hover:bg-gray-800/30 rounded-lg transition-colors">
      <span className="text-base flex-shrink-0 mt-0.5">
        {isHandoff ? '↔️' : agent.emoji || '🤖'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {isHandoff ? (
            <>
              <span className="text-xs font-medium" style={{ color: fromA.color || '#6366f1' }}>{fromA.name || item.from_agent}</span>
              <ChevronRight size={10} className="text-gray-500" />
              <span className="text-xs font-medium" style={{ color: toA.color || '#10b981' }}>{toA.name || item.to_agent}</span>
            </>
          ) : (
            <span className="text-xs font-medium" style={{ color: agent.color || '#94a3b8' }}>{agent.name || item.agent}</span>
          )}
          <span className="text-xs text-gray-600 ml-auto">{time}</span>
        </div>
        <p className="text-xs text-gray-400 truncate mt-0.5">{item.content?.slice(0, 100)}</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AgentStudio() {
  const [activeAgentId, setActiveAgentId] = useState('agent-organizer')
  const [sessionId]      = useState(newSessionId)
  const [chatMessages, setChatMessages]   = useState({})  // { agentId: [msgs] }
  const [input, setInput]                 = useState('')
  const [streaming, setStreaming]         = useState(false)
  const [liveFeed, setLiveFeed]           = useState([])
  const [feedLoading, setFeedLoading]     = useState(true)
  const chatBottomRef  = useRef(null)
  const feedBottomRef  = useRef(null)
  const inputRef       = useRef(null)

  const activeAgent    = AGENT_MAP[activeAgentId]
  const currentMsgs    = chatMessages[activeAgentId] || []

  // ── Load recent activity on mount ──────────────────────────────────────────
  useEffect(() => {
    fetchRecentActivity(null)
      .then((rows) => { setLiveFeed(rows.reverse()); setFeedLoading(false) })
      .catch(() => setFeedLoading(false))
  }, [])

  // ── Poll live feed every 3s ─────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      fetchRecentActivity(null).then((rows) => setLiveFeed(rows.reverse())).catch(() => {})
    }, 3000)
    return () => clearInterval(iv)
  }, [])

  // ── Scroll to bottom on new messages ───────────────────────────────────────
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, activeAgentId])

  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [liveFeed])

  // ── Add/update a message in the current agent's thread ─────────────────────
  const addMessage = useCallback((agentId, msg) => {
    setChatMessages((prev) => ({
      ...prev,
      [agentId]: [...(prev[agentId] || []), msg],
    }))
  }, [])

  const updateLastMessage = useCallback((agentId, updater) => {
    setChatMessages((prev) => {
      const msgs = prev[agentId] || []
      if (!msgs.length) return prev
      const updated = [...msgs]
      updated[updated.length - 1] = updater(updated[updated.length - 1])
      return { ...prev, [agentId]: updated }
    })
  }, [])

  // ── Send a message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setStreaming(true)

    // Add user message
    addMessage(activeAgentId, { role: 'user', content: text })

    // Build conversation history for API
    const history = (chatMessages[activeAgentId] || [])
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))

    history.push({ role: 'user', content: text })

    // Placeholder for assistant response
    const assistantMsgId = `${Date.now()}`
    addMessage(activeAgentId, {
      id: assistantMsgId,
      role: 'assistant',
      agent: activeAgentId,
      content: '',
      streaming: true,
    })

    try {
      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: activeAgentId,
          messages: history,
          sessionId,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event
          try { event = JSON.parse(line.slice(6)) } catch (_) { continue }

          if (event.type === 'text') {
            updateLastMessage(activeAgentId, (m) => ({
              ...m,
              content: m.content + event.content,
            }))
          }

          if (event.type === 'handoff') {
            // Insert a handoff indicator into the chat
            addMessage(activeAgentId, {
              type: 'handoff',
              role: 'handoff',
              fromAgent: event.from,
              toAgent: event.to,
              content: event.query,
            })
          }

          if (event.type === 'consultant_text') {
            // Show the consultant agent's streaming response
            setChatMessages((prev) => {
              const msgs = prev[activeAgentId] || []
              const last = msgs[msgs.length - 1]
              // If last message is from this consultant, append to it
              if (last && last.type === 'consultant_text' && last.agent === event.from) {
                const updated = [...msgs]
                updated[updated.length - 1] = { ...last, content: last.content + event.content }
                return { ...prev, [activeAgentId]: updated }
              }
              // Otherwise add new consultant message
              return {
                ...prev,
                [activeAgentId]: [
                  ...msgs,
                  {
                    type: 'consultant_text',
                    role: 'assistant',
                    agent: event.from,
                    content: event.content,
                    streaming: true,
                  },
                ],
              }
            })
          }

          if (event.type === 'done') {
            updateLastMessage(activeAgentId, (m) => ({ ...m, streaming: false }))
            // Refresh live feed
            fetchRecentActivity(null).then((rows) => setLiveFeed(rows.reverse())).catch(() => {})
          }

          if (event.type === 'error') {
            updateLastMessage(activeAgentId, (m) => ({
              ...m,
              content: `Error: ${event.message}`,
              streaming: false,
              error: true,
            }))
          }
        }
      }
    } catch (err) {
      updateLastMessage(activeAgentId, (m) => ({
        ...m,
        content: `Connection error: ${err.message}`,
        streaming: false,
        error: true,
      }))
    } finally {
      setStreaming(false)
      inputRef.current?.focus()
    }
  }, [input, streaming, activeAgentId, chatMessages, sessionId, addMessage, updateLastMessage])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const switchAgent = (id) => {
    if (streaming) return
    setActiveAgentId(id)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center gap-4 px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <Link to="/dashboard" className="text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-indigo-400" />
          <span className="font-semibold text-gray-100">Agent Studio</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-gray-400">Live</span>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Agent Roster ── */}
        <aside className="w-56 flex-shrink-0 border-r border-gray-800 overflow-y-auto flex flex-col">
          <div className="px-3 pt-3 pb-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Agents</p>
          </div>
          <nav className="flex-1 px-2 pb-3">
            {AGENTS.map((agent) => {
              const isActive  = agent.id === activeAgentId
              const hasChat   = (chatMessages[agent.id] || []).length > 0
              return (
                <button
                  key={agent.id}
                  onClick={() => switchAgent(agent.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-0.5 text-left transition-all ${
                    isActive
                      ? 'bg-gray-800 text-gray-100'
                      : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                  }`}
                >
                  <span className="text-base flex-shrink-0">{agent.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate">{agent.name}</span>
                      {hasChat && (
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: agent.color }}
                        />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{agent.role}</p>
                  </div>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* ── Chat Panel ── */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Agent header */}
          <div
            className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 flex-shrink-0"
            style={{ borderBottomColor: `${activeAgent.color}33` }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
              style={{ background: `${activeAgent.color}22`, border: `1px solid ${activeAgent.color}55` }}
            >
              {activeAgent.emoji}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: activeAgent.color }}>{activeAgent.name}</p>
              <p className="text-xs text-gray-500">{activeAgent.role}</p>
            </div>
            <MessageSquare size={14} className="ml-auto text-gray-600" />
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
            {currentMsgs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-8">
                <span className="text-5xl">{activeAgent.emoji}</span>
                <div>
                  <p className="text-gray-300 font-medium">{activeAgent.name}</p>
                  <p className="text-gray-500 text-sm mt-1">{activeAgent.role}</p>
                </div>
                <p className="text-gray-600 text-xs max-w-xs">
                  Ask me anything. I can also consult other agents when needed.
                </p>
              </div>
            )}
            {currentMsgs.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 pb-4 flex-shrink-0">
            <div className="flex gap-2 bg-gray-800 border border-gray-700 rounded-xl p-1 focus-within:border-indigo-500/50 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${activeAgent.name}…`}
                disabled={streaming}
                rows={1}
                className="flex-1 bg-transparent px-3 py-2 text-sm text-gray-100 placeholder-gray-500 resize-none outline-none max-h-32 overflow-y-auto"
                style={{ minHeight: '38px' }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || streaming}
                className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all m-0.5"
                style={{
                  background: input.trim() && !streaming ? activeAgent.color : '#374151',
                  opacity: input.trim() && !streaming ? 1 : 0.5,
                }}
              >
                {streaming
                  ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Send size={14} className="text-white" />
                }
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1.5 px-1">
              Enter to send · Shift+Enter for newline · Agents can consult each other automatically
            </p>
          </div>
        </main>

        {/* ── Live Feed ── */}
        <aside className="w-72 flex-shrink-0 border-l border-gray-800 flex flex-col">
          <div className="flex items-center gap-2 px-3 pt-3 pb-1 flex-shrink-0">
            <Activity size={14} className="text-emerald-400" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Live Activity</p>
            <span className="ml-auto text-xs text-gray-600">{liveFeed.length} events</span>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {feedLoading && (
              <div className="flex items-center justify-center h-32 text-gray-600 text-sm">Loading…</div>
            )}
            {!feedLoading && liveFeed.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
                <Activity size={24} className="text-gray-700" />
                <p className="text-gray-600 text-xs">No activity yet.<br />Start chatting to see the feed.</p>
              </div>
            )}
            {liveFeed.map((item) => (
              <FeedItem key={item.id} item={item} />
            ))}
            <div ref={feedBottomRef} />
          </div>

          {/* Session info */}
          <div className="px-3 py-2 border-t border-gray-800 flex-shrink-0">
            <p className="text-xs text-gray-600 truncate">Session: {sessionId.slice(8, 20)}…</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
