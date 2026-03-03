const { getSupabase }   = require('../../lib/supabase')
const { authDashboard } = require('../../lib/auth-dashboard')

/**
 * GET /api/dashboard/brands
 *
 * Top brands ranked by total mention count.
 * Useful for the "most-mentioned brands" leaderboard card.
 *
 * Query params:
 *   limit        int     default 20, max 100
 *   mention_type string  'organic' | 'sponsored' | 'unknown'  (all if omitted)
 *   platform     string  'tiktok' | 'twitch'  (all if omitted)
 *   from         ISO8601 created_at >=
 *   to           ISO8601 created_at <=
 *
 * Response shape:
 * {
 *   data: [
 *     {
 *       brand_normalized,
 *       brand_name,           -- most-common raw form
 *       total_mentions,
 *       sponsored_count,
 *       organic_count,
 *       creator_count,        -- how many distinct creators mentioned it
 *       avg_confidence,
 *       last_seen_at
 *     },
 *     ...
 *   ]
 * }
 */
const VALID_MENTION_TYPES = new Set(['organic', 'sponsored', 'unknown'])
const VALID_PLATFORMS     = new Set(['tiktok', 'twitch'])
const ROW_CAP             = 5000  // safety cap on mentions fetched for aggregation

module.exports = async function handler(req, res) {
  if (!authDashboard(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)))

    const sb = getSupabase()

    // Build the base query using the mentions table.
    // We can't do GROUP BY directly via the JS client, so we use a raw RPC or
    // simulate it by fetching then aggregating in JS. For correctness + performance
    // we call a Postgres function via rpc if available, otherwise fall back to JS.
    //
    // Strategy: pull all relevant mention rows (brand_normalized + fields needed for
    // aggregation) filtered by the user's params, then group in JS. This is fine for
    // dashboards where brand cardinality is low (hundreds, not millions).

    let query = sb
      .from('mentions')
      .select(
        `brand_name,
         brand_normalized,
         mention_type,
         confidence_score,
         created_at,
         creator_id,
         creators ( platform )`
      )
      .eq('is_false_positive', false)

    if (req.query.mention_type && VALID_MENTION_TYPES.has(req.query.mention_type)) {
      query = query.eq('mention_type', req.query.mention_type)
    }
    if (req.query.from) {
      query = query.gte('created_at', req.query.from)
    }
    if (req.query.to) {
      query = query.lte('created_at', req.query.to)
    }

    // Safety cap: prevent fetching unbounded rows for in-JS aggregation
    query = query.limit(ROW_CAP)

    const { data: rows, error } = await query

    if (error) {
      console.error('[brands] Supabase error:', error)
      return res.status(500).json({ error: 'Database query failed' })
    }

    // Filter by platform after fetch — validate enum first
    const filtered = (req.query.platform && VALID_PLATFORMS.has(req.query.platform))
      ? rows.filter(r => r.creators?.platform === req.query.platform)
      : rows

    // Aggregate by brand_normalized
    const map = new Map()

    for (const row of filtered) {
      const key = row.brand_normalized
      if (!map.has(key)) {
        map.set(key, {
          brand_normalized: key,
          brand_name:       row.brand_name,
          total_mentions:   0,
          sponsored_count:  0,
          organic_count:    0,
          creators:         new Set(),
          confidence_sum:   0,
          last_seen_at:     row.created_at,
        })
      }
      const agg = map.get(key)
      agg.total_mentions++
      if (row.mention_type === 'sponsored') agg.sponsored_count++
      if (row.mention_type === 'organic')   agg.organic_count++
      agg.creators.add(row.creator_id)
      agg.confidence_sum += Number(row.confidence_score || 0)
      if (row.created_at > agg.last_seen_at) agg.last_seen_at = row.created_at
    }

    const brands = Array.from(map.values())
      .sort((a, b) => b.total_mentions - a.total_mentions)
      .slice(0, limit)
      .map(({ confidence_sum, creators, ...rest }) => ({
        ...rest,
        creator_count:   creators.size,
        avg_confidence:  rest.total_mentions
          ? parseFloat((confidence_sum / rest.total_mentions).toFixed(3))
          : null,
      }))

    return res.status(200).json({ data: brands })
  } catch (err) {
    console.error('[brands] Unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

