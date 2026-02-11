const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkColumns() {
    const tableName = 'interactions';
    const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching schema:', error);
        return;
    }

    const columns = data.length > 0 ? Object.keys(data[0]) : [];
    console.log(`Columns for ${tableName}:`, columns);

    fs.writeFileSync('schema_debug.json', JSON.stringify({ tableName, columns }, null, 2));
    console.log(`Schema for ${tableName} written to schema_debug.json`);
}

checkColumns();
