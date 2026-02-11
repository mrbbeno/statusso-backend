const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const archiver = require('archiver');
const axios = require('axios');
const { sendInvoiceEmail } = require('../services/email');

router.use(authMiddleware);

// POST /invoices/send-email - Manually resend invoice email
router.post('/send-email', async (req, res) => {
    try {
        const { invoice_id } = req.body;
        const workspaceId = req.user.workspace_id;

        // 1. Fetch Invoice & Client & Account Name
        const { data: invoice, error } = await req.supabase
            .from('invoices')
            .select(`
                *,
                clients:client_id (email)
            `)
            .eq('id', invoice_id)
            .eq('workspace_id', workspaceId)
            .single();

        if (error || !invoice) return res.status(404).json({ error: 'Invoice not found' });
        if (!invoice.clients?.email) return res.status(400).json({ error: 'Client has no email' });

        // 2. Fetch Workspace Name (for Sender Name)
        const { data: workspace } = await req.supabase
            .from('profiles')
            .select('stripe_account_name, primary_color, currency, company_name, email')
            .eq('id', workspaceId)
            .single();

        // 3. Send Email (fire-and-forget - don't block response)
        sendInvoiceEmail(invoice.clients.email, {
            sender_name: workspace?.company_name || workspace?.stripe_account_name || 'Satusso User',
            amount: invoice.amount,
            currency: workspace?.currency || 'usd',
            branding_color: workspace?.primary_color,
            reply_to: workspace?.email,
            pdf_url: invoice.invoice_pdf,
            payment_url: invoice.stripe_payment_link_url,
            invoice_number: invoice.invoice_number
        }).catch(err => console.error('[Email] Invoice resend failed:', err));

        res.json({ success: true });

    } catch (err) {
        console.error('Send Email Error:', err);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// GET /download-zip - Download invoices as ZIP (max 50 to prevent memory issues)
router.get('/download-zip', async (req, res) => {
    try {
        const workspaceId = req.user.workspace_id;
        const MAX_INVOICES = 50; // Memory protection limit

        // 1. Fetch invoices with PDF links (limited to prevent memory issues)
        const { data: invoices, error, count } = await req.supabase
            .from('invoices')
            .select('invoice_number, invoice_pdf', { count: 'exact' })
            .eq('workspace_id', workspaceId)
            .not('invoice_pdf', 'is', null)
            .order('created_at', { ascending: false })
            .limit(MAX_INVOICES);

        if (error) throw error;

        if (!invoices || invoices.length === 0) {
            return res.status(404).json({ error: 'No invoices with generated PDFs found.' });
        }

        // Warn if there are more invoices than the limit
        if (count > MAX_INVOICES) {
            console.log(`[ZIP] Workspace ${workspaceId} has ${count} invoices, limiting to ${MAX_INVOICES}`);
        }

        // 2. Set Headers for ZIP
        res.attachment(`invoices-${new Date().toISOString().split('T')[0]}.zip`);

        // 3. Create Archive
        const archive = archiver('zip', { zlib: { level: 9 } });

        // Pipe to response
        archive.pipe(res);

        // Handle errors
        archive.on('error', (err) => {
            console.error('Archive Error:', err);
            if (!res.headersSent) res.status(500).json({ error: 'Failed to generate zip' });
        });

        // 4. Append files in parallel batches (5 at a time for better performance)
        console.log(`[ZIP] Workspace ${workspaceId}, processing ${invoices.length} invoices...`);

        const BATCH_SIZE = 5;
        for (let i = 0; i < invoices.length; i += BATCH_SIZE) {
            const batch = invoices.slice(i, i + BATCH_SIZE);

            // Process batch in parallel
            const results = await Promise.allSettled(
                batch.map(async (invoice) => {
                    if (!invoice.invoice_pdf) return null;

                    try {
                        const response = await axios.get(invoice.invoice_pdf, {
                            responseType: 'stream',
                            timeout: 30000 // 30 second timeout per PDF
                        });
                        return { invoice, stream: response.data };
                    } catch (err) {
                        console.error(`[ZIP] Failed to download PDF for ${invoice.invoice_number}:`, err.message);
                        return { invoice, error: err.message };
                    }
                })
            );

            // Append results to archive
            for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                    const { invoice, stream, error } = result.value;
                    const fileName = `Invoice_${invoice.invoice_number}.pdf`;

                    if (stream) {
                        archive.append(stream, { name: fileName });
                    } else if (error) {
                        archive.append(`Failed to download: ${error}`, { name: `ERROR_${invoice.invoice_number}.txt` });
                    }
                }
            }
        }

        // 5. Finalize
        await archive.finalize();

    } catch (err) {
        console.error('Download ZIP Error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /recurring - List active recurring invoice templates
router.get('/recurring', async (req, res) => {
    try {
        const workspaceId = req.user.workspace_id;

        const { data: templates, error } = await req.supabase
            .from('recurring_invoices')
            .select(`
                *,
                clients (
                    client_name,
                    email
                )
            `)
            .eq('workspace_id', workspaceId)
            .eq('status', 'active')
            .order('next_run_date', { ascending: true });

        if (error) throw error;

        res.json(templates);
    } catch (err) {
        console.error('List Recurring Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET / - List all invoices for the authenticated user's workspace
router.get('/', async (req, res) => {
    try {
        const workspaceId = req.user.workspace_id; // Support Team Mode (view owner's invoices)

        // Query invoices table
        // We join with clients to get client name if needed (assuming `clients` table exists)
        const { data: invoices, error } = await req.supabase
            .from('invoices')
            .select(`
                *,
                clients (
                    client_name
                )
            `)
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(invoices);
    } catch (err) {
        console.error('List Invoices Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
