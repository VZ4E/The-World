/**
 * Slack ↔ Agent bridge.
 *
 * Handles:
 *  - Parsing which agent to use from Slack message text
 *  - Running an agent with streaming via the Anthropic SDK
 *  - Posting live updates (handoffs, partial responses) back to Slack
 *  - Final Block Kit formatted response
 */

const Anthropic        = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')
const { AGENT_MAP, AGENTS } = require('./agents')

// Lazy singletons — avoid crashing at module load if env vars are missing
let _anthropic = null
let _supabase  = null

function getAnthropic() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set in environment variables')
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _anthropic
}

function getSupabase() {
  if (!_supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  }
  return _supabase
}

// ─── Slack Web API helper ─────────────────────────────────────────────────────
async function slackApi(method, payload) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) { console.warn('[slack-agent] SLACK_BOT_TOKEN not set'); return null }
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!json.ok) console.error(`[slack-agent] ${method} error:`, json.error)
  return json
}

// Post to a response_url (slash command delayed responses)
async function postToResponseUrl(url, payload) {
  if (!url) return
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) console.error('[slack-agent] response_url post failed:', res.status)
}

// ─── Agent name parser ────────────────────────────────────────────────────────
// Accepts: "@senior-backend ...", "senior-backend ...", "backend ...", or just "..."
function parseAgent(text = '') {
  const cleaned = text.trim().replace(/^<@[A-Z0-9]+>\s*/, '') // strip bot mention
  const words   = cleaned.split(/\s+/)
  const first   = words[0]?.replace(/^@/, '').toLowerCase() || ''

  // Exact ID match
  if (AGENT_MAP[first]) {
    return { agentId: first, message: words.slice(1).join(' ').trim() || '(no message)' }
  }

  // Partial match on id or name (e.g. "backend" → "senior-backend")
  const partial = AGENTS.find(
    (a) => a.id.includes(first) || a.name.toLowerCase().replace(/\s+/g, '-').includes(first)
  )
  if (partial && words.length > 1) {
    return { agentId: partial.id, message: words.slice(1).join(' ').trim() }
  }

  // Default: agent-organizer handles everything
  return { agentId: 'agent-organizer', message: cleaned || '(no message)' }
}

// ─── Block Kit builders ───────────────────────────────────────────────────────
function agentHeaderBlock(agent) {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `${agent.emoji} *${agent.name}* _${agent.role}_`,
    },
  }
}

function handoffBlock(fromAgent, toAgent, query) {
  return {
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `↔️ *${fromAgent.emoji} ${fromAgent.name}* consulting *${toAgent.emoji} ${toAgent.name}*  ·  _${query.slice(0, 120)}_`,
    }],
  }
}

function responseBlock(text) {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: text.slice(0, 2900) }, // Slack block text limit
  }
}

function footerBlock(agentId, sessionId) {
  return {
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `Respawn Signal Agent Studio · ${agentId} · <${process.env.APP_URL || ''}/agents|Open Studio>`,
    }],
  }
}

// ─── Consult tool (mirrors api/agents/chat.js) ────────────────────────────────
const CONSULT_TOOL = {
  name: 'consult_agent',
  description: 'Ask a specialist agent for expert input.',
  input_schema: {
    type: 'object',
    properties: {
      agent_id:  { type: 'string', description: 'The specialist agent ID to consult.' },
      query:     { type: 'string', description: 'The specific question to ask.' },
      context:   { type: 'string', description: 'Relevant context from the current conversation.' },
    },
    required: ['agent_id', 'query'],
  },
}

async function runConsultation(agentId, query, context) {
  const specialist = AGENT_MAP[agentId]
  if (!specialist) return `Agent "${agentId}" not found.`

  let result = ''
  const stream = getAnthropic().messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: specialist.system,
    messages: [{
      role: 'user',
      content: context ? `Context:\n${context}\n\nQuestion:\n${query}` : query,
    }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      result += event.delta.text
    }
  }
  return result
}

// ─── Main: run agent and post live updates to Slack ───────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.agentId     - which agent to run
 * @param {string} opts.message     - user's message
 * @param {string} opts.channelId   - Slack channel ID
 * @param {string} [opts.threadTs]  - thread timestamp to reply in
 * @param {string} [opts.responseUrl] - slash command response_url
 * @param {string} [opts.sessionId] - for Supabase persistence
 */
