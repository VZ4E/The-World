/**
 * POST /api/cron/analyze-mentions
 *
 * Vercel cron job — runs every 30 minutes.
 *
 * Picks up videos where:
 *   transcription_status = 'completed'
 *   analysis_status      = 'pending'
 *
 * For each video:
 *   1. Sends the transcript to Claude for brand extraction
 *   2. Inserts rows into the mentions table
 *   3. Updates the video's analysis_status to 'completed'
 *
 * Processes up to BATCH_SIZE videos per run to keep Claude costs predictable.
 */

const { getSupabase } = require('../../lib/supabase')
const { extractBrands } = require('../../lib/claude')

const BATCH_SIZE = 20
const VALID_MENTION_TYPES = new Set(['sponsored', 'organic', 'unknown'])
const VALID_SENTIMENTS = new Set(['positive', 'negative', 'neutral'])

module.exports = async function handler(req, res) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const cronSecret = process.env.PIPELINE_CRON_SECRET
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = getSupabase()
  const runStarted = new Date().toISOString()

  console.log(`[analyze-mentions] Pipeline started at ${runStarted}`)

  // ── Load videos ready for analysis ────────────────────────────────────────
  const { data: videos, error } = await supabase
    .from('videos')
    .select('id, transcript_text, creator_id, title, creators(handle)')
    .eq('transcription_status', 'completed')
    .eq('analysis_status', 'pending')
    .not('transcript_text', 'is', null)
    .order('transcribed_at', { ascending: true }) // oldest first (FIFO)
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[analyze-mentions] Failed to load videos:', error.message)
    return res.status(500).json({ error: error.message })
  }

  console.log(`[analyze-mentions] Analyzing ${videos.length} videos`)

  const summary = {
    run_started_at: runStarted,
    videos_analyzed: 0,
    total_mentions: 0,
    failed: 0,
    errors: [],
  }

  // ── Process each video ─────────────────────────────────────────────────────
  for (const video of videos) {
    const creatorHandle = video.creators?.handle ?? 'unknown'
    const tag = `[video ${video.id} / @${creatorHandle}]`

    try {
      // Optimistic lock — mark as processing before calling Claude
      const { error: lockError } = await supabase
        .from('videos')
        .update({ analysis_status: 'processing' })
        .eq('id', video.id)
        .eq('analysis_status', 'pending')

      if (lockError) throw new Error(`Lock failed: ${lockError.message}`)

      // Skip transcripts that are empty (silence, music-only, etc.)
      if (!video.transcript_text || video.transcript_text.trim().length < 20) {
        await supabase
          .from('videos')
          .update({ analysis_status: 'skipped', analyzed_at: new Date().toISOString() })
          .eq('id', video.id)
        console.log(`${tag} Skipped — transcript too short`)
        continue
      }

      // ── Call Claude ──────────────────────────────────────────────────────
      const { mentions, input_tokens, output_tokens } = await extractBrands(
        video.transcript_text,
        creatorHandle
      )

      // ── Update video row ─────────────────────────────────────────────────
      const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'

      const { error: videoUpdateError } = await supabase
        .from('videos')
        .update({
          analysis_status: 'completed',
          analysis_model: model,
          analysis_input_tokens: input_tokens,
          analysis_output_tokens: output_tokens,
          analyzed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', video.id)

      if (videoUpdateError) throw new Error(`Video update failed: ${videoUpdateError.message}`)

      // ── Insert mentions ──────────────────────────────────────────────────
      if (mentions.length > 0) {
        const mentionRows = mentions.map((m) => ({
          video_id: video.id,
          creator_id: video.creator_id,
          brand_name: String(m.brand_name || '').trim(),
          brand_normalized: String(m.brand_normalized || m.brand_name || '')
            .toLowerCase()
            .trim(),
          context_snippet: m.context_snippet || null,
          confidence_score:
            typeof m.confidence_score === 'number'
              ? Math.max(0, Math.min(1, m.confidence_score))
              : null,
          mention_type: VALID_MENTION_TYPES.has(m.mention_type) ? m.mention_type : 'unknown',
          sentiment: VALID_SENTIMENTS.has(m.sentiment) ? m.sentiment : 'neutral',
        }))

        const { error: insertError } = await supabase
          .from('mentions')
          .insert(mentionRows)

        if (insertError) throw new Error(`Mentions insert failed: ${insertError.message}`)

        summary.total_mentions += mentions.length
      }

      summary.videos_analyzed++
      console.log(`${tag} Done — ${mentions.length} brand mentions (${input_tokens}+${output_tokens} tokens)`)

    } catch (err) {
      console.error(`${tag} Error:`, err.message)

      await supabase
        .from('videos')
        .update({
          analysis_status: 'failed',
          error_message: err.message,
        })
        .eq('id', video.id)

      summary.failed++
      summary.errors.push({ video_id: video.id, error: err.message })
    }
  }

  const runFinished = new Date().toISOString()
  summary.run_finished_at = runFinished

  console.log('[analyze-mentions] Pipeline complete:', JSON.stringify(summary))

  return res.status(200).json(summary)
}
