-- ============================================================
-- RLS POLICIES FOR PROFILES AND TEAM_MEMBERS TABLES
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. PROFILES TABLE
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- Users can only view their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT
    USING (id = auth.uid());

-- Users can only update their own profile
CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE
    USING (id = auth.uid());

-- NOTE: INSERT is typically handled by auth trigger, DELETE is not allowed

-- ============================================================
-- 2. TEAM_MEMBERS TABLE
-- ============================================================
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_members_select_own_workspace" ON public.team_members;
DROP POLICY IF EXISTS "team_members_insert_owner" ON public.team_members;
DROP POLICY IF EXISTS "team_members_update_owner" ON public.team_members;
DROP POLICY IF EXISTS "team_members_delete_owner" ON public.team_members;

-- Team members can view members of workspaces they belong to
CREATE POLICY "team_members_select_own_workspace" ON public.team_members
    FOR SELECT
    USING (
        -- Owner can see all their team members
        owner_id = auth.uid()
        -- OR team member can see other members of their workspace
        OR EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.owner_id = team_members.owner_id
            AND LOWER(tm.email) = LOWER(auth.jwt()->>'email')
            LIMIT 1
        )
    );

-- Only workspace owner can add team members
CREATE POLICY "team_members_insert_owner" ON public.team_members
    FOR INSERT
    WITH CHECK (owner_id = auth.uid());

-- Only workspace owner can update team members
CREATE POLICY "team_members_update_owner" ON public.team_members
    FOR UPDATE
    USING (owner_id = auth.uid());

-- Only workspace owner can remove team members
CREATE POLICY "team_members_delete_owner" ON public.team_members
    FOR DELETE
    USING (owner_id = auth.uid());

-- ============================================================
-- 3. VERIFICATION QUERY
-- ============================================================
SELECT 
    schemaname, 
    tablename, 
    rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'team_members')
ORDER BY tablename;

-- Expected output: Both tables should show "rowsecurity = true"
