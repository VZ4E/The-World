/**
 * POST /api/cron/check-transcriptions
 *
 * NOTE: This job is no longer active.
 *
 * It was previously used to poll AssemblyAI for async transcription results.
 * Transcription now uses Transcript24 (https://www.transcript24.com/transcript-api),
 * which is synchronous — transcribe-videos.js handles submission and saving
 * in a single request. No polling is needed.
 *
 * This handler is kept as a no-op so the route doesn't 404 if the cron
 * fires before vercel.json is updated to remove it.
 */

module.exports = async function handler(req, res) {
  return res.status(200).json({ message: 'No-op: transcription is now synchronous via Transcript24.' })
}
