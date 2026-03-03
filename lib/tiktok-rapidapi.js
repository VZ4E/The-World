/**
 * TikTok — RapidAPI fallback fetcher
 *
 * Used when the TikTok Research API is unavailable (partner approval pending).
 * Activated automatically when RAPIDAPI_TIKTOK_KEY is set.
 *
 * Uses: tiktok-scraper7.p.rapidapi.com  (most popular TikTok scraper on RapidAPI)
 * Sign up: https://rapidapi.com/Lundehund/api/tiktok-scraper7
 *
 * To use this fallback:
 *   1. Create a RapidAPI account and subscribe to "TikTok Scraper" (free tier available)
 *   2. Add RAPIDAPI_TIKTOK_KEY=your_key to .env
 *   3. The pipeline will use RapidAPI automatically instead of the Research API
 *
 * NOTE: Unofficial APIs can break if TikTok changes their internal API.
 * Research API access is the preferred long-term solution.
 */

const RAPIDAPI_HOST = 'tiktok-scraper7.p.rapidapi.com'
const POSTS_URL     = `https://${RAPIDAPI_HOST}/user/posts`

/**
 * Fetches the most recent `limit` TikTok videos for a creator via RapidAPI.
 *
 * @param {Object} creator  - Row from the creators table
 * @param {number} limit    - Max videos to return (default 7)
 * @returns {Array}         - Array of video objects shaped for the videos table
 */
async function fetchRecentVideos(creator, limit = 7) {
  const apiKey = process.env.RAPIDAPI_TIKTOK_KEY
  if (!apiKey) throw new Error('RAPIDAPI_TIKTOK_KEY is not set')

  const handle = creator.handle.replace(/^@/, '')

  const url = new URL(POSTS_URL)
  url.searchParams.set('unique_id', handle)
  url.searchParams.set('count', String(Math.min(limit, 30))) // RapidAPI max is 30

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-rapidapi-key':  apiKey,
      'x-rapidapi-host': RAPIDAPI_HOST,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(
      `TikTok RapidAPI failed for @${handle} [${res.status}]: ${text.slice(0, 300)}`
    )
  }

  const json = await res.json()

  if (!json.data) {
    throw new Error(`TikTok RapidAPI unexpected response for @${handle}: ${JSON.stringify(json).slice(0, 200)}`)
  }

  const items = json.data?.videos ?? json.data?.itemList ?? json.data ?? []
  if (!Array.isArray(items)) {
    throw new Error(`TikTok RapidAPI: expected array, got ${typeof items} for @${handle}`)
  }

  return items.slice(0, limit).map((v) => {
    // RapidAPI scraper fields vary slightly by version — normalise all known shapes
    const videoId     = String(v.video_id || v.aweme_id || v.id || '')
    const shareUrl    = v.share_url || v.video?.play_addr?.url_list?.[0] || null
    const cover       = v.video_cover?.url_list?.[0] || v.origin_cover?.url_list?.[0] || v.thumbnail_url || null
    const duration    = v.video?.duration ? Math.round(v.video.duration / 1000) : (v.duration_seconds ?? null)
    const createTime  = v.create_time || v.createTime

    return {
      creator_id:           creator.id,
      platform:             'tiktok',
      platform_video_id:    videoId,
      title:                v.desc || v.title || null,
      video_url:            shareUrl,
      thumbnail_url:        cover,
      duration_seconds:     duration,
      view_count:           v.statistics?.play_count    ?? v.playCount    ?? null,
      like_count:           v.statistics?.digg_count    ?? v.diggCount    ?? null,
      comment_count:        v.statistics?.comment_count ?? v.commentCount ?? null,
      published_at:         createTime ? new Date(Number(createTime) * 1000).toISOString() : null,
      transcription_status: 'pending',
      analysis_status:      'pending',
    }
  }).filter(v => v.platform_video_id) // drop any with no ID
}

module.exports = { fetchRecentVideos }
