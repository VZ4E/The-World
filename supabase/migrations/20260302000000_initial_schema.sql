-- =============================================================================
-- Project Signal — Initial Schema
-- Tables: creators, videos, mentions
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- trigram index for brand name search


-- ---------------------------------------------------------------------------
-- Enums (as CHECK constraints — avoids ALTER TYPE pain during iteration)
-- ---------------------------------------------------------------------------
-- Platform values:  'tiktok' | 'twitch'
-- Transcription:    'pending' | 'processing' | 'completed' | 'failed'
-- Analysis:         'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
-- Mention type:     'organic' | 'sponsored' | 'unknown'
-- Sentiment:        'positive' | 'negative' | 'neutral'


-- =============================================================================
-- TABLE: creators
-- One row per monitored creator.  Platform + handle uniquely identifies them.
-- =============================================================================
create table creators (
  -- Identity
  id                  uuid        primary key default gen_random_uuid(),
  name                text        not null,                       -- display name, e.g. "DrLupo"
  handle              text        not null,                       -- @username on platform
  platform            text        not null
                        check (platform in ('tiktok', 'twitch')),
  platform_user_id    text        not null,                       -- platform's own numeric/string ID (for API calls)
  channel_url         text,                                       -- full URL to channel / profile

  -- Metadata (refreshed periodically)
  avatar_url          text,
  follower_count      bigint,
  subscriber_count    bigint,                                     -- Twitch subscribers (separate from followers)

  -- Alert routing
  alert_email         text,                                       -- Resend recipient for this creator
  slack_webhook_url   text,                                       -- optional per-creator override; falls back to global

  -- Pipeline control
  is_active           boolean     not null default true,          -- false = skip in cron
  last_fetched_at     timestamptz,                                -- when the pipeline last ran for this creator

  -- Timestamps
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Constraints
  unique (platform, platform_user_id),
  unique (platform, handle)
);

comment on table  creators                  is 'Gaming creators whose content is monitored for brand mentions.';
comment on column creators.platform_user_id is 'Platform-native ID used for API requests (e.g. TikTok secUid, Twitch user_id).';
comment on column creators.last_fetched_at  is 'Timestamp of the most recent successful video-fetch pipeline run for this creator.';


-- =============================================================================
-- TABLE: videos
-- One row per video/VOD processed by the pipeline.
-- Tracks both the transcription job (AssemblyAI) and the analysis job (Claude).
-- =============================================================================
create table videos (
  -- Identity
  id                        uuid        primary key default gen_random_uuid(),
  creator_id                uuid        not null references creators (id) on delete cascade,
  platform_video_id         text        not null,                 -- TikTok video ID or Twitch VOD/clip ID
  platform                  text        not null
                              check (platform in ('tiktok', 'twitch')), -- denormalized for fast queries without join

  -- Video metadata (from platform API)
  title                     text,
  video_url                 text,
  thumbnail_url             text,
  duration_seconds          int,                                  -- total length of the video
  view_count                bigint,
  like_count                bigint,
  comment_count             bigint,
  published_at              timestamptz,                          -- when the creator published it
  fetched_at                timestamptz not null default now(),   -- when our pipeline pulled it from the API

  -- Transcription (AssemblyAI)
  transcription_status      text        not null default 'pending'
                              check (transcription_status in ('pending', 'processing', 'completed', 'failed')),
  assemblyai_transcript_id  text,                                 -- AssemblyAI job ID, used for status polling
  transcript_text           text,                                 -- full plain-text transcript
  transcript_confidence     numeric(5, 4)                         -- overall confidence score 0.0000–1.0000
                              check (transcript_confidence between 0 and 1),
  transcript_words_json     jsonb,                                -- word-level data from AssemblyAI (word + start/end ms)
  transcribed_at            timestamptz,                          -- when AssemblyAI marked the job complete

  -- Analysis (Claude)
  analysis_status           text        not null default 'pending'
                              check (analysis_status in ('pending', 'processing', 'completed', 'failed', 'skipped')),
  analysis_model            text,                                 -- model used, e.g. 'claude-sonnet-4-6'
  analysis_prompt_tokens    int,                                  -- for cost tracking
  analysis_output_tokens    int,
  analyzed_at               timestamptz,                          -- when Claude finished processing

  -- Error handling
  error_message             text,                                 -- last pipeline error (transcription or analysis)
  retry_count               smallint    not null default 0,       -- how many times this video has been retried

  -- Timestamps
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Constraints
  unique (platform, platform_video_id)                            -- never insert the same video twice
);

comment on table  videos                           is 'Videos fetched for each creator. Tracks transcription and Claude analysis pipeline state.';
comment on column videos.platform_video_id         is 'Platform-native video identifier. Used to prevent duplicate ingestion.';
comment on column videos.analysis_status           is '"skipped" means transcript was empty or below confidence threshold — no Claude call made.';
comment on column videos.transcript_words_json     is 'Raw word-level response from AssemblyAI. Each entry has {text, start, end, confidence}.';
comment on column videos.analysis_prompt_tokens    is 'Token counts stored for Claude API cost monitoring and budgeting.';


