-- Allow members to view other members of the SAME team
DROP POLICY IF EXISTS "Members can view own membership" ON public.team_members;

CREATE POLICY "Members can view team" ON public.team_members
    FOR SELECT
    USING (
        owner_id IN (
            SELECT owner_id FROM public.team_members WHERE email = auth.jwt() ->> 'email'
        )
        OR
        owner_id = auth.uid()
    );

-- Allow members to see the specific workspace owner's profile (to know who they work for? optional)
-- For now, just ensuring team_members visibility is enough for the UI.
