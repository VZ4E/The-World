#!/usr/bin/env node
/**
 * Local pipeline test — runs each cron step against the real Supabase DB.
 * Usage: node scripts/test-pipeline.js
 */

require('dotenv').config()

const SECRET = process.env.PIPELINE_CRON_SECRET

if (!SECRET) {
  console.error('❌  PIPELINE_CRON_SECRET not set in .env')
  process.exit(1)
}

// Minimal req/res mock for the Vercel handler signature
function makeReq(method = 'GET') {
  return { method, headers: { authorization: `Bearer ${SECRET}` } }
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(data)  { this.body = data; return this },
  }
  return res
}

async function runStep(name, handlerPath) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`▶  ${name}`)
  console.log('─'.repeat(60))

  const handler = require(handlerPath)
  const req = makeReq()
  const res = makeRes()

  try {
    await handler(req, res)
    console.log(`   Status: ${res.statusCode}`)
    console.log('   Body:', JSON.stringify(res.body, null, 2))
  } catch (err) {
    console.error(`   ❌ Crashed: ${err.message}`)
    console.error(err.stack)
  }
}

async function checkDB() {
  console.log('\n── DB Connectivity Check ──────────────────────────────────')
  const { getSupabase } = require('../lib/supabase')
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('creators')
    .select('id, name, handle, platform, is_active')
    .limit(10)

  if (error) {
    console.error('❌  Cannot reach Supabase:', error.message)
    console.error('    Have you applied the migrations in supabase/migrations/ via the Supabase dashboard?')
    process.exit(1)
  }

  console.log(`✅  Connected. ${data.length} creator(s) in DB:`)
  for (const c of data) {
    console.log(`   [${c.is_active ? 'active' : 'inactive'}] ${c.platform}/@${c.handle} (${c.id})`)
  }

  if (data.length === 0) {
    console.warn('\n⚠️  No creators found. Run: node scripts/seed-creators.js')
    process.exit(0)
  }
}

;(async () => {
  console.log('Respawn Signal — Local Pipeline Test')
  console.log('=====================================')

  await checkDB()

  // Step 1: fetch videos from TikTok / Twitch
  await runStep('Step 1 — fetch-videos', '../api/cron/fetch-videos')

  // Step 2: submit pending videos to AssemblyAI
  await runStep('Step 2 — transcribe-videos', '../api/cron/transcribe-videos')

  // Step 3: poll AssemblyAI for completed transcriptions
  await runStep('Step 3 — check-transcriptions', '../api/cron/check-transcriptions')

  // Step 4: analyze completed transcripts with Claude
  await runStep('Step 4 — analyze-mentions', '../api/cron/analyze-mentions')

  console.log('\n✅  Test run complete.\n')
})()
