-- ============================================================
-- COMPREHENSIVE RLS (Row Level Security) POLICIES
-- Run this in Supabase SQL Editor to protect ALL tables
-- ============================================================
-- NOTE: Uses workspace_id (not user_id) based on actual schema
-- OPTIMIZED: Uses EXISTS with LIMIT 1 instead of IN for better performance

-- ============================================================
-- 1. CLIENTS TABLE
-- ============================================================
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to prevent conflicts
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

-- Policy: Users can INSERT clients into their workspace
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

-- Policy: Users can UPDATE their workspace's clients
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

-- Policy: Users can DELETE their workspace's clients
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

-- ============================================================
-- 2. PROJECTS TABLE
-- ============================================================
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

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

-- ============================================================
-- 3. INTERACTIONS TABLE
-- ============================================================
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interactions_select_workspace" ON public.interactions;
DROP POLICY IF EXISTS "interactions_insert_workspace" ON public.interactions;
DROP POLICY IF EXISTS "interactions_update_workspace" ON public.interactions;
DROP POLICY IF EXISTS "interactions_delete_workspace" ON public.interactions;

-- Interactions use workspace_id column
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

CREATE POLICY "interactions_update_workspace" ON public.interactions
    FOR UPDATE
    USING (
        workspace_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = interactions.workspace_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            AND role IN ('admin', 'member')
            LIMIT 1
        )
    );

CREATE POLICY "interactions_delete_workspace" ON public.interactions
    FOR DELETE
    USING (
        workspace_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = interactions.workspace_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            AND role = 'admin'
            LIMIT 1
        )
    );

-- ============================================================
-- 4. INVOICES TABLE
-- ============================================================
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_select_workspace" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_workspace" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_workspace" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete_workspace" ON public.invoices;
DROP POLICY IF EXISTS "Users can view their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can insert their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can update their own invoices" ON public.invoices;

-- Invoices use workspace_id column
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

CREATE POLICY "invoices_update_workspace" ON public.invoices
    FOR UPDATE
    USING (
        workspace_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = invoices.workspace_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            AND role IN ('admin', 'member')
            LIMIT 1
        )
    );

CREATE POLICY "invoices_delete_workspace" ON public.invoices
    FOR DELETE
    USING (
        workspace_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE owner_id = invoices.workspace_id
            AND LOWER(email) = LOWER(auth.jwt()->>'email')
            AND role = 'admin'
            LIMIT 1
        )
    );

-- ============================================================
-- 5. VERIFICATION QUERY
-- Run this to confirm RLS is enabled on all tables
-- ============================================================
SELECT 
    schemaname, 
    tablename, 
    rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('clients', 'projects', 'interactions', 'invoices', 'profiles', 'team_members')
ORDER BY tablename;

-- Expected output: All tables should show "rowsecurity = true"
