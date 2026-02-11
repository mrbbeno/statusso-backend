-- TEAM WRITE POLICIES
-- Allows team members (editors/admins) to create and delete clients/projects in the shared workspace

-- 1. CLIENTS POLICIES
DROP POLICY IF EXISTS "Team Members can insert clients" ON public.clients;
CREATE POLICY "Team Members can insert clients" ON public.clients
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.owner_id = clients.user_id
            AND tm.email = (auth.jwt() ->> 'email')
            AND tm.role IN ('admin', 'editor')
        )
    );

DROP POLICY IF EXISTS "Team Members can delete clients" ON public.clients;
CREATE POLICY "Team Members can delete clients" ON public.clients
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.owner_id = clients.user_id
            AND tm.email = (auth.jwt() ->> 'email')
            AND tm.role IN ('admin', 'editor')
        )
    );

-- 2. PROJECTS POLICIES
DROP POLICY IF EXISTS "Team Members can insert projects" ON public.projects;
CREATE POLICY "Team Members can insert projects" ON public.projects
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.owner_id = projects.user_id
            AND tm.email = (auth.jwt() ->> 'email')
            AND tm.role IN ('admin', 'editor')
        )
    );

DROP POLICY IF EXISTS "Team Members can delete projects" ON public.projects;
CREATE POLICY "Team Members can delete projects" ON public.projects
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.owner_id = projects.user_id
            AND tm.email = (auth.jwt() ->> 'email')
            AND tm.role IN ('admin', 'editor')
        )
    );

-- 3. MILESTONES POLICIES (Important for project creation)
DROP POLICY IF EXISTS "Team Members can manage milestones" ON public.project_milestones;
CREATE POLICY "Team Members can manage milestones" ON public.project_milestones
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.team_members tm ON tm.owner_id = p.user_id
            WHERE p.id = project_milestones.project_id
            AND tm.email = (auth.jwt() ->> 'email')
            AND tm.role IN ('admin', 'editor')
        )
        OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_milestones.project_id
            AND p.user_id = auth.uid()
        )
    );

-- 4. INTERACTIONS POLICIES (The Feed)
DROP POLICY IF EXISTS "Team Members can manage interactions" ON public.interactions;
CREATE POLICY "Team Members can manage interactions" ON public.interactions
    USING (
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.owner_id = interactions.user_id
            AND tm.email = (auth.jwt() ->> 'email')
            AND tm.role IN ('admin', 'editor')
        )
    );
