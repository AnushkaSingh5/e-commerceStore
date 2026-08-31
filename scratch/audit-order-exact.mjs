// scratch/audit-order-exact.mjs
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

async function audit() {
  const orderId = '8f153691-787f-4a88-8092-b61ce155b923';
  console.log(`Auditing exact Order: ${orderId}...`);
  const orders = await query('orders', `id=eq.${orderId}&select=*`);
  console.log('Order Record:\n', JSON.stringify(orders[0], null, 2));

  const items = await query('order_items', `order_id=eq.${orderId}&select=*`);
  console.log('\nOrder Items:\n', JSON.stringify(items, null, 2));

  const storeId = orders[0].store_id;
  const storeShipping = await query('store_shipping_settings', `store_id=eq.${storeId}&select=*`);
  console.log('\nStore Shipping Settings:\n', JSON.stringify(storeShipping[0], null, 2));
}

audit().catch(console.error);
