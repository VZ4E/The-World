import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, Users, Zap, AlertCircle, ExternalLink, RefreshCw, Loader2 } from 'lucide-react'
import ScanMenu from '../components/ScanMenu'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

async function dbGet(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
    },
  })
  if (!res.ok) throw new Error(`DB error: ${res.status}`)
  return res.json()
}

function useData(fetcher, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetcher()
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false) } })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, loading, error, refresh: () => setTick(t => t + 1) }
}

function fmtNum(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function relTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1)  return `${Math.floor(diff / 60000)}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function Badge({ type }) {
  const cfg = {
    sponsored: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
    organic:   'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    unknown:   'bg-slate-500/15 text-slate-400 border border-slate-500/30',
  }
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg[type] ?? cfg.unknown}`}>
      {type === 'sponsored' ? '💰' : type === 'organic' ? '🌿' : '?'} {type}
    </span>
  )
}

// ─── Deal Feed ───────────────────────────────────────────────────────────────
function DealFeed() {
  const { data: mentions, loading, error, refresh } = useData(() =>
    dbGet('mentions', 'select=*,creators(name,handle,platform,avatar_url),videos(title,video_url,view_count)&order=created_at.desc&limit=40')
  )

  const [filter, setFilter] = useState('all')
  const filtered = (mentions ?? []).filter(m => filter === 'all' || m.mention_type === filter)

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-bold text-lg flex items-center gap-2">
          <Zap size={18} className="text-[#4f74f3]" /> Live Deal Feed
        </h2>
        <div className="flex items-center gap-2">
          {['all', 'sponsored', 'organic'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors
                ${filter === f ? 'bg-[#4f74f3] text-white' : 'bg-[#1a1e28] text-slate-400 hover:text-white'}`}
            >
              {f}
            </button>
          ))}
          <button onClick={refresh} className="p-1.5 rounded-lg bg-[#1a1e28] text-slate-400 hover:text-white">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {loading && <div className="text-slate-500 text-sm py-8 text-center">Loading...</div>}
      {error   && <div className="text-red-400 text-sm py-4 flex items-center gap-2"><AlertCircle size={14}/>{error}</div>}

      <div className="space-y-2">
        {filtered.map(m => (
          <div key={m.id} className="bg-[#13161d] border border-[#222736] rounded-xl p-4 hover:border-[#4f74f3]/40 transition-colors">
            <div className="flex items-start gap-3">
              {m.creators?.avatar_url
                ? <img src={m.creators.avatar_url} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
                : <div className="w-9 h-9 rounded-full bg-[#222736] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                    {(m.creators?.name ?? '?')[0]}
                  </div>
              }
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-white font-semibold text-sm">{m.brand_name}</span>
                  <Badge type={m.mention_type} />
                  <span className={`text-xs ${m.sentiment === 'positive' ? 'text-emerald-400' : m.sentiment === 'negative' ? 'text-red-400' : 'text-slate-500'}`}>
                    {m.sentiment}
                  </span>
                  <span className="text-slate-600 text-xs ml-auto">{relTime(m.created_at)}</span>
                </div>
                <div className="text-slate-400 text-xs mb-1">
                  @{m.creators?.handle} · {m.creators?.platform}
                </div>
                {m.context_snippet && (
                  <p className="text-slate-500 text-xs italic line-clamp-2">"{m.context_snippet}"</p>
                )}
              </div>
              {m.videos?.video_url && (
                <a href={m.videos.video_url} target="_blank" rel="noopener noreferrer"
                   className="text-slate-600 hover:text-[#4f74f3] flex-shrink-0 transition-colors">
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="text-slate-600 text-sm text-center py-8">No mentions yet.</div>
        )}
      </div>
    </section>
  )
}

// ─── Brand Radar ─────────────────────────────────────────────────────────────
function BrandRadar() {
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: mentions, loading } = useData(() =>
    dbGet('mentions', `select=brand_name,brand_normalized,mention_type,sentiment,videos(view_count)&created_at=gte.${since}`)
  )

  const brands = React.useMemo(() => {
    if (!mentions) return []
    const map = {}
    for (const m of mentions) {
      const k = m.brand_normalized
      if (!map[k]) map[k] = { name: m.brand_name, total: 0, sponsored: 0, organic: 0, positive: 0, reach: 0 }
      map[k].total++
      map[k][m.mention_type]++
      if (m.sentiment === 'positive') map[k].positive++
      map[k].reach += m.videos?.view_count ?? 0
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [mentions])

  return (
    <section>
      <h2 className="text-white font-bold text-lg flex items-center gap-2 mb-4">
        <TrendingUp size={18} className="text-purple-400" /> Brand Radar
        <span className="text-slate-600 text-sm font-normal">last 30 days</span>
      </h2>

      {loading && <div className="text-slate-500 text-sm py-4 text-center">Loading...</div>}

      <div className="bg-[#13161d] border border-[#222736] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#0d0f14]">
              <th className="px-4 py-3 text-left text-slate-500 text-xs font-semibold uppercase tracking-wide">Brand</th>
              <th className="px-4 py-3 text-center text-slate-500 text-xs font-semibold uppercase tracking-wide">Mentions</th>
              <th className="px-4 py-3 text-center text-slate-500 text-xs font-semibold uppercase tracking-wide">Type</th>
              <th className="px-4 py-3 text-right text-slate-500 text-xs font-semibold uppercase tracking-wide">Est. Reach</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b, i) => (
              <tr key={b.name} className="border-t border-[#1a1e28] hover:bg-[#0d0f14]/60 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 text-xs w-4">{i + 1}</span>
                    <span className="text-white font-semibold">{b.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="bg-[#4f74f3]/15 text-[#7b9ef8] px-2 py-0.5 rounded-full text-xs font-bold">{b.total}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {b.sponsored > 0 && <span className="text-orange-400 text-xs">💰 {b.sponsored}</span>}
                    {b.organic   > 0 && <span className="text-emerald-400 text-xs ml-1">🌿 {b.organic}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-slate-400 text-xs">{fmtNum(b.reach)}</td>
              </tr>
            ))}
            {!loading && brands.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-600">No data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Opportunities ───────────────────────────────────────────────────────────
function Opportunities() {
  const since = new Date(Date.now() - 14 * 86400000).toISOString()
  const { data: mentions, loading } = useData(() =>
    dbGet('mentions', `select=brand_name,brand_normalized,mention_type,creators(name,handle,platform,follower_count)&mention_type=eq.sponsored&created_at=gte.${since}`)
  )

  const opps = React.useMemo(() => {
    if (!mentions) return []
    const map = {}
    for (const m of mentions) {
      const k = `${m.brand_normalized}__${m.creators?.handle}`
      if (!map[k]) map[k] = { brand: m.brand_name, creator: m.creators, count: 0 }
      map[k].count++
    }
    return Object.values(map).sort((a, b) => b.count - a.count)
  }, [mentions])

  return (
    <section>
      <h2 className="text-white font-bold text-lg flex items-center gap-2 mb-4">
        <Users size={18} className="text-orange-400" /> Agency Opportunities
        <span className="text-slate-600 text-sm font-normal">sponsored deals last 14 days</span>
      </h2>

      {loading && <div className="text-slate-500 text-sm py-4 text-center">Loading...</div>}

      {!loading && opps.length === 0 && (
        <div className="bg-[#13161d] border border-[#222736] rounded-xl p-6 text-center text-slate-600 text-sm">
          No sponsored mentions yet — run the pipeline or seed demo data.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {opps.map((o, i) => (
          <div key={i} className="bg-[#13161d] border border-[#222736] rounded-xl p-4 hover:border-orange-500/30 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <span className="text-orange-400 font-bold text-sm">{o.brand}</span>
              <span className="bg-orange-500/15 text-orange-400 text-xs px-2 py-0.5 rounded-full border border-orange-500/30 font-semibold">
                {o.count}× deal
              </span>
            </div>
            <div className="text-white text-sm font-semibold">{o.creator?.name}</div>
            <div className="text-slate-500 text-xs">@{o.creator?.handle} · {o.creator?.platform}</div>
            {o.creator?.follower_count && (
              <div className="text-slate-600 text-xs mt-1">{fmtNum(o.creator.follower_count)} followers</div>
            )}
            <div className="mt-3 pt-3 border-t border-[#1a1e28]">
              <p className="text-slate-500 text-xs">
                Already doing deals with <strong className="text-slate-400">{o.brand}</strong>.
                This creator is open to brand partnerships — pitch your clients now.
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Dashboard shell ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const [tab, setTab]         = useState('feed')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [clearing, setClearing] = useState(false)
  const [clearResult, setClearResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState(null)

  async function runPipeline() {
    setRunning(true)
    setRunResult(null)
    try {
      const res  = await fetch('/api/dashboard/run-pipeline', { method: 'POST' })
      const data = await res.json()
      setRunResult(res.ok ? data : { _httpError: data.error || `HTTP ${res.status}` })
      setTimeout(() => setRunResult(null), 8000)
    } catch (err) {
      setRunResult({ _httpError: err.message || 'Network error' })
      setTimeout(() => setRunResult(null), 8000)
    } finally {
      setRunning(false)
    }
  }

  async function scanAll(opts) {
    setScanning(true)
    setScanResult(null)
    try {
      const res  = await fetch('/api/dashboard/scan-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      })
      const data = await res.json()
      setScanResult(data)
      setTimeout(() => setScanResult(null), 4000)
    } catch {
      // silent
    } finally {
      setScanning(false)
    }
  }

  async function clearPending() {
    setClearing(true)
    setClearResult(null)
    try {
      const [clearRes, scanRes] = await Promise.all([
        fetch('/api/dashboard/clear-pending', { method: 'POST' }),
        fetch('/api/dashboard/scan-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'count', count: 7 }),
        }),
      ])
      const [clearData, scanData] = await Promise.all([clearRes.json(), scanRes.json()])
      setClearResult({ ...clearData, new_videos: scanData.new_videos ?? 0 })
      setTimeout(() => setClearResult(null), 5000)
    } catch {
      // silent
    } finally {
      setClearing(false)
    }
  }

  const tabs = [
    { id: 'feed',  label: 'Deal Feed' },
    { id: 'radar', label: 'Brand Radar' },
    { id: 'opps',  label: 'Opportunities' },
  ]

  return (
    <div className="min-h-screen bg-[#080a0e] text-[#e2e8f0]">
      {/* Topbar */}
      <div className="border-b border-[#1a1e28] sticky top-0 bg-[#080a0e]/95 backdrop-blur z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-slate-500 hover:text-white text-sm transition-colors">← Home</Link>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-[#4f74f3] flex items-center justify-center text-white text-xs font-bold">RS</div>
              <span className="text-white font-semibold text-sm">Signal Dashboard</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {runResult && (
              <span className={`text-xs font-semibold ${runResult._httpError || runResult.errors?.length > 0 ? 'text-red-400' : 'text-purple-400'}`}>
                {runResult._httpError
                  ? `Error: ${runResult._httpError}`
                  : runResult.found === 0
                    ? 'No pending videos found'
                    : runResult.transcribed > 0 || runResult.analyzed > 0
                      ? `Transcribed ${runResult.transcribed}/${runResult.found} · analyzed ${runResult.analyzed} · ${runResult.mentions_found} mention(s)${runResult.errors?.length > 0 ? ` · ${runResult.errors.length} failed` : ''}`
                      : runResult.errors?.length > 0
                        ? `Found ${runResult.found} videos · ${runResult.errors.length} failed (check API keys)`
                        : `Found ${runResult.found} · ${runResult.skipped ?? 0} skipped (no URL)`}
              </span>
            )}
            {clearResult && (
              <span className="text-xs text-blue-400 font-semibold">
                {(clearResult.reset_transcription + clearResult.reset_analysis) > 0
                  ? `Reset ${clearResult.reset_transcription + clearResult.reset_analysis} job(s)`
                  : 'Queue clear'}
                {clearResult.new_videos > 0 && ` · +${clearResult.new_videos} new videos`}
              </span>
            )}
            {scanResult && (
              <span className="text-xs text-emerald-400 font-semibold">
                {scanResult.new_videos > 0 ? `Queued ${scanResult.new_videos} video${scanResult.new_videos !== 1 ? 's' : ''}` : 'No new videos'}
              </span>
            )}
            <button
              onClick={runPipeline}
              disabled={running}
              className="bg-[#1a1e28] hover:bg-[#222736] text-purple-400 hover:text-purple-300 text-sm font-semibold px-3 py-1.5 rounded-lg border border-[#222736] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running ? 'Running…' : 'Run Pipeline'}
            </button>
            <button
              onClick={clearPending}
              disabled={clearing}
              className="bg-[#1a1e28] hover:bg-[#222736] text-slate-400 hover:text-slate-200 text-sm font-semibold px-3 py-1.5 rounded-lg border border-[#222736] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {clearing ? 'Clearing…' : 'Clear Pending'}
            </button>
            <ScanMenu
              onScan={scanAll}
              scanning={scanning}
              label="Scan All"
              className="bg-[#1a1e28] hover:bg-[#222736] text-slate-300 text-sm font-semibold px-3 py-1.5 rounded-lg border border-[#222736]"
            />
            <Link to="/videos"
              className="text-sm text-slate-400 hover:text-white font-semibold transition-colors">
              Videos
            </Link>
            <Link to="/creators"
              className="text-sm text-[#4f74f3] hover:text-[#7b9ef8] font-semibold transition-colors">
              Manage Creators →
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex gap-1 pb-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors
                ${tab === t.id
                  ? 'text-[#4f74f3] border-[#4f74f3]'
                  : 'text-slate-500 border-transparent hover:text-white'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {tab === 'feed'  && <DealFeed />}
        {tab === 'radar' && <BrandRadar />}
        {tab === 'opps'  && <Opportunities />}
      </div>
    </div>
  )
}
