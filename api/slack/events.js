/**
 * Slack Events API handler — POST /api/slack/events
 *
 * Handles:
 *   - URL verification challenge (Slack setup)
 *   - app_mention  → user @mentions the bot in a channel
 *   - message.im   → user sends the bot a DM
 *
 * Setup in Slack app dashboard:
 *   Event Subscriptions → Enable Events
 *     Request URL: https://your-domain.com/api/slack/events
 *   Subscribe to bot events:
 *     - app_mention
 *     - message.im
 *
 * Message format:
 *   @RespawnBot senior-backend how do I optimize a query?
 *   @RespawnBot how do I break down this task?          (defaults to agent-organizer)
 */

const crypto = require('crypto')
const { parseAgent, runAgentForSlack } = require('../../lib/slack-agent')

module.exports.config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end',  () => resolve(data))
    req.on('error', reject)
  })
}

function verifySignature(rawBody, headers) {
  const secret = process.env.SLACK_SIGNING_SECRET
  if (!secret) {
    console.warn('[slack/events] SLACK_SIGNING_SECRET not set — skipping verification')
    return true
  }
  const sig = headers['x-slack-signature']
  const ts  = headers['x-slack-request-timestamp']
  if (!sig || !ts) return false
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false

  const computed = 'v0=' + crypto
    .createHmac('sha256', secret)
    .update(`v0:${ts}:${rawBody}`)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sig))
  } catch {
    return false
  }
}

// Track processed event IDs to prevent duplicate handling (in-memory, resets on cold start)
const processedEvents = new Set()

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const rawBody = await getRawBody(req)

  if (!verifySignature(rawBody, req.headers)) {
    res.status(401).json({ error: 'Invalid Slack signature' })
    return
  }

  let body
  try { body = JSON.parse(rawBody) } catch {
    res.status(400).json({ error: 'Invalid JSON' })
    return
  }

  // ── URL verification challenge (one-time during Slack app setup) ───────────
  if (body.type === 'url_verification') {
    res.json({ challenge: body.challenge })
    return
  }

  if (body.type !== 'event_callback') {
    res.status(200).end()
    return
  }

  const event = body.event || {}

  // Deduplicate (Slack may retry events)
  if (body.event_id && processedEvents.has(body.event_id)) {
    res.status(200).end()
    return
  }
  if (body.event_id) processedEvents.add(body.event_id)

  // Ignore bot's own messages
  if (event.bot_id || event.subtype === 'bot_message') {
    res.status(200).end()
    return
  }

  const { type, text = '', channel, ts, thread_ts, user } = event

  const isAppMention = type === 'app_mention'
  const isDM         = type === 'message' && event.channel_type === 'im'

  if (!isAppMention && !isDM) {
    res.status(200).end()
    return
  }

  // Acknowledge immediately — Slack requires 200 within 3 seconds
  res.status(200).end()

  const { agentId, message } = parseAgent(text)
  if (!message || message === '(no message)') return

  const sessionId = `slack-${user || 'anon'}-${Date.now()}`

  await runAgentForSlack({
    agentId,
    message,
    channelId: channel,
    threadTs: thread_ts || ts,  // reply in thread
    sessionId,
  }).catch((err) => console.error('[slack/events] background error:', err.message))
}
