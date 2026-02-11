-- =============================================================
-- RLS OPTIMIZATION INDEXES
-- Futtasd ezt a Supabase SQL Editorban a Performance javításához
-- =============================================================
-- Ezek az indexek felgyorsítják az RLS subquery-ket 5000+ usernél

-- =====================
-- TEAM_MEMBERS INDEXES (RLS Critical)
-- =====================

-- 1. Egyedi index az email mezőre (case-insensitive kereséshez)
CREATE INDEX IF NOT EXISTS idx_team_members_email 
ON public.team_members(email);

-- 2. Index az owner_id mezőre
CREATE INDEX IF NOT EXISTS idx_team_members_owner_id 
ON public.team_members(owner_id);

-- 3. KRITIKUS: Composite index az RLS subquery-hez
-- Ez a legfontosabb! Az RLS policy ezt használja:
-- SELECT owner_id FROM team_members WHERE LOWER(email) = LOWER(...)
CREATE INDEX IF NOT EXISTS idx_team_members_email_owner 
ON public.team_members(LOWER(email), owner_id);

-- 4. Index a role mezőre (RBAC ellenőrzésekhez)
CREATE INDEX IF NOT EXISTS idx_team_members_role 
ON public.team_members(role);

-- =====================
-- PROFILES INDEXES
-- =====================

-- Email lookup az authMiddleware-hez
CREATE INDEX IF NOT EXISTS idx_profiles_email 
ON public.profiles(email);

-- ID lookup (primary key mellett, de explicit)
CREATE INDEX IF NOT EXISTS idx_profiles_id 
ON public.profiles(id);

-- =====================
-- FUNCTION-BASED INDEX (LOWER case matching)
-- =====================

-- Ez felgyorsítja a LOWER(email) összehasonlításokat az RLS-ben
CREATE INDEX IF NOT EXISTS idx_team_members_email_lower 
ON public.team_members(LOWER(email));

-- =====================
-- ANALYZE (Statisztikák frissítése)
-- =====================

ANALYZE public.team_members;
ANALYZE public.profiles;

-- =====================
-- VERIFICATION
-- =====================

-- Futtasd ezt az indexek ellenőrzéséhez:
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'team_members'
ORDER BY indexname;
