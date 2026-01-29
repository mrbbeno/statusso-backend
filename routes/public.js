const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// GET /public/client/:publicToken - Publicly fetch client info and projects
router.get('/client/:publicToken', async (req, res) => {
    const { publicToken } = req.params;

    try {
        console.log('Incoming publicToken:', publicToken);
        // 1. Fetch Client info (SELECTIVE)
        // We try BOTH public_token and numeric ID to maximize compatibility
        let query = supabase
            .from('clients')
            .select('id, client_name');

        if (publicToken.match(/^[0-9a-fA-F-]{36}$/)) {
            // It's a UUID
            query = query.eq('public_token', publicToken);
        } else if (!isNaN(publicToken)) {
            // It's a numeric ID
            query = query.eq('id', publicToken);
        } else {
            // Just try public_token anyway
            query = query.eq('public_token', publicToken);
        }

        const { data: client, error: clientError } = await query.single();

        if (clientError) {
            console.error('Client Query Error:', clientError);
            return res.status(404).json({
                error: 'Client not found',
                details: clientError.message,
                code: clientError.code,
                hint: clientError.hint
            });
        }

        if (!client) {
            console.warn('No client found for token:', publicToken);
            return res.status(404).json({ error: 'Client not found', details: 'No rows returned' });
        }

        const clientId = client.id;

        // 2. Fetch Projects (SELECTIVE)
        const { data: projects, error: projectsError } = await supabase
            .from('projects')
            .select('id, project_title, status, eta, description') // Only public info
            .eq('client_id', clientId)
            .order('created_at', { ascending: false });

        if (projectsError) {
            console.error('Projects Query Error:', projectsError);
            throw projectsError;
        }

        console.log(`Successfully fetched ${projects ? projects.length : 0} projects for client ID: ${clientId}`);
        res.json({ client, projects });
    } catch (err) {
        console.error('Public fetch error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
