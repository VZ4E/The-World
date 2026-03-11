/**
 * POST /api/dashboard/run-pipeline
 *
 * Manually triggers one batch of transcription + analysis immediately,
 * without waiting for the scheduled cron jobs.
 *
 * Processes up to 10 videos per call to stay within Vercel's timeout.
 * Click again to process the next batch.
 *
 * Returns: { found, transcribed, skipped, analyzed, mentions_found, errors }
 */

const { getSupabase }    = require('../../lib/supabase')
const { transcribeVideo } = require('../../lib/transcript24')
const { extractBrands }   = require('../../lib/claude')

const BATCH_SIZE   = 10
const MAX_RETRIES  = 3
const VALID_MENTION_TYPES = new Set(['sponsored', 'organic', 'unknown'])
const VALID_SENTIMENTS    = new Set(['positive', 'negative', 'neutral'])

/** Build a TikTok share URL from creator handle + video ID */
function buildTikTokUrl(video) {
  if (video.platform === 'tiktok' && video.platform_video_id && video.creators?.handle) {
    const handle = video.creators.handle.replace(/^@/, '')
    return `https://www.tiktok.com/@${handle}/video/${video.platform_video_id}`
  }
  return null
}

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
  const summary  = { found: 0, transcribed: 0, skipped: 0, analyzed: 0, mentions_found: 0, errors }

  // ── Step 1: Transcribe pending videos ─────────────────────────────────────
  const { data: toTranscribe, error: fetchErr } = await supabase
    .from('videos')
    .select('id, video_url, retry_count, platform, platform_video_id, creators(handle)')
    .eq('transcription_status', 'pending')
    .order('published_at', { ascending: false })
    .limit(BATCH_SIZE)

  if (fetchErr) return res.status(500).json({ error: fetchErr.message })

  summary.found = (toTranscribe ?? []).length

  for (const video of toTranscribe ?? []) {
    // Resolve URL — use stored URL or construct from video ID + handle
    let url = video.video_url
    if (!url) {
      url = buildTikTokUrl(video)
      if (url) {
        // Save constructed URL so future runs don't need to rebuild it
        await supabase.from('videos').update({ video_url: url }).eq('id', video.id)
      }
    }

    // Still no URL — can't transcribe, mark skipped
    if (!url) {
      await supabase.from('videos').update({ transcription_status: 'skipped' }).eq('id', video.id)
      summary.skipped++
      continue
    }

    try {
      const { text, captions } = await transcribeVideo(url)

      await supabase
        .from('videos')
        .update({
          transcription_status:  'completed',
          transcript_text:       text,
          transcript_words_json: captions,
          transcribed_at:        new Date().toISOString(),
          error_message:         null,
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
