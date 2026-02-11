const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../authMiddleware');
const { adminSupabase } = require('../supabaseClient');
const { calculateHealthScore } = require('../utils/healthScore');
const {
  sendInvoiceEmail,
  sendProjectInviteEmail,
  sendProjectUpdateEmail,
  sendMilestoneUpdateEmail,
  sendHealthScoreAlertEmail
} = require('../services/email');

// Rate limiting for project operations
const projectsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100, // 100 requests per minute (heavier usage expected)
  message: { error: 'Too many requests, please try again later.' }
});

router.use(authMiddleware);
router.use(projectsLimiter);

/**
 * Recalculates and persists health score to DB
 */
async function syncProjectHealth(projectId, workspaceId) {
  try {
    // 1. Get owner settings (weights + thresholds)
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('health_weights, stale_alert_days')
      .eq('id', workspaceId)
      .single();

    // 2. Get project + milestones
    const { data: project, error: pErr } = await adminSupabase
      .from('projects')
      .select('*, project_milestones(*)')
      .eq('id', projectId)
      .single();

    if (pErr || !project) return;

    // 3. Calc
    const thresholds = {
      INACTIVITY_DAYS: profile?.stale_alert_days || 7
    };
    const score = calculateHealthScore(project, project.project_milestones, profile?.health_weights, thresholds);

    // 4. Update using adminSupabase to ensure it persists and bypasses RLS
    await adminSupabase.from('projects').update({ health_score: score }).eq('id', projectId);
    console.log(`[Health Sync] Project ${projectId} score updated to ${score}`);
  } catch (err) {
    console.error('[Health Sync Error]', err);
  }
}

/**
 * Recalculates health for ALL projects in a workspace
 */
async function syncAllWorkspaceHealth(workspaceId) {
  try {
    const { data: projects } = await adminSupabase
      .from('projects')
      .select('id')
      .eq('user_id', workspaceId);

    if (projects) {
      console.log(`[Batch Health Sync] Starting for workspace ${workspaceId} (${projects.length} projects)`);
      for (const p of projects) {
        await syncProjectHealth(p.id, workspaceId);
      }
    }
  } catch (err) {
    console.error('[Batch Health Sync Error]', err);
  }
}

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
        is_archived,
        updated_at,
        archived_at,
        health_score,
        last_action_at,
        project_milestones(*),
        clients(client_name)
      `)
      .order('updated_at', { ascending: false });

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
    // RBAC Check
    if (req.user.role === 'viewer') {
      return res.status(403).json({ error: 'Viewers permission denied' });
    }

    const { project_title, status, eta, client_id, description, total_amount, monthly_revenue, auto_invoice } = req.body;

    if (!project_title || !client_id) {
      return res.status(400).json({ error: 'Missing required fields: project_title or client_id' });
    }

    // Check plan limits
    if (req.user.plan === 'free') {
      const { count, error: countError } = await req.supabase
        .from('projects')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;

      if (count >= 10) {
        return res.status(403).json({
          error: 'Limit reached',
          details: 'Free plan is limited to 10 projects. Please upgrade to Pro for unlimited projects.'
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
        auto_invoice: auto_invoice || false,
        user_id: req.user.workspace_id || req.user.id,
        last_action_at: new Date().toISOString() // Set initial activity
      }])
      .select();

    if (error) {
      console.error('Error creating project (DB):', error);
      return res.status(500).json({ error: 'Database Error' });
    }

    // Health calculation offloaded to background job
    // syncProjectHealth(data[0].id, req.user.workspace_id);

    // [NEW] Send Project Invite Email (Async)
    if (client_id) {
      (async () => {
        try {
          // 1. Fetch Client & Workspace details
          const [{ data: client }, { data: workspace }] = await Promise.all([
            req.supabase.from('clients').select('email, public_token').eq('id', client_id).single(),
            req.supabase.from('profiles').select('stripe_account_name, primary_color, slug, company_name, email, client_notify_project_create').eq('id', req.user.workspace_id).single()
          ]);

          if (client?.email && client?.public_token && workspace && workspace.client_notify_project_create !== false) {
            const portalUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/client/${client.public_token}`;
            await sendProjectInviteEmail(client.email, {
              sender_name: workspace.company_name || workspace.stripe_account_name || 'Satusso User',
              project_title: project_title,
              portal_url: portalUrl,
              branding_color: workspace.primary_color,
              reply_to: workspace.email
            });
            console.log(`[Email] Project Invite sent to ${client.email}`);
          }
        } catch (emailErr) {
          console.error('[Email] Failed to send project invite:', emailErr);
        }
      })();
    }

    res.status(201).json(data[0]);
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});