async function runAgentForSlack({ agentId, message, channelId, threadTs, responseUrl, sessionId = 'slack' }) {
  const agent = AGENT_MAP[agentId]
  if (!agent) return

  // ── Post "thinking" indicator ─────────────────────────────────────────────
  const thinkingPayload = {
    response_type: 'in_channel',
    blocks: [
      agentHeaderBlock(agent),
      { type: 'section', text: { type: 'mrkdwn', text: `_Processing your request…_` } },
    ],
  }

  let thinkingTs = null

  if (responseUrl) {
    await postToResponseUrl(responseUrl, thinkingPayload)
  } else if (channelId) {
    const posted = await slackApi('chat.postMessage', {
      channel: channelId,
      thread_ts: threadTs,
      blocks: thinkingPayload.blocks,
    })
    thinkingTs = posted?.ts
  }

  // ── Persist user message ──────────────────────────────────────────────────
  if (getSupabase()) {
    await getSupabase().from('agent_messages').insert({
      session_id: `slack-${sessionId}`,
      agent: agentId,
      role: 'user',
      content: message,
    })
  }

  // ── Run the agent ─────────────────────────────────────────────────────────
  let fullText     = ''
  const liveBlocks = [agentHeaderBlock(agent)]
  const toolUses   = []

  try {
    const stream = getAnthropic().messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: agent.system,
      tools: [CONSULT_TOOL],
      messages: [{ role: 'user', content: message }],
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text
      }
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        toolUses.push({ id: event.content_block.id, name: event.content_block.name, inputBuffer: '' })
      }
      if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
        const last = toolUses[toolUses.length - 1]
        if (last) last.inputBuffer += event.delta.partial_json
      }
    }

    const finalMsg = await stream.finalMessage()

    // ── Handle agent-to-agent consultations ──────────────────────────────────
    const toolResults = []

    for (const toolUse of toolUses) {
      let input = {}
      try { input = JSON.parse(toolUse.inputBuffer || '{}') } catch (_) {}

      const { agent_id: targetId, query, context } = input
      const targetAgent = AGENT_MAP[targetId] || {}

      // Post handoff notification immediately
      const handoffBlocks = [...liveBlocks, handoffBlock(agent, targetAgent, query || '')]

      if (channelId) {
        await slackApi('chat.postMessage', {
          channel: channelId,
          thread_ts: threadTs,
          blocks: handoffBlocks,
        })
      }

      if (getSupabase()) {
        await getSupabase().from('agent_messages').insert({
          session_id: `slack-${sessionId}`,
          agent: agentId,
          role: 'handoff',
          content: `Consulting ${targetId}: ${query}`,
          from_agent: agentId,
          to_agent: targetId,
        })
      }

      // Run the specialist
      const consultResult = await runConsultation(targetId, query, context)

      // Post specialist's response in thread
      if (channelId) {
        await slackApi('chat.postMessage', {
          channel: channelId,
          thread_ts: threadTs,
          blocks: [
            agentHeaderBlock(targetAgent),
            responseBlock(consultResult),
          ],
        })
      }

      if (getSupabase()) {
        await getSupabase().from('agent_messages').insert({
          session_id: `slack-${sessionId}`,
          agent: targetId,
          role: 'assistant',
          content: consultResult,
          from_agent: targetId,
        })
      }

      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: consultResult })
    }

    // ── If there were tool uses, get primary agent's synthesis ────────────────
    if (toolUses.length > 0) {
      fullText = ''
      const continuationStream = getAnthropic().messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: agent.system,
        tools: [CONSULT_TOOL],
        messages: [
          { role: 'user', content: message },
          { role: 'assistant', content: finalMsg.content },
          { role: 'user', content: toolResults },
        ],
      })

      for await (const event of continuationStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          fullText += event.delta.text
        }
      }
    }

    // ── Post final response ───────────────────────────────────────────────────
    const finalBlocks = [
      agentHeaderBlock(agent),
      responseBlock(fullText || '_(no response)_'),
      { type: 'divider' },
      footerBlock(agentId, sessionId),
    ]

    if (responseUrl) {
      await postToResponseUrl(responseUrl, {
        response_type: 'in_channel',
        replace_original: true,
        blocks: finalBlocks,
      })
    } else if (channelId) {
      if (thinkingTs) {
        // Update the "thinking..." message with the final answer
        await slackApi('chat.update', {
          channel: channelId,
          ts: thinkingTs,
          blocks: finalBlocks,
        })
      } else {
        await slackApi('chat.postMessage', {
          channel: channelId,
          thread_ts: threadTs,
          blocks: finalBlocks,
        })
      }
    }

    if (getSupabase()) {
      await getSupabase().from('agent_messages').insert({
        session_id: `slack-${sessionId}`,
        agent: agentId,
        role: 'assistant',
        content: fullText,
      })
    }
  } catch (err) {
    console.error('[slack-agent] run error:', err.message)
    const errPayload = {
      response_type: 'in_channel',
      replace_original: true,
      text: `❌ Agent error: ${err.message}`,
    }
    if (responseUrl) await postToResponseUrl(responseUrl, errPayload)
    else if (channelId) {
      await slackApi('chat.postMessage', {
        channel: channelId,
        thread_ts: threadTs,
        text: `❌ Agent error: ${err.message}`,
      })
    }
  }
}

module.exports = { parseAgent, runAgentForSlack, slackApi, postToResponseUrl }
