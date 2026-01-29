const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');

router.use(authMiddleware);

// GET /projects - összes projekt lekérése, opcionálisan client_id alapján szűrve

router.get('/', async (req, res) => {
  try {
    // Lekérjük a projekteket, és hozzákapcsoljuk az ügyfél nevét is
    const { data, error } = await req.supabase
      .from('projects')
      .select(`
        id,
        project_title,
        status,
        eta,
        description,
        client_id,
        created_at,
        clients(client_name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});





// POST /projects - új projekt létrehozása
router.post('/', async (req, res) => {
  try {
    const { project_title, status, eta, client_id, description } = req.body;

    if (!project_title || !client_id) {
      return res.status(400).json({ error: 'Missing required fields: project_title or client_id' });
    }

    const { data, error } = await req.supabase
      .from('projects')
      .insert([{
        project_title,
        status,
        eta,
        description,
        client_id,
        user_id: req.user.id
      }])
      .select();

    if (error) {
      console.error('Error creating project (DB):', error);
      return res.status(500).json({ error: 'Database Error' });
    }

    res.status(201).json(data[0]);
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});





// PUT /projects/:id - projekt frissítése
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { project_title, status, eta, description, client_id } = req.body;

    if (!project_title || !client_id) {
      return res.status(400).json({ error: 'Missing required fields: project_title or client_id' });
    }

    const { data, error } = await req.supabase
      .from('projects')
      .update({ project_title, status, eta, description, client_id })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Error updating project (DB):', error);
      return res.status(500).json({ error: 'Database Error' });
    }
    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json(data[0]);
  } catch (err) {
    console.error('Error updating project:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});




// DELETE /projects/:id - projekt törlése
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await req.supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
