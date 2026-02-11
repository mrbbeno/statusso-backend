-- Add is_internal flag and workspace_id to interactions
-- This allows separating internal team communication and ensures workspace-wide visibility.

-- 1. Add columns
ALTER TABLE public.interactions 
ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS workspace_id UUID;

-- 2. Make project_id nullable (for General Workspace Chat)
ALTER TABLE public.interactions
ALTER COLUMN project_id DROP NOT NULL;

-- 3. Populate workspace_id
-- We want workspace_id to ALWAYS be the Owner's User ID.

-- Strategy:
-- 1. If interaction has a project, use project's user_id (the owner).
UPDATE public.interactions i
SET workspace_id = p.user_id
FROM public.projects p
WHERE i.project_id = p.id
AND i.workspace_id IS NULL;

-- 2. For project-less interactions (General Chat), find if sender is a member or owner.
-- This uses a subquery to find owner_id from team_members if exists, else uses the sender's own ID.
UPDATE public.interactions i
SET workspace_id = COALESCE(
    (
        SELECT tm.owner_id 
        FROM public.team_members tm 
        JOIN public.profiles pr ON pr.email = tm.email 
        WHERE pr.id = i.user_id
        LIMIT 1
    ),
    i.user_id
)
WHERE i.workspace_id IS NULL;

-- 4. Update RLS policies for interactions
DROP POLICY IF EXISTS "Team Members can manage interactions" ON public.interactions;
CREATE POLICY "Team Members can manage interactions" ON public.interactions
    USING (
        workspace_id = (
            SELECT workspace_id FROM (
                -- Try to find the user's current effective workspace_id
                -- 1. If they are a member, it's the owner_id
                SELECT owner_id as workspace_id FROM public.team_members 
                WHERE email = (SELECT email FROM public.profiles WHERE id = auth.uid())
                UNION ALL
                -- 2. If they are the owner, it's their own id
                SELECT id as workspace_id FROM public.profiles WHERE id = auth.uid()
            ) as ws LIMIT 1
        )
    )
    WITH CHECK (
        workspace_id = (
            SELECT workspace_id FROM (
                SELECT owner_id as workspace_id FROM public.team_members 
                WHERE email = (SELECT email FROM public.profiles WHERE id = auth.uid())
                UNION ALL
                SELECT id as workspace_id FROM public.profiles WHERE id = auth.uid()
            ) as ws LIMIT 1
        )
    );

-- 5. Update existing client reactions/comments to be external (false)
UPDATE public.interactions 
SET is_internal = false
WHERE author_type = 'client';
