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

async function testServiceability() {
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

  console.log('\nQuerying Shiprocket courier serviceability for 481556 -> 462022 (0.5kg, Prepaid)...');
  const res = await fetch('https://apiv2.shiprocket.in/v1/external/courier/serviceability?pickup_postcode=481556&delivery_postcode=462022&weight=0.5&cod=0&length=15&breadth=15&height=15', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  const couriers = data.data?.available_courier_companies || [];
  console.log(`Shiprocket API returned ${couriers.length} available couriers for 481556 -> 462022:`);
  couriers.forEach(c => {
    console.log(`  - Courier: "${c.courier_name}" (ID: ${c.courier_company_id}) | Rate: ₹${c.rate} | Freight: ₹${c.freight_charge} | ETD: ${c.etd} | Rating: ${c.rating}`);
  });
}

testServiceability();
