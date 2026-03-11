/**
 * Shared video-scanning logic used by scan-creator and scan-all endpoints.
 *
 * mode:
 *   'count' + count  → fetch exactly `count` most-recent videos (3 / 12 / 30)
 *   'days'  + days   → fetch up to 35 videos, keep only those published in the last `days` days
 */

const tiktokResearch = require('./tiktok')
const tiktokRapidApi = require('./tiktok-rapidapi')

const tiktok = process.env.RAPIDAPI_TIKTOK_KEY ? tiktokRapidApi : tiktokResearch

const API_MAX = 35 // RapidAPI hard cap per request

/**
 * Fetch + filter videos for one creator, insert new ones into the DB.
 *
 * @param {object} supabase
 * @param {object} creator   - { id, handle, platform, platform_user_id }
 * @param {object} opts      - { mode: 'count'|'days', count?: number, days?: number }
 * @returns {number}         - count of newly inserted videos
 */
async function scanCreator(supabase, creator, opts = {}) {
  const { mode = 'count', count = 7, days = 7 } = opts

  const fetchLimit = mode === 'count' ? Math.min(count, API_MAX) : API_MAX

  let fetched = await tiktok.fetchRecentVideos(creator, fetchLimit)

  // For days mode, filter to videos published within the window
  if (mode === 'days') {
    const cutoff = Date.now() - days * 86400000
    fetched = fetched.filter(v => v.published_at && new Date(v.published_at).getTime() >= cutoff)
  }

  if (fetched.length === 0) {
    await supabase.from('creators').update({ last_fetched_at: new Date().toISOString() }).eq('id', creator.id)
    return 0
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
  }

  await supabase.from('creators').update({ last_fetched_at: new Date().toISOString() }).eq('id', creator.id)
  return newVideos.length
}

module.exports = { scanCreator }
