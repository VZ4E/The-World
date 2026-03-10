/**
 * TikTok — RapidAPI fallback fetcher
 *
 * Used when the TikTok Research API is unavailable (partner approval pending).
 * Activated automatically when RAPIDAPI_TIKTOK_KEY is set.
 *
 * Uses: tiktok-api23.p.rapidapi.com  (Lundehund's TikTok API on RapidAPI)
 * Sign up: https://rapidapi.com/Lundehund/api/tiktok-api23
 *
 * To use this fallback:
 *   1. Create a RapidAPI account and subscribe to "TikTok Scraper" (free tier available)
 *   2. Add RAPIDAPI_TIKTOK_KEY=your_key to .env
 *   3. The pipeline will use RapidAPI automatically instead of the Research API
 *
 * NOTE: Unofficial APIs can break if TikTok changes their internal API.
 * Research API access is the preferred long-term solution.
 */

const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com'
const POSTS_URL     = `https://${RAPIDAPI_HOST}/api/user/posts`

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
  url.searchParams.set('uniqueId', handle)        // tiktok-api23 uses camelCase
  url.searchParams.set('count', String(Math.min(limit, 35)))
  url.searchParams.set('cursor', '0')

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

  // tiktok-api23 returns { code, msg, data: { videos: [...], cursor, hasMore } }
  if (!json.data) {
    throw new Error(`TikTok RapidAPI unexpected response for @${handle}: ${JSON.stringify(json).slice(0, 200)}`)
  }

  const items = json.data?.videos ?? json.data?.itemList ?? json.data ?? []
  if (!Array.isArray(items)) {
    throw new Error(`TikTok RapidAPI: expected array, got ${typeof items} for @${handle}`)
  }

  return items.slice(0, limit).map((v) => {
    // Normalise across tiktok-api23 and other known RapidAPI TikTok scraper shapes
    const videoId    = String(v.video_id || v.aweme_id || v.id || '')
    // tiktok-api23: video URL is in v.video.playAddr.urlList[0]
    const shareUrl   = v.share_url
                    || v.video?.playAddr?.urlList?.[0]
                    || v.video?.play_addr?.url_list?.[0]
                    || null
    // tiktok-api23: cover is in v.video.cover.urlList[0]
    const cover      = v.video?.cover?.urlList?.[0]
                    || v.video_cover?.url_list?.[0]
                    || v.origin_cover?.url_list?.[0]
                    || v.thumbnail_url
                    || null
    // tiktok-api23: duration is in seconds directly on v.video.duration
    const duration   = v.video?.duration != null
                    ? Math.round(v.video.duration)
                    : (v.duration_seconds ?? null)
    const createTime = v.createTime || v.create_time

    return {
      creator_id:           creator.id,
      platform:             'tiktok',
      platform_video_id:    videoId,
      title:                v.desc || v.title || null,
      video_url:            shareUrl,
      thumbnail_url:        cover,
      duration_seconds:     duration,
      view_count:           v.stats?.playCount    ?? v.statistics?.play_count    ?? v.playCount    ?? null,
      like_count:           v.stats?.diggCount    ?? v.statistics?.digg_count    ?? v.diggCount    ?? null,
      comment_count:        v.stats?.commentCount ?? v.statistics?.comment_count ?? v.commentCount ?? null,
      published_at:         createTime ? new Date(Number(createTime) * 1000).toISOString() : null,
      transcription_status: 'pending',
      analysis_status:      'pending',
    }
  }).filter(v => v.platform_video_id) // drop any with no ID
}

module.exports = { fetchRecentVideos }
