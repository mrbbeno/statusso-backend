-- Add Stripe Account details columns
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS stripe_account_email TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS stripe_account_name TEXT;
