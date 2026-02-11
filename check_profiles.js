const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProfiles() {
    console.log('Checking profiles table columns...');

    // Attempt to select the specific columns to see if they exist
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, stripe_account_id')
        .limit(1);

    if (error) {
        console.error('Error selecting stripe columns:', error);
    } else {
        console.log('Successfully selected stripe_account_id. Columns exist!');
        console.log('Sample data:', data);
    }
}

checkProfiles();
