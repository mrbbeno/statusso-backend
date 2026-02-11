require('dotenv').config(); // Defaults to ./.env
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debug() {
    console.log('--- DEBUGGING DB STATE ---');

    console.log('\n1. Fetching All Profiles:');
    const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, email, plan');
    if (pErr) console.error(pErr);
    else console.log(JSON.stringify(profiles, null, 2));

    console.log('\n2. Fetching Team Member Emails:');
    const { data: members, error: mErr } = await supabase.from('team_members').select('email, role, status, owner_id');
    if (mErr) console.error(mErr);
    else console.log(JSON.stringify(members, null, 2));
}

debug();
