-- Add Stripe Customer ID to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Add Invoice PDF and Hosted URL to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_pdf TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS hosted_invoice_url TEXT;
