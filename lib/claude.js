/**
 * Claude (Anthropic) — brand mention extractor
 *
 * Sends a completed transcript to Claude and asks it to identify all brand
 * and product mentions, returning structured JSON.
 *
 * Uses @anthropic-ai/sdk with claude-sonnet-4-6 by default (overridable via
 * the CLAUDE_MODEL env var).
 *
 * Transcripts longer than MAX_TRANSCRIPT_CHARS are truncated. For Twitch
 * VODs this is common — future work can chunk long transcripts.
 */

const Anthropic = require('@anthropic-ai/sdk')

const MAX_TRANSCRIPT_CHARS = 20000 // ~3,500–4,000 words

const SYSTEM_PROMPT = `\
You are a brand mention analyst for a gaming creator monitoring service called Project Signal.

Your job is to read video transcripts from gaming creators on TikTok and Twitch, then extract every brand, company, and product mention.

For each mention return a JSON object with these fields:
- brand_name         (string)  The brand as mentioned, preserving capitalisation. e.g. "AMD", "Razer", "G FUEL", "NordVPN"
- brand_normalized   (string)  Lowercase, trimmed. e.g. "amd", "razer", "g fuel", "nordvpn"
- context_snippet    (string)  1–2 sentences of surrounding transcript text showing how the brand was mentioned.
- confidence_score   (number)  0.0–1.0 — how confident you are this is a real brand mention (not a false positive).
- mention_type       (string)  One of: "sponsored" (paid/ad read), "organic" (natural reference), "unknown"
- sentiment          (string)  One of: "positive", "negative", "neutral"

Focus on: gaming peripherals & hardware, energy drinks, VPNs, gaming chairs, game studios, software tools, streaming platforms (when discussed as a product/service), clothing/merch, and known creator sponsors.

Exclude:
- Generic references to Twitch or TikTok as the streaming platform (unless the creator is discussing them as a product)
- The creator's own channel, brand, or merch (you'll be told the creator handle)
- Individual game titles (include the studio/publisher name if it's discussed as a company)

Return ONLY a valid JSON array — no markdown fences, no explanation, no preamble. If there are no brand mentions return [].`

let _client = null

function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

/**
 * Extracts brand mentions from a transcript using Claude.
 *
 * @param {string} transcriptText  - Full transcript from AssemblyAI
 * @param {string} creatorHandle   - Creator's handle (used for context + exclusions)
 * @returns {{ mentions: Array, input_tokens: number, output_tokens: number }}
 */
async function extractBrands(transcriptText, creatorHandle) {
  const client = getClient()
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'

  // Truncate to stay within cost/context limits
  const truncated = transcriptText.slice(0, MAX_TRANSCRIPT_CHARS)
  const wasTruncated = transcriptText.length > MAX_TRANSCRIPT_CHARS

  const userMessage =
    `Creator handle: @${creatorHandle}\n` +
    (wasTruncated ? `[Transcript truncated to first ${MAX_TRANSCRIPT_CHARS} chars]\n\n` : '\n') +
    `Transcript:\n${truncated}`

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const rawText = response.content[0]?.text?.trim() ?? '[]'

  let mentions
  try {
    const parsed = JSON.parse(rawText)
    mentions = Array.isArray(parsed) ? parsed : []
  } catch (parseErr) {
    throw new Error(
      `Claude returned non-JSON output for @${creatorHandle}: ${rawText.slice(0, 200)}`
    )
  }

  return {
    mentions,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  }
}

module.exports = { extractBrands }
