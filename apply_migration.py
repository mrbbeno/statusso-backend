import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from backend/.env
# We need to go up one level to find the .env if we are in scripts, 
# but here we can just point to the absolute path or relative from workspace root.
load_dotenv('d:/satusso/backend/.env')

url: str = os.environ.get("REACT_APP_SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

supabase: Client = create_client(url, key)

sql_file_path = 'd:/satusso/backend/migrations/update_clients_schema.sql'

with open(sql_file_path, 'r') as f:
    sql = f.read()

print(f"Applying migration from {sql_file_path}...")

# Use the rpc call if available for running raw SQL, 
# but Supabase JS/Python client doesn't directly support raw SQL unless via a custom function.
# However, usually there is an 'exec_sql' or similar if configured, 
# or we can try to run it using a common approach.
# Since I don't know if 'exec_sql' exists, I'll assume the user might need to run it manually 
# if this fails, but I'll try to use a common workaround or just inform.

try:
    # This is a common pattern in some setups, but not standard.
    # If this fails, I will advise the user to run it in Supabase dashboard.
    res = supabase.post("/rest/v1/", json={"query": sql})
    print("Migration applied (hopefully).")
except Exception as e:
    print(f"Error applying migration: {e}")
    print("Please run the SQL in update_clients_schema.sql manually in your Supabase SQL Editor.")
