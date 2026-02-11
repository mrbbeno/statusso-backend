-- Create Recurring Invoices Table
CREATE TABLE IF NOT EXISTS recurring_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    
    amount NUMERIC(10, 2) NOT NULL, -- Cached total, but re-calculated from items ideally
    currency TEXT DEFAULT 'usd',
    items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of { description, amount }
    description TEXT,
    
    status TEXT DEFAULT 'active', -- active, paused, cancelled
    interval TEXT DEFAULT 'monthly', -- monthly, yearly, weekly (start with monthly)
    
    last_run_date TIMESTAMPTZ,
    next_run_date TIMESTAMPTZ NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE recurring_invoices ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their recurring templates" ON recurring_invoices
    FOR SELECT USING (auth.uid() = workspace_id);

CREATE POLICY "Users can manage their recurring templates" ON recurring_invoices
    FOR ALL USING (auth.uid() = workspace_id);

-- Add recurring flag to invoices for tracking
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recurring_template_id UUID REFERENCES recurring_invoices(id) ON DELETE SET NULL;
