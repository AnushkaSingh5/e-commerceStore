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

async function testShiprocketAuth() {
  console.log('=== PHASE 1: SHIPROCKET AUTHENTICATION TEST ===');
  const email = (process.env.SHIPROCKET_EMAIL || '').trim().replace(/^["']|["']$/g, '');
  const password = (process.env.SHIPROCKET_PASSWORD || '').trim().replace(/^["']|["']$/g, '');

  console.log('Email configured:', email ? `${email.slice(0, 3)}***@${email.split('@')[1] || ''}` : 'MISSING');
  console.log('Password configured:', password ? '******** (configured)' : 'MISSING');

  if (!email || !password) {
    console.error('❌ Missing SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD in .env.local');
    process.exit(1);
  }

  try {
    const url = 'https://apiv2.shiprocket.in/v1/external/auth/login';
    console.log(`Calling POST ${url}...`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const status = response.status;
    const data = await response.json().catch(() => ({}));
    console.log(`Response HTTP Status: ${status}`);

    if (!response.ok || !data.token) {
      console.error('❌ Shiprocket Auth Failed:', data);
      process.exit(1);
    }

    console.log('✅ Shiprocket JWT Token successfully generated!');
    console.log('JWT Token Prefix:', data.token.substring(0, 25) + '...');
    console.log('User ID:', data.id);
    console.log('First Name:', data.first_name);
    console.log('Company Name:', data.company_name);

    console.log('\n=== PHASE 2: INSPECTING REGISTERED PICKUP LOCATIONS ===');
    const pickupRes = await fetch('https://apiv2.shiprocket.in/v1/external/settings/company/pickup', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.token}`
      }
    });

    const pickupData = await pickupRes.json().catch(() => ({}));
    const addresses = pickupData.data?.shipping_address || [];
    console.log(`Found ${addresses.length} registered pickup locations in Shiprocket account:`);
    addresses.forEach((addr, idx) => {
      console.log(`\nLocation [${idx + 1}]:`);
      console.log(`  Nickname: "${addr.pickup_location}"`);
      console.log(`  Name: ${addr.name}`);
      console.log(`  Email: ${addr.email}`);
      console.log(`  Phone: ${addr.phone}`);
      console.log(`  Address: ${addr.address}, ${addr.address_2 || ''}`);
      console.log(`  City/State/Pincode: ${addr.city}, ${addr.state} - ${addr.pin_code}`);
      console.log(`  Pickup Location ID: ${addr.id}`);
      console.log(`  Status: ${addr.status === 1 ? 'ACTIVE (Verified)' : 'INACTIVE'}`);
    });

  } catch (err) {
    console.error('❌ Exception during Shiprocket test:', err.message);
  }
}

testShiprocketAuth();
