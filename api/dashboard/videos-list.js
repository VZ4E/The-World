/**
 * GET /api/dashboard/videos-list
 *
 * Returns paginated videos with mention summary for each.
 * Query params:
 *   limit   int     default 50
 *   offset  int     default 0
 *   creator uuid    filter by creator_id
 *   label   string  'branded' | 'possible' | 'none' | 'pending'
 */

const { getSupabase } = require('../../lib/supabase')

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' })

  const supabase = getSupabase()
  const limit    = Math.min(parseInt(req.query.limit  || '50', 10), 100)
  const offset   = parseInt(req.query.offset || '0', 10)

  // 1. Fetch videos with creator info
  let q = supabase
    .from('videos')
    .select('id, creator_id, platform_video_id, title, video_url, thumbnail_url, duration_seconds, view_count, like_count, published_at, transcription_status, analysis_status, created_at, creators(id, name, handle, avatar_url, platform)')
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (req.query.creator) q = q.eq('creator_id', req.query.creator)

  const { data: videos, error: vErr } = await q
  if (vErr) return res.status(500).json({ error: vErr.message })
  if (!videos.length) return res.status(200).json({ videos: [], total: 0 })

  // 2. Fetch mentions for these videos
  const videoIds = videos.map(v => v.id)
  const { data: mentions, error: mErr } = await supabase
    .from('mentions')
    .select('video_id, brand_name, mention_type, confidence_score, sentiment')
    .in('video_id', videoIds)
    .eq('is_false_positive', false)

  if (mErr) return res.status(500).json({ error: mErr.message })

  // 3. Group mentions by video
  const mentionMap = {}
  for (const m of mentions ?? []) {
    if (!mentionMap[m.video_id]) mentionMap[m.video_id] = []
    mentionMap[m.video_id].push(m)
  }

  // 4. Classify each video
  const result = videos.map(v => {
    const vMentions = mentionMap[v.id] ?? []
    const hasSponsored = vMentions.some(m => m.mention_type === 'sponsored')
    const hasMentions  = vMentions.length > 0
    const maxConf      = vMentions.reduce((max, m) => Math.max(max, m.confidence_score ?? 0), 0)

    let label
    if (v.analysis_status !== 'completed' && v.analysis_status !== 'skipped') {
      label = 'pending'
    } else if (!hasMentions) {
      label = 'none'
    } else if (hasSponsored) {
      label = 'branded'
    } else {
      label = 'possible'
    }

    return {
      ...v,
      label,
      confidence: maxConf,
      brands: vMentions.map(m => ({ name: m.brand_name, type: m.mention_type, confidence: m.confidence_score, sentiment: m.sentiment })),
    }
  })

  // 5. Client-side label filter (applied after classification)
  const filtered = req.query.label ? result.filter(v => v.label === req.query.label) : result

  return res.status(200).json({ videos: filtered })
}
