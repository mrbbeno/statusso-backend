const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { adminSupabase: supabase } = require('../supabaseClient');
const { sendReactionNotificationEmail } = require('../services/email');

// SECURITY: Rate limit public endpoints to prevent abuse
const publicLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute per IP
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.use(publicLimiter);

// GET /public/client/:publicToken - Publicly fetch client info and projects
router.get('/client/:publicToken', async (req, res) => {
    const { publicToken } = req.params;

    try {
        console.log('Incoming publicToken:', publicToken);

        // SECURITY: Only accept UUID format tokens (reject numeric IDs)
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (!UUID_REGEX.test(publicToken)) {
            console.warn(`[SECURITY] Rejected non-UUID token attempt: ${publicToken}`);
            return res.status(400).json({
                error: 'Invalid token format',
                hint: 'Portal access requires a valid access token from your invitation email.'
            });
        }

        // 1. Fetch Client info by public_token ONLY (never by ID)
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, client_name, user_id, public_token')
            .eq('public_token', publicToken)
            .single();

        if (clientError || !client) {
            console.error('Client Query Error:', clientError || 'No client found');
            return res.status(404).json({
                error: 'Client not found',
                details: clientError ? clientError.message : 'No rows returned'
            });
        }

        const clientId = client.id;
        const ownerId = client.user_id;

        // 2. Fetch Owner Settings (from profiles)
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('enable_comments, enable_reactions, enable_client_requests, history_access, show_stats, show_timeline, plan, company_name, primary_color, bg_color, text_color, card_color, enable_onboarding, require_onboarding, portal_intro')
            .eq('id', ownerId)
            .single();

        // 3. Fetch Projects (SELECTIVE)
        const { data: projects, error: projectsError } = await supabase
            .from('projects')
            .select(`
                id, 
                project_title, 
                status, 
                eta, 
                description, 
                created_at, 
                updated_at,
                project_milestones (
                    id, 
                    title, 
                    status, 
                    order_index
                ),
                interactions (
                    id,
                    type,
                    content,
                    author_type,
                    is_internal,
                    created_at
                )
            `)
            .eq('client_id', clientId)
            .order('created_at', { ascending: false })
            .limit(20); // SECURITY: Limit projects to prevent unbounded queries

        if (projectsError) {
            console.error('Projects Query Error:', projectsError);
            throw projectsError;
        }

        console.log(`Successfully fetched ${projects ? projects.length : 0} projects for client ID: ${clientId}`);
        res.json({
            client,
            projects,
            settings: profile || {
                enable_comments: true,
                enable_reactions: true,
                enable_client_requests: false,
                history_access: 'full'
            }
        });
    } catch (err) {
        console.error('Public fetch error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /public/project/:projectId/interaction - Let client post a comment or reaction
// SECURITY: Requires public_token to verify the client owns this project
router.post('/project/:projectId/interaction', async (req, res) => {
    const { projectId } = req.params;
    const { type, content, author_name, public_token } = req.body;

    // SECURITY: Validate public_token is provided
    if (!public_token) {
        return res.status(400).json({ error: 'Missing public_token' });
    }

    try {
        // 1. Verify the client token first
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id')
            .eq('public_token', public_token)
            .single();

        if (clientError || !client) {
            return res.status(403).json({ error: 'Invalid or expired access token' });
        }

        // 2. Get project and verify client ownership
        const { data: project, error: pError } = await supabase
            .from('projects')
            .select('id, user_id, client_id')
            .eq('id', projectId)
            .single();

        if (pError || !project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // SECURITY: Verify this client owns this project
        if (project.client_id !== client.id) {
            console.warn(`[SECURITY] Token mismatch: Client ${client.id} tried to access project ${projectId} owned by client ${project.client_id}`);
            return res.status(403).json({ error: 'Access denied to this project' });
        }

        // 2. Insert interaction
        const { data, error } = await supabase
            .from('interactions')
            .insert([{
                project_id: projectId,
                client_id: project.client_id, // SECURITY: Always use project's client_id, never trust request body
                user_id: project.user_id,
                workspace_id: project.user_id, // project.user_id is the workspace owner ID
                type,
                content,
                is_internal: false,
                author_type: 'client',
                author_name: author_name || 'Client'
            }])
            .select()
            .single();

        if (error) {
            console.error('DATABASE ERROR while inserting interaction:', error);
            return res.status(500).json({ error: 'Database Error', details: error.message });
        }
        console.log('Interaction saved successfully:', data.id);

        // 3. Send Notification Email to Owner
        try {
            const { data: ownerProfile } = await supabase
                .from('profiles')
                .select('email, team_notify_reactions, company_name, primary_color')
                .eq('id', project.user_id)
                .single();

            // Check if notification is enabled (default false)
            if (ownerProfile && ownerProfile.email && ownerProfile.team_notify_reactions === true) {
                // Fetch project title for context
                const { data: projectDetails } = await supabase
                    .from('projects')
                    .select('project_title')
                    .eq('id', projectId)
                    .single();

                sendReactionNotificationEmail(ownerProfile.email, {
                    client_name: author_name || 'Client',
                    project_title: projectDetails?.project_title || 'Project',
                    reaction_type: type === 'reaction' ? 'reacted to' : 'commented on',
                    branding_color: ownerProfile.primary_color,
                    dashboard_url: `${process.env.FRONTEND_URL}/projects/${projectId}`
                }).catch(err => console.error('[Email] Reaction notification failed:', err));
                console.log(`[Email] Reaction notification queued for ${ownerProfile.email}`);
            }
        } catch (emailErr) {
            console.error('[Email] Failed to send reaction notification:', emailErr);
            // Don't block response
        }

        res.status(201).json(data);
    } catch (err) {
        console.error('PORTAL INTERACTION FATAL ERROR:', err);
        res.status(500).json({ error: 'Failed to post interaction', details: err.message });
    }
});



module.exports = router;
