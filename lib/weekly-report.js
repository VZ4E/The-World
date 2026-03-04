/**
 * Respawn Signal — Weekly Report Builder
 *
 * Generates an agency-framed HTML email summarising the past 7 days of
 * brand mention activity across all monitored creators.
 *
 * Usage (from an API route or cron):
 *   const { buildWeeklyReport, sendWeeklyReport } = require('./lib/weekly-report')
 *
 *   const html = await buildWeeklyReport({ clientName: 'Acme Agency' })
 *   await sendWeeklyReport(html, { to: 'client@agency.com', clientName: 'Acme Agency' })
 */

const RESEND_API_URL = 'https://api.resend.com/emails'

const { getSupabase } = require('./supabase')

// ─────────────────────────────────────────────────────────────────────────────
// Data aggregation
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWeeklyData() {
  const db = getSupabase()
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [mentionsRes, videosRes, creatorsRes] = await Promise.all([
    db
      .from('mentions')
      .select('*, creators(name, handle, platform, avatar_url, follower_count), videos(title, video_url, view_count, published_at)')
      .gte('created_at', since)
      .order('created_at', { ascending: false }),

    db
      .from('videos')
      .select('id, creator_id, view_count, published_at, analysis_status')
      .gte('published_at', since),

    db
      .from('creators')
      .select('id, name, handle, platform, follower_count, avatar_url')
      .eq('is_active', true),
  ])

  if (mentionsRes.error) throw new Error(mentionsRes.error.message)
  if (videosRes.error)   throw new Error(videosRes.error.message)
  if (creatorsRes.error) throw new Error(creatorsRes.error.message)

  return {
    mentions: mentionsRes.data ?? [],
    videos:   videosRes.data ?? [],
    creators: creatorsRes.data ?? [],
    since,
  }
}

// Aggregate brand leaderboard — top brands by mention count + sentiment
function buildBrandLeaderboard(mentions) {
  const map = {}
  for (const m of mentions) {
    const key = m.brand_normalized
    if (!map[key]) map[key] = { brand: m.brand_name, count: 0, sponsored: 0, organic: 0, positive: 0, negative: 0, neutral: 0, totalViews: 0 }
    map[key].count++
    map[key][m.mention_type]++
    map[key][m.sentiment]++
    map[key].totalViews += m.videos?.view_count ?? 0
  }
  return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10)
}

