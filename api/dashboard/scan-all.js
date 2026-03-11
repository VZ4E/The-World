/**
 * POST /api/dashboard/scan-all
 *
 * Trigger a video fetch for all active TikTok creators.
 * Body: { mode: 'count'|'days', count?: number, days?: number }
 * Returns: { scanned: number, new_videos: number, errors: [...] }
 */

const { getSupabase } = require('../../lib/supabase')
const { scanCreator } = require('../../lib/scan-videos')

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const { mode = 'count', count = 7, days = 7 } = req.body ?? {}
  const supabase = getSupabase()

  const { data: creators, error: creatorsErr } = await supabase
    .from('creators')
    .select('id, name, handle, platform, platform_user_id')
    .eq('is_active', true)
    .eq('platform', 'tiktok')

  if (creatorsErr) return res.status(500).json({ error: creatorsErr.message })

  let newVideosTotal = 0
  const errors = []

  for (const creator of creators) {
    try {
      newVideosTotal += await scanCreator(supabase, creator, { mode, count, days })
    } catch (err) {
      errors.push({ handle: creator.handle, error: err.message })
    }
  }

  return res.status(200).json({ scanned: creators.length, new_videos: newVideosTotal, errors })
}
