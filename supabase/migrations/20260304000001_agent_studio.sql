-- Agent Studio: real-time message store for agent conversations and agent-to-agent communication

create table if not exists agent_messages (
  id            uuid primary key default gen_random_uuid(),
  session_id    text not null,
  agent         text not null,           -- which agent sent/received
  role          text not null,           -- 'user' | 'assistant' | 'handoff' | 'system'
  content       text not null,
  from_agent    text,                    -- populated for agent-to-agent handoffs
  to_agent      text,                    -- populated for agent-to-agent handoffs
  metadata      jsonb default '{}',
  created_at    timestamptz not null default now()
);

-- Index for fast session lookups and live feed ordering
create index if not exists agent_messages_session_idx on agent_messages (session_id, created_at desc);
create index if not exists agent_messages_created_idx on agent_messages (created_at desc);

-- Enable Row Level Security
alter table agent_messages enable row level security;

-- Allow anon read/write for the studio (tighten in production)
create policy "anon_read_agent_messages"
  on agent_messages for select
  using (true);

create policy "anon_insert_agent_messages"
  on agent_messages for insert
  with check (true);

-- Enable Realtime for live feed
alter publication supabase_realtime add table agent_messages;
