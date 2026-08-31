// scratch/inspect-db-schema.mjs
import path from 'path';
import fs from 'fs';

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.resolve(process.cwd(), f);
    if (fs.existsSync(p)) {
      const lines = fs.readFileSync(p, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function query(table, params = '') {
  const url = `${supabaseUrl}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    }
  });
  return await res.json();
}

async function inspect() {
  console.log('--- Orders Table Sample ---');
  const sampleOrders = await query('orders', 'limit=2&order=created_at.desc');
  if (sampleOrders && sampleOrders.length > 0) {
    console.log('Orders Columns:', Object.keys(sampleOrders[0]));
    console.log('Sample Order Row:\n', JSON.stringify(sampleOrders[0], null, 2));
  } else {
    console.log('No orders found or error:', sampleOrders);
  }

  console.log('\n--- Order Items Table Sample ---');
  const sampleItems = await query('order_items', 'limit=2');
  if (sampleItems && sampleItems.length > 0) {
    console.log('Order Items Columns:', Object.keys(sampleItems[0]));
    console.log('Sample Item Row:\n', JSON.stringify(sampleItems[0], null, 2));
  } else {
    console.log('No order items found or error:', sampleItems);
  }
}

inspect().catch(console.error);
