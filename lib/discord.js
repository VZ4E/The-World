/**
 * Discord webhook notifier — brand mention alerts.
 *
 * Sends a rich embed to DISCORD_WEBHOOK_URL whenever the analysis pipeline
 * detects sponsored mentions (or high-confidence organic mentions) in a video.
 *
 * Fire-and-forget — errors are logged but never rethrown so they cannot
 * break the main analysis pipeline.
 */

// Min confidence score to alert on organic mentions (sponsored always alerts)
const ORGANIC_CONFIDENCE_THRESHOLD = 0.85

const COLOR_SPONSORED = 0xff6b35 // orange  — paid deals
const COLOR_ORGANIC   = 0x2dd4aa // teal    — organic-only
const COLOR_MIXED     = 0x7b9ef8 // blue    — mixed bag

/**
 * Sends a Discord embed for notable brand mentions found in a single video.
 *
 * @param {object[]} mentions - All mention rows for this video (after DB insert)
 * @param {object}   video    - { id, title, video_url, thumbnail_url }
 * @param {object}   creator  - { name, handle, platform, avatar_url, channel_url }
 */
async function sendMentionAlert(mentions, video, creator) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) return // not configured — skip silently

  // Only notify for sponsored or high-confidence organic mentions
  const notable = mentions.filter(
    (m) =>
      m.mention_type === 'sponsored' ||
      (m.mention_type === 'organic' && (m.confidence_score ?? 0) >= ORGANIC_CONFIDENCE_THRESHOLD)
  )
  if (!notable.length) return

  const hasSponsored = notable.some((m) => m.mention_type === 'sponsored')
  const hasOrganic   = notable.some((m) => m.mention_type === 'organic')
  const color =
    hasSponsored && hasOrganic ? COLOR_MIXED :
    hasSponsored               ? COLOR_SPONSORED :
                                 COLOR_ORGANIC

  const platformLabel =
    creator.platform === 'tiktok' ? 'TikTok' :
    creator.platform === 'twitch' ? 'Twitch' :
    creator.platform ?? 'Unknown'

  const embed = {
    color,
    author: {
      name: `${creator.name} (@${creator.handle}) · ${platformLabel}`,
      url:      creator.channel_url  || undefined,
      icon_url: creator.avatar_url   || undefined,
    },
    title: video.title ? `🎯 ${video.title}` : '🎯 New Brand Mentions Detected',
    url:   video.video_url || undefined,
    thumbnail: video.thumbnail_url ? { url: video.thumbnail_url } : undefined,
    fields: notable.map((m) => ({
      name: [
        typeBadge(m.mention_type),
        `**${m.brand_name}**`,
        '·',
        sentimentEmoji(m.sentiment),
        m.sentiment,
        '·',
        `${Math.round((m.confidence_score ?? 0) * 100)}% conf`,
      ].join(' '),
      value: m.context_snippet
        ? `> ${m.context_snippet.slice(0, 250)}`
        : '*no snippet available*',
      inline: false,
    })),
    footer: {
      text: `Project Signal · ${notable.length} notable mention${notable.length !== 1 ? 's' : ''}`,
    },
    timestamp: new Date().toISOString(),
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`[discord] Webhook returned ${res.status}: ${text.slice(0, 200)}`)
    } else {
      console.log(`[discord] Sent alert — ${notable.length} mention(s) from @${creator.handle}`)
    }
  } catch (err) {
    console.error('[discord] Webhook request failed:', err.message)
  }
}

function typeBadge(type) {
  if (type === 'sponsored') return '💰'
  if (type === 'organic')   return '🌿'
  return '❓'
}

function sentimentEmoji(sentiment) {
  if (sentiment === 'positive') return '✅'
  if (sentiment === 'negative') return '⚠️'
  return '➖'
}

module.exports = { sendMentionAlert }
