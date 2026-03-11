/**
 * /api/dashboard/creators-write
 *
 * Server-side mutations for the creators table using the service role key
 * (bypasses RLS — anon key cannot write).
 *
 * POST   { ...creatorFields }        → insert creator
 * PATCH  { id, ...fields }           → update creator (toggle active, etc.)
 * DELETE { id }                      → delete creator + cascade
 */

const { getSupabase } = require('../../lib/supabase')

function cors(res, req) {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

module.exports = async function handler(req, res) {
  cors(res, req)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const supabase = getSupabase()
  const body = req.body ?? {}

  // ── GET: list all creators ────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('creators')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // ── POST: insert new creator ──────────────────────────────────────────────
  if (req.method === 'POST') {
    const { name, handle, platform, platform_user_id, channel_url, alert_email } = body

    if (!name || !handle) {
      return res.status(400).json({ error: 'name and handle are required' })
    }

    const { data, error } = await supabase
      .from('creators')
      .insert({ name, handle, platform: platform || 'tiktok', platform_user_id, channel_url, alert_email, is_active: true })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  // ── PATCH: update creator fields ──────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id, ...fields } = body
    if (!id) return res.status(400).json({ error: 'id is required' })

    const { data, error } = await supabase
      .from('creators')
      .update(fields)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // ── DELETE: remove creator ────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = body
    if (!id) return res.status(400).json({ error: 'id is required' })

    const { error } = await supabase
      .from('creators')
      .delete()
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
