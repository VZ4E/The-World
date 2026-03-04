import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, ToggleLeft, ToggleRight, AlertCircle, Loader2, CheckCircle } from 'lucide-react'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

const headers = {
  apikey:        SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
  Prefer:        'return=representation',
}

async function dbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(`DB ${res.status}`)
  return res.json()
}

async function dbPost(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  if (!res.ok) { const t = await res.text(); throw new Error(t) }
  return res.json()
}

async function dbPatch(table, id, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH', headers, body: JSON.stringify(body),
  })
  if (!res.ok) { const t = await res.text(); throw new Error(t) }
  return res.json()
}

async function dbDelete(table, id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE', headers,
  })
  if (!res.ok) { const t = await res.text(); throw new Error(t) }
}

const PLATFORMS = ['tiktok', 'twitch', 'youtube']

function PlatformBadge({ platform }) {
  const cfg = {
    tiktok:  'bg-pink-500/15 text-pink-400',
    twitch:  'bg-purple-500/15 text-purple-400',
    youtube: 'bg-red-500/15 text-red-400',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg[platform] ?? 'bg-slate-500/15 text-slate-400'}`}>
      {platform}
    </span>
  )
}

function Toast({ msg, ok }) {
  return (
    <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-semibold z-50
      ${ok ? 'bg-emerald-900/90 text-emerald-300 border border-emerald-700' : 'bg-red-900/90 text-red-300 border border-red-700'}`}>
      {ok ? <CheckCircle size={15}/> : <AlertCircle size={15}/>}
      {msg}
    </div>
  )
}

const EMPTY_FORM = { name: '', handle: '', platform: 'tiktok', platform_user_id: '', channel_url: '', alert_email: '' }

