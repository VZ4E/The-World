/**
 * GET /api/cron/fetch-videos
 *
 * Vercel cron job — runs daily at 06:00 UTC (configured in vercel.json).
 *
 * For every active creator:
 *   1. Fetch their last 7 videos from TikTok (Twitch: stub for next iteration)
 *   2. Identify which videos are new (not yet in the DB)
 *   3. Insert new videos with transcription_status = 'pending'
 *   4. Update creator.last_fetched_at
 *
 * Vercel invokes crons with the Authorization header set to
 * `Bearer <CRON_SECRET>` — we validate it to block manual abuse.
 * See: https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
 */

const { getSupabase } = require('../../lib/supabase')
const { fetchRecentVideos } = require('../../lib/tiktok')

const VIDEOS_PER_CREATOR = parseInt(process.env.VIDEOS_PER_CREATOR || '7', 10)

module.exports = async function handler(req, res) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.PIPELINE_CRON_SECRET
  const authHeader = req.headers.authorization

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = getSupabase()
  const runStarted = new Date().toISOString()

  console.log(`[fetch-videos] Pipeline started at ${runStarted}`)

  // ── Load active creators ──────────────────────────────────────────────────
  const { data: creators, error: creatorsError } = await supabase
    .from('creators')
    .select('id, name, handle, platform, platform_user_id')
    .eq('is_active', true)
    .order('name')

  if (creatorsError) {
    console.error('[fetch-videos] Failed to load creators:', creatorsError.message)
    return res.status(500).json({ error: 'Failed to load creators', detail: creatorsError.message })
  }

  console.log(`[fetch-videos] Processing ${creators.length} active creators`)

  const summary = {
    run_started_at: runStarted,
    creators_processed: 0,
    videos_fetched: 0,
    videos_inserted: 0,
    creators_skipped: 0,
    errors: [],
  }

  // ── Process each creator sequentially ────────────────────────────────────
  // Sequential (not parallel) to stay within TikTok API rate limits.
  for (const creator of creators) {
    const tag = `[${creator.platform}/@${creator.handle}]`

    try {
      // 1. Fetch videos from the platform
      let fetchedVideos = []

      if (creator.platform === 'tiktok') {
        fetchedVideos = await fetchRecentVideos(creator, VIDEOS_PER_CREATOR)
      } else if (creator.platform === 'twitch') {
        // Twitch fetcher is built in the next iteration
        console.log(`${tag} Twitch fetcher not yet implemented — skipping`)
        summary.creators_skipped++
        continue
      } else {
        console.warn(`${tag} Unknown platform "${creator.platform}" — skipping`)
        summary.creators_skipped++
        continue
      }

      summary.videos_fetched += fetchedVideos.length
      console.log(`${tag} Fetched ${fetchedVideos.length} videos from API`)

      if (fetchedVideos.length === 0) {
        await touchLastFetched(supabase, creator.id)
        summary.creators_processed++
        continue
      }

      // 2. Find which video IDs already exist in the DB for this creator
      const fetchedIds = fetchedVideos.map((v) => v.platform_video_id)

      const { data: existing, error: existingError } = await supabase
        .from('videos')
        .select('platform_video_id')
        .eq('creator_id', creator.id)
        .eq('platform', creator.platform)
        .in('platform_video_id', fetchedIds)

      if (existingError) {
        throw new Error(`DB lookup failed: ${existingError.message}`)
      }

      const existingIds = new Set((existing ?? []).map((v) => v.platform_video_id))
      const newVideos = fetchedVideos.filter(
        (v) => !existingIds.has(v.platform_video_id)
      )

      console.log(
        `${tag} ${newVideos.length} new / ${existingIds.size} already in DB`
      )

      // 3. Insert new videos
      if (newVideos.length > 0) {
        const { error: insertError } = await supabase
          .from('videos')
          .insert(newVideos)

        if (insertError) {
          throw new Error(`Insert failed: ${insertError.message}`)
        }

        summary.videos_inserted += newVideos.length
      }

      // 4. Stamp last_fetched_at on the creator
      await touchLastFetched(supabase, creator.id)
      summary.creators_processed++

    } catch (err) {
      console.error(`${tag} Error:`, err.message)
      summary.errors.push({ creator: creator.handle, platform: creator.platform, error: err.message })
    }
  }

  const runFinished = new Date().toISOString()
  summary.run_finished_at = runFinished

  console.log('[fetch-videos] Pipeline complete:', JSON.stringify(summary))

  return res.status(200).json(summary)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function touchLastFetched(supabase, creatorId) {
  const { error } = await supabase
    .from('creators')
    .update({ last_fetched_at: new Date().toISOString() })
    .eq('id', creatorId)

  if (error) {
    // Non-fatal — log and continue
    console.warn(`[fetch-videos] Failed to update last_fetched_at for creator ${creatorId}:`, error.message)
  }
}
