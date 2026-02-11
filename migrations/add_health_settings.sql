-- Add health score persistence to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS enable_health_score BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS health_weights JSONB DEFAULT '{
    "INACTIVITY": 2,
    "ETA_OVERRUN": 30,
    "STAGNATION": 15,
    "PARALLEL_OVERLOAD": 10
}'::JSONB;

-- Update the sync function to include these new columns
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
        enable_health_score = row_owner.enable_health_score,
        health_weights = row_owner.health_weights
    WHERE email = member_email;
END;
$$;

-- Update the owner settings change trigger function as well
CREATE OR REPLACE FUNCTION public.on_owner_settings_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (OLD.plan IS DISTINCT FROM NEW.plan 
        OR OLD.auto_archive IS DISTINCT FROM NEW.auto_archive
        OR OLD.enable_health_score IS DISTINCT FROM NEW.enable_health_score
        OR OLD.health_weights IS DISTINCT FROM NEW.health_weights
        OR OLD.stale_alert_days IS DISTINCT FROM NEW.stale_alert_days) THEN
        
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
            enable_health_score = NEW.enable_health_score,
            health_weights = NEW.health_weights
        FROM team_members tm
        WHERE tm.owner_id = NEW.id
        AND tm.email = p.email;
    END IF;
    RETURN NEW;
END;
$$;