-- =============================================================================
-- TABLE: mentions
-- One row per brand mention extracted by Claude from a video transcript.
-- =============================================================================
create table mentions (
  -- Identity
  id                    uuid        primary key default gen_random_uuid(),
  video_id              uuid        not null references videos (id) on delete cascade,
  creator_id            uuid        not null references creators (id) on delete cascade, -- denormalized

  -- Brand data (as extracted by Claude)
  brand_name            text        not null,                     -- exact brand name as Claude extracted it
  brand_normalized      text        not null,                     -- lowercased + trimmed, for grouping / dedup
  context_snippet       text,                                     -- 1–3 surrounding sentences from the transcript
  timestamp_seconds     int,                                      -- approximate position in video (from word timestamps)
  confidence_score      numeric(4, 3)                             -- Claude's confidence in the extraction 0.000–1.000
                          check (confidence_score between 0 and 1),

  -- Classification (Claude-inferred)
  mention_type          text        not null default 'unknown'
                          check (mention_type in ('organic', 'sponsored', 'unknown')),
  sentiment             text        not null default 'neutral'
                          check (sentiment in ('positive', 'negative', 'neutral')),

  -- Human review
  is_verified           boolean     not null default false,       -- manually confirmed by team
  is_false_positive     boolean     not null default false,       -- marked as incorrect extraction

  -- Alert tracking — email (Resend)
  alert_email_sent      boolean     not null default false,
  alert_email_sent_at   timestamptz,
  alert_email_recipient text,                                     -- actual address used (for audit trail)

  -- Alert tracking — Slack
  alert_slack_sent      boolean     not null default false,
  alert_slack_sent_at   timestamptz,
  alert_slack_channel   text,                                     -- channel or webhook target used

  -- Timestamps
  created_at            timestamptz not null default now()
);

comment on table  mentions                  is 'Brand mentions extracted from video transcripts by Claude API.';
comment on column mentions.brand_normalized is 'Lowercase, whitespace-trimmed brand name. Use for GROUP BY and cross-creator brand analytics.';
comment on column mentions.timestamp_seconds is 'Derived from AssemblyAI word timestamps. NULL when word-level data is unavailable.';
comment on column mentions.mention_type     is '"sponsored" = paid placement detected; "organic" = natural reference; "unknown" = Claude could not determine.';


-- =============================================================================
-- INDEXES
-- =============================================================================

-- creators
create index idx_creators_platform         on creators (platform);
create index idx_creators_is_active        on creators (is_active) where is_active = true;

-- videos — pipeline queue queries
create index idx_videos_creator_id         on videos (creator_id);
create index idx_videos_platform_video_id  on videos (platform, platform_video_id);
create index idx_videos_transcription      on videos (transcription_status) where transcription_status in ('pending', 'processing');
create index idx_videos_analysis           on videos (analysis_status)      where analysis_status      in ('pending', 'processing');
create index idx_videos_published_at       on videos (published_at desc);
create index idx_videos_creator_published  on videos (creator_id, published_at desc);

-- mentions — alert queue + analytics
create index idx_mentions_video_id         on mentions (video_id);
create index idx_mentions_creator_id       on mentions (creator_id);
create index idx_mentions_brand_normalized on mentions (brand_normalized);
create index idx_mentions_created_at       on mentions (created_at desc);
create index idx_mentions_unsent_email     on mentions (alert_email_sent, created_at) where alert_email_sent = false;
create index idx_mentions_unsent_slack     on mentions (alert_slack_sent, created_at) where alert_slack_sent = false;

-- trigram index for fuzzy brand-name search in dashboard
create index idx_mentions_brand_trgm       on mentions using gin (brand_normalized gin_trgm_ops);


-- =============================================================================
-- TRIGGERS — auto-update updated_at
-- =============================================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_creators_updated_at
  before update on creators
  for each row execute function set_updated_at();

create trigger trg_videos_updated_at
  before update on videos
  for each row execute function set_updated_at();


-- =============================================================================
-- ROW LEVEL SECURITY
-- The pipeline runs server-side with the service_role key (bypasses RLS).
-- RLS is enabled now so a future dashboard using anon/authenticated keys
-- cannot read data without explicit policies being added.
-- =============================================================================
alter table creators enable row level security;
alter table videos   enable row level security;
alter table mentions enable row level security;

-- Service role bypasses RLS automatically — no policy needed for the pipeline.
-- Add authenticated-user policies here when you build the dashboard.
-- Example:
--   create policy "authenticated users can read creators"
--     on creators for select to authenticated using (true);


-- =============================================================================
-- SEED: 8 placeholder creator rows (update platform_user_id + handle before go-live)
-- =============================================================================
insert into creators (name, handle, platform, platform_user_id, is_active) values
  ('Creator 1', 'creator1', 'tiktok',  'tiktok_uid_1',  true),
  ('Creator 2', 'creator2', 'tiktok',  'tiktok_uid_2',  true),
  ('Creator 3', 'creator3', 'tiktok',  'tiktok_uid_3',  true),
  ('Creator 4', 'creator4', 'tiktok',  'tiktok_uid_4',  true),
  ('Creator 5', 'creator5', 'twitch',  'twitch_uid_5',  true),
  ('Creator 6', 'creator6', 'twitch',  'twitch_uid_6',  true),
  ('Creator 7', 'creator7', 'twitch',  'twitch_uid_7',  true),
  ('Creator 8', 'creator8', 'twitch',  'twitch_uid_8',  true);
