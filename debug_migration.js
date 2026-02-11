const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // MUST use Service Role for schema changes

if (!supabaseKey) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    const sql = `
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_connected_at TIMESTAMPTZ;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_account_email TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_account_name TEXT;
    `;

    console.log('Running SQL:', sql);

    const { error } = await supabase.rpc('exec_sql', { sql_query: sql }); // Assuming an exec_sql function exists?
    // OR usually we can't run DDL via JS client unless we used a specific stored procedure exposed.
    // BUT since I saw 'apply_migration.py' earlier, maybe that's the way.
    // Let's try to use the raw Postgres connection if available or assume there is an endpoint.
    // Actually, Supabase JS client cannot run raw SQL DDL unless wrapped in a function.

    // IF the user has direct DB access string, we could use 'pg' lib.
    // Checking package.json for 'pg'.
}

// Check package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (packageJson.dependencies.pg) {
    console.log('pg driver found, using direct connection if DATABASE_URL is present.');
} else {
    console.log('pg driver NOT found.');
}
