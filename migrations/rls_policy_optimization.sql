-- =============================================================
-- RLS POLICY OPTIMIZATION (Performance-focused)
-- Run this in Supabase SQL Editor to improve query performance
-- =============================================================
-- Replaces IN subqueries with EXISTS for better query planning

-- =====================
-- 1. CLIENTS TABLE (Optimized)
-- =====================

DROP POLICY IF EXISTS "clients_select_workspace" ON public.clients;
DROP POLICY IF EXISTS "clients_insert_workspace" ON public.clients;
DROP POLICY IF EXISTS "clients_update_workspace" ON public.clients;
DROP POLICY IF EXISTS "clients_delete_workspace" ON public.clients;

-- OPTIMIZED: Check auth.uid() first (fast), then EXISTS (indexed)
CREATE POLICY "clients_select_workspace" ON public.clients
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = clients.user_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            LIMIT 1
        )
    );

CREATE POLICY "clients_insert_workspace" ON public.clients
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = clients.user_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            AND role IN ('admin', 'member')
            LIMIT 1
        )
    );

CREATE POLICY "clients_update_workspace" ON public.clients
    FOR UPDATE
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = clients.user_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            AND role IN ('admin', 'member')
            LIMIT 1
        )
    );

CREATE POLICY "clients_delete_workspace" ON public.clients
    FOR DELETE
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = clients.user_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            AND role = 'admin'
            LIMIT 1
        )
    );

-- =====================
-- 2. PROJECTS TABLE (Optimized)
-- =====================

DROP POLICY IF EXISTS "projects_select_workspace" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_workspace" ON public.projects;
DROP POLICY IF EXISTS "projects_update_workspace" ON public.projects;
DROP POLICY IF EXISTS "projects_delete_workspace" ON public.projects;

CREATE POLICY "projects_select_workspace" ON public.projects
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = projects.user_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            LIMIT 1
        )
    );

CREATE POLICY "projects_insert_workspace" ON public.projects
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = projects.user_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            AND role IN ('admin', 'member')
            LIMIT 1
        )
    );

CREATE POLICY "projects_update_workspace" ON public.projects
    FOR UPDATE
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = projects.user_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            AND role IN ('admin', 'member')
            LIMIT 1
        )
    );

CREATE POLICY "projects_delete_workspace" ON public.projects
    FOR DELETE
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = projects.user_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            AND role = 'admin'
            LIMIT 1
        )
    );

-- =====================
-- 3. INTERACTIONS TABLE (Optimized)
-- =====================

DROP POLICY IF EXISTS "interactions_select_workspace" ON public.interactions;
DROP POLICY IF EXISTS "interactions_insert_workspace" ON public.interactions;

CREATE POLICY "interactions_select_workspace" ON public.interactions
    FOR SELECT
    USING (
        workspace_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = interactions.workspace_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            LIMIT 1
        )
    );

CREATE POLICY "interactions_insert_workspace" ON public.interactions
    FOR INSERT
    WITH CHECK (
        workspace_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = interactions.workspace_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            AND role IN ('admin', 'member')
            LIMIT 1
        )
    );

-- =====================
-- 4. INVOICES TABLE (Optimized)
-- =====================

DROP POLICY IF EXISTS "invoices_select_workspace" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_workspace" ON public.invoices;

CREATE POLICY "invoices_select_workspace" ON public.invoices
    FOR SELECT
    USING (
        workspace_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = invoices.workspace_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            LIMIT 1
        )
    );

CREATE POLICY "invoices_insert_workspace" ON public.invoices
    FOR INSERT
    WITH CHECK (
        workspace_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = invoices.workspace_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            AND role IN ('admin', 'member')
            LIMIT 1
        )
    );

-- =====================
-- ANALYZE (Update statistics)
-- =====================
ANALYZE public.team_members;
ANALYZE public.clients;
ANALYZE public.projects;
ANALYZE public.interactions;
ANALYZE public.invoices;

-- =====================
-- VERIFICATION
-- =====================
SELECT 
    policyname,
    tablename,
    cmd
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('clients', 'projects', 'interactions', 'invoices')
ORDER BY tablename, cmd;
