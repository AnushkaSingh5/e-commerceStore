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

async function checkStoreSettings() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/store_shipping_settings?store_id=eq.9dafdf4f-be38-471d-97b2-ec729f721cb9`, { headers });
  const data = await res.json();
  console.log('Store shipping settings for RACERÉ (store 9dafdf4f...):', data);

  // If pickup_location_id is dl_pk_255106, update it to 98333329 (Primary)
  if (data[0]?.pickup_location_id !== '98333329') {
    console.log('Updating RACERÉ store settings to use verified Shiprocket Primary ID 98333329...');
    await fetch(`${supabaseUrl}/rest/v1/store_shipping_settings?store_id=eq.9dafdf4f-be38-471d-97b2-ec729f721cb9`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        pickup_location_id: '98333329',
        pickup_location_name: 'Primary',
        shiprocket_registered: true,
        warehouse_status: 'registered_active',
        last_synced: new Date().toISOString()
      })
    });
    console.log('✅ Updated store_shipping_settings for RACERÉ to Shiprocket location 98333329.');
  }
}

checkStoreSettings();
