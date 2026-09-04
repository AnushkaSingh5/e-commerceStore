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

async function resetOrderStatus() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  console.log('Resetting order 044e4268-1624-471e-85e9-4bf3b79d30c4 status to "AWB Assigned" so Schedule Pickup button is active...');
  const res = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.044e4268-1624-471e-85e9-4bf3b79d30c4`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      shipping_status: 'AWB Assigned',
      shipping_provider: 'Shiprocket'
    })
  });

  const updated = await res.json();
  console.log('Updated order:', updated);
}

resetOrderStatus();
