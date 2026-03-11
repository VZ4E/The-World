/**
 * POST /api/dashboard/clear-pending
 *
 * Resets stuck/failed videos so the pipeline can retry them:
 *   - 'processing' → 'pending'  (stuck mid-run)
 *   - 'failed'     → 'pending'  (exhausted retries — reset retry_count too)
 *
 * Returns: { reset_transcription: number, reset_analysis: number }
 */

const { getSupabase } = require('../../lib/supabase')

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const supabase = getSupabase()

  // Reset stuck transcription jobs (processing or failed)
  const [tProcessing, tFailed, aProcessing, aFailed] = await Promise.all([
    supabase
      .from('videos')
      .update({ transcription_status: 'pending' })
      .eq('transcription_status', 'processing'),
    supabase
      .from('videos')
      .update({ transcription_status: 'pending', retry_count: 0, error_message: null })
      .eq('transcription_status', 'failed'),
    supabase
      .from('videos')
      .update({ analysis_status: 'pending' })
      .eq('analysis_status', 'processing'),
    supabase
      .from('videos')
      .update({ analysis_status: 'pending', error_message: null })
      .eq('analysis_status', 'failed'),
  ])

  const firstError = tProcessing.error || tFailed.error || aProcessing.error || aFailed.error
  if (firstError) return res.status(500).json({ error: firstError.message })

  return res.status(200).json({
    reset_transcription: (tProcessing.count ?? 0) + (tFailed.count ?? 0),
    reset_analysis:      (aProcessing.count ?? 0) + (aFailed.count ?? 0),
  })
}
