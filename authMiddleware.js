const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

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
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            console.error('Auth error:', error);
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Create a scoped supabase client for this user
        const scopedSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            },
        });

        // Fetch user plan from profiles
        const { data: profile } = await supabase
            .from('profiles')
            .select('plan')
            .eq('id', user.id)
            .maybeSingle();

        req.user = {
            ...user,
            plan: profile?.plan || 'free'
        };
        req.supabase = scopedSupabase;
        next();
    } catch (err) {
        console.error('Middleware error:', err);
        res.status(500).json({ error: 'Server error during authentication' });
    }
};

module.exports = authMiddleware;
