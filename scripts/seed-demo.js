#!/usr/bin/env node
/**
 * Respawn Signal — Demo Data Seeder
 *
 * Inserts realistic-looking creators, videos, and brand mentions so you can
 * demo the dashboard to agency prospects without real pipeline data.
 *
 * Usage:
 *   node scripts/seed-demo.js
 *
 * Requirements:
 *   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Safe to re-run — uses upsert/insert with conflict handling.
 * Clear demo data: node scripts/seed-demo.js --clear
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const CLEAR = process.argv.includes('--clear')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// ─────────────────────────────────────────────────────────────────────────────
// Demo creators — realistic gaming/streaming handles
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_CREATORS = [
  { name: 'Tyler "Ninja" Blevins',  handle: 'ninja',       platform: 'tiktok',  platform_user_id: 'demo_tiktok_ninja',    follower_count: 18_200_000, channel_url: 'https://www.tiktok.com/@ninja' },
  { name: 'DrLupo',                 handle: 'drlupo',      platform: 'twitch',  platform_user_id: 'demo_twitch_drlupo',   follower_count: 4_500_000,  channel_url: 'https://www.twitch.tv/drlupo' },
  { name: 'Valkyrae',               handle: 'valkyrae',    platform: 'tiktok',  platform_user_id: 'demo_tiktok_valk',     follower_count: 3_100_000,  channel_url: 'https://www.tiktok.com/@valkyrae' },
  { name: 'TimTheTatman',           handle: 'timthetatman', platform: 'twitch', platform_user_id: 'demo_twitch_tim',      follower_count: 7_800_000,  channel_url: 'https://www.twitch.tv/timthetatman' },
  { name: 'pokimane',               handle: 'pokimane',    platform: 'tiktok',  platform_user_id: 'demo_tiktok_poki',     follower_count: 9_400_000,  channel_url: 'https://www.tiktok.com/@pokimane' },
  { name: 'Shroud',                 handle: 'shroud',      platform: 'twitch',  platform_user_id: 'demo_twitch_shroud',   follower_count: 10_200_000, channel_url: 'https://www.twitch.tv/shroud' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Demo videos per creator (5 each)
// ─────────────────────────────────────────────────────────────────────────────
function videosForCreator(creator, creatorId) {
  const base = Date.now()
  return Array.from({ length: 5 }, (_, i) => ({
    creator_id:           creatorId,
    platform:             creator.platform,
    platform_video_id:    `demo_${creator.handle}_vid_${i + 1}`,
    title:                [
      `${creator.name} reacts to the craziest clutch plays`,
      `Playing ranked until I hit Diamond — day ${i + 1}`,
      `Testing the new meta: is it busted?`,
      `My honest review after 100 hours`,
      `The game everyone is talking about right now`,
    ][i],
    view_count:           Math.floor(Math.random() * 2_000_000) + 50_000,
    like_count:           Math.floor(Math.random() * 200_000)  + 5_000,
    comment_count:        Math.floor(Math.random() * 20_000)   + 500,
    duration_seconds:     Math.floor(Math.random() * 3600)     + 300,
    published_at:         new Date(base - i * 86_400_000 * (i + 1)).toISOString(),
    transcription_status: 'completed',
    analysis_status:      'completed',
    analysis_model:       'claude-sonnet-4-6',
    transcript_text:      `This is a demo transcript for video ${i + 1} by ${creator.name}.`,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo mentions — brands an agency would care about
// ─────────────────────────────────────────────────────────────────────────────
const BRANDS = [
  { name: 'G FUEL',        normalized: 'g fuel',       type: 'sponsored', sentiment: 'positive' },
  { name: 'SteelSeries',   normalized: 'steelseries',  type: 'organic',   sentiment: 'positive' },
  { name: 'NordVPN',       normalized: 'nordvpn',      type: 'sponsored', sentiment: 'neutral'  },
  { name: 'Corsair',       normalized: 'corsair',      type: 'organic',   sentiment: 'positive' },
  { name: 'Monster Energy',normalized: 'monster energy',type: 'sponsored',sentiment: 'positive' },
  { name: 'Alienware',     normalized: 'alienware',    type: 'organic',   sentiment: 'positive' },
  { name: 'Razer',         normalized: 'razer',        type: 'organic',   sentiment: 'positive' },
  { name: 'HyperX',        normalized: 'hyperx',       type: 'sponsored', sentiment: 'positive' },
]

const SNIPPETS = [
  'Honestly this has been my go-to for the past few months.',
  'I know everyone says this but seriously, it makes a difference.',
  'No cap, I was skeptical at first but now I use it every stream.',
  'My chat keeps asking me about it so let me just say right now —',
  'I switched over like three months ago and haven\'t looked back.',
]

function mentionsForVideo(videoId, creatorId, numMentions = 2) {
  return Array.from({ length: numMentions }, (_, i) => {
    const brand = BRANDS[(Math.floor(Math.random() * BRANDS.length) + i) % BRANDS.length]
    return {
      video_id:          videoId,
      creator_id:        creatorId,
      brand_name:        brand.name,
      brand_normalized:  brand.normalized,
      mention_type:      brand.type,
      sentiment:         brand.sentiment,
      confidence_score:  (0.75 + Math.random() * 0.24).toFixed(3),
      timestamp_seconds: Math.floor(Math.random() * 3000) + 30,
      context_snippet:   SNIPPETS[i % SNIPPETS.length],
      alert_email_sent:  true,
      alert_slack_sent:  true,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  if (CLEAR) {
    console.log('Clearing demo data...')
    const handles = DEMO_CREATORS.map(c => c.handle)
    const { data: existing } = await supabase
      .from('creators')
      .select('id')
      .in('handle', handles)
    if (existing?.length) {
      const ids = existing.map(r => r.id)
      await supabase.from('mentions').delete().in('creator_id', ids)
      await supabase.from('videos').delete().in('creator_id', ids)
      await supabase.from('creators').delete().in('id', ids)
    }
    console.log('Demo data cleared.')
    return
  }

  console.log('\nRespawn Signal — Demo Seeder')
  console.log('════════════════════════════')

  // 1. Creators
  console.log('\n[1/3] Seeding creators...')
  const { data: createdCreators, error: cErr } = await supabase
    .from('creators')
    .upsert(
      DEMO_CREATORS.map(c => ({ ...c, is_active: true })),
      { onConflict: 'platform,platform_user_id', ignoreDuplicates: false }
    )
    .select()

  if (cErr) { console.error('Creator upsert failed:', cErr.message); process.exit(1) }

  // Re-fetch to get IDs (upsert may not return all rows on conflict)
  const { data: creators } = await supabase
    .from('creators')
    .select('id, handle, platform')
    .in('handle', DEMO_CREATORS.map(c => c.handle))

  console.log(`  ✅ ${creators.length} creators`)

  // 2. Videos
  console.log('\n[2/3] Seeding videos...')
  const allVideos = creators.flatMap(c => {
    const def = DEMO_CREATORS.find(d => d.handle === c.handle)
    return videosForCreator(def, c.id)
  })

  const { error: vErr } = await supabase
    .from('videos')
    .upsert(allVideos, { onConflict: 'platform,platform_video_id', ignoreDuplicates: true })

  if (vErr) { console.error('Video upsert failed:', vErr.message); process.exit(1) }

  // Fetch inserted video IDs
  const { data: videos } = await supabase
    .from('videos')
    .select('id, creator_id')
    .like('platform_video_id', 'demo_%')

  console.log(`  ✅ ${videos.length} videos`)

  // 3. Mentions
  console.log('\n[3/3] Seeding brand mentions...')
  const allMentions = videos.flatMap(v => mentionsForVideo(v.id, v.creator_id, 2))

  // Insert in batches of 100
  let inserted = 0
  for (let i = 0; i < allMentions.length; i += 100) {
    const batch = allMentions.slice(i, i + 100)
    const { error: mErr } = await supabase.from('mentions').insert(batch)
    if (mErr) { console.error('Mention insert failed:', mErr.message); process.exit(1) }
    inserted += batch.length
  }
  console.log(`  ✅ ${inserted} brand mentions`)

  console.log('\n════════════════════════════')
  console.log('Demo data ready. Open your dashboard to pitch.')
  console.log('To clear: node scripts/seed-demo.js --clear\n')
}

main().catch(err => {
  console.error('Seeder crashed:', err.message)
  process.exit(1)
})
