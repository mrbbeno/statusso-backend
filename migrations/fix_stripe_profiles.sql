-- Add Stripe Account details columns to PROFILES table
-- (Correcting the mistake of using 'user_settings')

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_connected_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_account_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_account_name TEXT;
