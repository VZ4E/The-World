/**
 * POST /api/dashboard/scan-all
 *
 * Trigger a video fetch for all active creators.
 * Returns: { scanned: number, new_videos: number, errors: [...] }
 */

const { getSupabase } = require('../../lib/supabase')
const tiktokResearch  = require('../../lib/tiktok')
const tiktokRapidApi  = require('../../lib/tiktok-rapidapi')

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
      const fetched = await tiktok.fetchRecentVideos(creator, VIDEOS_PER_CREATOR)
      if (fetched.length === 0) {
        await supabase.from('creators').update({ last_fetched_at: new Date().toISOString() }).eq('id', creator.id)
        continue
      }

      const fetchedIds = fetched.map(v => v.platform_video_id)
      const { data: existing } = await supabase
        .from('videos').select('platform_video_id')
        .eq('creator_id', creator.id).in('platform_video_id', fetchedIds)

      const existingIds = new Set((existing ?? []).map(v => v.platform_video_id))
      const newVideos   = fetched.filter(v => !existingIds.has(v.platform_video_id))

      if (newVideos.length > 0) {
        const { error: insertErr } = await supabase.from('videos').insert(newVideos)
        if (insertErr) throw new Error(insertErr.message)
        newVideosTotal += newVideos.length
      }

      await supabase.from('creators').update({ last_fetched_at: new Date().toISOString() }).eq('id', creator.id)
    } catch (err) {
      errors.push({ handle: creator.handle, error: err.message })
    }
  }

  return res.status(200).json({ scanned: creators.length, new_videos: newVideosTotal, errors })
}
