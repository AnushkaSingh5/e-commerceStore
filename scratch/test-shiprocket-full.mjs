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

async function testFullShiprocket() {
  console.log('=== TESTING SHIPROCKET LIVE INTEGRATION ===');
  const email = (process.env.SHIPROCKET_EMAIL || '').trim().replace(/^["']|["']$/g, '');
  const password = (process.env.SHIPROCKET_PASSWORD || '').trim().replace(/^["']|["']$/g, '');

  // 1. Auth
  const authRes = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const authData = await authRes.json();
  if (!authRes.ok || !authData.token) {
    console.error('❌ Auth failed:', authData);
    process.exit(1);
  }

  const token = authData.token;
  console.log('✅ JWT Token:', token.slice(0, 20) + '...');

  // 2. Check Pickup Locations
  const pkRes = await fetch('https://apiv2.shiprocket.in/v1/external/settings/company/pickup', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const pkData = await pkRes.json();
  const pickups = pkData.data?.shipping_address || [];
  console.log(`✅ Pickup locations found (${pickups.length}):`);
  pickups.forEach(p => {
    console.log(` - Nickname: "${p.pickup_location}", ID: ${p.id}, Pin: ${p.pin_code}, City: ${p.city}, Status: ${p.status}`);
  });

  // 3. Check Courier Serviceability from Pickup Pin (481556) to Delivery Pin (110001 - Delhi)
  const pickupPincode = pickups[0]?.pin_code || '481556';
  const deliveryPincode = '110001';
  console.log(`\nChecking serviceability: ${pickupPincode} -> ${deliveryPincode}...`);
  const srvUrl = `https://apiv2.shiprocket.in/v1/external/courier/serviceability?pickup_postcode=${pickupPincode}&delivery_postcode=${deliveryPincode}&weight=0.5&cod=0`;
  const srvRes = await fetch(srvUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const srvData = await srvRes.json();
  const couriers = srvData.data?.available_courier_companies || [];
  console.log(`✅ Available couriers count: ${couriers.length}`);
  if (couriers.length > 0) {
    console.log(`   Top courier: ${couriers[0].courier_name} (ID: ${couriers[0].courier_company_id}), Rate: ₹${couriers[0].rate}, ETD: ${couriers[0].etd}`);
  } else {
    console.log('   Response status details:', srvData);
  }
}

testFullShiprocket();
