-- Migration to expand profiles table with personal and preference fields
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS job_title TEXT,
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS personal_timezone TEXT,
ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS browser_notifications BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS theme_preference TEXT DEFAULT 'dark';

-- Add comment explaining usage
COMMENT ON COLUMN public.profiles.personal_timezone IS 'User specific timezone preference';
COMMENT ON COLUMN public.profiles.theme_preference IS 'UI theme preference: light, dark, or auto';
