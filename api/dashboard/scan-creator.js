/**
 * POST /api/dashboard/scan-creator
 *
 * Manually trigger a video fetch for a single creator.
 * Body: { creatorId: string }
 *
 * Returns: { new_videos: number, error?: string }
 */

const { getSupabase }  = require('../../lib/supabase')
const tiktokResearch   = require('../../lib/tiktok')
const tiktokRapidApi   = require('../../lib/tiktok-rapidapi')

const tiktok = process.env.RAPIDAPI_TIKTOK_KEY ? tiktokRapidApi : tiktokResearch
const VIDEOS_PER_CREATOR = parseInt(process.env.VIDEOS_PER_CREATOR || '7', 10)

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const { creatorId } = req.body ?? {}
  if (!creatorId) return res.status(400).json({ error: 'creatorId is required' })

  const supabase = getSupabase()

  // Load the creator
  const { data: creator, error: fetchErr } = await supabase
    .from('creators')
    .select('id, name, handle, platform, platform_user_id')
    .eq('id', creatorId)
    .single()

  if (fetchErr || !creator) return res.status(404).json({ error: 'Creator not found' })

  try {
    let fetchedVideos = []

    if (creator.platform === 'tiktok') {
      fetchedVideos = await tiktok.fetchRecentVideos(creator, VIDEOS_PER_CREATOR)
    } else {
      return res.status(400).json({ error: `Scanning not supported for platform: ${creator.platform}` })
    }

    if (fetchedVideos.length === 0) {
      await supabase.from('creators').update({ last_fetched_at: new Date().toISOString() }).eq('id', creator.id)
      return res.status(200).json({ new_videos: 0 })
    }

    // Find which are already in DB
    const fetchedIds = fetchedVideos.map(v => v.platform_video_id)
    const { data: existing } = await supabase
      .from('videos')
      .select('platform_video_id')
      .eq('creator_id', creator.id)
      .in('platform_video_id', fetchedIds)

    const existingIds = new Set((existing ?? []).map(v => v.platform_video_id))
    const newVideos   = fetchedVideos.filter(v => !existingIds.has(v.platform_video_id))

    if (newVideos.length > 0) {
      const { error: insertErr } = await supabase.from('videos').insert(newVideos)
      if (insertErr) throw new Error(insertErr.message)
    }

    await supabase.from('creators').update({ last_fetched_at: new Date().toISOString() }).eq('id', creator.id)

    return res.status(200).json({ new_videos: newVideos.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
