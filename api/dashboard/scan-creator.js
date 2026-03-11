/**
 * POST /api/dashboard/scan-creator
 *
 * Manually trigger a video fetch for a single creator.
 * Body: { creatorId: string, mode: 'count'|'days', count?: number, days?: number }
 * Returns: { new_videos: number }
 */

const { getSupabase }  = require('../../lib/supabase')
const { scanCreator }  = require('../../lib/scan-videos')

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const { creatorId, mode = 'count', count = 7, days = 7, force = false } = req.body ?? {}
  if (!creatorId) return res.status(400).json({ error: 'creatorId is required' })

  const supabase = getSupabase()

  const { data: creator, error: fetchErr } = await supabase
    .from('creators')
    .select('id, name, handle, platform, platform_user_id')
    .eq('id', creatorId)
    .single()

  if (fetchErr || !creator) return res.status(404).json({ error: 'Creator not found' })
  if (creator.platform !== 'tiktok') return res.status(400).json({ error: `Scanning not supported for platform: ${creator.platform}` })

  try {
    const newVideos = await scanCreator(supabase, creator, { mode, count, days, force })
    return res.status(200).json({ new_videos: newVideos })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
