/**
 * POST /api/dashboard/import-tiktok
 *
 * Bulk-import TikTok creators by username.
 *
 * Body: { usernames: ["ninja", "pokimane", ...] }
 *
 * For each username:
 *   1. Calls RapidAPI to resolve profile (secUid, name, avatar, followers)
 *   2. Upserts into the creators table (skips if handle already exists)
 *
 * Returns: { imported: [...], skipped: [...], errors: [...] }
 */

const { getSupabase } = require('../../lib/supabase')

const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com'
const USER_URL      = `https://${RAPIDAPI_HOST}/api/user/info`

async function resolveProfile(handle, apiKey) {
  const url = new URL(USER_URL)
  url.searchParams.set('uniqueId', handle)

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-rapidapi-key':  apiKey,
      'x-rapidapi-host': RAPIDAPI_HOST,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`RapidAPI ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = await res.json()

  const user = json.data?.user || json.data?.userInfo?.user
  if (!user?.secUid) {
    throw new Error(`Could not resolve secUid — ${JSON.stringify(json).slice(0, 200)}`)
  }

  const stats = json.data?.stats || json.data?.userInfo?.stats || {}

  return {
    handle:             user.uniqueId || handle,
    name:               user.nickname || user.uniqueId || handle,
    platform_user_id:   user.secUid,
    avatar_url:         user.avatarMedium || user.avatarThumb || null,
    follower_count:     stats.followerCount ?? null,
    channel_url:        `https://www.tiktok.com/@${user.uniqueId || handle}`,
  }
}

module.exports = async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.RAPIDAPI_TIKTOK_KEY
  if (!apiKey) return res.status(503).json({ error: 'RAPIDAPI_TIKTOK_KEY not configured' })

  const { usernames } = req.body ?? {}
  if (!Array.isArray(usernames) || usernames.length === 0) {
    return res.status(400).json({ error: 'usernames must be a non-empty array' })
  }

  const cleaned = usernames
    .map(u => String(u).trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean)
    .slice(0, 50) // max 50 per request

  const supabase = getSupabase()

  // Fetch existing handles so we can detect skips
  const { data: existing } = await supabase
    .from('creators')
    .select('handle')
    .eq('platform', 'tiktok')
    .in('handle', cleaned)

  const existingHandles = new Set((existing ?? []).map(c => c.handle.toLowerCase()))

  const imported = []
  const skipped  = []
  const errors   = []

  for (const handle of cleaned) {
    if (existingHandles.has(handle)) {
      skipped.push(handle)
      continue
    }

    try {
      const profile = await resolveProfile(handle, apiKey)

      const { error: insertError } = await supabase
        .from('creators')
        .insert({
          ...profile,
          platform:  'tiktok',
          is_active: true,
        })

      if (insertError) throw new Error(insertError.message)

      imported.push(handle)
    } catch (err) {
      errors.push({ handle, error: err.message })
    }
  }

  return res.status(200).json({ imported, skipped, errors })
}
