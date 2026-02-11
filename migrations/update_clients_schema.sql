-- Add new columns to the clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_position TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS secondary_email TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_address TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_payment_method TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
