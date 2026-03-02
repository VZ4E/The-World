const { getSupabase } = require('../../lib/supabase')

/**
 * GET /api/dashboard/pipeline
 *
 * Real-time pipeline health snapshot.
 * Useful for a status board showing backlog and stuck jobs.
 *
 * Response shape:
 * {
 *   transcription: {
 *     pending:    int,
 *     processing: int,
 *     completed:  int,
 *     failed:     int
 *   },
 *   analysis: {
 *     pending:    int,
 *     processing: int,
 *     completed:  int,
 *     failed:     int,
 *     skipped:    int
 *   },
 *   stuck: {
 *     transcription: [ video rows processing > 2h ],
 *     analysis:      [ video rows processing > 2h ]
 *   },
 *   recent_failures: [ last 10 failed videos with error_message ]
 * }
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getSupabase()
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

    const [
      tPending,
      tProcessing,
      tCompleted,
      tFailed,
      aPending,
      aProcessing,
      aCompleted,
      aFailed,
      aSkipped,
      stuckTranscription,
      stuckAnalysis,
      recentFailures,
    ] = await Promise.all([
      sb.from('videos').select('id', { count: 'exact', head: true }).eq('transcription_status', 'pending'),
      sb.from('videos').select('id', { count: 'exact', head: true }).eq('transcription_status', 'processing'),
      sb.from('videos').select('id', { count: 'exact', head: true }).eq('transcription_status', 'completed'),
      sb.from('videos').select('id', { count: 'exact', head: true }).eq('transcription_status', 'failed'),

      sb.from('videos').select('id', { count: 'exact', head: true }).eq('analysis_status', 'pending'),
      sb.from('videos').select('id', { count: 'exact', head: true }).eq('analysis_status', 'processing'),
      sb.from('videos').select('id', { count: 'exact', head: true }).eq('analysis_status', 'completed'),
      sb.from('videos').select('id', { count: 'exact', head: true }).eq('analysis_status', 'failed'),
      sb.from('videos').select('id', { count: 'exact', head: true }).eq('analysis_status', 'skipped'),

      // Videos stuck in 'processing' for more than 2 hours (likely zombie jobs)
      sb.from('videos')
        .select('id, title, platform, assemblyai_transcript_id, updated_at, creators(name, handle)')
        .eq('transcription_status', 'processing')
        .lt('updated_at', twoHoursAgo)
        .order('updated_at', { ascending: true })
        .limit(20),

      sb.from('videos')
        .select('id, title, platform, updated_at, creators(name, handle)')
        .eq('analysis_status', 'processing')
        .lt('updated_at', twoHoursAgo)
        .order('updated_at', { ascending: true })
        .limit(20),

      // Last 10 failed videos with their error messages
      sb.from('videos')
        .select('id, title, platform, transcription_status, analysis_status, error_message, retry_count, updated_at, creators(name, handle)')
        .or('transcription_status.eq.failed,analysis_status.eq.failed')
        .order('updated_at', { ascending: false })
        .limit(10),
    ])

    const errs = [tPending, tProcessing, tCompleted, tFailed,
      aPending, aProcessing, aCompleted, aFailed, aSkipped,
      stuckTranscription, stuckAnalysis, recentFailures]
      .filter(r => r.error)

    if (errs.length) {
      console.error('[pipeline] Supabase errors:', errs.map(r => r.error))
      return res.status(500).json({ error: 'Database query failed' })
    }

    return res.status(200).json({
      transcription: {
        pending:    tPending.count,
        processing: tProcessing.count,
        completed:  tCompleted.count,
        failed:     tFailed.count,
      },
      analysis: {
        pending:    aPending.count,
        processing: aProcessing.count,
        completed:  aCompleted.count,
        failed:     aFailed.count,
        skipped:    aSkipped.count,
      },
      stuck: {
        transcription: stuckTranscription.data,
        analysis:      stuckAnalysis.data,
      },
      recent_failures: recentFailures.data,
    })
  } catch (err) {
    console.error('[pipeline] Unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
