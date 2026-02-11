require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { adminSupabase } = require('./supabaseClient');

const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('CRITICAL: Supabase URL or Key missing in authMiddleware.');
}

// Client for validating the JWT (stateless)
const supabase = createClient(supabaseUrl, supabaseKey);

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token missing' });
    }

    try {
        // 1. Verify Token
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            console.error('Auth error:', error);
            return res.status(401).json({ error: 'Invalid token' });
        }

        // 2. Create Scoped Client for RLS
        const scopedSupabase = createClient(supabaseUrl, supabaseKey, {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            },
        });

        // 3. Setup Internal DB Client (Admin if available, else Scoped)
        // We use admin to bypass RLS for checking membership/plans to avoid recursion or visibility issues.
        const dbClient = adminSupabase || scopedSupabase;

        // 4. Determine Context (Workspace, Plan, Role)
        let workspaceId = user.id;
        let plan = 'free';
        let role = 'owner';

        // Check if user is a team member
        // Use ilike for case-insensitive matching
        // Logs to help verify if we are using Admin client (bypassing RLS) or Scoped
        const isUsingAdmin = !!adminSupabase;
        // console.log(`[AuthMiddleware] Using Admin Client: ${isUsingAdmin}`); 

        // console.log(`[AuthMiddleware] Looking up team membership for: ${user.email}`);

        const { data: membership, error: memberError } = await dbClient
            .from('team_members')
            .select('owner_id, role')
            .ilike('email', user.email)
            .maybeSingle();

        if (memberError) {
            console.error('[AuthMiddleware] Error finding team membership:', memberError);
        } else {
            // console.log(`[AuthMiddleware] Membership lookup for ${user.email}:`, membership ? `Found (Owner: ${membership.owner_id})` : 'Not Found');
        }

        if (membership && membership.owner_id) {
            // CASE A: User is a Team Member
            workspaceId = membership.owner_id;
            role = membership.role;

            // Fetch OWNER'S plan (inherit Pro features)
            const { data: ownerProfile } = await dbClient
                .from('profiles')
                .select('plan')
                .eq('id', workspaceId)
                .maybeSingle();

            plan = ownerProfile?.plan || 'free';

            // --- AUTO-SYNC: Update Member's Profile to match Owner's Plan ---
            // This ensures DB-level checks (RLS, Client Limits) pass for the member too.
            const { data: myProfile } = await dbClient
                .from('profiles')
                .select('plan')
                .eq('id', user.id)
                .maybeSingle();

            if (myProfile && myProfile.plan !== plan) {
                console.log(`[AuthMiddleware] Syncing Plan for ${user.email}: ${myProfile.plan} -> ${plan}`);
                await dbClient
                    .from('profiles')
                    .update({ plan: plan })
                    .eq('id', user.id);
            }
            // ---------------------------------------------------------------
        } else {
            // CASE B: User is acting as Owner
            // Fetch THEIR OWN plan
            const { data: myProfile } = await dbClient
                .from('profiles')
                .select('plan')
                .eq('id', user.id)
                .maybeSingle();

            plan = myProfile?.plan || 'free';
        }

        // 5. Attach to Request
        req.user = {
            ...user,
            plan,
            role,
            workspace_id: workspaceId
        };

        req.supabase = scopedSupabase;
        next();

    } catch (err) {
        console.error('Middleware error:', err);
        res.status(500).json({ error: 'Server error during authentication' });
    }
};

module.exports = authMiddleware;
