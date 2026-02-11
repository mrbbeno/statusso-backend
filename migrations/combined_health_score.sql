-- ============================================================
-- Client Health Score System (v1) - Combined Schema Migration
-- ============================================================

-- 1. Add Health Score columns to 'clients' table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS engagement_mode TEXT DEFAULT 'collaborative', -- 'collaborative' or 'low_touch'
ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS current_factors JSONB DEFAULT '[]'::JSONB; -- Added for caching reasons

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

-- 4. Policies for health_logs
-- View logs: Workspace members
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_logs' AND policyname = 'health_logs_select_workspace'
    ) THEN
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
    END IF;
END $$;

-- Insert logs: Service Role only (Edge Functions) or Admin
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_logs' AND policyname = 'health_logs_insert_workspace'
    ) THEN
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
    END IF;
END $$;
