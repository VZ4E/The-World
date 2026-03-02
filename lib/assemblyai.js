/**
 * AssemblyAI v2 — transcription helpers
 *
 * Docs: https://www.assemblyai.com/docs/api-reference
 *
 * Two operations:
 *   submitTranscription(audioUrl) → kicks off a job, returns { id, status }
 *   getTranscript(transcriptId)   → polls a job, returns the full transcript object
 *
 * Status lifecycle: queued → processing → completed | error
 */

const BASE_URL = 'https://api.assemblyai.com/v2'

function authHeaders() {
  return {
    Authorization: process.env.ASSEMBLYAI_API_KEY,
    'Content-Type': 'application/json',
  }
}

/**
 * Submits an audio/video URL for transcription.
 *
 * AssemblyAI can fetch from public URLs (direct CDN links).
 * For platform share URLs (TikTok, Twitch) that require auth, the caller
 * should first download and upload the audio to Supabase Storage, then
 * pass the public storage URL here.
 *
 * @param {string} audioUrl  - Publicly accessible URL to the media file
 * @returns {Object}         - AssemblyAI response: { id, status: 'queued', ... }
 */
async function submitTranscription(audioUrl) {
  const res = await fetch(`${BASE_URL}/transcript`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      audio_url: audioUrl,
      language_detection: true, // auto-detect language
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AssemblyAI submit failed [${res.status}]: ${text}`)
  }

  return res.json()
}

/**
 * Fetches the current state of a transcription job.
 *
 * When status === 'completed', the response includes:
 *   text          — full transcript string
 *   words         — array of { text, start, end, confidence }
 *   confidence    — overall confidence score (0–1)
 *   audio_duration — length of audio in seconds
 *
 * When status === 'error', the response includes:
 *   error         — human-readable error message
 *
 * @param {string} transcriptId  - ID returned by submitTranscription
 * @returns {Object}             - Full transcript object from AssemblyAI
 */
async function getTranscript(transcriptId) {
  const res = await fetch(`${BASE_URL}/transcript/${transcriptId}`, {
    headers: { Authorization: process.env.ASSEMBLYAI_API_KEY },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AssemblyAI poll failed for ${transcriptId} [${res.status}]: ${text}`)
  }

  return res.json()
}

module.exports = { submitTranscription, getTranscript }
