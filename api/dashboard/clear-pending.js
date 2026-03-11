/**
 * POST /api/dashboard/clear-pending
 *
 * Resets any videos stuck in 'processing' state back to 'pending'
 * so the next cron run picks them up again.
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

  const [transcriptionResult, analysisResult] = await Promise.all([
    supabase
      .from('videos')
      .update({ transcription_status: 'pending' })
      .eq('transcription_status', 'processing'),
    supabase
      .from('videos')
      .update({ analysis_status: 'pending' })
      .eq('analysis_status', 'processing'),
  ])

  if (transcriptionResult.error) {
    return res.status(500).json({ error: transcriptionResult.error.message })
  }
  if (analysisResult.error) {
    return res.status(500).json({ error: analysisResult.error.message })
  }

  return res.status(200).json({
    reset_transcription: transcriptionResult.count ?? 0,
    reset_analysis:      analysisResult.count      ?? 0,
  })
}
