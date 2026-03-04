/**
 * Agent Studio — streaming chat endpoint with agent-to-agent tool support.
 *
 * POST /api/agents/chat
 * Body: { agentId, messages: [{role, content}], sessionId }
 *
 * Streams Server-Sent Events:
 *   data: {"type":"text","agent":"senior-backend","content":"..."}
 *   data: {"type":"handoff","from":"senior-backend","to":"data-engineer","query":"..."}
 *   data: {"type":"consultant_text","from":"data-engineer","content":"..."}
 *   data: {"type":"done"}
 *   data: {"type":"error","message":"..."}
 */

const Anthropic       = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')
const { AGENT_MAP }   = require('../../lib/agents')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null

// Tool that allows an agent to consult another agent
const CONSULT_TOOL = {
  name: 'consult_agent',
  description: 'Ask a specialist agent for their expert input on a specific question. Use this when you need deep expertise from another domain.',
  input_schema: {
    type: 'object',
    properties: {
      agent_id: {
        type: 'string',
        description: 'The agent to consult. One of: agent-organizer, task-decomposition-expert, senior-backend, frontend-developer, data-engineer, llm-architect, prompt-engineer, model-evaluator, security-engineer, error-detective, search-specialist, report-generator',
      },
      query: {
        type: 'string',
        description: 'The specific question or task to ask the specialist agent.',
      },
      context: {
        type: 'string',
        description: 'Relevant context from the current conversation to give the specialist.',
      },
    },
    required: ['agent_id', 'query'],
  },
}

async function persistMessage(sessionId, agent, role, content, extra = {}) {
  if (!supabase) return
  await supabase.from('agent_messages').insert({
    session_id: sessionId,
    agent,
    role,
    content,
    ...extra,
  }).then(({ error }) => {
    if (error) console.error('[agent-studio] persist error:', error.message)
  })
}

async function consultAgent(agentId, query, context, sessionId, send) {
  const specialist = AGENT_MAP[agentId]
  if (!specialist) {
    return `Agent "${agentId}" not found.`
  }

  const consultMessages = [
    {
      role: 'user',
      content: context
        ? `Context from another agent:\n${context}\n\nQuestion for you:\n${query}`
        : query,
    },
  ]

  await persistMessage(sessionId, agentId, 'system', `Consulted by another agent: ${query}`, {
    from_agent: 'system',
    to_agent: agentId,
  })

  let fullResponse = ''

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: specialist.system,
    messages: consultMessages,
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullResponse += event.delta.text
      send({ type: 'consultant_text', from: agentId, content: event.delta.text })
    }
  }

  await persistMessage(sessionId, agentId, 'assistant', fullResponse, {
    from_agent: agentId,
    to_agent: null,
  })

  return fullResponse
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { agentId, messages, sessionId = 'default' } = req.body

  if (!agentId || !messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'agentId and messages are required' })
    return
  }

  const agent = AGENT_MAP[agentId]
  if (!agent) {
    res.status(404).json({ error: `Unknown agent: ${agentId}` })
    return
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // Persist the user's message
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  if (lastUserMsg) {
    await persistMessage(sessionId, agentId, 'user', lastUserMsg.content)
  }

  try {
    let fullResponse = ''
    const toolResults = []

    // First pass: stream with tool use enabled
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: agent.system,
      tools: [CONSULT_TOOL],
      messages,
    })

    let pendingToolUses = []

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          fullResponse += event.delta.text
          send({ type: 'text', agent: agentId, content: event.delta.text })
        }
      }

      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        pendingToolUses.push({
          id: event.content_block.id,
          name: event.content_block.name,
          inputBuffer: '',
        })
      }

      if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
        const last = pendingToolUses[pendingToolUses.length - 1]
        if (last) last.inputBuffer += event.delta.partial_json
      }
    }

    const finalMsg = await stream.finalMessage()

    // Process tool uses (agent-to-agent handoffs)
    if (pendingToolUses.length > 0) {
      const assistantContent = finalMsg.content

      for (const toolUse of pendingToolUses) {
        let input = {}
        try { input = JSON.parse(toolUse.inputBuffer || '{}') } catch (_) {}

        const { agent_id: targetId, query, context } = input

        // Notify the UI about the handoff
        send({
          type: 'handoff',
          from: agentId,
          to: targetId,
          query,
        })

        await persistMessage(sessionId, agentId, 'handoff',
          `Consulting ${targetId}: ${query}`,
          { from_agent: agentId, to_agent: targetId }
        )

        // Call the specialist agent
        const consultResult = await consultAgent(targetId, query, context, sessionId, send)

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: consultResult,
        })
      }

      // Second pass: let primary agent respond with the specialist's input
      const continuationStream = anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: agent.system,
        tools: [CONSULT_TOOL],
        messages: [
          ...messages,
          { role: 'assistant', content: assistantContent },
          { role: 'user', content: toolResults },
        ],
      })

      for await (const event of continuationStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          fullResponse += event.delta.text
          send({ type: 'text', agent: agentId, content: event.delta.text })
        }
      }
    }

    // Persist final assistant response
    await persistMessage(sessionId, agentId, 'assistant', fullResponse)

    send({ type: 'done', agent: agentId })
    res.end()
  } catch (err) {
    console.error('[agent-studio] error:', err.message)
    send({ type: 'error', message: err.message })
    res.end()
  }
}
