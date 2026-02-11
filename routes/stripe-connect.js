const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { supabase: userSupabase, adminSupabase } = require('../supabaseClient');
const supabase = adminSupabase || userSupabase;
const { sendInvoiceEmail } = require('../services/email');
const { createStripeInvoice } = require('../services/invoiceService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';
const authMiddleware = require('../authMiddleware');

// SECURITY: Rate limiting for Stripe operations
const stripeConnectLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 connect requests per minute
    message: { error: 'Too many Stripe Connect requests, please try again later.' }
});

const stripeInvoiceLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 invoice requests per minute
    message: { error: 'Too many invoice requests, please try again later.' }
});

// 1. Start Connect Flow (Account Link)
// SECURITY: Now requires valid JWT authentication
router.get('/connect', authMiddleware, stripeConnectLimiter, async (req, res) => {
    // SECURITY: Use authenticated user ID instead of untrusted query param
    const userId = req.user.id;
    console.log('[Stripe Connect] Init started for User:', userId);

    try {
        // 1. Get user record
        const { data: userProfile, error: fetchError } = await supabase
            .from('profiles')
            .select('stripe_account_id, email, id')
            .eq('id', userId)
            .single();

        console.log('[Stripe Connect] Existing profile:', userProfile, 'Error:', fetchError);

        let accountId = userProfile?.stripe_account_id;

        // 2. If no account ID, create a specific Stripe Account for them
        if (!accountId) {
            console.log('[Stripe Connect] Creating new Standard Account...');
            const account = await stripe.accounts.create({
                type: 'standard',
                email: userProfile?.email,
            });
            accountId = account.id;
            console.log('[Stripe Connect] Created Account ID:', accountId);

            // Save pending account ID
            // UPSERT to profiles (profiles usually exist for users, but upsert is safe)
            const { error: upsertError } = await supabase
                .from('profiles')
                .update({ stripe_account_id: accountId }) // Update is safer for profiles as auth trigger creates them
                .eq('id', userId);

            console.log('[Stripe Connect] Update profile result error:', upsertError);
        } else {
            console.log('[Stripe Connect] Using existing Account ID:', accountId);
        }

        // 3. Create an Account Link (Onboarding URL)
        console.log('[Stripe Connect] Creating Account Link...');
        // Pass userId in the return_url query params so we don't depend on DB state for the callback
        const returnUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/stripe/connect/callback?account_id=${accountId}&user_id=${userId}`;

        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            // SECURITY: refresh_url no longer passes user_id - requires re-auth
            refresh_url: `${FRONTEND_URL}/settings?tab=billing&reconnect=true`,
            return_url: returnUrl,
            type: 'account_onboarding',
        });

        console.log('[Stripe Connect] Redirecting to:', accountLink.url);

        // Redirect user to Stripe Onboarding
        res.redirect(accountLink.url);

    } catch (err) {
        console.error('[Stripe Connect] Init Error:', err);
        res.redirect(`${FRONTEND_URL}/stripe/callback?error=init_failed&desc=${err.message}`);
    }
});

// 2. Connect Callback (After onboarding)
// SECURITY: Validates that the account_id belongs to the user_id before updating
router.get('/connect/callback', stripeConnectLimiter, async (req, res) => {
    const { account_id, user_id } = req.query;
    console.log('[Stripe Callback] Started for Account:', account_id, 'User:', user_id);

    try {
        if (!account_id) throw new Error('Missing Account ID');
        if (!user_id) throw new Error('Missing User ID in callback');

        const userId = user_id;

        // SECURITY: Validate that this account_id was actually created for this user
        // by checking if the profile already has this account_id stored (set during /connect)
        const { data: existingProfile, error: profileError } = await supabase
            .from('profiles')
            .select('stripe_account_id')
            .eq('id', userId)
            .single();

        if (profileError || !existingProfile) {
            console.error('[Stripe Callback] User profile not found:', userId);
            return res.redirect(`${FRONTEND_URL}/stripe/callback?error=user_not_found`);
        }

        // SECURITY: Verify the account_id matches what we stored during /connect
        if (existingProfile.stripe_account_id && existingProfile.stripe_account_id !== account_id) {
            console.error('[Stripe Callback] SECURITY: Account ID mismatch!', {
                expected: existingProfile.stripe_account_id,
                received: account_id,
                userId: userId
            });
            return res.redirect(`${FRONTEND_URL}/stripe/callback?error=account_mismatch&desc=Security validation failed`);
        }

        // Verify the account status directly from Stripe
        const account = await stripe.accounts.retrieve(account_id);
        console.log('[Stripe Callback] Account Status:', {
            charges_enabled: account.charges_enabled,
            details_submitted: account.details_submitted,
            email: account.email
        });

        if (account.charges_enabled || account.details_submitted) {
            const display_name = account.business_profile?.name || account.settings?.dashboard?.display_name || account.email;

            console.log('[Stripe Callback] Saving details for:', display_name);

            // Mark as fully connected (Update profiles)
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    stripe_connected_at: new Date().toISOString(),
                    stripe_account_name: display_name,
                    stripe_account_email: account.email,
                    stripe_account_id: account_id
                })
                .eq('id', userId)
                .eq('stripe_account_id', account_id); // SECURITY: Double-check ownership

            console.log('[Stripe Callback] Update result error:', updateError);

            if (updateError) throw updateError;

            res.redirect(`${FRONTEND_URL}/stripe/callback?success=true&account_id=${account_id}&name=${encodeURIComponent(display_name)}`);
        } else {
            // Still pending details
            console.warn('[Stripe Callback] Account not fully setup');
            res.redirect(`${FRONTEND_URL}/stripe/callback?error=incomplete&desc=Account setup incomplete`);
        }

    } catch (err) {
        console.error('[Stripe Callback] Error:', err);
        res.redirect(`${FRONTEND_URL}/stripe/callback?error=callback_failed&desc=${err.message}`);
    }
});

// 3. Create Invoice / Payment Link
// 3. Create & Send Invoice (Real Invoice Object)
// 3. Create & Send Invoice (Real Invoice Object)
router.post('/create-invoice', authMiddleware, stripeInvoiceLimiter, async (req, res) => {
    try {
        console.log('[Stripe Create Invoice] Body:', req.body);
        const { client_id, amount, description, due_date, project_id, currency, draft, items, recurring_template_id } = req.body;
        const workspace_id = req.user.workspace_id;

        const result = await createStripeInvoice({
            workspace_id,
            client_id,
            project_id,
            items: items || (amount ? [{ description: description || 'Professional Services', amount }] : []),
            due_date,
            currency,
            draft,
            description,
            recurring_template_id
        });

        res.json({
            invoice: result.invoice,
            paymentUrl: result.stripeInvoice.hosted_invoice_url,
            pdfUrl: result.stripeInvoice.invoice_pdf
        });

    } catch (err) {
        console.error('Create Invoice Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 4. Create Recurring Invoice Template
// 4. Create Recurring Invoice (Stripe Subscription)
router.post('/create-recurring', authMiddleware, stripeInvoiceLimiter, async (req, res) => {
    try {
        console.log('[Stripe Subscription] Body:', req.body);
        // interval: 'day', 'week', 'month', 'year'
        const { client_id, amount, description, items, currency, interval = 'month', start_now = true, project_id } = req.body;
        const workspace_id = req.user.workspace_id;

        // 1. Get Workspace & Client
        const [{ data: workspace }, { data: client }] = await Promise.all([
            supabase.from('profiles').select('stripe_account_id, stripe_account_name').eq('id', workspace_id).single(),
            supabase.from('clients').select('*').eq('id', client_id).single()
        ]);

        if (!workspace?.stripe_account_id) throw new Error('Stripe not connected');
        if (!client) throw new Error('Client not found');

        const stripeAccount = workspace.stripe_account_id;

        // 2. Ensure Stripe Customer
        let customerId = client.stripe_customer_id;
        if (!customerId) {
            console.log(`[Stripe Sub] Creating Customer for ${client.client_name}`);
            const customer = await stripe.customers.create({
                email: client.email,
                name: client.client_name,
                metadata: { satusso_client_id: client.id }
            }, { stripeAccount });
            customerId = customer.id;
            await supabase.from('clients').update({ stripe_customer_id: customerId }).eq('id', client_id);
        }

        // 3. Prepare Subscription Items (Create Prices First)
        // subscriptions.create doesn't support inline product_data in price_data usually. 
        // We must create Price objects first (which supports inline Product creation).

        const priceIds = [];
        const rawItems = (items && items.length > 0) ? items : [{
            description: description || 'Recurring Service',
            amount: amount,
        }];

        for (const item of rawItems) {
            console.log('[Stripe Sub] Creating Price for:', item.description);
            const price = await stripe.prices.create({
                currency: currency || 'usd',
                unit_amount: Math.round(parseFloat(item.amount) * 100),
                recurring: {
                    interval: interval === 'minute' ? 'day' : interval
                },
                product_data: {
                    name: item.description || 'Recurring Service'
                }
            }, { stripeAccount });
            priceIds.push(price.id);
        }

        const subscriptionItems = priceIds.map(priceId => ({ price: priceId }));

        // 4. Create Stripe Subscription
        console.log('[Stripe Sub] Creating subscription with items:', subscriptionItems);
        const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: subscriptionItems,
            payment_behavior: 'default_incomplete',
            expand: ['latest_invoice.payment_intent'],
            metadata: {
                project_id: project_id || '',
                workspace_id: workspace_id
            }
        }, { stripeAccount });

        console.log('[Stripe Sub] Created:', subscription.id);

        // 5. Save to DB
        const { data: template, error } = await supabase.from('recurring_invoices').insert({
            workspace_id,
            client_id,
            project_id: project_id || null,
            amount: parseFloat(amount) || 0,
            currency: currency || 'usd',
            items: items || [],
            description,
            interval: interval,
            status: 'active',
            next_run_date: (subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : new Date()).toISOString(),
            stripe_subscription_id: subscription.id,
            stripe_price_id: priceIds[0] // Store primary price ID
        }).select().single();

        if (error) throw error;

        // 6. Handle First Invoice (Email & DB)
        if (subscription.latest_invoice) {
            const invoiceObj = subscription.latest_invoice; // Expanded

            // Save Invoice to DB as 'paid' or 'open'
            // We can reuse createStripeInvoice but it creates a NEW one. 
            // We just want to record this existing one and send email.

            // A. Record Invoice in DB
            const { error: invError } = await supabase.from('invoices').insert({
                workspace_id,
                client_id,
                project_id: project_id || null,
                invoice_number: invoiceObj.number,
                amount: invoiceObj.total / 100, // Cents to Unit
                description: description || 'Recurring Subscription Initial Invoice',
                due_date: new Date(invoiceObj.due_date * 1000).toISOString(),
                stripe_payment_link_id: invoiceObj.id,
                stripe_payment_link_url: invoiceObj.hosted_invoice_url,
                invoice_pdf: invoiceObj.invoice_pdf,
                status: invoiceObj.status,
                is_recurring: true,
                recurring_template_id: template.id
            });

            if (invError) console.error('[Stripe Sub] Failed to save initial invoice:', invError);

            // B. Send Email
            if (client.email && workspace.client_notify_invoice_send !== false) {
                console.log('[Stripe Sub] Sending email to:', client.email);
                sendInvoiceEmail(client.email, {
                    sender_name: workspace.company_name || workspace.stripe_account_name || 'Satusso User',
                    amount: invoiceObj.total / 100,
                    currency: invoiceObj.currency,
                    branding_color: workspace.primary_color,
                    reply_to: workspace.email,
                    pdf_url: invoiceObj.invoice_pdf,
                    payment_url: invoiceObj.hosted_invoice_url,
                    invoice_number: invoiceObj.number
                }).catch(err => console.error(`[Stripe Sub] Email failed: ${err.message}`));
            }
        }

        res.json({
            template,
            subscription_id: subscription.id,
            client_secret: subscription.latest_invoice?.payment_intent?.client_secret,
            message: 'Subscription created successfully.'
        });

    } catch (err) {
        console.error('Create Subscription Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 5. Cancel Recurring Invoice (Stripe Subscription)
router.post('/cancel-recurring', authMiddleware, stripeInvoiceLimiter, async (req, res) => {
    try {
        const { template_id } = req.body;
        const workspace_id = req.user.workspace_id;

        if (!template_id) return res.status(400).json({ error: 'Missing template_id' });

        // 1. Get Template
        const { data: template } = await supabase
            .from('recurring_invoices')
            .select('stripe_subscription_id, workspace_id')
            .eq('id', template_id)
            .single();

        if (!template) return res.status(404).json({ error: 'Template not found' });
        if (template.workspace_id !== workspace_id) return res.status(403).json({ error: 'Unauthorized' });

        // 2. Cancel in Stripe (if it exists)
        if (template.stripe_subscription_id) {
            const { data: workspace } = await supabase.from('profiles').select('stripe_account_id').eq('id', workspace_id).single();
            if (workspace?.stripe_account_id) {
                try {
                    await stripe.subscriptions.cancel(template.stripe_subscription_id, {
                        stripeAccount: workspace.stripe_account_id
                    });
                    console.log('[Stripe Sub] Cancelled:', template.stripe_subscription_id);
                } catch (stripeErr) {
                    console.warn('[Stripe Sub] Cancellation warning:', stripeErr.message);
                    // Continue to mark as cancelled in DB even if Stripe fails (e.g. already cancelled)
                }
            }
        }

        // 3. Update DB
        const { error } = await supabase
            .from('recurring_invoices')
            .update({ status: 'cancelled' })
            .eq('id', template_id);

        if (error) throw error;

        res.json({ success: true, message: 'Subscription cancelled.' });

    } catch (err) {
        console.error('Cancel Subscription Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
