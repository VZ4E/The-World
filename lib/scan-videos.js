/**
 * Shared video-scanning logic used by scan-creator and scan-all endpoints.
 *
 * mode:
 *   'count' + count  → fetch exactly `count` most-recent videos (3 / 12 / 30)
 *   'days'  + days   → fetch up to 35 videos, keep only those published in the last `days` days
 *
 * force (boolean, default false):
 *   When true, videos that already exist in the DB are reset to transcription_status='pending'
 *   and analysis_status='pending' so the pipeline re-processes them.
 *   Used by the manual "Scan N" count buttons so they always queue the last N videos.
 */

const tiktokResearch = require('./tiktok')
const tiktokRapidApi = require('./tiktok-rapidapi')

const tiktok = process.env.RAPIDAPI_TIKTOK_KEY ? tiktokRapidApi : tiktokResearch

const API_MAX = 35 // RapidAPI hard cap per request

/**
 * Fetch + filter videos for one creator, insert new ones (and optionally
 * force-reset existing ones) in the DB.
 *
 * @param {object} supabase
 * @param {object} creator   - { id, handle, platform, platform_user_id }
 * @param {object} opts      - { mode, count, days, force }
 * @returns {number}         - count of videos inserted or re-queued
 */
async function scanCreator(supabase, creator, opts = {}) {
  const { mode = 'count', count = 7, days = 7, force = false } = opts

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

  const existingIds  = new Set((existing ?? []).map(v => v.platform_video_id))
  const newVideos    = fetched.filter(v => !existingIds.has(v.platform_video_id))
  const alreadyHave  = fetched.filter(v =>  existingIds.has(v.platform_video_id))

  let queued = 0

  // Insert brand-new videos
  if (newVideos.length > 0) {
    const { error: insertErr } = await supabase.from('videos').insert(newVideos)
    if (insertErr) throw new Error(insertErr.message)
    queued += newVideos.length
  }

  // In force mode, reset existing videos back to pending so pipeline re-runs them
  if (force && alreadyHave.length > 0) {
    const ids = alreadyHave.map(v => v.platform_video_id)
    const { error: updateErr } = await supabase
      .from('videos')
      .update({
        transcription_status: 'pending',
        analysis_status:      'pending',
        error_message:        null,
        retry_count:          0,
      })
      .eq('creator_id', creator.id)
      .in('platform_video_id', ids)
    if (updateErr) throw new Error(updateErr.message)
    queued += alreadyHave.length
  }

  await supabase.from('creators').update({ last_fetched_at: new Date().toISOString() }).eq('id', creator.id)
  return queued
}

module.exports = { scanCreator }
