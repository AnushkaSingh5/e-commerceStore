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

async function inspectOrder() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/orders?select=*&order=created_at.desc&limit=10`, { headers });
  const orders = await res.json();
  console.log(`Found ${orders.length} recent orders:`);
  orders.forEach(o => {
    console.log(`Order ID: ${o.id} | Status: ${o.status} | Shipping Status: ${o.shipping_status}`);
    console.log(`  Provider: ${o.shipping_provider} | Courier: ${o.courier_name}`);
    console.log(`  Shipment ID: ${o.shipment_id} | AWB: ${o.awb_number}`);
    console.log(`  Created At: ${o.created_at} | Shipped At: ${o.shipped_at}\n`);
  });
}

inspectOrder();
