const { getSupabase }   = require('../../lib/supabase')
const { authDashboard } = require('../../lib/auth-dashboard')

/**
 * GET /api/dashboard/mentions
 *
 * Paginated, filterable list of brand mentions.
 *
 * Query params:
 *   page          int     default 1
 *   limit         int     default 25, max 100
 *   brand         string  partial match on brand_normalized
 *   creator_id    uuid    filter to one creator
 *   platform      string  'tiktok' | 'twitch'
 *   mention_type  string  'organic' | 'sponsored' | 'unknown'
 *   sentiment     string  'positive' | 'negative' | 'neutral'
 *   from          ISO8601 created_at >=
 *   to            ISO8601 created_at <=
 *
 * Response shape:
 * {
 *   data: [ mention rows with creator + video join ],
 *   meta: { page, limit, total }
 * }
 */
// Allowed enum values — reject anything outside these sets to prevent unexpected filter abuse
const VALID_MENTION_TYPES = new Set(['organic', 'sponsored', 'unknown'])
const VALID_SENTIMENTS    = new Set(['positive', 'negative', 'neutral'])
const VALID_PLATFORMS     = new Set(['tiktok', 'twitch'])
const MAX_DAYS            = 365

module.exports = async function handler(req, res) {
  if (!authDashboard(req, res)) return   // handles CORS + auth; returns 401/503 on failure

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)))
    const from  = (page - 1) * limit
    const to    = from + limit - 1

    const sb = getSupabase()

    let query = sb
      .from('mentions')
      .select(
        `id,
         brand_name,
         brand_normalized,
         context_snippet,
         timestamp_seconds,
         confidence_score,
         mention_type,
         sentiment,
         is_verified,
         is_false_positive,
         created_at,
         creators ( id, name, handle, platform, avatar_url ),
         videos   ( id, title, video_url, thumbnail_url, published_at, duration_seconds, view_count )`,
        { count: 'exact' }
      )
      .eq('is_false_positive', false)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (req.query.brand) {
      // Truncate to prevent excessive pattern lengths; Supabase uses prepared statements so no SQL injection risk
      const brandSearch = req.query.brand.toLowerCase().trim().slice(0, 100)
      query = query.ilike('brand_normalized', `%${brandSearch}%`)
    }
    if (req.query.creator_id) {
      query = query.eq('creator_id', req.query.creator_id)
    }
    if (req.query.platform && VALID_PLATFORMS.has(req.query.platform)) {
      query = query.eq('creators.platform', req.query.platform)
    }
    if (req.query.mention_type && VALID_MENTION_TYPES.has(req.query.mention_type)) {
      query = query.eq('mention_type', req.query.mention_type)
    }
    if (req.query.sentiment && VALID_SENTIMENTS.has(req.query.sentiment)) {
      query = query.eq('sentiment', req.query.sentiment)
    }
    // `days` convenience filter — overrides explicit `from`/`to`
    if (req.query.days) {
      const days = Math.min(MAX_DAYS, Math.max(1, parseInt(req.query.days, 10)))
      if (!isNaN(days)) {
        query = query.gte('created_at', new Date(Date.now() - days * 86400000).toISOString())
      }
    } else {
      if (req.query.from) query = query.gte('created_at', req.query.from)
      if (req.query.to)   query = query.lte('created_at', req.query.to)
    }

    const { data, count, error } = await query

    if (error) {
      console.error('[mentions] Supabase error:', error)
      return res.status(500).json({ error: 'Database query failed' })
    }

    return res.status(200).json({
      data,
      meta: { page, limit, total: count },
    })
  } catch (err) {
    console.error('[mentions] Unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

