-- Add Stripe Connect fields to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS stripe_connected_at TIMESTAMPTZ;

-- Drop invoices table if exists (since it was just a placeholder before)
DROP TABLE IF EXISTS invoices;

-- Re-create invoices table with Stripe support
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES user_settings(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    
    invoice_number TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'usd',
    description TEXT,
    due_date DATE,
    
    -- Stripe fields
    stripe_payment_link_id TEXT,
    stripe_payment_link_url TEXT,
    stripe_payment_intent_id TEXT,
    
    status TEXT DEFAULT 'draft', -- draft, sent, paid, overdue, cancelled
    paid_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoices_workspace_id ON invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- Enable RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view and manage their own invoices
CREATE POLICY "Users can manage own invoices" ON invoices
    FOR ALL USING (workspace_id = auth.uid());

-- Triggers for updated_at
CREATE TRIGGER update_invoices_modtime
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
