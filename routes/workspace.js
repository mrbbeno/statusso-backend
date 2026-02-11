const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../authMiddleware');
const { adminSupabase } = require('../supabaseClient');
const { syncAllWorkspaceHealth } = require('./projects');

// Rate limiting for workspace operations
const workspaceLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30, // 30 requests per minute
    message: { error: 'Too many requests, please try again later.' }
});

router.use(authMiddleware);
router.use(workspaceLimiter);

// GET /workspace/settings - Get the shared settings for the current workspace
router.get('/settings', async (req, res) => {
    try {
        const workspaceId = req.user.workspace_id;
        console.log(`[Workspace Route] Fetching settings for user ${req.user.email}. Workspace: ${workspaceId}, Role: ${req.user.role}, Plan: ${req.user.plan}`);

        // Fetch the OWNER'S profile (this contains the shared settings)
        // We use adminSupabase to bypass RLS if needed, ensuring we get the data
        const client = adminSupabase || req.supabase;

        const { data: settings, error } = await client
            .from('profiles')
            .select('*')
            .eq('id', workspaceId)
            .maybeSingle();

        if (error) {
            console.error('[Workspace Settings] DB Error:', error);
            throw error;
        }

        if (!settings) {
            console.warn(`[Workspace Settings] No profile found for workspace/user: ${workspaceId}`);
            // Return defaults if profile is missing (should not happen usually)
            return res.json({
                role: req.user.role || 'owner',
                is_owner: req.user.id === workspaceId,
                plan: 'free',
                stale_alert_days: 7,
                auto_archive: false,
                weekend_mode: false
            });
        }

        // Return combined data: Settings + Current User's Role + Workspace Info
        res.json({
            ...settings,
            role: req.user.role || 'owner',
            is_owner: req.user.id === workspaceId,
            plan: settings.plan || 'free' // Ensure plan comes from owner
        });

    } catch (err) {
        console.error('Error fetching workspace settings:', err);
        res.status(500).json({ error: 'Failed to load workspace settings', details: err.message });
    }
});

// PUT /workspace/settings - Update shared settings (Owner/Admin only)
router.put('/settings', async (req, res) => {
    try {
        // RBAC Check
        if (req.user.role === 'viewer') {
            return res.status(403).json({ error: 'Viewers cannot change workspace settings' });
        }

        const workspaceId = req.user.workspace_id;
        const updates = req.body;

        // Prevent updating critical fields like id, email through this endpoint
        delete updates.id;
        delete updates.email;
        // delete updates.plan; // Allow manual plan update for now

        // 1. Fetch current settings to compare
        const { data: currentSettings } = await (adminSupabase || req.supabase)
            .from('profiles')
            .select('stale_alert_days, auto_archive, weekend_mode')
            .eq('id', workspaceId)
            .single();

        // 2. Perform Update
        const { data, error } = await (adminSupabase || req.supabase)
            .from('profiles')
            .update(updates)
            .eq('id', workspaceId)
            .select();

        if (error) throw error;

        // 3. Conditional Sync: Only if health-affecting fields changed
        const shouldSync =
            (updates.stale_alert_days !== undefined && updates.stale_alert_days !== currentSettings?.stale_alert_days) ||
            (updates.auto_archive !== undefined && updates.auto_archive !== currentSettings?.auto_archive) ||
            (updates.weekend_mode !== undefined && updates.weekend_mode !== currentSettings?.weekend_mode);

        if (shouldSync) {
            console.log('[Workspace] Health settings changed, triggering sync...');
            syncAllWorkspaceHealth(workspaceId);
        }

        res.json(data[0]);

    } catch (err) {
        console.error('Error updating workspace settings:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

module.exports = router;
