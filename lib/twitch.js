/**
 * Twitch Helix API — video fetcher
 *
 * Docs: https://dev.twitch.tv/docs/api/reference/#get-videos
 * Auth: App access token via client_credentials
 *
 * Fetches recent VODs, highlights, and uploads for a creator.
 */

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const VIDEOS_URL = 'https://api.twitch.tv/helix/videos'

// Module-level token cache — valid for the lifetime of one function invocation
let cachedToken = null
let tokenExpiresAt = 0

/**
 * Exchanges client credentials for a Twitch app access token.
 * Caches the token in memory and reuses it while valid.
 */
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }

  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    client_secret: process.env.TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials',
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twitch token request failed [${res.status}]: ${text}`)
  }

  const json = await res.json()

  if (!json.access_token) {
    throw new Error(`Twitch token response missing access_token: ${JSON.stringify(json)}`)
  }

  cachedToken = json.access_token
  // Subtract 60s as a safety buffer before expiry
  tokenExpiresAt = Date.now() + (json.expires_in - 60) * 1000

  return cachedToken
}

/**
 * Parses Twitch duration strings like "1h23m45s", "45m30s", "2h", "30m", "45s"
 * into total seconds.
 *
 * @param {string} str  - Twitch duration string
 * @returns {number|null}
 */
function parseDuration(str) {
  if (!str) return null
  const match = str.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!match || !match[0]) return null
  const h = parseInt(match[1] || '0', 10)
  const m = parseInt(match[2] || '0', 10)
  const s = parseInt(match[3] || '0', 10)
  return h * 3600 + m * 60 + s
}

/**
 * Fetches the most recent `limit` videos for a Twitch creator.
 *
 * type=all returns VODs (archives), highlights, and manual uploads.
 * sort=time returns newest first.
 *
 * @param {Object} creator  - Row from the creators table
 * @param {number} limit    - Max videos to return (default 7)
 * @returns {Array}         - Array of video objects shaped for the videos table
 */
async function fetchRecentVideos(creator, limit = 7) {
  const token = await getAccessToken()

  const params = new URLSearchParams({
    user_id: creator.platform_user_id,
    first: String(limit),
    sort: 'time',
    type: 'all', // VODs, highlights, uploads
  })

  const res = await fetch(`${VIDEOS_URL}?${params}`, {
    headers: {
      'Client-ID': process.env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(
      `Twitch videos API failed for @${creator.handle} [${res.status}]: ${text}`
    )
  }

  const json = await res.json()
  const videos = json.data ?? []

  return videos.map((v) => ({
    creator_id: creator.id,
    platform: 'twitch',
    platform_video_id: String(v.id),
    title: v.title || null,
    video_url: v.url || null,
    // Twitch returns thumbnail_url with %{width}x%{height} placeholders
    thumbnail_url: v.thumbnail_url
      ? v.thumbnail_url.replace('%{width}', '640').replace('%{height}', '360')
      : null,
    duration_seconds: parseDuration(v.duration),
    view_count: v.view_count ?? null,
    like_count: null,    // Helix API does not expose like count
    comment_count: null, // Helix API does not expose comment count
    published_at: v.created_at || null,
    // Pipeline state
    transcription_status: 'pending',
    analysis_status: 'pending',
  }))
}

module.exports = { fetchRecentVideos }
