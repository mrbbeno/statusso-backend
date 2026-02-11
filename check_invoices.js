const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkInvoicesSchema() {
    console.log('Checking invoices table...');

    // Check if table exists and we can select from it
    const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error selecting from invoices:', error);
    } else {
        console.log('Invoices table exists. Sample:', data);
    }

    // Check relationship with clients
    // We try the exact query used in the route
    console.log('Testing join with clients...');
    const { data: joinData, error: joinError } = await supabase
        .from('invoices')
        .select(`
            *,
            clients (
                client_name
            )
        `)
        .limit(1);

    if (joinError) {
        console.error('Join Error:', joinError);
    } else {
        console.log('Join successful!');
    }
}

checkInvoicesSchema();
