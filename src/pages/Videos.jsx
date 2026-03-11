import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ExternalLink, ChevronDown } from 'lucide-react'

const LABELS = [
  { id: 'all',      label: 'All',            color: 'text-slate-300' },
  { id: 'branded',  label: 'Branded',        color: 'text-orange-400' },
  { id: 'possible', label: 'Possible Brand', color: 'text-yellow-400' },
  { id: 'none',     label: 'No Brand',       color: 'text-slate-500' },
  { id: 'pending',  label: 'Pending',        color: 'text-blue-400' },
]

function LabelBadge({ label, confidence }) {
  const cfg = {
    branded:  { cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30',  text: 'Branded' },
    possible: { cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',  text: 'Possible Brand' },
    none:     { cls: 'bg-slate-500/15  text-slate-500  border-slate-500/20',   text: 'No Brand' },
    pending:  { cls: 'bg-blue-500/15   text-blue-400   border-blue-500/30',    text: 'Pending' },
  }
  const c = cfg[label] ?? cfg.pending
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${c.cls}`}>
      {c.text}
      {confidence > 0 && label !== 'none' && label !== 'pending' && (
        <span className="opacity-70">{Math.round(confidence * 100)}%</span>
      )}
    </span>
  )
}

function fmtNum(n) {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtDur(s) {
  if (!s) return ''
  const m = Math.floor(s / 60), sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function relTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1)  return `${Math.floor(diff / 60000)}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function VideoCard({ video }) {
  const [expanded, setExpanded] = useState(false)
  const hasBrands = video.brands.length > 0

  return (
    <div className="bg-[#13161d] border border-[#222736] rounded-xl overflow-hidden hover:border-[#2a2f3d] transition-colors">
      <div className="flex gap-3 p-4">
        {/* Thumbnail */}
        <div className="flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden bg-[#0d0f14] relative">
          {video.thumbnail_url
            ? <img src={video.thumbnail_url} className="w-full h-full object-cover" alt="" />
            : <div className="w-full h-full flex items-center justify-center text-slate-700 text-xs">No img</div>
          }
          {video.duration_seconds && (
            <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
              {fmtDur(video.duration_seconds)}
            </span>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-white text-sm font-semibold line-clamp-2 leading-snug">
              {video.title || <span className="text-slate-600 italic">No title</span>}
            </p>
            {video.video_url && (
              <a href={video.video_url} target="_blank" rel="noopener noreferrer"
                 className="text-slate-600 hover:text-[#4f74f3] flex-shrink-0 transition-colors mt-0.5">
                <ExternalLink size={13}/>
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap mb-2">
            {video.creators?.avatar_url
              ? <img src={video.creators.avatar_url} className="w-4 h-4 rounded-full" alt=""/>
              : null
            }
            <span className="text-slate-500 text-xs">@{video.creators?.handle}</span>
            <span className="text-slate-700 text-xs">·</span>
            <span className="text-slate-600 text-xs">{fmtNum(video.view_count)} views</span>
            <span className="text-slate-700 text-xs">·</span>
            <span className="text-slate-600 text-xs">{relTime(video.published_at)}</span>
          </div>

          <div className="flex items-center gap-2">
            <LabelBadge label={video.label} confidence={video.confidence} />
            {hasBrands && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="flex items-center gap-0.5 text-slate-500 hover:text-slate-300 text-xs transition-colors"
              >
                {video.brands.length} brand{video.brands.length !== 1 ? 's' : ''}
                <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`}/>
              </button>
            )}
          </div>

          {expanded && hasBrands && (
            <div className="mt-2 space-y-1">
              {video.brands.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-[#0d0f14] rounded-lg px-2.5 py-1.5">
                  <span className="text-white font-semibold">{b.name}</span>
                  <span className={`${b.type === 'sponsored' ? 'text-orange-400' : b.type === 'organic' ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {b.type}
                  </span>
                  {b.confidence != null && (
                    <span className="text-slate-600 ml-auto">{Math.round(b.confidence * 100)}% conf</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Videos() {
  const [videos,  setVideos]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [filter,  setFilter]  = useState('all')
  const [creator, setCreator] = useState('all')
  const [creators, setCreators] = useState([])

  // Load creator list for filter dropdown
  useEffect(() => {
    fetch('/api/dashboard/creators-write')
      .then(r => r.json())
      .then(d => setCreators(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (filter  !== 'all') params.set('label',   filter)
      if (creator !== 'all') params.set('creator', creator)
      const res  = await fetch(`/api/dashboard/videos-list?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      setVideos(data.videos ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filter, creator])

  useEffect(() => { load() }, [load])

  const counts = videos.reduce((acc, v) => { acc[v.label] = (acc[v.label] || 0) + 1; return acc }, {})

  return (
    <div className="min-h-screen bg-[#080a0e] text-[#e2e8f0]">
      {/* Header */}
      <div className="border-b border-[#1a1e28] sticky top-0 bg-[#080a0e]/95 backdrop-blur z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="text-slate-500 hover:text-white text-sm transition-colors">← Dashboard</Link>
            <span className="text-slate-700">|</span>
            <span className="text-white font-semibold text-sm">Videos</span>
          </div>
          {/* Creator filter */}
          <select
            value={creator}
            onChange={e => setCreator(e.target.value)}
            className="bg-[#1a1e28] border border-[#222736] text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="all">All Creators</option>
            {creators.map(c => (
              <option key={c.id} value={c.id}>@{c.handle}</option>
            ))}
          </select>
        </div>

        {/* Label filter tabs */}
        <div className="max-w-5xl mx-auto px-4 flex gap-1 pb-0">
          {LABELS.map(l => (
            <button key={l.id} onClick={() => setFilter(l.id)}
              className={`px-3 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5
                ${filter === l.id ? 'text-white border-[#4f74f3]' : `${l.color} border-transparent hover:text-white`}`}>
              {l.label}
              {l.id !== 'all' && counts[l.id] > 0 && (
                <span className="bg-[#1a1e28] text-slate-400 text-[10px] px-1.5 py-0.5 rounded-full">
                  {counts[l.id]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {error   && <div className="text-red-400 text-sm flex items-center gap-2 mb-4"><AlertCircle size={14}/>{error}</div>}
        {loading && <div className="text-slate-500 text-sm text-center py-16">Loading videos…</div>}

        {!loading && videos.length === 0 && (
          <div className="text-center text-slate-600 text-sm py-16">
            No videos found. Scan some creators first.
          </div>
        )}

        <div className="space-y-2">
          {videos.map(v => <VideoCard key={v.id} video={v} />)}
        </div>
      </div>
    </div>
  )
}
