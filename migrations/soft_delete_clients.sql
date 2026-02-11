-- =============================================================
-- SOFT DELETE FOR CLIENTS (Safe Delete)
-- Futtasd ezt a Supabase SQL Editorban
-- =============================================================
-- Ez lehetővé teszi, hogy a kliensek "törlése" csak elrejtse őket,
-- de az adatok (projektek, számlák) megmaradjanak az archívumban.

-- 1. Add is_deleted column to clients
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- 2. Add deleted_at timestamp for audit trail
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Create index for filtering out deleted clients
CREATE INDEX IF NOT EXISTS idx_clients_is_deleted
ON public.clients(is_deleted)
WHERE is_deleted = FALSE;

-- 4. Update projects foreign key to SET NULL instead of CASCADE
-- First, we need to check current constraint and recreate it
-- NOTE: This requires dropping and recreating the constraint

-- Check current constraint:
-- SELECT conname, confdeltype FROM pg_constraint 
-- WHERE conrelid = 'projects'::regclass AND contype = 'f';

-- If you want to change CASCADE to SET NULL for projects:
-- ALTER TABLE public.projects
-- DROP CONSTRAINT IF EXISTS projects_client_id_fkey,
-- ADD CONSTRAINT projects_client_id_fkey 
-- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

-- 5. Update invoices foreign key to SET NULL (CRITICAL for accounting!)
-- ALTER TABLE public.invoices
-- DROP CONSTRAINT IF EXISTS invoices_client_id_fkey,
-- ADD CONSTRAINT invoices_client_id_fkey 
-- FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

-- 6. Verify the changes
SELECT 
    column_name, 
    data_type, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'clients' 
AND column_name IN ('is_deleted', 'deleted_at');
