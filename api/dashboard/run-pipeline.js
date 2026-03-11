/**
 * POST /api/dashboard/run-pipeline
 *
 * Manually triggers one batch of transcription + analysis immediately,
 * without waiting for the scheduled cron jobs.
 *
 * Processes up to 10 videos per call to stay within Vercel's timeout.
 * Click again to process the next batch.
 *
 * Returns: { transcribed: number, analyzed: number, mentions_found: number, errors: [...] }
 */

const { getSupabase }    = require('../../lib/supabase')
const { transcribeVideo } = require('../../lib/transcript24')
const { extractBrands }   = require('../../lib/claude')

const BATCH_SIZE   = 10
const MAX_RETRIES  = 3
const VALID_MENTION_TYPES = new Set(['sponsored', 'organic', 'unknown'])
const VALID_SENTIMENTS    = new Set(['positive', 'negative', 'neutral'])

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const supabase = getSupabase()
  const errors   = []
  const summary  = { transcribed: 0, analyzed: 0, mentions_found: 0, errors }

  // ── Step 1: Transcribe pending videos ─────────────────────────────────────
  const { data: toTranscribe } = await supabase
    .from('videos')
    .select('id, video_url, retry_count')
    .eq('transcription_status', 'pending')
    .not('video_url', 'is', null)
    .or(`retry_count.is.null,retry_count.lt.${MAX_RETRIES}`)
    .order('published_at', { ascending: false })
    .limit(BATCH_SIZE)

  for (const video of toTranscribe ?? []) {
    try {
      const { text, captions } = await transcribeVideo(video.video_url)

      await supabase
        .from('videos')
        .update({
          transcription_status: 'completed',
          transcript_text:      text,
          transcript_words_json: captions,
          transcribed_at:       new Date().toISOString(),
          error_message:        null,
        })
        .eq('id', video.id)

      summary.transcribed++
    } catch (err) {
      const retryCount = (video.retry_count ?? 0) + 1
      await supabase
        .from('videos')
        .update({
          transcription_status: retryCount >= MAX_RETRIES ? 'failed' : 'pending',
          retry_count:          retryCount,
          error_message:        err.message,
        })
        .eq('id', video.id)

      errors.push({ stage: 'transcribe', video_id: video.id, error: err.message })
    }
  }

  // ── Step 2: Analyze transcribed videos ────────────────────────────────────
  const { data: toAnalyze } = await supabase
    .from('videos')
    .select('id, transcript_text, creator_id, creators(handle)')
    .eq('transcription_status', 'completed')
    .eq('analysis_status', 'pending')
    .not('transcript_text', 'is', null)
    .order('transcribed_at', { ascending: true })
    .limit(BATCH_SIZE)

  for (const video of toAnalyze ?? []) {
    const creatorHandle = video.creators?.handle ?? 'unknown'
    try {
      // Optimistic lock
      const { error: lockError } = await supabase
        .from('videos')
        .update({ analysis_status: 'processing' })
        .eq('id', video.id)
        .eq('analysis_status', 'pending')

      if (lockError) throw new Error(`Lock failed: ${lockError.message}`)

      if (!video.transcript_text || video.transcript_text.trim().length < 20) {
        await supabase
          .from('videos')
          .update({ analysis_status: 'skipped', analyzed_at: new Date().toISOString() })
          .eq('id', video.id)
        continue
      }

      const { mentions, input_tokens, output_tokens } = await extractBrands(
        video.transcript_text,
        creatorHandle
      )

      await supabase
        .from('videos')
        .update({
          analysis_status:        'completed',
          analysis_model:         process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
          analysis_prompt_tokens: input_tokens,
          analysis_output_tokens: output_tokens,
          analyzed_at:            new Date().toISOString(),
          error_message:          null,
        })
        .eq('id', video.id)

      if (mentions.length > 0) {
        const mentionRows = mentions.map(m => ({
          video_id:         video.id,
          creator_id:       video.creator_id,
          brand_name:       String(m.brand_name || '').trim(),
          brand_normalized: String(m.brand_normalized || m.brand_name || '').toLowerCase().trim(),
          context_snippet:  m.context_snippet  || null,
          confidence_score: typeof m.confidence_score === 'number'
            ? Math.max(0, Math.min(1, m.confidence_score)) : null,
          mention_type: VALID_MENTION_TYPES.has(m.mention_type) ? m.mention_type : 'unknown',
          sentiment:    VALID_SENTIMENTS.has(m.sentiment)    ? m.sentiment    : 'neutral',
        }))

        await supabase.from('mentions').insert(mentionRows)
        summary.mentions_found += mentions.length
      }

      summary.analyzed++
    } catch (err) {
      await supabase
        .from('videos')
        .update({ analysis_status: 'failed', error_message: err.message })
        .eq('id', video.id)

      errors.push({ stage: 'analyze', video_id: video.id, error: err.message })
    }
  }

  return res.status(200).json(summary)
}
