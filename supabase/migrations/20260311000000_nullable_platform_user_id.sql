-- Make platform_user_id nullable on creators.
-- The secUid / platform ID is resolved automatically by the pipeline
-- when scanning TikTok; requiring it at insert time blocked bulk-import
-- and manual creator creation flows.

alter table creators alter column platform_user_id drop not null;
