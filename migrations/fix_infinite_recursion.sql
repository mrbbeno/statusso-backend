-- FIX INFINITE RECURSION IN RLS

-- 1. Create a secure function to check team membership
-- This bypasses RLS on 'team_members' to avoid the loop
CREATE OR REPLACE FUNCTION public.get_my_teams()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT owner_id
  FROM team_members
  WHERE email = auth.jwt() ->> 'email'
$$;

-- 2. Create a secure function to check if I am a member of a SPECIFIC user's team
CREATE OR REPLACE FUNCTION public.is_member_of(target_owner_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM team_members
    WHERE owner_id = target_owner_id
    AND email = auth.jwt() ->> 'email'
  );
$$;

-- 3. Update 'team_members' Policies
DROP POLICY IF EXISTS "Members can view team" ON public.team_members;
DROP POLICY IF EXISTS "Members can view own membership" ON public.team_members;

CREATE POLICY "Members can view team" ON public.team_members
    FOR SELECT
    USING (
        owner_id IN (SELECT public.get_my_teams())
        OR
        owner_id = auth.uid()
    );

-- 4. Update 'projects' Policies
DROP POLICY IF EXISTS "Team Members can view shared projects" ON public.projects;

CREATE POLICY "Team Members can view shared projects" ON public.projects
    FOR SELECT
    USING (
        user_id = auth.uid() -- I am owner
        OR
        public.is_member_of(user_id) -- I am team member
    );

-- 5. Update 'clients' Policies (Assuming similar policy exists or needs to exist)
DROP POLICY IF EXISTS "Team Members can view shared clients" ON public.clients;

CREATE POLICY "Team Members can view shared clients" ON public.clients
    FOR SELECT
    USING (
        user_id = auth.uid() -- I am owner
        OR
        public.is_member_of(user_id) -- I am team member
    );
