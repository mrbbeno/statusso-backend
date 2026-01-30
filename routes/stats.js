const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');

router.use(authMiddleware);

router.get('/', async (req, res) => {
    try {
        const [clientsCount, projectsCount] = await Promise.all([
            req.supabase.from('clients').select('*', { count: 'exact', head: true }),
            req.supabase.from('projects').select('*', { count: 'exact', head: true })
        ]);

        if (clientsCount.error) throw clientsCount.error;
        if (projectsCount.error) throw projectsCount.error;

        res.json({
            totalClients: clientsCount.count,
            totalProjects: projectsCount.count
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
