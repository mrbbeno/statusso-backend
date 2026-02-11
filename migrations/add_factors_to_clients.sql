-- ============================================================
-- Add 'current_factors' to clients table for easier frontend access
-- ============================================================

ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS current_factors JSONB DEFAULT '[]'::JSONB;

-- Note: We do not need extra RLS policies as the existing ones cover the 'clients' table updates.
