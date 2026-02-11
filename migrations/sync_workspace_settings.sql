-- 1. Function to sync settings to a specific member
CREATE OR REPLACE FUNCTION public.sync_member_from_owner(member_email TEXT, target_owner_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    row_owner profiles%ROWTYPE;
BEGIN
    -- Get owner's settings
    SELECT * INTO row_owner FROM profiles WHERE id = target_owner_id;

    -- Update member's profile with all SHARED workspace settings
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
        weekend_mode = row_owner.weekend_mode
    WHERE email = member_email;
END;
$$;

-- 2. Trigger on team_members (when someone is added or role changes)
CREATE OR REPLACE FUNCTION public.on_team_member_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.sync_member_from_owner(NEW.email, NEW.owner_id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_on_membership ON public.team_members;
CREATE TRIGGER trigger_sync_on_membership
    AFTER INSERT OR UPDATE ON public.team_members
    FOR EACH ROW EXECUTE FUNCTION public.on_team_member_change();

-- 3. Trigger on profiles (when owner updates their settings)
CREATE OR REPLACE FUNCTION public.on_owner_settings_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only sync if core workspace settings changed (ignore personal fields like full_name)
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
        OR OLD.auto_archive IS DISTINCT FROM NEW.auto_archive) THEN
        
        -- Update all members associated with this owner
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
            weekend_mode = NEW.weekend_mode
        FROM team_members tm
        WHERE tm.owner_id = NEW.id
        AND tm.email = p.email;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_to_members ON public.profiles;
CREATE TRIGGER trigger_sync_to_members
    AFTER UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.on_owner_settings_change();

-- 4. Trigger on profiles (Sync on Signup)
-- When a user registers, check if they are already in a team and pull settings
CREATE OR REPLACE FUNCTION public.on_new_profile_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    found_owner_id UUID;
BEGIN
    SELECT owner_id INTO found_owner_id FROM team_members WHERE email = NEW.email LIMIT 1;
    
    IF found_owner_id IS NOT NULL THEN
        PERFORM public.sync_member_from_owner(NEW.email, found_owner_id);
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_on_signup ON public.profiles;
CREATE TRIGGER trigger_sync_on_signup
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.on_new_profile_signup();

-- 5. Initial Sync for existing members
DO $$
DECLARE
    row RECORD;
BEGIN
    FOR row IN SELECT email, owner_id FROM team_members LOOP
        PERFORM public.sync_member_from_owner(row.email, row.owner_id);
    END LOOP;
END;
$$;

