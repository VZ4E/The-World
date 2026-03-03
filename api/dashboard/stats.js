const { getSupabase }   = require('../../lib/supabase')
const { authDashboard } = require('../../lib/auth-dashboard')

/**
 * GET /api/dashboard/stats
 *
 * High-level summary counts for the dashboard header cards.
 *
 * Response shape:
 * {
 *   creators:  { total, active },
 *   videos:    { total, transcribed, analyzed, failed },
 *   mentions:  { total, sponsored, organic, last_24h },
 *   pipeline:  { pending_transcription, pending_analysis }
 * }
 */
module.exports = async function handler(req, res) {
  if (!authDashboard(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const sb = getSupabase()

    const [
      creatorsAll,
      creatorsActive,
      videosTotal,
      videosTranscribed,
      videosAnalyzed,
      videosFailed,
      videosPendingTranscription,
      videosPendingAnalysis,
      mentionsTotal,
      mentionsSponsored,
      mentionsOrganic,
      mentions24h,
    ] = await Promise.all([
      sb.from('creators').select('id', { count: 'exact', head: true }),
      sb.from('creators').select('id', { count: 'exact', head: true }).eq('is_active', true),

      sb.from('videos').select('id', { count: 'exact', head: true }),
      sb.from('videos').select('id', { count: 'exact', head: true }).eq('transcription_status', 'completed'),
      sb.from('videos').select('id', { count: 'exact', head: true }).eq('analysis_status', 'completed'),
      sb.from('videos').select('id', { count: 'exact', head: true }).in('transcription_status', ['failed']).or('analysis_status.eq.failed'),

      sb.from('videos').select('id', { count: 'exact', head: true }).in('transcription_status', ['pending', 'processing']),
      sb.from('videos').select('id', { count: 'exact', head: true }).eq('transcription_status', 'completed').in('analysis_status', ['pending', 'processing']),

      sb.from('mentions').select('id', { count: 'exact', head: true }).eq('is_false_positive', false),
      sb.from('mentions').select('id', { count: 'exact', head: true }).eq('mention_type', 'sponsored').eq('is_false_positive', false),
      sb.from('mentions').select('id', { count: 'exact', head: true }).eq('mention_type', 'organic').eq('is_false_positive', false),
      sb.from('mentions').select('id', { count: 'exact', head: true }).eq('is_false_positive', false)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ])

    const errs = [creatorsAll, creatorsActive, videosTotal, videosTranscribed, videosAnalyzed,
      videosFailed, videosPendingTranscription, videosPendingAnalysis,
      mentionsTotal, mentionsSponsored, mentionsOrganic, mentions24h]
      .filter(r => r.error)

    if (errs.length) {
      console.error('[stats] Supabase errors:', errs.map(r => r.error))
      return res.status(500).json({ error: 'Database query failed' })
    }

    return res.status(200).json({
      creators: {
        total:  creatorsAll.count,
        active: creatorsActive.count,
      },
      videos: {
        total:       videosTotal.count,
        transcribed: videosTranscribed.count,
        analyzed:    videosAnalyzed.count,
        failed:      videosFailed.count,
      },
      mentions: {
        total:     mentionsTotal.count,
        sponsored: mentionsSponsored.count,
        organic:   mentionsOrganic.count,
        last_24h:  mentions24h.count,
      },
      pipeline: {
        pending_transcription: videosPendingTranscription.count,
        pending_analysis:      videosPendingAnalysis.count,
      },
    })
  } catch (err) {
    console.error('[stats] Unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

