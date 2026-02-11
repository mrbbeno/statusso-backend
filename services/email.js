const { Resend } = require('resend');

// Initialize Resend with API Key from env
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * SECURITY: Sanitize sender name to prevent email header injection and spoofing
 * - Removes angle brackets (prevents fake email injection)
 * - Removes newlines (prevents header injection)
 * - Limits length to prevent abuse
 * - Falls back to 'Satusso User' if empty
 */
const sanitizeSenderName = (name) => {
    if (!name || typeof name !== 'string') return 'Satusso User';

    return name
        .replace(/[<>]/g, '')           // Remove angle brackets
        .replace(/[\r\n]/g, '')         // Remove newlines (header injection)
        .replace(/[^\w\s\-\.áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, '') // Allow only safe characters
        .trim()
        .slice(0, 64)                   // Limit length
        || 'Satusso User';
};

/**
 * SECURITY: Validate email format
 */
const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Send an invoice email with payment and PDF links.
 * @param {string} to - Recipient email
 * @param {object} invoiceData - { sender_name, amount, pdf_url, payment_url, invoice_number }
 */
const sendInvoiceEmail = async (to, invoiceData) => {
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Email] RESEND_API_KEY is missing. Email skipped.');
        return null;
    }

    const {
        sender_name,
        amount,
        currency = 'usd',
        pdf_url,
        payment_url,
        invoice_number,
        branding_color = '#4f46e5', // Default indigo-600
        reply_to
    } = invoiceData;

    // Helper to format currency
    let formattedAmount = amount;
    try {
        formattedAmount = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase()
        }).format(amount);
    } catch (e) {
        console.error('[Email] Currency format error:', e);
        formattedAmount = `${amount} ${currency.toUpperCase()}`;
    }

    try {
        const safeSenderName = sanitizeSenderName(sender_name);
        const safeReplyTo = isValidEmail(reply_to) ? reply_to : undefined;

        const { data, error } = await resend.emails.send({
            from: `${safeSenderName} <onboarding@resend.dev>`,
            to: [to],
            reply_to: safeReplyTo,
            subject: `Invoice #${invoice_number} from ${safeSenderName}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb;">
                    <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                        
                        <!-- Header with Branding Color -->
                        <div style="background-color: ${branding_color}; padding: 32px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">New Invoice</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 16px;">from ${sender_name}</p>
                        </div>

                        <!-- Content -->
                        <div style="padding: 40px 32px;">
                            <p style="color: #374151; font-size: 16px; line-height: 24px; margin-bottom: 24px;">
                                Hi there,
                            </p>
                            <p style="color: #374151; font-size: 16px; line-height: 24px; margin-bottom: 32px;">
                                You have received a new invoice (#${invoice_number}) from <strong>${sender_name}</strong>.
                            </p>

                            <!-- Amount Card -->
                            <div style="background-color: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 32px;">
                                <p style="margin: 0; font-size: 14px; font-weight: 500; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Amount Due</p>
                                <p style="margin: 8px 0 0; font-size: 36px; font-weight: 800; color: #111827; letter-spacing: -0.025em;">
                                    ${formattedAmount}
                                </p>
                            </div>

                            <!-- Actions -->
                            <div style="text-align: center;">
                                <a href="${payment_url}" style="display: inline-block; background-color: ${branding_color}; color: white; padding: 14px 32px; border-radius: 10px; font-weight: 600; text-decoration: none; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: transform 0.1s;">
                                    Pay Invoice
                                </a>
                            </div>

                            ${pdf_url ? `
                            <div style="text-align: center; margin-top: 20px;">
                                <a href="${pdf_url}" style="color: #6b7280; text-decoration: none; font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">
                                    Download PDF format
                                </a>
                            </div>
                            ` : ''}

                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 40px 0;">

                            <div style="text-align: center; margin-bottom: 20px;">
                                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                                    Invoice #${invoice_number} • Sent via Satusso
                                </p>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `
        });

        if (error) {
            console.error('[Email] Resend Error:', error);
            return null;
        }

        console.log('[Email] Sent successfully:', data.id);
        return data;
    } catch (err) {
        console.error('[Email] Sending failed:', err);
        return null;
    }
};

