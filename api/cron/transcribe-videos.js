/**
 * POST /api/cron/transcribe-videos
 *
 * Vercel cron job — runs daily at 06:10 UTC (10 min after fetch-videos).
 *
 * Finds all videos with transcription_status = 'pending' and transcribes them
 * via Transcript24 (https://www.transcript24.com/transcript-api).
 *
 * Unlike the previous AssemblyAI flow, Transcript24 is synchronous — the
 * transcript is returned in a single request, so no separate polling job
 * is needed. check-transcriptions.js is no longer used.
 *
 * Transcript24 accepts public TikTok share URLs directly, which is exactly
 * what we store in video_url from the RapidAPI fetcher.
 *
 * Retry logic:
 *   - On failure: increment retry_count, keep status 'pending'
 *   - After 3 failures: set status 'failed' so the video is skipped
 */

const { getSupabase } = require('../../lib/supabase')
const { transcribeVideo } = require('../../lib/transcript24')

const MAX_RETRIES = 3
const BATCH_SIZE = 20 // keep within Vercel's 300s function timeout

module.exports = async function handler(req, res) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const cronSecret = process.env.PIPELINE_CRON_SECRET
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = getSupabase()
  const runStarted = new Date().toISOString()

  console.log(`[transcribe-videos] Pipeline started at ${runStarted}`)

  // ── Load pending videos ────────────────────────────────────────────────────
  const { data: videos, error } = await supabase
    .from('videos')
    .select('id, video_url, retry_count')
    .eq('transcription_status', 'pending')
    .not('video_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[transcribe-videos] Failed to load pending videos:', error.message)
    return res.status(500).json({ error: error.message })
  }

  console.log(`[transcribe-videos] Transcribing ${videos.length} videos via Transcript24`)

  const summary = {
    run_started_at: runStarted,
    total_pending: videos.length,
    completed: 0,
    failed: 0,
    errors: [],
  }

  // ── Transcribe each video ──────────────────────────────────────────────────
  for (const video of videos) {
    try {
      const { text, captions, taskCredits } = await transcribeVideo(video.video_url)

      const { error: updateError } = await supabase
        .from('videos')
        .update({
          transcription_status: 'completed',
          transcript_text:      text,
          transcript_words_json: captions,  // [{ start_time, end_time, text }, ...]
          transcribed_at:       new Date().toISOString(),
          error_message:        null,
          // analysis_status remains 'pending' — analyze-mentions.js picks it up
        })
        .eq('id', video.id)

      if (updateError) throw new Error(`DB update failed: ${updateError.message}`)

      summary.completed++
      console.log(
        `[transcribe-videos] Completed video ${video.id} ` +
        `(${captions.length} captions, ${taskCredits ?? '?'} credits used)`
      )
    } catch (err) {
      console.error(`[transcribe-videos] Failed video ${video.id}:`, err.message)

      const retryCount = (video.retry_count ?? 0) + 1
      const newStatus = retryCount >= MAX_RETRIES ? 'failed' : 'pending'

      await supabase
        .from('videos')
        .update({
          transcription_status: newStatus,
          retry_count:          retryCount,
          error_message:        err.message,
        })
        .eq('id', video.id)

      summary.failed++
      summary.errors.push({ video_id: video.id, error: err.message })
    }
  }

  const runFinished = new Date().toISOString()
  summary.run_finished_at = runFinished

  console.log('[transcribe-videos] Pipeline complete:', JSON.stringify(summary))

  return res.status(200).json(summary)
}
