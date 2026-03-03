/**
 * Resend — email alert notifier
 *
 * Sends a branded HTML email whenever the analysis pipeline detects sponsored
 * or high-confidence organic brand mentions in a video.
 *
 * Uses the Resend REST API directly (no SDK dependency) so we stay lightweight.
 *
 * Fire-and-forget — errors are logged but never rethrown.
 */

const ORGANIC_CONFIDENCE_THRESHOLD = 0.85
const RESEND_API_URL = 'https://api.resend.com/emails'

/**
 * Sends a brand mention alert email.
 *
 * @param {object[]} mentions - All mention rows for this video (after DB insert)
 * @param {object}   video    - { id, title, video_url, thumbnail_url }
 * @param {object}   creator  - { name, handle, platform, avatar_url, channel_url, alert_email }
 */
async function sendEmailAlert(mentions, video, creator) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return // not configured

  // Only alert for sponsored or high-confidence organic
  const notable = mentions.filter(
    (m) =>
      m.mention_type === 'sponsored' ||
      (m.mention_type === 'organic' && (m.confidence_score ?? 0) >= ORGANIC_CONFIDENCE_THRESHOLD)
  )
  if (!notable.length) return

  // Recipient: per-creator override → global fallback
  const to = creator.alert_email || process.env.ALERT_EMAIL_TO
  if (!to) return

  const from = process.env.RESEND_FROM_EMAIL || 'signal@respawnmediagroup.com'
  const platformLabel = creator.platform === 'tiktok' ? 'TikTok' : creator.platform === 'twitch' ? 'Twitch' : creator.platform ?? 'Unknown'
  const hasSponsored = notable.some((m) => m.mention_type === 'sponsored')

  const subject = hasSponsored
    ? `💰 Sponsored mention: ${notable.filter(m => m.mention_type === 'sponsored').map(m => m.brand_name).join(', ')} — @${creator.handle}`
    : `🌿 Brand mention: ${notable.map(m => m.brand_name).join(', ')} — @${creator.handle}`

  const html = buildEmailHtml(notable, video, creator, platformLabel)

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject, html }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`[resend] Email failed ${res.status}: ${text.slice(0, 200)}`)
    } else {
      const { id } = await res.json()
      console.log(`[resend] Sent email ${id} to ${to} — @${creator.handle}`)
    }
  } catch (err) {
    console.error('[resend] Request failed:', err.message)
  }
}

function buildEmailHtml(mentions, video, creator, platformLabel) {
  const rows = mentions.map((m) => {
    const typeColor = m.mention_type === 'sponsored' ? '#fb923c' : '#34d399'
    const typeBg    = m.mention_type === 'sponsored' ? '#fb923c22' : '#34d39922'
    const sentColor = m.sentiment === 'positive' ? '#34d399' : m.sentiment === 'negative' ? '#f87171' : '#94a3b8'
    const conf      = Math.round((m.confidence_score ?? 0) * 100)

    return `
    <tr style="border-top:1px solid #1a1e28">
      <td style="padding:12px 16px;vertical-align:top">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <strong style="color:#fff;font-size:15px">${esc(m.brand_name)}</strong>
          <span style="background:${typeBg};color:${typeColor};border:1px solid ${typeColor}44;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600">${m.mention_type}</span>
          <span style="color:${sentColor};font-size:12px">${m.sentiment}</span>
          <span style="color:#64748b;font-size:12px;margin-left:auto">${conf}% conf</span>
        </div>
        ${m.context_snippet ? `<p style="color:#94a3b8;font-size:13px;margin:0;font-style:italic">"${esc(m.context_snippet)}"</p>` : ''}
      </td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0f14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">

    <!-- Header -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
      <div style="width:32px;height:32px;background:#4f74f3;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:11px;flex-shrink:0">PS</div>
      <span style="color:#fff;font-weight:600;font-size:16px">Project Signal</span>
      <span style="background:#1a1e28;color:#64748b;border:1px solid #222736;padding:2px 8px;border-radius:4px;font-size:11px;font-family:monospace">ALERT</span>
    </div>

    <!-- Creator card -->
    <div style="background:#13161d;border:1px solid #222736;border-radius:12px;padding:16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px">
        ${creator.avatar_url
          ? `<img src="${esc(creator.avatar_url)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover" />`
          : `<div style="width:44px;height:44px;border-radius:50%;background:#222736;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600">${esc(creator.name[0])}</div>`}
        <div>
          <div style="color:#fff;font-weight:600;font-size:15px">${esc(creator.name)}</div>
          <div style="color:#64748b;font-size:13px">@${esc(creator.handle)} · ${platformLabel}</div>
        </div>
      </div>
    </div>

    <!-- Video card -->
    ${video.title ? `
    <div style="background:#13161d;border:1px solid #222736;border-radius:12px;overflow:hidden;margin-bottom:16px">
      ${video.thumbnail_url ? `<img src="${esc(video.thumbnail_url)}" style="width:100%;height:180px;object-fit:cover;display:block" />` : ''}
      <div style="padding:12px 16px">
        <div style="color:#fff;font-weight:600;margin-bottom:4px">${esc(video.title)}</div>
        ${video.video_url ? `<a href="${esc(video.video_url)}" style="color:#7b9ef8;font-size:13px;text-decoration:none">Watch video →</a>` : ''}
      </div>
    </div>` : ''}

    <!-- Mentions table -->
    <div style="background:#13161d;border:1px solid #222736;border-radius:12px;overflow:hidden;margin-bottom:24px">
      <div style="padding:12px 16px;border-bottom:1px solid #1a1e28">
        <span style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.05em;font-weight:600">${mentions.length} notable mention${mentions.length !== 1 ? 's' : ''}</span>
      </div>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
    </div>

    <!-- Footer -->
    <div style="color:#475569;font-size:12px;text-align:center">
      Project Signal · Brand intelligence for gaming creators<br/>
      <a href="https://respawnmediagroup.com" style="color:#7b9ef8;text-decoration:none">respawnmediagroup.com</a>
    </div>
  </div>
</body>
</html>`
}

function esc(s) {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

module.exports = { sendEmailAlert }
