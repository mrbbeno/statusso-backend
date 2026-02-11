-- Database Schema: Create table for aggregated project statistics
-- This table stores pre-calculated monthly metrics for project performance tracking.

CREATE TABLE public.project_monthly_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    tasks_completed INT DEFAULT 0,
    hours_logged NUMERIC DEFAULT 0,
    budget_spent NUMERIC DEFAULT 0,
    health_score_avg INT DEFAULT 0,
    velocity_data JSONB DEFAULT '[]'::jsonb, -- Weekly completion rates for charts
    category_distribution JSONB DEFAULT '{}'::jsonb, -- E.g., { "Design": 30, "Dev": 50 }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.project_monthly_stats ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to view stats for projects they have access to
-- (Expanding the join logic based on typical project membership patterns)
CREATE POLICY "Users can view stats for their projects" 
ON public.project_monthly_stats
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_monthly_stats.project_id
        -- Add specific project access logic here (e.g., matching client_id or owner_id)
    )
);

-- Create an index on project_id and month for faster queries
CREATE INDEX idx_project_monthly_stats_project_month ON public.project_monthly_stats(project_id, month);
