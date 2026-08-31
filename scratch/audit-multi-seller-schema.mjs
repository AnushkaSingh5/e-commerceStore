// scratch/audit-multi-seller-schema.mjs
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

async function run() {
  console.log('--- Checking tables in Supabase ---');
  const tables = ['products', 'stores', 'store_shipping_settings', 'orders', 'order_items', 'shipments', 'order_shipments'];
  for (const t of tables) {
    try {
      const res = await query(t, 'limit=1');
      if (Array.isArray(res)) {
        console.log(`✅ Table "${t}" exists. Columns (${res[0] ? Object.keys(res[0]).length : 'empty'}):`, res[0] ? Object.keys(res[0]) : '(table empty)');
      } else {
        console.log(`❌ Table "${t}" does not exist or error:`, res.message || res);
      }
    } catch (e) {
      console.log(`❌ Table "${t}" error:`, e.message);
    }
  }
}

run().catch(console.error);
