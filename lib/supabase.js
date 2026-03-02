const { createClient } = require('@supabase/supabase-js')

let client = null

/**
 * Returns a Supabase client authenticated with the service role key.
 * Singleton — safe to call multiple times in one function invocation.
 */
function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
    }

    client = createClient(url, key, {
      auth: { persistSession: false },
    })
  }
  return client
}

module.exports = { getSupabase }
