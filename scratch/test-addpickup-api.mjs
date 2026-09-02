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

async function inspectShiprocketAddPickup() {
  console.log('=== INSPECTING SHIPROCKET ADD PICKUP RESPONSE ===\n');

  const email = (process.env.SHIPROCKET_EMAIL || '').trim().replace(/^["']|["']$/g, '');
  const password = (process.env.SHIPROCKET_PASSWORD || '').trim().replace(/^["']|["']$/g, '');

  const authRes = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const authData = await authRes.json();
  const token = authData.token;

  // Let's test calling addpickup with a realistic test warehouse
  const testPayload = {
    pickup_location: "Test_Store_Warehouse",
    name: "Kreator Admin",
    email: email,
    phone: "9876543210",
    address: "Plot 12, Cyber City, DLF Phase 2",
    address_2: "Near Metro Station",
    city: "Gurgaon",
    state: "Haryana",
    country: "India",
    pin_code: "122002",
    lat: 28.4906,
    long: 77.0913
  };

  console.log('Sending test payload to POST /settings/company/addpickup...');
  const addRes = await fetch('https://apiv2.shiprocket.in/v1/external/settings/company/addpickup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(testPayload)
  });

  const status = addRes.status;
  const data = await addRes.json().catch(() => ({}));
  console.log(`HTTP Status: ${status}`);
  console.log('Full Response Body:', JSON.stringify(data, null, 2));
}

inspectShiprocketAddPickup();
