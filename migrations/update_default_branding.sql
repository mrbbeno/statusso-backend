-- Update default values for branding columns to match "Graphite & Ember" (Dark Mode)
ALTER TABLE public.profiles
ALTER COLUMN theme_preference SET DEFAULT 'dark',
ALTER COLUMN primary_color SET DEFAULT '#5CD2AC',
ALTER COLUMN bg_color SET DEFAULT '#0F172A',
ALTER COLUMN card_color SET DEFAULT '#1E293B',
ALTER COLUMN text_color SET DEFAULT '#F8FAF9';

-- Optional: Update existing rows that are using old defaults or NULLs
-- This ensures consistency for users who haven't customized their settings yet.
UPDATE public.profiles
SET 
  theme_preference = 'dark',
  primary_color = '#5CD2AC',
  bg_color = '#0F172A',
  card_color = '#1E293B',
  text_color = '#F8FAF9'
WHERE theme_preference IS NULL OR theme_preference = 'light';
