-- Enable Supabase Realtime on interactions table
-- This is required for postgres_changes subscriptions to work

-- 1. Set REPLICA IDENTITY to FULL for Realtime to work properly
ALTER TABLE public.interactions REPLICA IDENTITY FULL;

-- 2. Add table to supabase_realtime publication (if not already)
-- Note: You may also need to enable Realtime in Supabase Dashboard:
-- Go to Database -> Replication -> Check "interactions" table

-- Run this in SQL Editor in Supabase Dashboard