// Top creators by mention activity
function buildCreatorLeaderboard(mentions, creators) {
  const map = {}
  for (const m of mentions) {
    const id = m.creator_id
    if (!map[id]) {
      const c = m.creators ?? creators.find(x => x.id === id)
      map[id] = { name: c?.name, handle: c?.handle, platform: c?.platform, avatarUrl: c?.avatar_url, followerCount: c?.follower_count, mentions: 0, sponsored: 0, brands: new Set() }
    }
    map[id].mentions++
    if (m.mention_type === 'sponsored') map[id].sponsored++
    map[id].brands.add(m.brand_normalized)
  }
  return Object.values(map)
    .map(r => ({ ...r, brands: r.brands.size }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 6)
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the weekly report HTML string.
 *
 * @param {object} opts
 * @param {string} [opts.clientName]       — Agency/client name shown in header
 * @param {string} [opts.agencyName]       — Sender agency name in footer
 * @param {object} [opts.data]             — Pre-fetched data (skips DB query if provided)
 */
async function buildWeeklyReport({ clientName = 'Your Agency', agencyName = 'Respawn Signal', data } = {}) {
  const { mentions, videos, creators, since } = data ?? await fetchWeeklyData()

  const totalMentions    = mentions.length
  const sponsoredCount   = mentions.filter(m => m.mention_type === 'sponsored').length
  const organicCount     = mentions.filter(m => m.mention_type === 'organic').length
  const videosAnalyzed   = videos.filter(v => v.analysis_status === 'completed').length
  const totalReach       = mentions.reduce((sum, m) => sum + (m.videos?.view_count ?? 0), 0)
  const brandLeaderboard = buildBrandLeaderboard(mentions)
  const creatorBoard     = buildCreatorLeaderboard(mentions, creators)
  const activeCreators   = creators.length

  const weekLabel = formatDateRange(since)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Weekly Brand Intelligence Report — ${esc(clientName)}</title>
</head>
<body style="margin:0;padding:0;background:#0d0f14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#e2e8f0">
<div style="max-width:680px;margin:0 auto;padding:32px 16px">

  <!-- ── Header ── -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:36px;height:36px;background:#4f74f3;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff">RS</div>
      <div>
        <div style="color:#fff;font-weight:700;font-size:16px">Respawn Signal</div>
        <div style="color:#64748b;font-size:12px">Weekly Brand Intelligence</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="color:#94a3b8;font-size:13px;font-weight:600">${esc(clientName)}</div>
      <div style="color:#475569;font-size:12px">${weekLabel}</div>
    </div>
  </div>

  <!-- ── KPI row ── -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
    ${kpi('Brand Mentions', totalMentions, '#4f74f3')}
    ${kpi('Sponsored', sponsoredCount, '#fb923c')}
    ${kpi('Organic', organicCount, '#34d399')}
    ${kpi('Est. Reach', fmtNum(totalReach), '#a78bfa')}
  </div>

  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:24px">
    ${kpi('Creators Monitored', activeCreators, '#64748b')}
    ${kpi('Videos Analysed', videosAnalyzed, '#64748b')}
  </div>

  <!-- ── Brand Leaderboard ── -->
  ${brandLeaderboard.length ? `
  <div style="background:#13161d;border:1px solid #222736;border-radius:12px;overflow:hidden;margin-bottom:24px">
    <div style="padding:14px 16px;border-bottom:1px solid #1a1e28">
      <span style="color:#fff;font-weight:700;font-size:14px">Top Brands This Week</span>
      <span style="color:#475569;font-size:12px;margin-left:8px">by mention frequency</span>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <tr style="background:#0d0f14">
        <th style="padding:8px 16px;text-align:left;color:#475569;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">#</th>
        <th style="padding:8px 16px;text-align:left;color:#475569;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Brand</th>
        <th style="padding:8px 16px;text-align:center;color:#475569;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Mentions</th>
        <th style="padding:8px 16px;text-align:center;color:#475569;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Type</th>
        <th style="padding:8px 16px;text-align:right;color:#475569;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Est. Reach</th>
      </tr>
      ${brandLeaderboard.map((b, i) => `
      <tr style="border-top:1px solid #1a1e28">
        <td style="padding:10px 16px;color:#475569;font-size:13px">${i + 1}</td>
        <td style="padding:10px 16px">
          <span style="color:#fff;font-weight:600;font-size:14px">${esc(b.brand)}</span>
        </td>
        <td style="padding:10px 16px;text-align:center">
          <span style="background:#4f74f322;color:#7b9ef8;padding:2px 8px;border-radius:99px;font-size:13px;font-weight:700">${b.count}</span>
        </td>
        <td style="padding:10px 16px;text-align:center">
          ${b.sponsored > 0 ? `<span style="background:#fb923c22;color:#fb923c;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600">💰 ${b.sponsored} spons</span>` : ''}
          ${b.organic  > 0 ? `<span style="background:#34d39922;color:#34d399;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;margin-left:4px">🌿 ${b.organic} org</span>` : ''}
        </td>
        <td style="padding:10px 16px;text-align:right;color:#64748b;font-size:12px">${fmtNum(b.totalViews)}</td>
      </tr>`).join('')}
    </table>
  </div>` : ''}

  <!-- ── Creator Activity ── -->
  ${creatorBoard.length ? `
  <div style="background:#13161d;border:1px solid #222736;border-radius:12px;overflow:hidden;margin-bottom:24px">
    <div style="padding:14px 16px;border-bottom:1px solid #1a1e28">
      <span style="color:#fff;font-weight:700;font-size:14px">Creator Activity</span>
    </div>
    <div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px">
      ${creatorBoard.map(c => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px;background:#0d0f14;border-radius:8px">
        ${c.avatarUrl
          ? `<img src="${esc(c.avatarUrl)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0" />`
          : `<div style="width:36px;height:36px;border-radius:50%;background:#222736;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;flex-shrink:0;font-size:14px">${esc((c.name ?? '?')[0])}</div>`}
        <div style="flex:1;min-width:0">
          <div style="color:#fff;font-weight:600;font-size:13px">${esc(c.name)}</div>
          <div style="color:#64748b;font-size:12px">@${esc(c.handle)} · ${platformLabel(c.platform)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="color:#7b9ef8;font-weight:700;font-size:14px">${c.mentions} mentions</div>
          <div style="color:#475569;font-size:11px">${c.brands} brand${c.brands !== 1 ? 's' : ''} · ${c.sponsored} sponsored</div>
        </div>
      </div>`).join('')}
    </div>
  </div>` : ''}

  <!-- ── Opportunities callout ── -->
  ${sponsoredCount > 0 ? `
  <div style="background:#fb923c11;border:1px solid #fb923c33;border-radius:12px;padding:16px;margin-bottom:24px">
    <div style="color:#fb923c;font-weight:700;font-size:14px;margin-bottom:4px">💡 Agency Opportunity</div>
    <div style="color:#cbd5e1;font-size:13px;line-height:1.5">
      ${sponsoredCount} sponsored mention${sponsoredCount !== 1 ? 's' : ''} detected this week.
      These creators are already taking brand deals — they're open to partnerships.
      Cross-reference with your client's target demographics and reach out now while momentum is high.
    </div>
  </div>` : ''}

  <!-- ── Footer ── -->
  <div style="border-top:1px solid #1a1e28;padding-top:16px;color:#475569;font-size:12px;text-align:center;line-height:1.6">
    This report was generated by <strong style="color:#94a3b8">${esc(agencyName)}</strong>.<br/>
    Monitoring ${activeCreators} creator${activeCreators !== 1 ? 's' : ''} across TikTok, Twitch &amp; YouTube.<br/>
    <a href="https://respawnmediagroup.com" style="color:#7b9ef8;text-decoration:none">respawnmediagroup.com</a>
  </div>

</div>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Send via Resend
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send the weekly report email via Resend.
 *
 * @param {string} html            — Output from buildWeeklyReport()
 * @param {object} opts
 * @param {string} opts.to         — Recipient email
 * @param {string} [opts.clientName]
 * @param {string} [opts.from]     — Defaults to RESEND_FROM_EMAIL env var
 */
async function sendWeeklyReport(html, { to, clientName = 'Your Agency', from } = {}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set')

  const sender    = from ?? process.env.RESEND_FROM_EMAIL ?? 'signal@respawnmediagroup.com'
  const recipient = to   ?? process.env.REPORT_EMAIL_TO
  if (!recipient) throw new Error('No recipient — set REPORT_EMAIL_TO or pass opts.to')

  const subject = `Weekly Brand Intelligence — ${clientName} — ${formatDateRange(new Date(Date.now() - 7 * 86400000).toISOString())}`

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from: sender, to: recipient, subject, html }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Resend error ${res.status}: ${text.slice(0, 200)}`)
  }

  const { id } = await res.json()
  console.log(`[weekly-report] Sent ${id} → ${recipient}`)
  return id
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function kpi(label, value, color) {
  return `
  <div style="background:#13161d;border:1px solid #222736;border-radius:10px;padding:14px 16px;text-align:center">
    <div style="color:${color};font-size:22px;font-weight:800;line-height:1">${value}</div>
    <div style="color:#64748b;font-size:11px;margin-top:4px;text-transform:uppercase;letter-spacing:.05em">${label}</div>
  </div>`
}

function fmtNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function platformLabel(p) {
  if (p === 'tiktok')   return 'TikTok'
  if (p === 'twitch')   return 'Twitch'
  if (p === 'youtube')  return 'YouTube'
  return p ?? 'Unknown'
}

function formatDateRange(sinceIso) {
  const from = new Date(sinceIso)
  const to   = new Date()
  const fmt  = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(from)} – ${fmt(to)}, ${to.getFullYear()}`
}

function esc(s) {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

module.exports = { buildWeeklyReport, sendWeeklyReport, fetchWeeklyData }
