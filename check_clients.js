const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkClients() {
    console.log('Checking clients table...');
    const { data, error } = await supabase.from('clients').select('*').limit(1);
    if (error) console.error(error);
    else if (data.length > 0) console.log(Object.keys(data[0]));
    else console.log('Clients table empty or keys not found, but query worked.');
}

checkClients();
