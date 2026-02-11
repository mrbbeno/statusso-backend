-- FIX TEAM POLICIES (Safe to run multiple times)

-- 1. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Members can view own membership" ON public.team_members;
DROP POLICY IF EXISTS "Members can view team" ON public.team_members;
DROP POLICY IF EXISTS "Owners can manage team members" ON public.team_members;

-- 2. Create Policies

-- Allow Owners to insert, update, delete their own team members
CREATE POLICY "Owners can manage team members" ON public.team_members
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- Allow Members to view other members of the SAME team (Visibility Fix)
CREATE POLICY "Members can view team" ON public.team_members
    FOR SELECT
    USING (
        owner_id IN (
            SELECT owner_id FROM public.team_members WHERE email = auth.jwt() ->> 'email'
        )
        OR
        owner_id = auth.uid()
    );

-- 3. Ensure RLS is enabled
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
