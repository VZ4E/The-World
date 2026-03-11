/**
 * TikTok Research API v2 — video fetcher
 *
 * Docs: https://developers.tiktok.com/doc/research-api-specs-query-videos
 * Auth: client_credentials (TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET)
 *
 * Requires TikTok Research API access approval.
 */

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const VIDEO_QUERY_URL = 'https://open.research.tiktok.com/api/video/query/'

// Fields requested from TikTok — only what we store
const VIDEO_FIELDS = [
  'id',
  'video_description',
  'create_time',
  'duration',
  'share_url',
  'view_count',
  'like_count',
  'comment_count',
  'thumbnail_url',
].join(',')

// How far back to look for videos (days). Wide enough for low-frequency creators.
const LOOKBACK_DAYS = 90

// Module-level token cache — valid for the lifetime of one function invocation
let cachedToken = null
let tokenExpiresAt = 0

/**
 * Fetches a client_credentials access token from TikTok.
 * Caches the token in memory and reuses it if still valid.
 */
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }

  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    grant_type: 'client_credentials',
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TikTok token request failed [${res.status}]: ${text}`)
  }

  const json = await res.json()

  if (!json.access_token) {
    throw new Error(`TikTok token response missing access_token: ${JSON.stringify(json)}`)
  }

  cachedToken = json.access_token
  // Subtract 60s from expiry as a safety buffer
  tokenExpiresAt = Date.now() + (json.expires_in - 60) * 1000

  return cachedToken
}

/**
 * Formats a Date to YYYYMMDD string required by the TikTok Research API.
 */
function formatDate(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * Fetches the most recent `limit` TikTok videos for a creator.
 *
 * @param {Object} creator  - Row from the creators table
 * @param {number} limit    - Max videos to return (default 7)
 * @returns {Array}         - Array of video objects shaped for the videos table
 */
async function fetchRecentVideos(creator, limit = 7) {
  const token = await getAccessToken()

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - LOOKBACK_DAYS)

  // Strip leading @ if present in the stored handle
  const username = creator.handle.replace(/^@/, '')

  const requestBody = {
    query: {
      and: [
        {
          field_name: 'username',
          field_values: [username],
          operation: 'EQ',
        },
      ],
    },
    start_date: formatDate(startDate),
    end_date: formatDate(endDate),
    max_count: limit,
    cursor: 0,
  }

  const res = await fetch(`${VIDEO_QUERY_URL}?fields=${VIDEO_FIELDS}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(
      `TikTok video query failed for @${username} [${res.status}]: ${text}`
    )
  }

  const json = await res.json()

  if (json.error?.code && json.error.code !== 'ok') {
    throw new Error(
      `TikTok API error for @${username}: ${JSON.stringify(json.error)}`
    )
  }

  const videos = json.data?.videos ?? []

  // Shape each TikTok video into a videos-table row
  return videos.map((v) => ({
    creator_id: creator.id,
    platform: 'tiktok',
    platform_video_id: String(v.id),
    title: v.video_description || null,
    video_url: v.share_url || null,
    thumbnail_url: v.thumbnail_url || null,
    duration_seconds: v.duration ? Math.round(v.duration) : null,
    view_count: v.view_count ?? null,
    like_count: v.like_count ?? null,
    comment_count: v.comment_count ?? null,
    published_at: v.create_time
      ? new Date(v.create_time * 1000).toISOString()
      : null,
    // Pipeline state — set to 'pending' so the transcription job picks them up
    transcription_status: 'pending',
    analysis_status: 'pending',
    retry_count: 0,
  }))
}

module.exports = { fetchRecentVideos }
