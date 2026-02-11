const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../authMiddleware');

// Rate limiting for client operations
const clientsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // 60 requests per minute
  message: { error: 'Too many requests, please try again later.' }
});

router.use(authMiddleware);
router.use(clientsLimiter);

// GET /clients - összes kliens lekérése (user-specific)
// Soft-deleted kliensek nem jelennek meg
router.get('/', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('clients')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false') // Filter out soft-deleted
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
    // RBAC Check
    if (req.user.role === 'viewer') {
      return res.status(403).json({ error: 'Viewers permission denied' });
    }

    const {
      client_name, phone, email, projects,
      industry, country, contact_name, contact_position,
      secondary_email, billing_address, tax_id,
      preferred_payment_method, payment_terms, status
    } = req.body;

    if (!client_name) {
      return res.status(400).json({ error: 'client_name is required' });
    }

    // Check plan limits
    if (req.user.plan === 'free') {
      const { count, error: countError } = await req.supabase
        .from('clients')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;

      if (count >= 10) {
        return res.status(403).json({
          error: 'Limit reached',
          details: 'Free plan is limited to 10 clients. Please upgrade to Pro for unlimited clients.'
        });
      }
    }

    // Létrehozzuk az ügyfelet
    const { data: clientData, error: clientError } = await req.supabase
      .from('clients')
      .insert([{
        client_name,
        phone,
        email,
        industry,
        country,
        contact_name,
        contact_position,
        secondary_email,
        billing_address,
        tax_id,
        preferred_payment_method,
        payment_terms,
        status: status || 'active',
        user_id: req.user.workspace_id || req.user.id,
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
    res.status(400).json({
      error: 'Failed to create client',
      details: err.message,
      hint: 'Did you add the public_token column to the clients table?'
    });
  }
});


// PUT /clients/:id - kliens frissítése
// SECURITY: Explicit workspace check to prevent IDOR
router.put('/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const {
    client_name, phone, email, projects,
    industry, country, contact_name, contact_position,
    secondary_email, billing_address, tax_id,
    preferred_payment_method, payment_terms, status
  } = req.body;

  try {
    const { data: clientData, error: clientError } = await req.supabase
      .from('clients')
      .update({
        client_name, phone, email,
        industry, country, contact_name, contact_position,
        secondary_email, billing_address, tax_id,
        preferred_payment_method, payment_terms, status
      })
      .eq('id', clientId)
      .eq('user_id', req.user.workspace_id) // Explicit workspace check
      .select()
      .single();

    if (clientError) {
      if (clientError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Client not found or access denied' });
      }
      throw clientError;
    }

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


// DELETE /clients/:id - kliens SOFT törlése (adatok megmaradnak!)
// A projektek és számlák megmaradnak az archívumban.
// SECURITY: Explicit workspace check to prevent IDOR
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // SOFT DELETE: Mark as deleted instead of actually deleting
    // This preserves all historical data (projects, invoices, etc.)
    const { data, error } = await req.supabase
      .from('clients')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', req.user.workspace_id) // Explicit workspace check
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Client not found or access denied' });
    }

    console.log(`[Soft Delete] Client ${id} marked as deleted`);
    res.status(204).send();
  } catch (err) {
    console.error('Error soft-deleting client:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
