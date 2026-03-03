/**
 * Dashboard API authentication middleware.
 *
 * Checks `Authorization: Bearer <DASHBOARD_API_KEY>` on all dashboard
 * endpoint requests. If DASHBOARD_API_KEY is not set in the environment,
 * access is blocked — the key must be explicitly configured.
 *
 * Usage in every api/dashboard/*.js handler:
 *
 *   const { authDashboard } = require('../../lib/auth-dashboard')
 *
 *   module.exports = async function handler(req, res) {
 *     if (!authDashboard(req, res)) return
 *     // ... rest of handler
 *   }
 *
 * The frontend reads the key from the user's browser session (see
 * the login prompt in public/index.html) and sends it as a Bearer token.
 */

/**
 * Validates the request's Authorization header against DASHBOARD_API_KEY.
 * Returns true if authorized, false (+ sends 401 response) if not.
 *
 * @param {object} req  - Vercel request
 * @param {object} res  - Vercel response
 * @returns {boolean}
 */
function authDashboard(req, res) {
  // Always set CORS before any auth check so preflight (OPTIONS) works
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '86400')

  // Respond to CORS preflight before auth
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return false // signal caller to stop
  }

  const apiKey = process.env.DASHBOARD_API_KEY

  // If no key is configured, deny all access — force explicit configuration
  if (!apiKey) {
    console.error('[auth-dashboard] DASHBOARD_API_KEY is not set — denying access')
    res.status(503).json({ error: 'Dashboard API key not configured' })
    return false
  }

  const authHeader = req.headers.authorization || ''
  const [scheme, token] = authHeader.split(' ', 2)

  if (scheme !== 'Bearer' || !token || token !== apiKey) {
    res.status(401).json({ error: 'Unauthorized — invalid or missing API key' })
    return false
  }

  return true
}

module.exports = { authDashboard }
