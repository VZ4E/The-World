-- =============================================================================
-- Project Signal — RLS Policies
-- Adds read access for the anon/authenticated roles used by the dashboard.
--
-- The pipeline runs with service_role (bypasses RLS).
-- The dashboard uses the ANON key — it needs explicit SELECT policies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- creators — dashboard reads all active creators
-- ---------------------------------------------------------------------------
create policy "anon can read creators"
  on creators
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- videos — dashboard reads video metadata + pipeline status
-- ---------------------------------------------------------------------------
create policy "anon can read videos"
  on videos
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- mentions — dashboard reads all mentions
-- ---------------------------------------------------------------------------
create policy "anon can read mentions"
  on mentions
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Block writes from the anon/authenticated role entirely.
-- The pipeline (service_role) bypasses RLS so it can write freely.
-- ---------------------------------------------------------------------------
create policy "anon cannot insert creators"
  on creators
  for insert
  to anon, authenticated
  with check (false);

create policy "anon cannot update creators"
  on creators
  for update
  to anon, authenticated
  using (false);

create policy "anon cannot delete creators"
  on creators
  for delete
  to anon, authenticated
  using (false);

create policy "anon cannot insert videos"
  on videos
  for insert
  to anon, authenticated
  with check (false);

create policy "anon cannot update videos"
  on videos
  for update
  to anon, authenticated
  using (false);

create policy "anon cannot delete videos"
  on videos
  for delete
  to anon, authenticated
  using (false);

create policy "anon cannot insert mentions"
  on mentions
  for insert
  to anon, authenticated
  with check (false);

create policy "anon cannot update mentions"
  on mentions
  for update
  to anon, authenticated
  using (false);

create policy "anon cannot delete mentions"
  on mentions
  for delete
  to anon, authenticated
  using (false);
