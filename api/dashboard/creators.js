const { getSupabase } = require('../../lib/supabase')

/**
 * GET /api/dashboard/creators
 *
 * All tracked creators with per-creator pipeline stats.
 *
 * Query params:
 *   platform   string   'tiktok' | 'twitch'
 *   active     boolean  '1' | 'true' — if set, only active creators
 *
 * Response shape:
 * {
 *   data: [
 *     {
 *       id, name, handle, platform, avatar_url, channel_url,
 *       follower_count, is_active, last_fetched_at,
 *       stats: {
 *         videos_total,
 *         videos_analyzed,
 *         mentions_total,
 *         mentions_sponsored,
 *         mentions_organic,
 *         top_brands: [ { brand_normalized, count } ]  -- top 5
 *       }
 *     }
 *   ]
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

    // 1. Fetch creators
    let creatorsQuery = sb
      .from('creators')
      .select('id, name, handle, platform, avatar_url, channel_url, follower_count, subscriber_count, is_active, last_fetched_at')
      .order('name', { ascending: true })

    if (req.query.platform) {
      creatorsQuery = creatorsQuery.eq('platform', req.query.platform)
    }
    if (req.query.active === '1' || req.query.active === 'true') {
      creatorsQuery = creatorsQuery.eq('is_active', true)
    }

    const { data: creators, error: creatorsErr } = await creatorsQuery

    if (creatorsErr) {
      console.error('[creators] Supabase error (creators):', creatorsErr)
      return res.status(500).json({ error: 'Database query failed' })
    }

    if (!creators.length) {
      return res.status(200).json({ data: [] })
    }

    const creatorIds = creators.map(c => c.id)

    // 2. Fetch video counts per creator (two statuses we care about)
    const { data: videoRows, error: videosErr } = await sb
      .from('videos')
      .select('creator_id, analysis_status')
      .in('creator_id', creatorIds)

    if (videosErr) {
      console.error('[creators] Supabase error (videos):', videosErr)
      return res.status(500).json({ error: 'Database query failed' })
    }

    // 3. Fetch mention counts per creator
    const { data: mentionRows, error: mentionsErr } = await sb
      .from('mentions')
      .select('creator_id, mention_type, brand_normalized')
      .in('creator_id', creatorIds)
      .eq('is_false_positive', false)

    if (mentionsErr) {
      console.error('[creators] Supabase error (mentions):', mentionsErr)
      return res.status(500).json({ error: 'Database query failed' })
    }

    // 4. Aggregate in JS
    const videoStats   = buildVideoStats(videoRows)
    const mentionStats = buildMentionStats(mentionRows)

    const data = creators.map(c => ({
      ...c,
      stats: {
        videos_total:       videoStats[c.id]?.total       ?? 0,
        videos_analyzed:    videoStats[c.id]?.analyzed    ?? 0,
        mentions_total:     mentionStats[c.id]?.total     ?? 0,
        mentions_sponsored: mentionStats[c.id]?.sponsored ?? 0,
        mentions_organic:   mentionStats[c.id]?.organic   ?? 0,
        top_brands:         mentionStats[c.id]?.top_brands ?? [],
      },
    }))

    return res.status(200).json({ data })
  } catch (err) {
    console.error('[creators] Unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

function buildVideoStats(rows) {
  const map = {}
  for (const row of rows) {
    const cid = row.creator_id
    if (!map[cid]) map[cid] = { total: 0, analyzed: 0 }
    map[cid].total++
    if (row.analysis_status === 'completed') map[cid].analyzed++
  }
  return map
}

function buildMentionStats(rows) {
  const map = {}
  for (const row of rows) {
    const cid = row.creator_id
    if (!map[cid]) map[cid] = { total: 0, sponsored: 0, organic: 0, brands: {} }
    map[cid].total++
    if (row.mention_type === 'sponsored') map[cid].sponsored++
    if (row.mention_type === 'organic')   map[cid].organic++
    map[cid].brands[row.brand_normalized] = (map[cid].brands[row.brand_normalized] || 0) + 1
  }
  // Build top_brands top-5 list per creator
  for (const cid of Object.keys(map)) {
    map[cid].top_brands = Object.entries(map[cid].brands)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([brand_normalized, count]) => ({ brand_normalized, count }))
    delete map[cid].brands
  }
  return map
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
