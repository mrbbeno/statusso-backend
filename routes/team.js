const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../authMiddleware');
const { adminSupabase } = require('../supabaseClient');

// Rate limiting for team operations
const teamLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests per minute
    message: { error: 'Too many requests, please try again later.' }
});

router.use(authMiddleware);
router.use(teamLimiter);

// GET /team - List my team members (I am the owner)
// GET /team - List my team members
router.get('/', async (req, res) => {
    try {
        const workspaceId = req.user.workspace_id || req.user.id;

        // 1. Fetch team members
        const { data: members, error: membersError } = await req.supabase
            .from('team_members')
            .select('*')
            .eq('owner_id', workspaceId);

        if (membersError) throw membersError;

        if (!members || members.length === 0) {
            return res.json([]);
        }

        // 2. Fetch profiles for these members manually
        const emails = members.map(m => m.email).filter(Boolean);

        if (emails.length > 0) {
            const { data: profiles, error: profilesError } = await req.supabase
                .from('profiles')
                .select('email, full_name, avatar_url, job_title')
                .in('email', emails);

            if (profilesError) throw profilesError;

            // 3. Merge data
            const combined = members.map(member => {
                const profile = profiles.find(p => p.email === member.email);
                return { ...member, profile };
            });
            return res.json(combined);
        }

        // If no emails (unlikely for team members), return members as is
        res.json(members);

    } catch (err) {
        console.error('Error fetching team:', err);
        res.status(500).json({ error: 'Failed to load team members' });
    }
});

// POST /team/invite - Invite a user
router.post('/invite', async (req, res) => {
    try {
        const { email, role } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        // 1. Send Official Supabase Invite (if admin client available)
        // This creates the user in auth.users if they don't exist, and sends an email.
        if (adminSupabase) {
            const { data: authData, error: authError } = await adminSupabase.auth.admin.inviteUserByEmail(email);

            if (authError) {
                console.warn('Supabase Auth Invite Warning:', authError.message);
                // We proceed anyway because they might already be a user, just not in this team
            } else {
                console.log('User invited via Supabase Auth:', email);
            }
        } else {
            console.warn('No adminSupabase client available - skipping auth invite.');
        }

        // 2. Check if already invited to this team
        const { data: existing } = await req.supabase
            .from('team_members')
            .select('id')
            .eq('owner_id', req.user.id)
            .eq('email', email)
            .single();

        if (existing) {
            // Update role if exists?
            const { error: updateError } = await req.supabase
                .from('team_members')
                .update({ role, status: 'pending' })
                .eq('id', existing.id);
            if (updateError) throw updateError;
            return res.json({ message: 'Updated existing invite' });
        }

        const { data, error } = await req.supabase
            .from('team_members')
            .insert([{
                owner_id: req.user.id,
                email: email.trim().toLowerCase(), // Normalize for RLS consistency
                role: role || 'editor',
                status: 'pending'
            }])
            .select();

        if (error) throw error;

        res.status(201).json(data[0]);
    } catch (err) {
        console.error('Error inviting member:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /team/accept-auto - Auto accept invitations for the logged-in user
router.post('/accept-auto', async (req, res) => {
    try {
        const { data: { user }, error: userError } = await req.supabase.auth.getUser();
        if (userError || !user || !user.email) return res.status(401).json({ error: 'User email not found' });

        const { error: updateError } = await req.supabase
            .from('team_members')
            .update({ status: 'accepted' })
            .eq('email', user.email)
            .eq('status', 'pending');

        if (updateError) throw updateError;
        res.json({ success: true, message: 'Invites accepted' });
    } catch (err) {
        console.error('Auto accept error:', err);
        res.status(500).json({ error: 'Failed to accept invites' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        // 1. Get the member's details first to know the email
        const { data: member, error: fetchError } = await req.supabase
            .from('team_members')
            .select('email')
            .eq('id', req.params.id)
            .eq('owner_id', req.user.id) // Security check
            .single();

        if (fetchError || !member) return res.status(404).json({ error: 'Member not found' });

        // 2. Delete from team_members (Database)
        const { error: deleteError } = await req.supabase
            .from('team_members')
            .delete()
            .eq('id', req.params.id);

        if (deleteError) throw deleteError;

        // NOTE: We intentionally do NOT delete the Auth user here!
        // The user may be a member of other workspaces, so we only remove
        // them from THIS team. Their account remains intact.
        console.log(`Removed team member: ${member.email} from workspace ${req.user.id}`);

        res.json({ success: true });
    } catch (err) {
        console.error('Error removing member:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
