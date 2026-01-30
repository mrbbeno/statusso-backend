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
        total_amount,
        monthly_revenue,
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
    const { project_title, status, eta, client_id, description, total_amount, monthly_revenue } = req.body;

    if (!project_title || !client_id) {
      return res.status(400).json({ error: 'Missing required fields: project_title or client_id' });
    }

    // Check plan limits
    if (req.user.plan === 'free') {
      const { count, error: countError } = await req.supabase
        .from('projects')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;

      if (count >= 3) {
        return res.status(403).json({
          error: 'Limit reached',
          details: 'Free plan is limited to 3 projects. Please upgrade to Pro for unlimited projects.'
        });
      }
    }

    const { data, error } = await req.supabase
      .from('projects')
      .insert([{
        project_title,
        status,
        eta,
        description,
        client_id,
        total_amount: total_amount || 0,
        monthly_revenue: monthly_revenue || 0,
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
    const { project_title, status, eta, description, client_id, total_amount, monthly_revenue } = req.body;

    if (!project_title || !client_id) {
      return res.status(400).json({ error: 'Missing required fields: project_title or client_id' });
    }

    const { data, error } = await req.supabase
      .from('projects')
      .update({
        project_title,
        status,
        eta,
        description,
        client_id,
        total_amount: total_amount || 0,
        monthly_revenue: monthly_revenue || 0
      })
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

// ==================== MILESTONE ROUTES ====================

// GET /projects/:id/milestones - Get all milestones for a project
router.get('/:id/milestones', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify project ownership
    const { data: project, error: projectError } = await req.supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { data, error } = await req.supabase
      .from('project_milestones')
      .select('*')
      .eq('project_id', id)
      .order('order_index', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching milestones:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /projects/:id/milestones - Add a new milestone
router.post('/:id/milestones', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, status, order_index } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Missing required field: title' });
    }

    // Verify project ownership
    const { data: project, error: projectError } = await req.supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { data, error } = await req.supabase
      .from('project_milestones')
      .insert([{
        project_id: id,
        title,
        status: status || 'To Do',
        order_index: order_index || 0
      }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    console.error('Error creating milestone:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /projects/milestones/:milestoneId - Update a milestone
router.put('/milestones/:milestoneId', async (req, res) => {
  try {
    const { milestoneId } = req.params;
    const { title, status, order_index } = req.body;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (status !== undefined) updateData.status = status;
    if (order_index !== undefined) updateData.order_index = order_index;

    const { data, error } = await req.supabase
      .from('project_milestones')
      .update(updateData)
      .eq('id', milestoneId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    res.json(data[0]);
  } catch (err) {
    console.error('Error updating milestone:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /projects/milestones/:milestoneId - Delete a milestone
router.delete('/milestones/:milestoneId', async (req, res) => {
  try {
    const { milestoneId } = req.params;

    const { error } = await req.supabase
      .from('project_milestones')
      .delete()
      .eq('id', milestoneId);

    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting milestone:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
