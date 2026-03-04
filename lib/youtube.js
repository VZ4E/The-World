/**
 * Respawn Signal — YouTube Data API v3 integration
 *
 * Uses the free tier (no OAuth required — public data only).
 * Quota: 10,000 units/day free. Each search.list = 100 units;
 * each videos.list = 1 unit per page.
 *
 * Required env var:
 *   YOUTUBE_API_KEY — a server-side API key from Google Cloud Console
 *     (restrict to "YouTube Data API v3" and your Vercel IP/domain)
 *
 * Usage:
 *   const yt = require('./lib/youtube')
 *   const channel = await yt.getChannelByHandle('ninja')
 *   const videos  = await yt.getRecentVideos(channel.id, { maxResults: 10 })
 */

const BASE = 'https://www.googleapis.com/youtube/v3'

function apiKey() {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw new Error('YOUTUBE_API_KEY is not set')
  return key
}

/**
 * Internal fetch wrapper — throws on non-2xx with the YouTube error message.
 */
async function ytFetch(path, params = {}) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('key', apiKey())
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  }

  const res = await fetch(url.toString())
  const json = await res.json()

  if (!res.ok) {
    const msg = json?.error?.message ?? `YouTube API error ${res.status}`
    throw new Error(msg)
  }

  return json
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a YouTube @handle or legacy username to a channel object.
 * Returns { id, title, customUrl, description, thumbnailUrl, subscriberCount, videoCount }
 * or null if not found.
 *
 * @param {string} handle — with or without the leading '@'
 */
async function getChannelByHandle(handle) {
  const h = handle.startsWith('@') ? handle : `@${handle}`

  const data = await ytFetch('/channels', {
    part:       'snippet,statistics',
    forHandle:  h,
    maxResults: 1,
  })

  const item = data.items?.[0]
  if (!item) return null

  return normalizeChannel(item)
}

/**
 * Lookup a channel by its raw channel ID (UCxxxxxxxx).
 */
async function getChannelById(channelId) {
  const data = await ytFetch('/channels', {
    part: 'snippet,statistics',
    id:   channelId,
  })
  const item = data.items?.[0]
  if (!item) return null
  return normalizeChannel(item)
}

function normalizeChannel(item) {
  return {
    id:              item.id,
    title:           item.snippet.title,
    customUrl:       item.snippet.customUrl ?? null,
    description:     item.snippet.description ?? null,
    thumbnailUrl:    item.snippet.thumbnails?.default?.url ?? null,
    subscriberCount: parseInt(item.statistics?.subscriberCount ?? '0', 10),
    videoCount:      parseInt(item.statistics?.videoCount ?? '0', 10),
    viewCount:       parseInt(item.statistics?.viewCount ?? '0', 10),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent video fetch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the most recent public videos uploaded by a channel.
 *
 * @param {string} channelId
 * @param {object} opts
 * @param {number} [opts.maxResults=25]   — 1–50
 * @param {string} [opts.publishedAfter]  — ISO 8601, e.g. "2025-01-01T00:00:00Z"
 * @param {string} [opts.pageToken]       — for pagination
 *
 * @returns {{ videos: VideoItem[], nextPageToken: string|null }}
 */
async function getRecentVideos(channelId, opts = {}) {
  const { maxResults = 25, publishedAfter, pageToken } = opts

  // search.list to get video IDs — 100 quota units
  const searchData = await ytFetch('/search', {
    part:           'id',
    channelId,
    type:           'video',
    order:          'date',
    maxResults:     Math.min(maxResults, 50),
    publishedAfter,
    pageToken,
  })

  const ids = (searchData.items ?? []).map(i => i.id.videoId).filter(Boolean)
  if (!ids.length) return { videos: [], nextPageToken: null }

  // videos.list to get full metadata — 1 unit
  const videoData = await ytFetch('/videos', {
    part: 'snippet,statistics,contentDetails',
    id:   ids.join(','),
  })

  const videos = (videoData.items ?? []).map(normalizeVideo)

  return {
    videos,
    nextPageToken: searchData.nextPageToken ?? null,
  }
}

/**
 * Fetch a single video by ID.
 * Returns null if the video is unavailable or private.
 */
async function getVideo(videoId) {
  const data = await ytFetch('/videos', {
    part: 'snippet,statistics,contentDetails',
    id:   videoId,
  })
  const item = data.items?.[0]
  if (!item) return null
  return normalizeVideo(item)
}

function normalizeVideo(item) {
  return {
    id:              item.id,
    title:           item.snippet.title,
    description:     item.snippet.description ?? null,
    channelId:       item.snippet.channelId,
    channelTitle:    item.snippet.channelTitle,
    publishedAt:     item.snippet.publishedAt,
    thumbnailUrl:    item.snippet.thumbnails?.standard?.url
                     ?? item.snippet.thumbnails?.default?.url
                     ?? null,
    duration:        parseDuration(item.contentDetails?.duration ?? 'PT0S'),
    viewCount:       parseInt(item.statistics?.viewCount  ?? '0', 10),
    likeCount:       parseInt(item.statistics?.likeCount  ?? '0', 10),
    commentCount:    parseInt(item.statistics?.commentCount ?? '0', 10),
    videoUrl:        `https://www.youtube.com/watch?v=${item.id}`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Caption / transcript lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List available caption tracks for a video.
 * Note: downloading captions via the API requires OAuth.
 * This returns track metadata only (language, kind, isAutoSynced).
 *
 * @returns {CaptionTrack[]}
 */
async function getCaptionTracks(videoId) {
  try {
    const data = await ytFetch('/captions', {
      part:    'snippet',
      videoId,
    })
    return (data.items ?? []).map(item => ({
      id:          item.id,
      language:    item.snippet.language,
      kind:        item.snippet.trackKind,   // 'standard' | 'asr' | 'forced'
      isAutoSynced: item.snippet.isAutoSynced,
      name:        item.snippet.name,
    }))
  } catch {
    // Returns 403 if captions are disabled or video is not accessible
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quota-aware helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimate quota units for a planned fetch.
 * search.list = 100 units; videos.list = 1 unit per page.
 */
function estimateQuota({ searches = 0, videoLookups = 0 }) {
  return searches * 100 + videoLookups
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse ISO 8601 duration (e.g. "PT4M13S") to total seconds.
 */
function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  return (parseInt(m[1] ?? 0) * 3600)
       + (parseInt(m[2] ?? 0) * 60)
       + (parseInt(m[3] ?? 0))
}

module.exports = {
  getChannelByHandle,
  getChannelById,
  getRecentVideos,
  getVideo,
  getCaptionTracks,
  estimateQuota,
  // exported for testing
  _parseDuration: parseDuration,
}