const sendProjectInviteEmail = async (to, projectData) => {
    if (!process.env.RESEND_API_KEY) return null;

    const {
        sender_name,
        project_title,
        portal_url,
        branding_color = '#4f46e5',
        reply_to
    } = projectData;

    try {
        const safeSenderName = sanitizeSenderName(sender_name);
        const safeReplyTo = isValidEmail(reply_to) ? reply_to : undefined;

        await resend.emails.send({
            from: `${safeSenderName} <onboarding@resend.dev>`,
            to: [to],
            reply_to: safeReplyTo,
            subject: `New Project: ${project_title}`,
            html: `
                <!DOCTYPE html>
                <html>
                <body style="margin: 0; padding: 0; font-family: sans-serif; background-color: #f9fafb;">
                    <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                        <div style="background-color: ${branding_color}; padding: 32px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 24px;">New Project Started</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">with ${sender_name}</p>
                        </div>
                        <div style="padding: 40px 32px;">
                            <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Hi there,</p>
                            <p style="color: #374151; font-size: 16px; margin-bottom: 32px;">
                                We've created a new project for you: <strong>${project_title}</strong>. 
                                You can track progress, approve milestones, and view invoices in your client portal.
                            </p>
                            <div style="text-align: center;">
                                <a href="${portal_url}" style="display: inline-block; background-color: ${branding_color}; color: white; padding: 14px 32px; border-radius: 10px; font-weight: 600; text-decoration: none;">
                                    View Client Portal
                                </a>
                            </div>
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 40px 0;">
                            <p style="text-align: center; color: #9ca3af; font-size: 12px;">Sent via Satusso</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        });
    } catch (err) {
        console.error('[Email] Project Invite failed:', err);
    }
};

const sendProjectUpdateEmail = async (to, updateData) => {
    if (!process.env.RESEND_API_KEY) return null;

    const {
        sender_name,
        project_title,
        new_status,
        portal_url,
        branding_color = '#4f46e5',
        reply_to
    } = updateData;

    try {
        const safeSenderName = sanitizeSenderName(sender_name);
        const safeReplyTo = isValidEmail(reply_to) ? reply_to : undefined;

        await resend.emails.send({
            from: `${safeSenderName} <onboarding@resend.dev>`,
            to: [to],
            reply_to: safeReplyTo,
            subject: `Update on ${project_title}`,
            html: `
                <!DOCTYPE html>
                <html>
                <body style="margin: 0; padding: 0; font-family: sans-serif; background-color: #f9fafb;">
                    <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                        <div style="background-color: ${branding_color}; padding: 32px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 24px;">Project Update</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">${project_title}</p>
                        </div>
                        <div style="padding: 40px 32px;">
                            <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Hi there,</p>
                            <p style="color: #374151; font-size: 16px; margin-bottom: 32px;">
                                The status of your project has changed to: <strong style="text-transform: uppercase; color: ${branding_color};">${new_status}</strong>.
                            </p>
                            <div style="text-align: center;">
                                <a href="${portal_url}" style="display: inline-block; background-color: ${branding_color}; color: white; padding: 14px 32px; border-radius: 10px; font-weight: 600; text-decoration: none;">
                                    View Project
                                </a>
                            </div>
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 40px 0;">
                            <p style="text-align: center; color: #9ca3af; font-size: 12px;">Sent via Satusso</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        });
    } catch (err) {
        console.error('[Email] Project Update failed:', err);
    }
};

const sendMilestoneUpdateEmail = async (to, data) => {
    if (!process.env.RESEND_API_KEY) return null;
    const { sender_name, project_title, milestone_name, portal_url, branding_color = '#4f46e5', reply_to } = data;

    try {
        const safeSenderName = sanitizeSenderName(sender_name);
        const safeReplyTo = isValidEmail(reply_to) ? reply_to : undefined;

        await resend.emails.send({
            from: `${safeSenderName} <onboarding@resend.dev>`,
            to: [to],
            reply_to: safeReplyTo,
            subject: `Milestone Completed: ${milestone_name}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: ${branding_color};">Milestone Reached! 🚀</h2>
                    <p>Good news! A milestone has been completed for <strong>${project_title}</strong>.</p>
                    <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
                        <strong>${milestone_name}</strong>
                        <span style="float: right; color: green;">✅ Completed</span>
                    </div>
                    <a href="${portal_url}" style="background: ${branding_color}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">View Progress</a>
                    <p style="margin-top: 30px; color: #666; font-size: 12px;">Sent by ${sender_name}</p>
                </div>
            `
        });
    } catch (err) { console.error('[Email] Milestone failed:', err); }
};

const sendReactionNotificationEmail = async (to, data) => {
    if (!process.env.RESEND_API_KEY) return null;
    const { client_name, project_title, reaction_type = 'liked', branding_color = '#4f46e5', dashboard_url } = data;

    try {
        await resend.emails.send({
            from: 'Satusso System <system@resend.dev>', // System notification
            to: [to],
            subject: `New Reaction from ${client_name}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h3>New Client Interaction 🔔</h3>
                    <p><strong>${client_name}</strong> reacted to an update in <strong>${project_title}</strong>.</p>
                    <p>They ${reaction_type} an update.</p>
                    <a href="${dashboard_url}" style="color: ${branding_color};">Go to Dashboard</a>
                </div>
            `
        });
    } catch (err) { console.error('[Email] Reaction failed:', err); }
};

const sendHealthScoreAlertEmail = async (to, data) => {
    if (!process.env.RESEND_API_KEY) return null;
    const { project_title, health_score, branding_color = '#ef4444', dashboard_url } = data;

    try {
        await resend.emails.send({
            from: 'Satusso System <system@resend.dev>', // System notification
            to: [to],
            subject: `⚠️ Health Score Alert: ${project_title}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #ef4444;">Project Needs Attention</h2>
                    <p>The health score for <strong>${project_title}</strong> has dropped to <strong style="color: #ef4444; font-size: 18px;">${health_score}%</strong>.</p>
                    <p>This falls below your alert threshold of 50%. You may want to check in with the client or update the status.</p>
                    <a href="${dashboard_url}" style="background: #ef4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">View Project</a>
                </div>
            `
        });
    } catch (err) { console.error('[Email] Health Alert failed:', err); }
};

module.exports = {
    sendInvoiceEmail,
    sendProjectInviteEmail,
    sendProjectUpdateEmail,
    sendMilestoneUpdateEmail,
    sendReactionNotificationEmail,
    sendHealthScoreAlertEmail
};
