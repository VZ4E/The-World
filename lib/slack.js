/**
 * Slack webhook notifier — brand mention alerts.
 *
 * Sends a Block Kit message to SLACK_WEBHOOK_URL (or a per-creator override)
 * whenever the analysis pipeline detects sponsored/high-confidence organic
 * brand mentions in a video.
 *
 * Fire-and-forget — errors are logged but never rethrown.
 */

const ORGANIC_CONFIDENCE_THRESHOLD = 0.85

/**
 * Sends a Slack Block Kit alert for notable brand mentions.
 *
 * @param {object[]} mentions - All mention rows for this video (after DB insert)
 * @param {object}   video    - { id, title, video_url, thumbnail_url }
 * @param {object}   creator  - { name, handle, platform, avatar_url, channel_url, slack_webhook_url }
 */
async function sendSlackAlert(mentions, video, creator) {
  // Per-creator override → global fallback
  const webhookUrl = creator.slack_webhook_url || process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return

  const notable = mentions.filter(
    (m) =>
      m.mention_type === 'sponsored' ||
      (m.mention_type === 'organic' && (m.confidence_score ?? 0) >= ORGANIC_CONFIDENCE_THRESHOLD)
  )
  if (!notable.length) return

  const platformLabel = creator.platform === 'tiktok' ? 'TikTok' : creator.platform === 'twitch' ? 'Twitch' : creator.platform ?? 'Unknown'
  const hasSponsored  = notable.some((m) => m.mention_type === 'sponsored')

  const headerText = hasSponsored
    ? `💰 *Sponsored mention detected* — @${creator.handle} on ${platformLabel}`
    : `🌿 *Brand mention detected* — @${creator.handle} on ${platformLabel}`

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🎯 Project Signal — Brand Alert', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: headerText },
      ...(creator.avatar_url
        ? { accessory: { type: 'image', image_url: creator.avatar_url, alt_text: creator.name } }
        : {}),
    },
  ]

  // Video section
  if (video.title) {
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Video*\n${video.video_url ? `<${video.video_url}|${video.title}>` : video.title}` },
        { type: 'mrkdwn', text: `*Creator*\n${creator.channel_url ? `<${creator.channel_url}|${creator.name}>` : creator.name}` },
      ],
    })
  }

  blocks.push({ type: 'divider' })

  // One section per notable mention
  for (const m of notable) {
    const typeEmoji = m.mention_type === 'sponsored' ? '💰' : '🌿'
    const sentEmoji = m.sentiment === 'positive' ? '✅' : m.sentiment === 'negative' ? '⚠️' : '➖'
    const conf      = Math.round((m.confidence_score ?? 0) * 100)

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `${typeEmoji} *${m.brand_name}*  ${sentEmoji} ${m.sentiment}  ·  ${conf}% confidence`,
          m.context_snippet ? `> ${m.context_snippet.slice(0, 250)}` : '',
        ].filter(Boolean).join('\n'),
      },
    })
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Project Signal  ·  ${notable.length} notable mention${notable.length !== 1 ? 's' : ''}  ·  ${new Date().toUTCString()}`,
      },
    ],
  })

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`[slack] Webhook returned ${res.status}: ${text.slice(0, 200)}`)
    } else {
      console.log(`[slack] Sent alert — ${notable.length} mention(s) from @${creator.handle}`)
    }
  } catch (err) {
    console.error('[slack] Webhook request failed:', err.message)
  }
}

module.exports = { sendSlackAlert }
