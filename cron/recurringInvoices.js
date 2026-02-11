const cron = require('node-cron');
const { createStripeInvoice } = require('../services/invoiceService');

const { supabase: userSupabase, adminSupabase } = require('../supabaseClient');
// Use adminSupabase to bypass RLS for cron tasks
const supabase = adminSupabase || userSupabase;

// Helper to calculate next run date
const calculateNextRun = (currentDate, interval = 'monthly') => {
    const date = new Date(currentDate);
    if (interval === 'minute') {
        date.setMinutes(date.getMinutes() + 1);
    } else if (interval === 'weekly') {
        date.setDate(date.getDate() + 7);
    } else if (interval === 'yearly') {
        date.setFullYear(date.getFullYear() + 1);
    } else {
        // Default monthly
        date.setMonth(date.getMonth() + 1);
    }
    return date.toISOString();
};

const processRecurringInvoices = async () => {
    console.log('[Cron] Checking for recurring invoices...');

    try {
        // 1. Fetch due recurring templates
        const { data: templates, error } = await supabase
            .from('recurring_invoices')
            .select('*')
            .eq('status', 'active')
            .lte('next_run_date', new Date().toISOString());

        if (error) throw error;

        if (!templates || templates.length === 0) {
            console.log('[Cron] No recurring invoices due.');
            return;
        }

        console.log(`[Cron] Found ${templates.length} due invoices.`);

        for (const template of templates) {
            try {
                console.log(`[Cron] Processing template ${template.id} for client ${template.client_id}`);

                // 2. Generate Invoice
                // Calculate new due date (e.g. standard Net 15 or immediate?)
                // For now, let's say due in 15 days or keeps the same day of month?
                // Actually, due_date for the invoice usually implies payment terms.
                // Let's assume Net 7 for recurring by default or inherit from client settings if we had them.
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + 7);

                await createStripeInvoice({
                    workspace_id: template.workspace_id,
                    client_id: template.client_id,
                    project_id: template.project_id,
                    items: template.items, // Reuse items snapshot
                    due_date: dueDate.toISOString(),
                    currency: template.currency,
                    draft: false, // Automatically send!
                    description: template.description || 'Recurring Invoice',
                    recurring_template_id: template.id
                });

                // 3. Update Template (Next Run)
                const nextRun = calculateNextRun(template.next_run_date, template.interval);

                await supabase
                    .from('recurring_invoices')
                    .update({
                        last_run_date: new Date().toISOString(),
                        next_run_date: nextRun
                    })
                    .eq('id', template.id);

                console.log(`[Cron] Successfully processed template ${template.id}. Next run: ${nextRun}`);

            } catch (err) {
                console.error(`[Cron] Failed to process template ${template.id}:`, err);
                // Optionally log error to db or notify admin
            }
        }

    } catch (err) {
        console.error('[Cron] Error processing recurring invoices:', err);
    }
};

// Schedule: Run every day at midnight (00:00)
const initCron = () => {
    // cron.schedule('* * * * *', processRecurringInvoices);
    console.log('[Cron] Recurring invoice scheduler DISABLED (Moved to Stripe Subscriptions).');
};

module.exports = { initCron };
