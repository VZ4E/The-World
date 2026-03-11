/**
 * Transcript24 API — transcription helper
 *
 * Docs: https://www.transcript24.com/transcript-api
 *
 * Takes a public social media URL (TikTok, YouTube, Instagram, etc.)
 * and returns the transcript synchronously in a single request.
 *
 * Billing: 1 credit per minute of audio (rounded up). Failed jobs are free.
 */

const BASE_URL = 'https://api.transcript24.com'

/**
 * Transcribes a public social media video URL.
 *
 * @param {string} videoUrl  - Public TikTok/YouTube/Instagram/etc. share URL
 * @returns {{ text: string, captions: Array, taskCredits: number }}
 *   text      — full transcript as a single string
 *   captions  — raw caption array: [{ start_time, end_time, text }, ...]
 *   taskCredits — credits consumed for this request
 */
async function transcribeVideo(videoUrl) {
  const res = await fetch(`${BASE_URL}/transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.TRANSCRIPT24_API_KEY}`,
    },
    body: JSON.stringify({ url: videoUrl }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Transcript24 failed [${res.status}]: ${text}`)
  }

  const json = await res.json()

  if (!json.ok) {
    throw new Error(`Transcript24 error: ${json.error ?? JSON.stringify(json)}`)
  }

  const captions = json.caption ?? []
  const text = captions.map((c) => c.text).join(' ').trim()

  return {
    text,
    captions,
    taskCredits: json.taskCredits ?? null,
  }
}

module.exports = { transcribeVideo }
