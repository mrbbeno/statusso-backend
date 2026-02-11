-- Add health_score column to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 100;

-- Optional: Index for filtering "at risk" projects efficiently
CREATE INDEX IF NOT EXISTS idx_projects_health_score ON public.projects(health_score);
