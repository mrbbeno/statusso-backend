const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// GET /public/client/:publicToken - Publicly fetch client info and projects
router.get('/client/:publicToken', async (req, res) => {
    const { publicToken } = req.params;

    try {
        // 1. Fetch Client info (SELECTIVE) by public_token
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, client_name') // Only public info
            .eq('public_token', publicToken)
            .single();

        if (clientError || !client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const clientId = client.id;

        // 2. Fetch Projects (SELECTIVE)
        const { data: projects, error: projectsError } = await supabase
            .from('projects')
            .select('id, project_title, status, eta, description') // Only public info
            .eq('client_id', clientId)
            .order('created_at', { ascending: false });

        if (projectsError) throw projectsError;

        res.json({ client, projects });
    } catch (err) {
        console.error('Public fetch error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
