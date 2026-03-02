/**
 * POST /api/cron/check-transcriptions
 *
 * Vercel cron job — runs every 30 minutes.
 *
 * Polls AssemblyAI for all videos in transcription_status = 'processing'.
 * On completion:
 *   - Saves the transcript text + word-level data to the video row
 *   - Sets transcription_status = 'completed' (analysis_status stays 'pending'
 *     so analyze-mentions.js will pick it up)
 * On error:
 *   - Sets transcription_status = 'failed', analysis_status = 'skipped'
 */

const { getSupabase } = require('../../lib/supabase')
const { getTranscript } = require('../../lib/assemblyai')

const BATCH_SIZE = 100 // max in-flight jobs to poll per run

module.exports = async function handler(req, res) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const cronSecret = process.env.PIPELINE_CRON_SECRET
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = getSupabase()
  const runStarted = new Date().toISOString()

  console.log(`[check-transcriptions] Poll started at ${runStarted}`)

  // ── Load processing videos ─────────────────────────────────────────────────
  const { data: videos, error } = await supabase
    .from('videos')
    .select('id, assemblyai_transcript_id')
    .eq('transcription_status', 'processing')
    .not('assemblyai_transcript_id', 'is', null)
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[check-transcriptions] Failed to load processing videos:', error.message)
    return res.status(500).json({ error: error.message })
  }

  console.log(`[check-transcriptions] Checking ${videos.length} in-flight jobs`)

  const summary = {
    run_started_at: runStarted,
    checked: videos.length,
    completed: 0,
    failed: 0,
    still_processing: 0,
  }

  // ── Poll each job ──────────────────────────────────────────────────────────
  for (const video of videos) {
    try {
      const transcript = await getTranscript(video.assemblyai_transcript_id)

      if (transcript.status === 'completed') {
        const { error: updateError } = await supabase
          .from('videos')
          .update({
            transcription_status: 'completed',
            transcript_text: transcript.text || '',
            transcript_confidence: transcript.confidence ?? null,
            // Store word-level data as JSON for future timestamp-based lookups
            transcript_words_json: transcript.words ?? null,
            transcribed_at: new Date().toISOString(),
            error_message: null,
            // analysis_status remains 'pending' — analyze-mentions.js picks it up
          })
          .eq('id', video.id)

        if (updateError) throw new Error(`DB update failed: ${updateError.message}`)

        summary.completed++
        console.log(
          `[check-transcriptions] Completed: video ${video.id} ` +
          `(${transcript.words?.length ?? 0} words, ` +
          `${Math.round(transcript.audio_duration ?? 0)}s audio)`
        )

      } else if (transcript.status === 'error') {
        await supabase
          .from('videos')
          .update({
            transcription_status: 'failed',
            analysis_status: 'skipped', // no transcript to analyze
            error_message: transcript.error ?? 'AssemblyAI returned error status',
          })
          .eq('id', video.id)

        summary.failed++
        console.warn(
          `[check-transcriptions] Failed: video ${video.id} — ${transcript.error}`
        )

      } else {
        // status is 'queued' or 'processing' — still working
        summary.still_processing++
      }

    } catch (err) {
      // Non-fatal: log and continue polling remaining videos
      console.error(
        `[check-transcriptions] Error checking video ${video.id}:`, err.message
      )
    }
  }

  const runFinished = new Date().toISOString()
  summary.run_finished_at = runFinished

  console.log('[check-transcriptions] Poll complete:', JSON.stringify(summary))

  return res.status(200).json(summary)
}
