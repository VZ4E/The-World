/**
 * Slack Slash Command handler — POST /api/slack/slash
 *
 * Usage in Slack:
 *   /agent <message>                        → agent-organizer handles it
 *   /agent senior-backend <message>         → routes to Senior Backend
 *   /agent @data-engineer <message>         → routes to Data Engineer
 *
 * Setup in Slack app dashboard:
 *   Slash Commands → Create New Command
 *     Command:      /agent
 *     Request URL:  https://your-domain.com/api/slack/slash
 *     Description:  Talk to a Respawn Signal specialist agent
 *     Usage hint:   [agent-name] your message
 */

const crypto = require('crypto')
const { parseAgent, runAgentForSlack } = require('../../lib/slack-agent')
const { AGENTS } = require('../../lib/agents')

// Disable Vercel's default body parser so we can verify the raw body signature
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
    console.warn('[slack/slash] SLACK_SIGNING_SECRET not set — skipping verification')
    return true
  }
  const sig = headers['x-slack-signature']
  const ts  = headers['x-slack-request-timestamp']
  if (!sig || !ts) return false
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false // replay attack guard

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

function parseUrlEncoded(raw) {
  return Object.fromEntries(new URLSearchParams(raw))
}

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

  const body = parseUrlEncoded(rawBody)
  const {
    text         = '',
    channel_id,
    user_id,
    user_name,
    response_url,
  } = body

  // Help command
  if (text.trim() === 'help' || text.trim() === '') {
    const agentList = AGENTS.map((a) => `• \`${a.id}\` — ${a.name}: ${a.role}`).join('\n')
    res.json({
      response_type: 'ephemeral',
      text: `*Respawn Signal Agent Studio*\n\nUsage: \`/agent [agent-name] your message\`\n\n*Available agents:*\n${agentList}\n\nExample: \`/agent senior-backend how do I optimize a PostgreSQL query?\`\nDefault (no agent name): routes to Agent Organizer`,
    })
    return
  }

  const { agentId, message } = parseAgent(text)
  const sessionId = `slack-${user_id || 'anon'}-${Date.now()}`

  // Acknowledge immediately — Slack requires a response within 3 seconds.
  // We then run the agent synchronously within the same function invocation,
  // posting the final result to response_url (valid for 30 minutes).
  res.json({
    response_type: 'in_channel',
    text: `_Routing to *${agentId}*…_`,
  })

  // Run agent — Vercel keeps the function alive for maxDuration after res is sent
  // so long as there is pending async work in the same invocation.
  try {
    await runAgentForSlack({
      agentId,
      message,
      channelId: channel_id,
      responseUrl: response_url,
      sessionId,
    })
  } catch (err) {
    console.error('[slack/slash] agent error:', err.message)
  }
}
