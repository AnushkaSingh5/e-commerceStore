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

async function inspectOrderB5() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/orders?select=*&order=created_at.desc&limit=5`, { headers });
  const data = await res.json();
  const orderB5 = data.find(o => o.id.startsWith('b517529e'));
  console.log('Found recent orders:');
  data.forEach(o => console.log(` - Order ${o.id.slice(0, 8)} | Status: ${o.shipping_status} | Courier: ${o.courier_name} | AWB: ${o.awb_number} | Shipment: ${o.shipment_id}`));

  if (orderB5) {
    console.log(`Setting shipping_status = 'Pickup Scheduled' on order ${orderB5.id}...`);
    await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderB5.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shipping_status: 'Pickup Scheduled',
        pickup_status: 'Scheduled'
      })
    });
    console.log('✅ Updated order status.');
  }
}

inspectOrderB5();
