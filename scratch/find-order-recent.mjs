// scratch/find-order-recent.mjs
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

async function search() {
  console.log('Searching for 8f153691-787f-4a88-8092-b61ec155b923 across all fields...');
  const searchMatch = await query('orders', 'or=(id.ilike.*8f15*,payment_order_id.ilike.*8f15*,payment_id.ilike.*8f15*,shipment_id.ilike.*8f15*,awb_number.ilike.*8f15*)&select=*');
  console.log('Match count:', searchMatch.length);
  if (searchMatch.length > 0) {
    console.log(JSON.stringify(searchMatch, null, 2));
  } else {
    console.log('No direct match. Fetching latest 10 orders:');
    const recent = await query('orders', 'limit=10&order=created_at.desc&select=id,customer_name,total_amount,status,shipping_provider,awb_number,shipment_id,created_at,paid_at');
    console.table(recent);
  }
}

search().catch(console.error);
