-- Add last_action_at to track real activity separate from health score updates
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMPTZ;

-- Initialize with current updated_at
UPDATE public.projects SET last_action_at = updated_at WHERE last_action_at IS NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_projects_last_action ON public.projects(last_action_at);
