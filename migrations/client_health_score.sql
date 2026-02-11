-- ============================================================
-- Client Health Score System (v1) - Schema Migration
-- ============================================================

-- 1. Add Health Score columns to 'clients' table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS engagement_mode TEXT DEFAULT 'collaborative', -- 'collaborative' or 'low_touch'
ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Create 'health_logs' table to track history
CREATE TABLE IF NOT EXISTS public.health_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    factors JSONB DEFAULT '[]'::JSONB, -- Array of objects: { reason, deduction }
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::JSONB -- For AI insights or other future data
);

-- 3. Enable RLS for health_logs
ALTER TABLE public.health_logs ENABLE ROW LEVEL SECURITY;

-- 4. Policies for health_logs (matches clients policies)
-- View logs: Workspace members
CREATE POLICY "health_logs_select_workspace" ON public.health_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = health_logs.client_id
            AND (
                c.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.team_members tm
                    WHERE tm.owner_id = c.user_id
                    AND LOWER(tm.email) = LOWER(auth.jwt()->>'email')
                )
            )
        )
    );

-- Insert logs: Service Role only (Edge Functions) or Admin
-- Note: Edge Functions using Service Role bypass RLS, but handy to have explicit policy if needed.
CREATE POLICY "health_logs_insert_workspace" ON public.health_logs
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = health_logs.client_id
            AND (
                c.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.team_members tm
                    WHERE tm.owner_id = c.user_id
                    AND LOWER(tm.email) = LOWER(auth.jwt()->>'email')
                    AND tm.role IN ('admin')
                )
            )
        )
    );

-- ============================================================
-- 5. CRON JOB CONFIGURATION (pg_cron)
-- Triggers the 'client-health-score' Edge Function daily at midnight
-- ============================================================

-- Enable pg_cron (must be enabled in Dashboard first usually, but good to have in SQL)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the job: Daily at 00:00 UTC
-- NOTE: Replace 'YOUR_PROJECT_REF' and 'YOUR_SERVICE_KEY' if not using internal invoke.
-- Since we are inside Supabase, we can use pg_net to call the function.
-- IMPORTANT: URL format is https://<project_ref>.supabase.co/functions/v1/client-health-score

/*
SELECT cron.schedule(
    'client-health-score-daily', -- name of the cron job
    '0 0 * * *',                 -- every day at midnight (UTC)
    $$
    SELECT
      net.http_post(
          url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/client-health-score',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
    $$
);
*/

-- ALTERNATIVE: If deploying via CLI, you often set up cron in `config.toml`.
-- For SQL migration, the above is the pattern.
-- I've commented it out because YOU need to insert the PROJECT_REF and KEY.
