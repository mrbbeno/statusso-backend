const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// SCALE-02: Connection Pooling Configuration
// To enable connection pooling for 5000+ users:
// 1. Go to Supabase Dashboard > Project Settings > Database
// 2. Copy the "Connection Pooler" URL (uses pgbouncer)
// 3. Set SUPABASE_POOLER_URL in .env (optional - Supabase JS handles pooling internally)
// 4. For direct DB connections (migrations), use the pooler URL with mode=transaction
//
// The Supabase JS client uses HTTP/REST API, not direct PostgreSQL connections,
// so it already handles connection management efficiently. The pooler is mainly
// needed for direct database connections via pg/postgres libraries.

if (!supabaseUrl) {
    console.error('Error: SUPABASE_URL is missing from environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const adminSupabase = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

if (!adminSupabase) {
    console.warn('Warning: SUPABASE_SERVICE_ROLE_KEY is missing. Public portal may fail due to RLS.');
}

module.exports = { supabase, adminSupabase };
