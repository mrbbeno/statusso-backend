const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { sendInvoiceEmail } = require('./email');

const { supabase: userSupabase, adminSupabase } = require('../supabaseClient');
// Use adminSupabase to bypass RLS for administrative tasks
const supabase = adminSupabase || userSupabase;

/**
 * Creates and optionally sends a Stripe invoice.
 * @param {Object} params - Invoice parameters
 * @param {string} params.workspace_id - The Supabase ID of the workspace (user profile)
 * @param {string} params.client_id - The Supabase ID of the client
 * @param {string} params.project_id - Optional project ID
 * @param {Array} params.items - Array of { description, amount }
 * @param {string} params.due_date - ISO date string
 * @param {string} params.currency - Currency code (usd, eur, etc.)
 * @param {boolean} params.draft - Whether to keep as draft or finalize
 * @param {string} params.description - Invoice level description
 * @param {string} params.recurring_template_id - Optional ID of the recurring template
 */
async function createStripeInvoice({
    workspace_id,
    client_id,
    project_id,
    items,
    due_date,
    currency,
    draft = false,
    description,
    recurring_template_id = null
}) {
    // 1. Get Workspace (Connected Account) & Client Details
    const [{ data: workspace }, { data: client }] = await Promise.all([
        supabase.from('profiles').select('stripe_account_id, stripe_account_name, primary_color, currency, company_name, email, client_notify_invoice_send').eq('id', workspace_id).single(),
        supabase.from('clients').select('*').eq('id', client_id).single()
    ]);

    if (!workspace?.stripe_account_id) {
        throw new Error('Stripe not connected for this workspace');
    }
    if (!client) {
        throw new Error('Client not found');
    }

    const stripeAccount = workspace.stripe_account_id;

    // 2. Ensure Stripe Customer exists on the CONNECTED account
    let customerId = client.stripe_customer_id;

    if (!customerId) {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!client.email || !emailRegex.test(client.email)) {
            throw new Error(`Invalid client email address: ${client.email}`);
        }

        console.log(`[InvoiceService] Creating Customer for ${client.client_name} on account ${stripeAccount}`);
        const customer = await stripe.customers.create({
            email: client.email,
            name: client.client_name,
            phone: client.phone,
            metadata: {
                satusso_client_id: client.id
            }
        }, { stripeAccount });

        customerId = customer.id;

        // Save for future use
        await supabase.from('clients').update({ stripe_customer_id: customerId }).eq('id', client_id);
    }

    // 3. Create Invoice Object
    // Ensure due_date is in the future.
    const inputDueDate = new Date(due_date);
    inputDueDate.setHours(23, 59, 59, 999);
    const timestamp = Math.floor(inputDueDate.getTime() / 1000);

    const invoiceParams = {
        customer: customerId,
        auto_advance: !draft, // If draft, don't auto-advance
        collection_method: 'send_invoice',
        due_date: timestamp,
        currency: currency || workspace.currency || 'usd',
        metadata: {
            project_id: project_id || '',
            recurring_template_id: recurring_template_id || ''
        }
    };

    const invoice = await stripe.invoices.create(invoiceParams, { stripeAccount });

    // 4. Create Invoice Items
    const validItems = items && items.length > 0 ? items : [{ amount: 0, description: 'Service' }]; // Safety fallback

    let totalAmount = 0;

    for (const item of validItems) {
        const itemAmount = parseFloat(item.amount) || 0;
        totalAmount += itemAmount;

        await stripe.invoiceItems.create({
            customer: customerId,
            invoice: invoice.id,
            amount: Math.round(itemAmount * 100), // Stripe expects cents
            currency: invoiceParams.currency,
            description: item.description,
        }, { stripeAccount });
    }

    let finalInvoiceData = invoice;
    let dbStatus = 'draft';

    // 5. Finalize Invoice (unless draft)
    if (!draft) {
        finalInvoiceData = await stripe.invoices.finalizeInvoice(invoice.id, { stripeAccount });
        dbStatus = finalInvoiceData.status;
    }

    // 6. Save to Database
    const { data: dbInvoice, error: dbError } = await supabase.from('invoices').insert({
        workspace_id,
        client_id,
        project_id: project_id || null,
        invoice_number: finalInvoiceData.number || 'DRAFT',
        amount: totalAmount,
        description: description || items.map(i => i.description).join(', '),
        due_date: due_date || new Date().toISOString(),
        stripe_payment_link_id: finalInvoiceData.id,
        stripe_payment_link_url: finalInvoiceData.hosted_invoice_url,
        invoice_pdf: finalInvoiceData.invoice_pdf,
        status: dbStatus,
        is_recurring: !!recurring_template_id,
        recurring_template_id: recurring_template_id || null
    }).select().single();

    if (dbError) throw dbError;

    // 7. Send Email
    if (!draft && client.email && workspace.client_notify_invoice_send !== false) {
        sendInvoiceEmail(client.email, {
            sender_name: workspace.company_name || workspace.stripe_account_name || 'Satusso User',
            amount: totalAmount,
            currency: workspace.currency || 'usd',
            branding_color: workspace.primary_color,
            reply_to: workspace.email,
            pdf_url: finalInvoiceData.invoice_pdf,
            payment_url: finalInvoiceData.hosted_invoice_url,
            invoice_number: finalInvoiceData.number
        }).then(() => console.log(`[InvoiceService] Email sent to ${client.email}`))
            .catch(err => console.error(`[InvoiceService] Email failed: ${err.message}`));
    }

    return {
        invoice: dbInvoice,
        stripeInvoice: finalInvoiceData
    };
}

module.exports = { createStripeInvoice };
