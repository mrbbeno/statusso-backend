-- TEAM MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'editor',
    status TEXT DEFAULT 'pending', -- pending, accepted
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(owner_id, email)
);

-- ENABLE RLS
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- POLICIES FOR TEAM_MEMBERS
-- 1. Owners can manage their own team
CREATE POLICY "Owners can manage team members" ON public.team_members
    FOR ALL
    USING (auth.uid() = owner_id);

-- 2. Members can view their own membership status
CREATE POLICY "Members can view own membership" ON public.team_members
    FOR SELECT
    USING (email = auth.jwt() ->> 'email');

-- SHARED ACCESS POLICIES (Project & Clients)

-- Allow team members to VIEW projects owned by the person who invited them
CREATE POLICY "Team Members can view shared projects" ON public.projects
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.owner_id = projects.user_id
            AND tm.email = (auth.jwt() ->> 'email')
        )
    );

-- Allow team members to VIEW clients owned by the person who invited them
CREATE POLICY "Team Members can view shared clients" ON public.clients
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.owner_id = clients.user_id
            AND tm.email = (auth.jwt() ->> 'email')
        )
    );

-- Allow team members to UPDATE shared projects (if role is not viewer)
CREATE POLICY "Team Members can update shared projects" ON public.projects
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.owner_id = projects.user_id
            AND tm.email = (auth.jwt() ->> 'email')
            AND tm.role IN ('admin', 'editor')
        )
    );

-- Allow team members to UPDATE shared clients (if role is not viewer)
CREATE POLICY "Team Members can update shared clients" ON public.clients
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.owner_id = clients.user_id
            AND tm.email = (auth.jwt() ->> 'email')
            AND tm.role IN ('admin', 'editor')
        )
    );
