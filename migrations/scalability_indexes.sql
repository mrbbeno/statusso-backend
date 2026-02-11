-- =============================================================
-- COMPREHENSIVE DATABASE INDEXING FOR SCALABILITY
-- Run this in Supabase SQL Editor
-- =============================================================
-- These indexes ensure fast queries at 1M+ rows

-- =====================
-- INTERACTIONS TABLE (Most critical for scaling)
-- =====================

-- For unread count queries (used by Sidebar)
CREATE INDEX IF NOT EXISTS idx_interactions_unread 
ON public.interactions(is_read, author_type) 
WHERE is_read = false;

-- For fetching interactions by project
CREATE INDEX IF NOT EXISTS idx_interactions_project_id 
ON public.interactions(project_id);

-- For fetching interactions by workspace
CREATE INDEX IF NOT EXISTS idx_interactions_workspace_id 
ON public.interactions(workspace_id);

-- For sorting by date (commonly used)
CREATE INDEX IF NOT EXISTS idx_interactions_created_at 
ON public.interactions(created_at DESC);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_interactions_workspace_created 
ON public.interactions(workspace_id, created_at DESC);

-- =====================
-- PROJECTS TABLE
-- =====================

-- For filtering by client
CREATE INDEX IF NOT EXISTS idx_projects_client_id 
ON public.projects(client_id);

-- For filtering by user/workspace
CREATE INDEX IF NOT EXISTS idx_projects_user_id 
ON public.projects(user_id);

-- For archived project queries
CREATE INDEX IF NOT EXISTS idx_projects_archived 
ON public.projects(is_archived);

-- For date sorting
CREATE INDEX IF NOT EXISTS idx_projects_updated_at 
ON public.projects(updated_at DESC);

-- Composite index for common dashboard query
CREATE INDEX IF NOT EXISTS idx_projects_user_archived 
ON public.projects(user_id, is_archived);

-- =====================
-- CLIENTS TABLE
-- =====================

-- For filtering by owner
CREATE INDEX IF NOT EXISTS idx_clients_user_id 
ON public.clients(user_id);

-- For public token lookups (client portal)
CREATE INDEX IF NOT EXISTS idx_clients_public_token 
ON public.clients(public_token);

-- For date sorting
CREATE INDEX IF NOT EXISTS idx_clients_created_at 
ON public.clients(created_at DESC);

-- =====================
-- TEAM_MEMBERS TABLE
-- =====================

-- For looking up team members by owner
CREATE INDEX IF NOT EXISTS idx_team_members_owner_id 
ON public.team_members(owner_id);

-- For looking up team members by email
CREATE INDEX IF NOT EXISTS idx_team_members_email 
ON public.team_members(email);

-- =====================
-- PROFILES TABLE
-- =====================

-- For looking up by email (used in member sync)
CREATE INDEX IF NOT EXISTS idx_profiles_email 
ON public.profiles(email);

-- =====================
-- PROJECT_MILESTONES TABLE
-- =====================

-- For fetching milestones by project
CREATE INDEX IF NOT EXISTS idx_milestones_project_id 
ON public.project_milestones(project_id);

-- =====================
-- ENABLE REALTIME
-- =====================

-- Required for Realtime subscriptions to work properly
ALTER TABLE public.interactions REPLICA IDENTITY FULL;
ALTER TABLE public.projects REPLICA IDENTITY FULL;
ALTER TABLE public.clients REPLICA IDENTITY FULL;

-- =====================
-- ANALYZE TABLES (Update statistics for query planner)
-- =====================
ANALYZE public.interactions;
ANALYZE public.projects;
ANALYZE public.clients;
ANALYZE public.team_members;
ANALYZE public.profiles;
ANALYZE public.project_milestones;
