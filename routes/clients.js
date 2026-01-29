const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');

router.use(authMiddleware);

// GET /clients - összes kliens lekérése (user-specific)
router.get('/', async (req, res) => {
  try {
    // RLS handles filtering, but good practice to allow explicit user_id filter if needed
    const { data, error } = await req.supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error fetching clients:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /clients - új kliens létrehozása
// routes/clients.js

router.post('/', async (req, res) => {
  try {
    const { client_name, phone, email, projects } = req.body;

    if (!client_name) {
      return res.status(400).json({ error: 'client_name is required' });
    }

    // Létrehozzuk az ügyfelet
    const { data: clientData, error: clientError } = await req.supabase
      .from('clients')
      .insert([{
        client_name,
        phone,
        email,
        user_id: req.user.id,
        public_token: require('crypto').randomUUID()
      }])
      .select();

    if (clientError) throw clientError;

    const clientId = clientData[0].id;

    // Ha vannak projektek, akkor beillesztjük őket a kliens ID-val
    if (Array.isArray(projects) && projects.length > 0) {
      const projectsToInsert = projects.map(p => ({
        ...p,
        client_id: clientId,
        user_id: req.user.id,
      }));

      const { error: projectsError } = await req.supabase
        .from('projects')
        .insert(projectsToInsert);

      if (projectsError) throw projectsError;
    }

    res.status(201).json(clientData[0]);
  } catch (err) {
    console.error('Error creating client:', err);
    res.status(400).json({ error: 'Failed to create client' });
  }
});


// PUT /clients/:id - kliens frissítése
router.put('/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const { client_name, phone, email, projects } = req.body;

  try {
    // 1. Frissítjük az ügyfelet
    const { data: clientData, error: clientError } = await req.supabase
      .from('clients')
      .update({ client_name, phone, email })
      .eq('id', clientId)
      // .eq('user_id', req.user.id) // RLS handles this, but safer
      .select()
      .single();

    if (clientError) throw clientError;

    // 2. Projektek szinkronizálása (Biztonságos frissítés)
    if (Array.isArray(projects)) {
      // a) Lekérjük a jelenlegi projektek ID-it
      const { data: existingProjects, error: fetchError } = await req.supabase
        .from('projects')
        .select('id')
        .eq('client_id', clientId);

      if (fetchError) throw fetchError;

      const existingIds = existingProjects.map(p => p.id);

      // b) Azonosítjuk a bejövő ID-kat (amiknek van ID-ja, azok frissítések/megtartások)
      const incomingIds = projects
        .filter(p => p.id)
        .map(p => p.id);

      // c) Törölni kell azokat, amik a DB-ben vannak, de a bejövőben nincsenek
      const idsToDelete = existingIds.filter(id => !incomingIds.includes(id));

      if (idsToDelete.length > 0) {
        const { error: deleteError } = await req.supabase
          .from('projects')
          .delete()
          .in('id', idsToDelete);
        if (deleteError) throw deleteError;
      }

      // d) Upsert (Beszúrás vagy Frissítés)
      // Azok a projektek, amiknek nincs ID-ja, újként lesznek beszúrva.
      // Amiknek van ID-ja, és léteznek, frissülnek.
      if (projects.length > 0) {
        const projectsToUpsert = projects.map(p => ({
          ...p,
          client_id: clientId,
          user_id: req.user.id // Ensure user_id is set/preserved
        }));

        const { error: upsertError } = await req.supabase
          .from('projects')
          .upsert(projectsToUpsert);

        if (upsertError) throw upsertError;
      }
    }

    res.json(clientData);
  } catch (err) {
    console.error('Error updating client:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// DELETE /clients/:id - kliens törlése (és hozzá tartozó projektek is)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Megjegyzés: Ha az adatbázisban be van állítva a CASCADE delete, akkor a projekteket nem kell külön törölni.
    // De a biztonság kedvéért itt hagyjuk explicit módon.
    let { error } = await req.supabase.from('projects').delete().eq('client_id', id);
    if (error) throw error;
    ({ error } = await req.supabase.from('clients').delete().eq('id', id));
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting client:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
