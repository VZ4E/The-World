/**
 * POST /api/report/weekly
 *
 * Generates and optionally sends the weekly brand intelligence report.
 *
 * Auth: Authorization: Bearer <PIPELINE_CRON_SECRET>
 *
 * Body (JSON):
 *   {
 *     "to":         "client@agency.com",    // optional — overrides REPORT_EMAIL_TO
 *     "clientName": "Acme Esports",         // optional — shown in report header
 *     "send":       true                    // false = return HTML only (preview mode)
 *   }
 *
 * Response:
 *   { ok: true, emailId: "...", preview: "<html>..." }   (when send: true)
 *   { ok: true, preview: "<html>..." }                   (when send: false)
 */

const { buildWeeklyReport, sendWeeklyReport } = require('../../lib/weekly-report')

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth
  const secret = process.env.PIPELINE_CRON_SECRET
  if (secret) {
    const auth = req.headers.authorization ?? ''
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const { to, clientName, send = true } = req.body ?? {}

  try {
    const html = await buildWeeklyReport({ clientName })

    if (!send) {
      return res.status(200).json({ ok: true, preview: html })
    }

    const emailId = await sendWeeklyReport(html, { to, clientName })
    return res.status(200).json({ ok: true, emailId, preview: html })
  } catch (err) {
    console.error('[weekly-report]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
