-- Add new workspace identity and regional settings columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS slug TEXT,
ADD COLUMN IF NOT EXISTS company_size TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS company_description TEXT,
ADD COLUMN IF NOT EXISTS time_format TEXT DEFAULT '24h',
ADD COLUMN IF NOT EXISTS week_start TEXT DEFAULT 'Monday',
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS number_format TEXT DEFAULT '1,234.56';

-- Update the sync function to include new columns
CREATE OR REPLACE FUNCTION public.sync_member_from_owner(member_email TEXT, target_owner_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    row_owner profiles%ROWTYPE;
BEGIN
    SELECT * INTO row_owner FROM profiles WHERE id = target_owner_id;

    UPDATE profiles 
    SET 
        plan = COALESCE(row_owner.plan, 'free'),
        company_name = row_owner.company_name,
        industry = row_owner.industry,
        logo_url = row_owner.logo_url,
        timezone = row_owner.timezone,
        date_format = row_owner.date_format,
        primary_color = row_owner.primary_color,
        bg_color = row_owner.bg_color,
        text_color = row_owner.text_color,
        card_color = row_owner.card_color,
        show_branding = row_owner.show_branding,
        portal_intro = row_owner.portal_intro,
        enable_comments = row_owner.enable_comments,
        enable_reactions = row_owner.enable_reactions,
        enable_client_requests = row_owner.enable_client_requests,
        show_stats = row_owner.show_stats,
        show_timeline = row_owner.show_timeline,
        stale_alert_days = row_owner.stale_alert_days,
        auto_archive = row_owner.auto_archive,
        archive_delay = row_owner.archive_delay,
        weekend_mode = row_owner.weekend_mode,
        -- New columns
        slug = row_owner.slug,
        company_size = row_owner.company_size,
        website = row_owner.website,
        company_description = row_owner.company_description,
        time_format = row_owner.time_format,
        week_start = row_owner.week_start,
        currency = row_owner.currency,
        number_format = row_owner.number_format
    WHERE email = member_email;
END;
$$;

-- Update the trigger function to include new columns
CREATE OR REPLACE FUNCTION public.on_owner_settings_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (OLD.plan IS DISTINCT FROM NEW.plan 
        OR OLD.company_name IS DISTINCT FROM NEW.company_name
        OR OLD.industry IS DISTINCT FROM NEW.industry
        OR OLD.logo_url IS DISTINCT FROM NEW.logo_url
        OR OLD.primary_color IS DISTINCT FROM NEW.primary_color
        OR OLD.bg_color IS DISTINCT FROM NEW.bg_color
        OR OLD.text_color IS DISTINCT FROM NEW.text_color
        OR OLD.card_color IS DISTINCT FROM NEW.card_color
        OR OLD.timezone IS DISTINCT FROM NEW.timezone
        OR OLD.date_format IS DISTINCT FROM NEW.date_format
        OR OLD.enable_comments IS DISTINCT FROM NEW.enable_comments
        OR OLD.auto_archive IS DISTINCT FROM NEW.auto_archive
        -- Check new columns
        OR OLD.slug IS DISTINCT FROM NEW.slug
        OR OLD.company_size IS DISTINCT FROM NEW.company_size
        OR OLD.website IS DISTINCT FROM NEW.website
        OR OLD.company_description IS DISTINCT FROM NEW.company_description
        OR OLD.time_format IS DISTINCT FROM NEW.time_format
        OR OLD.week_start IS DISTINCT FROM NEW.week_start
        OR OLD.currency IS DISTINCT FROM NEW.currency
        OR OLD.number_format IS DISTINCT FROM NEW.number_format
        ) THEN
        
        UPDATE profiles p
        SET 
            plan = NEW.plan,
            company_name = NEW.company_name,
            industry = NEW.industry,
            logo_url = NEW.logo_url,
            timezone = NEW.timezone,
            date_format = NEW.date_format,
            primary_color = NEW.primary_color,
            bg_color = NEW.bg_color,
            text_color = NEW.text_color,
            card_color = NEW.card_color,
            show_branding = NEW.show_branding,
            portal_intro = NEW.portal_intro,
            enable_comments = NEW.enable_comments,
            enable_reactions = NEW.enable_reactions,
            enable_client_requests = NEW.enable_client_requests,
            show_stats = NEW.show_stats,
            show_timeline = NEW.show_timeline,
            stale_alert_days = NEW.stale_alert_days,
            auto_archive = NEW.auto_archive,
            archive_delay = NEW.archive_delay,
            weekend_mode = NEW.weekend_mode,
            -- New columns
            slug = NEW.slug,
            company_size = NEW.company_size,
            website = NEW.website,
            company_description = NEW.company_description,
            time_format = NEW.time_format,
            week_start = NEW.week_start,
            currency = NEW.currency,
            number_format = NEW.number_format
        FROM team_members tm
        WHERE tm.owner_id = NEW.id
        AND tm.email = p.email;
    END IF;
    RETURN NEW;
END;
$$;
