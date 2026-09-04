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

async function checkRealOrders() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  };

  const channelIds = [
    '2ae2aa85-2b7b-4a9a-afad-5ef04df61b13',
    '7d0d27ca-4210-4ea1-b4f5-276f0245bea5',
    '4e665825-48b1-4c00-968d-5787e0cf292f',
    '0b8933bf-8e98-4345-87b2-2fc5569a0523',
    'f5607291-b2d2-403f-b3c5-27e8ffa8dde1'
  ];

  for (const id of channelIds) {
    const res = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${id}&select=*`, { headers });
    const data = await res.json();
    if (data && data.length > 0) {
      const o = data[0];
      console.log(`Order: ${o.id.slice(0, 8)} | Store: ${o.store_id} | Status: ${o.shipping_status}`);
      console.log(`  Shipment ID in DB: ${o.shipment_id} | AWB in DB: ${o.awb_number}`);
    } else {
      console.log(`Order ${id} not found in Supabase.`);
    }
  }
}

checkRealOrders();
