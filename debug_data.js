const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
    console.error("Missing Service Key");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function dumpData() {
    const results = {};

    // 1. Team Members
    const { data: members, error: mErr } = await supabase.from('team_members').select('*');
    results.team_members = mErr ? mErr : members;

    // 2. Profiles (limit for safety)
    const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, email, plan, company_name');
    results.profiles = pErr ? pErr : profiles;

    // 3. Auth Users (Admin)
    const { data: { users }, error: uErr } = await supabase.auth.admin.listUsers();
    results.users = uErr ? uErr : users.map(u => ({ id: u.id, email: u.email }));

    fs.writeFileSync('debug_output.json', JSON.stringify(results, null, 2));
    console.log('Dumped to debug_output.json');
}

dumpData();