export default function CreatorAdmin() {
  const [creators, setCreators] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [toast,    setToast]    = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(null)

  function notify(msg, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  async function load() {
    setLoading(true)
    try {
      const data = await dbGet('creators?select=*&order=created_at.desc')
      setCreators(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.name || !form.handle || !form.platform_user_id) {
      notify('Name, handle, and platform ID are required.', false)
      return
    }
    setSaving(true)
    try {
      await dbPost('creators', { ...form, is_active: true })
      setForm(EMPTY_FORM)
      setShowForm(false)
      notify('Creator added.')
      load()
    } catch (e) {
      notify(e.message, false)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(creator) {
    try {
      await dbPatch('creators', creator.id, { is_active: !creator.is_active })
      setCreators(prev => prev.map(c => c.id === creator.id ? { ...c, is_active: !c.is_active } : c))
      notify(creator.is_active ? 'Creator paused.' : 'Creator activated.')
    } catch (e) {
      notify(e.message, false)
    }
  }

  async function handleDelete(creator) {
    if (!window.confirm(`Delete @${creator.handle}? This removes all their videos and mentions.`)) return
    setDeleting(creator.id)
    try {
      await dbDelete('creators', creator.id)
      setCreators(prev => prev.filter(c => c.id !== creator.id))
      notify('Creator deleted.')
    } catch (e) {
      notify(e.message, false)
    } finally {
      setDeleting(null)
    }
  }

  function fmtNum(n) {
    if (!n) return '—'
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  return (
    <div className="min-h-screen bg-[#080a0e] text-[#e2e8f0]">
      {/* Header */}
      <div className="border-b border-[#1a1e28] sticky top-0 bg-[#080a0e]/95 backdrop-blur z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="text-slate-500 hover:text-white text-sm transition-colors">← Dashboard</Link>
            <span className="text-slate-700">|</span>
            <span className="text-white font-semibold text-sm">Creator Admin</span>
          </div>
          <button
            onClick={() => setShowForm(f => !f)}
            className="flex items-center gap-1.5 bg-[#4f74f3] hover:bg-[#3d5fd4] text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={15} /> Add Creator
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Add form */}
        {showForm && (
          <form onSubmit={handleAdd} className="bg-[#13161d] border border-[#4f74f3]/40 rounded-xl p-6 mb-8 space-y-4">
            <h3 className="text-white font-bold text-base mb-4">Add New Creator</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Display Name *" value={form.name}
                onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="DrLupo" />
              <Field label="Handle *" value={form.handle}
                onChange={v => setForm(f => ({ ...f, handle: v }))} placeholder="drlupo (no @)" />
              <div>
                <label className="block text-slate-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">Platform *</label>
                <select
                  value={form.platform}
                  onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                  className="w-full bg-[#0d0f14] border border-[#222736] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#4f74f3]"
                >
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <Field label="Platform User ID *" value={form.platform_user_id}
                onChange={v => setForm(f => ({ ...f, platform_user_id: v }))}
                placeholder="secUid / numeric Twitch ID" />
              <Field label="Channel URL" value={form.channel_url}
                onChange={v => setForm(f => ({ ...f, channel_url: v }))}
                placeholder="https://www.twitch.tv/drlupo" />
              <Field label="Alert Email" value={form.alert_email}
                onChange={v => setForm(f => ({ ...f, alert_email: v }))}
                placeholder="alerts@agency.com" type="email" />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 bg-[#4f74f3] hover:bg-[#3d5fd4] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save Creator
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-white text-sm transition-colors">Cancel</button>
            </div>
          </form>
        )}

        {/* Error / loading */}
        {error   && <div className="text-red-400 text-sm flex items-center gap-2 mb-6"><AlertCircle size={15}/>{error}</div>}
        {loading && <div className="text-slate-500 text-sm text-center py-12">Loading creators...</div>}

        {/* Creator table */}
        {!loading && (
          <div className="bg-[#13161d] border border-[#222736] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1a1e28] flex items-center justify-between">
              <span className="text-white font-bold">{creators.length} Creator{creators.length !== 1 ? 's' : ''}</span>
              <span className="text-slate-500 text-xs">{creators.filter(c => c.is_active).length} active</span>
            </div>
            {creators.length === 0 ? (
              <div className="text-center text-slate-600 text-sm py-12">No creators yet. Add one above.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0d0f14]">
                    <th className="px-5 py-3 text-left text-slate-500 text-xs font-semibold uppercase tracking-wide">Creator</th>
                    <th className="px-5 py-3 text-left text-slate-500 text-xs font-semibold uppercase tracking-wide">Platform</th>
                    <th className="px-5 py-3 text-right text-slate-500 text-xs font-semibold uppercase tracking-wide">Followers</th>
                    <th className="px-5 py-3 text-center text-slate-500 text-xs font-semibold uppercase tracking-wide">Active</th>
                    <th className="px-5 py-3 text-right text-slate-500 text-xs font-semibold uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {creators.map(c => (
                    <tr key={c.id} className="border-t border-[#1a1e28] hover:bg-[#0d0f14]/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {c.avatar_url
                            ? <img src={c.avatar_url} className="w-8 h-8 rounded-full object-cover" alt="" />
                            : <div className="w-8 h-8 rounded-full bg-[#222736] flex items-center justify-center text-white text-xs font-bold">{(c.name??'?')[0]}</div>
                          }
                          <div>
                            <div className="text-white font-semibold">{c.name}</div>
                            <div className="text-slate-500 text-xs">@{c.handle}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4"><PlatformBadge platform={c.platform} /></td>
                      <td className="px-5 py-4 text-right text-slate-400 text-xs">{fmtNum(c.follower_count)}</td>
                      <td className="px-5 py-4 text-center">
                        <button onClick={() => toggleActive(c)}
                          className={`transition-colors ${c.is_active ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-600 hover:text-slate-400'}`}>
                          {c.is_active ? <ToggleRight size={22}/> : <ToggleLeft size={22}/>}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => handleDelete(c)}
                          disabled={deleting === c.id}
                          className="text-slate-600 hover:text-red-400 transition-colors disabled:opacity-40"
                        >
                          {deleting === c.id ? <Loader2 size={15} className="animate-spin"/> : <Trash2 size={15}/>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="block text-slate-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0d0f14] border border-[#222736] rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-[#4f74f3] transition-colors"
      />
    </div>
  )
}
