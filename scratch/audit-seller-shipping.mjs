import fs from 'fs';
import path from 'path';

function loadEnv() {
  try {
    const envPath = path.resolve('.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      });
    }
  } catch (e) {
    console.error('Failed to load .env.local', e);
  }
}

loadEnv();

async function runAudit() {
  console.log('=== AUDITING SELLER SHIPPING ARCHITECTURE ===\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const srEmail = (process.env.SHIPROCKET_EMAIL || '').trim().replace(/^["']|["']$/g, '');
  const srPassword = (process.env.SHIPROCKET_PASSWORD || '').trim().replace(/^["']|["']$/g, '');

  // 1. Fetch all sellers & stores from Supabase
  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  };

  console.log('1. Querying Supabase Stores and Sellers...');
  const storesRes = await fetch(`${supabaseUrl}/rest/v1/stores?select=id,name,slug,creator_id`, { headers });
  const stores = await storesRes.json();
  console.log(`Found ${stores.length} stores in database:`);
  stores.forEach(s => console.log(`  - Store: "${s.name}" (ID: ${s.id}, Slug: ${s.slug}, CreatorId: ${s.creator_id})`));

  console.log('\n2. Querying store_shipping_settings in Supabase...');
  const settingsRes = await fetch(`${supabaseUrl}/rest/v1/store_shipping_settings?select=*`, { headers });
  const settings = await settingsRes.json();
  console.log(`Found ${settings.length} shipping settings records:`);
  settings.forEach(st => {
    console.log(`  - Store ID: ${st.store_id}`);
    console.log(`    Warehouse Name: "${st.warehouse_name}"`);
    console.log(`    Address: "${st.address}", City: "${st.city}", State: "${st.state}", Pincode: "${st.pincode}"`);
    console.log(`    Contact: "${st.contact_person}", Phone: "${st.phone}"`);
    console.log(`    Shiprocket Pickup Name: "${st.pickup_location_name}"`);
    console.log(`    Shiprocket Pickup ID: "${st.pickup_location_id}"`);
    console.log(`    Shiprocket Registered: ${st.shiprocket_registered}`);
  });

  // 3. Query Shiprocket Registered Pickup Locations
  console.log('\n3. Querying Shiprocket API for registered pickup locations...');
  const authRes = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: srEmail, password: srPassword })
  });
  const authData = await authRes.json();
  const token = authData.token;

  const pkRes = await fetch('https://apiv2.shiprocket.in/v1/external/settings/company/pickup', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const pkData = await pkRes.json();
  const srPickups = pkData.data?.shipping_address || [];
  console.log(`Shiprocket account has ${srPickups.length} registered pickup locations:`);
  srPickups.forEach(p => {
    console.log(`  - Pickup Location Nickname: "${p.pickup_location}" (ID: ${p.id})`);
    console.log(`    Name: "${p.name}", Phone: "${p.phone}"`);
    console.log(`    Address: "${p.address}", City: "${p.city}", State: "${p.state}", Pin: "${p.pin_code}"`);
    console.log(`    Status: ${p.status}, Is Primary: ${p.is_primary_location}`);
  });
}

runAudit();
