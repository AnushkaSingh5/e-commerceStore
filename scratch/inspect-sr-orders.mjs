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

async function inspectShiprocketOrders() {
  const email = (process.env.SHIPROCKET_EMAIL || '').trim().replace(/^["']|["']$/g, '');
  const password = (process.env.SHIPROCKET_PASSWORD || '').trim().replace(/^["']|["']$/g, '');

  console.log('Logging into Shiprocket API...');
  const authRes = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const authData = await authRes.json();
  const token = authData.token;

  console.log('Fetching list of orders from Shiprocket API (/v1/external/orders)...');
  const ordersRes = await fetch('https://apiv2.shiprocket.in/v1/external/orders', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const ordersData = await ordersRes.json();
  const list = ordersData.data || [];
  console.log(`Found ${list.length} orders in Shiprocket account:`);
  list.forEach(o => {
    console.log(`Order ID: ${o.id} | Channel Order ID: ${o.channel_order_id} | Status: ${o.status}`);
    console.log(`  Customer: ${o.customer_name} | City: ${o.customer_city} | PIN: ${o.customer_pincode}`);
    console.log(`  Shipments: ${JSON.stringify(o.shipments?.map(s => ({ id: s.id, awb: s.awb, courier: s.courier_name, status: s.status })))}`);
  });
}

inspectShiprocketOrders();
