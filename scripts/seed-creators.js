#!/usr/bin/env node
/**
 * Project Signal — Creator Seeding Script
 *
 * Upserts real creator records into the database.
 * Run this once before your first pipeline run.
 *
 * Usage:
 *   node scripts/seed-creators.js
 *
 * Requirements:
 *   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env
 *   (or in the shell environment before running this script).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HOW TO FILL IN CREATOR DATA
 *
 * TikTok:
 *   platform_user_id = The creator's "secUid" from the TikTok API.
 *   You can find it by calling: GET /user/info?username=HANDLE
 *   It looks like: MS4wLjABAAAA...
 *
 * Twitch:
 *   platform_user_id = The creator's numeric Twitch user_id.
 *   Find it at: GET https://api.twitch.tv/helix/users?login=HANDLE
 *   It looks like: "123456789"
 *
 * channel_url examples:
 *   TikTok: https://www.tiktok.com/@handle
 *   Twitch: https://www.twitch.tv/handle
 *
 * alert_email = where to send brand mention emails for this creator.
 *   Leave null to use the global ALERT_EMAIL_TO env var.
 * ────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ─────────────────────────────────────────────────────────────────────────────
// ✏️  FILL IN YOUR REAL CREATORS BELOW
// ─────────────────────────────────────────────────────────────────────────────
const CREATORS = [
  // ── TikTok creators ────────────────────────────────────────────────────────
  {
    name:             'Creator Name Here',        // Display name
    handle:           'tiktokhandle',             // @username (no @)
    platform:         'tiktok',
    platform_user_id: 'TIKTOK_SECUID_HERE',       // secUid from TikTok API
    channel_url:      'https://www.tiktok.com/@tiktokhandle',
    avatar_url:       null,                       // optional: URL to avatar image
    alert_email:      null,                       // optional: override global ALERT_EMAIL_TO
    is_active:        true,
  },

  // ── Twitch creators ────────────────────────────────────────────────────────
  {
    name:             'Creator Name Here',        // Display name
    handle:           'twitchlogin',              // Twitch login (lowercase)
    platform:         'twitch',
    platform_user_id: 'TWITCH_USER_ID_HERE',      // numeric user_id from Helix API
    channel_url:      'https://www.twitch.tv/twitchlogin',
    avatar_url:       null,
    alert_email:      null,
    is_active:        true,
  },

  // Add more creators here...
  // {
  //   name:             '',
  //   handle:           '',
  //   platform:         'tiktok', // or 'twitch'
  //   platform_user_id: '',
  //   channel_url:      '',
  //   avatar_url:       null,
  //   alert_email:      null,
  //   is_active:        true,
  // },
]
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nProject Signal — Creator Seeder`)
  console.log(`Upserting ${CREATORS.length} creator(s)...\n`)

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
    console.error('    Copy .env.example to .env and fill in your Supabase credentials.')
    process.exit(1)
  }

  let ok = 0, fail = 0

  for (const creator of CREATORS) {
    if (!creator.name || !creator.handle || !creator.platform || !creator.platform_user_id) {
      console.warn(`⚠️  Skipping incomplete row: ${JSON.stringify(creator)}`)
      fail++
      continue
    }

    const { error } = await supabase
      .from('creators')
      .upsert(creator, { onConflict: 'platform,platform_user_id', ignoreDuplicates: false })

    if (error) {
      console.error(`❌  ${creator.platform}/@${creator.handle}: ${error.message}`)
      fail++
    } else {
      console.log(`✅  ${creator.platform}/@${creator.handle}`)
      ok++
    }
  }

  console.log(`\nDone — ${ok} upserted, ${fail} failed.\n`)

  if (ok > 0) {
    console.log('Next steps:')
    console.log('  1. Deploy to Vercel with all env vars set')
    console.log('  2. Trigger the first cron run:')
    console.log('     GET /api/cron/fetch-videos  (with Authorization: Bearer <PIPELINE_CRON_SECRET>)')
    console.log('  3. Watch the dashboard at your Vercel URL\n')
  }
}

main().catch((err) => {
  console.error('Seeder crashed:', err.message)
  process.exit(1)
})