// PUT /projects/:id - projekt frissítése
// SECURITY: RBAC + explicit workspace check
router.put('/:id', async (req, res) => {
  try {
    // RBAC Check
    if (req.user.role === 'viewer') {
      return res.status(403).json({ error: 'Viewers cannot modify projects' });
    }

    const { id } = req.params;
    const { project_title, status, eta, description, client_id, total_amount, monthly_revenue } = req.body;
    const updates = req.body;

    if (!project_title || !client_id) {
      return res.status(400).json({ error: 'Missing required fields: project_title or client_id' });
    }

    // Fetch original project BEFORE update (needed for email notification comparison)
    const { data: originalProject, error: fetchError } = await req.supabase
      .from('projects')
      .select('*, project_milestones(*)')
      .eq('id', id)
      .eq('user_id', req.user.workspace_id) // SECURITY: Workspace check
      .single();

    if (fetchError || !originalProject) {
      return res.status(404).json({ error: 'Project not found or access denied' });
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
        monthly_revenue: monthly_revenue || 0,
        last_action_at: new Date().toISOString() // Update on user edit
      })
      .eq('id', id)
      .eq('user_id', req.user.workspace_id) // SECURITY: Workspace check
      .select();

    if (error) {
      console.error('Error updating project (DB):', error);
      return res.status(500).json({ error: 'Database Error' });
    }
    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Health calculation offloaded to background job
    // syncProjectHealth(id, req.user.workspace_id);

    // [NEW] Send Email Notifications (Async)
    if (data && data[0]) {
      (async () => {
        try {
          // 1. Fetch Client Email (from project -> client) & Workspace
          const projectId = data[0].id; // Confirmed updated project
          const projectTitle = data[0].project_title;
          const clientId = data[0].client_id;

          // 2. Determine if status changed
          const statusChanged = updates.status && updates.status !== originalProject.status;

          // 3. Check for specific changes

          // A) Status Change -> Project Update Email
          if (statusChanged && originalProject.client_id) {
            const [{ data: client }, { data: workspace }] = await Promise.all([
              req.supabase.from('clients').select('email, public_token').eq('id', clientId).single(),
              req.supabase.from('profiles').select('stripe_account_name, primary_color, slug, company_name, email, client_notify_project_update').eq('id', req.user.workspace_id).single()
            ]);

            if (client?.email && client?.public_token && workspace && workspace.client_notify_project_update !== false) {
              const portalUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/client/${client.public_token}`;
              await sendProjectUpdateEmail(client.email, {
                sender_name: workspace.company_name || workspace.stripe_account_name || 'Satusso User',
                project_title: projectTitle,
                new_status: updates.status,
                portal_url: portalUrl,
                branding_color: workspace.primary_color,
                reply_to: workspace.email
              });
              console.log(`[Email] Status update sent to ${client.email} for project ${projectId}`);
            }
          }

          // B) Milestone Completion Check
          // We need to compare old vs newly updated milestones. 
          // Since Supabase update returns the new data, we can check that.
          // However, we need to know WHICH milestone changed.
          // Simplification: Check if any milestone in 'data' is marked 'done' and wasn't before? 
          // Actually, 'data' (from req.body) might just contain the specific changed fields or the whole array.
          // If we receive the whole milestones array, we can compare.
          if (updates.milestones && Array.isArray(updates.milestones) && originalProject.milestones) {
            const newMilestones = updates.milestones;
            const oldMilestones = originalProject.milestones;

            // Find any milestone that is now 'done' but wasn't before
            const justCompleted = newMilestones.find(nm =>
              nm.status === 'done' &&
              oldMilestones.find(om => om.id === nm.id && om.status !== 'done')
            );

            if (justCompleted) {
              // Fetch settings to check client_notify_milestone_update
              const { data: profile } = await req.supabase.from('profiles').select('client_notify_milestone_update, company_name, email, primary_color').eq('id', req.user.workspace_id).single();
              const { data: client } = await req.supabase.from('clients').select('email, public_token').eq('id', originalProject.client_id || updates.client_id).single();

              if (profile && profile.client_notify_milestone_update === true && client?.email && client?.public_token) {
                await sendMilestoneUpdateEmail(client.email, {
                  sender_name: profile.company_name || 'Satusso User',
                  project_title: updates.project_title || originalProject.project_title,
                  milestone_name: justCompleted.title,
                  portal_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/client/${client.public_token}`,
                  branding_color: profile.primary_color,
                  reply_to: profile.email
                });
                console.log(`[Email] Milestone update sent for "${justCompleted.title}"`);
              }
            }
          }

          // C) Health Score Drop Check
          if (updates.health_score !== undefined) {
            const oldScore = originalProject.health_score || 100;
            const newScore = updates.health_score;

            if (oldScore >= 50 && newScore < 50) {
              // Fetch settings to check team_notify_health_score_drop
              const { data: profile } = await req.supabase.from('profiles').select('team_notify_health_score_drop, email, primary_color').eq('id', req.user.workspace_id).single();

              if (profile && profile.team_notify_health_score_drop !== false && profile.email) {
                await sendHealthScoreAlertEmail(profile.email, {
                  project_title: updates.project_title || originalProject.project_title,
                  health_score: newScore,
                  branding_color: profile.primary_color,
                  dashboard_url: `${process.env.FRONTEND_URL}/projects/${id}`
                });
                console.log(`[Email] Health Score Alert sent (Score: ${newScore})`);
              }
            }
          }
        } catch (emailErr) {
          console.error('[Email] Failed to send status update:', emailErr);
        }
      })();
    }

    res.json(data[0]);
  } catch (err) {
    console.error('Error updating project:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});




// DELETE /projects/:id - projekt törlése
// SECURITY: Explicit workspace check to prevent IDOR (even though RLS is active)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await req.supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.workspace_id) // Explicit workspace check
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PATCH /projects/:id/archive - projekt archiválása/visszaállítása
router.patch('/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_archived } = req.body;

    const { data, error } = await adminSupabase
      .from('projects')
      .update({
        is_archived: !!is_archived,
        archived_at: is_archived ? new Date().toISOString() : null
      })
      .eq('id', id)
      .eq('user_id', req.user.workspace_id)
      .select();

    if (error) {
      console.error('[DEBUG] Archive DB Error:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Project not found or access denied.' });
    }

    res.json(data[0]);
  } catch (err) {
    console.error('Error archiving project:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
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

    // Health calculation offloaded to background job
    // syncProjectHealth(id, req.user.workspace_id);

    res.status(201).json(data[0]);
  } catch (err) {
    console.error('Error creating milestone:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /projects/milestones/:milestoneId - Update a milestone
// SECURITY: RBAC + explicit workspace check
router.put('/milestones/:milestoneId', async (req, res) => {
  try {
    // RBAC Check
    if (req.user.role === 'viewer') {
      return res.status(403).json({ error: 'Viewers cannot modify milestones' });
    }

    const { milestoneId } = req.params;
    const { title, status, order_index } = req.body;

    // 1. Fetch milestone to get its project_id
    const { data: existingMilestone, error: msError } = await req.supabase
      .from('project_milestones')
      .select('project_id')
      .eq('id', milestoneId)
      .single();

    if (msError || !existingMilestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    // 2. Verify project ownership (workspace check)
    const { data: project, error: projectError } = await req.supabase
      .from('projects')
      .select('id')
      .eq('id', existingMilestone.project_id)
      .eq('user_id', req.user.workspace_id)
      .single();

    if (projectError || !project) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // 3. Perform the update
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

    if (data && data[0] && data[0].project_id) {
      // Update the parent project's last_action_at timestamp too
      await adminSupabase.from('projects').update({ last_action_at: new Date().toISOString() }).eq('id', data[0].project_id);
      // syncProjectHealth(data[0].project_id, req.user.workspace_id);
    }

    res.json(data[0]);
  } catch (err) {
    console.error('Error updating milestone:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /projects/milestones/:milestoneId - Delete a milestone
// SECURITY: Explicit workspace check to prevent IDOR
router.delete('/milestones/:milestoneId', async (req, res) => {
  try {
    const { milestoneId } = req.params;

    // 1. Fetch milestone to get its project_id
    const { data: milestone, error: fetchError } = await req.supabase
      .from('project_milestones')
      .select('project_id')
      .eq('id', milestoneId)
      .single();

    if (fetchError || !milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    // 2. Verify project ownership (workspace check)
    const { data: project, error: projectError } = await req.supabase
      .from('projects')
      .select('id')
      .eq('id', milestone.project_id)
      .eq('user_id', req.user.workspace_id)
      .single();

    if (projectError || !project) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // 3. Delete the milestone
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

// ==================== INTERACTION ROUTES ====================

// GET /projects/interactions - Get all interactions for user's projects (The "Feed")
// SCALE: Limited to 100 results for performance
router.get('/interactions', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('interactions')
      .select(`
        *,
        projects(project_title),
        clients(client_name)
      `)
      .order('created_at', { ascending: false })
      .limit(100);  // SCALE: Pagination limit

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching interactions:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /projects/interactions/unread-count - Get total unread messages
router.get('/interactions/unread-count', async (req, res) => {
  try {
    const { count, error } = await req.supabase
      .from('interactions')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('author_type', 'client'); // Only count messages from clients

    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (err) {
    console.error('Error fetching unread count:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PATCH /projects/interactions/:projectId/read - Mark messages as read for a project
router.patch('/interactions/:projectId/read', async (req, res) => {
  try {
    const { projectId } = req.params;
    console.log(`[DEBUG] Attempting to mark interactions as read for project: ${projectId} for user: ${req.user.id}`);

    const query = req.supabase
      .from('interactions')
      .update({ is_read: true })
      .eq('is_read', false);

    if (projectId === 'general') {
      query.is('project_id', null);
    } else {
      query.eq('project_id', projectId);
    }

    const { data, error } = await query.select();

    if (error) {
      console.error('[DEBUG] Error updating interactions:', error);
      throw error;
    }

    console.log(`[DEBUG] Successfully marked ${data?.length || 0} interactions as read.`);
    res.status(204).send();
  } catch (err) {
    console.error('Error marking read:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// POST /projects/:id/interaction - Freelancer posts an interaction
router.post('/:id/interaction', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, content, is_internal } = req.body;

    // Insert interaction as freelancer
    const { data, error } = await req.supabase
      .from('interactions')
      .insert([{
        project_id: id === 'general' ? null : id,
        user_id: req.user.id,
        workspace_id: req.user.workspace_id,
        type,
        content,
        is_internal: is_internal !== undefined ? is_internal : true,
        author_type: 'freelancer',
        author_name: req.user.full_name || 'Freelancer'
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error posting interaction:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = {
  router,
  syncProjectHealth,
  syncAllWorkspaceHealth
};
