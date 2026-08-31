// scratch/test-shiprocket-live.mjs
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

async function testShiprocketAuth() {
  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;

  console.log(`Testing Shiprocket auth with email: ${email ? email.slice(0, 3) + '***' : 'MISSING'}...`);

  if (!email || !password) {
    console.error('Shiprocket credentials missing from env!');
    return;
  }

  try {
    const res = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    console.log('Shiprocket Auth HTTP Status:', res.status);
    const data = await res.json();
    if (res.ok && data.token) {
      console.log('✅ Shiprocket Auth Succeeded! Token received (first 10 chars):', data.token.slice(0, 10) + '...');
      
      // Test Pickup locations
      const pkRes = await fetch('https://apiv2.shiprocket.in/v1/external/settings/company/pickup', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.token}`
        }
      });
      console.log('Pickup Locations HTTP Status:', pkRes.status);
      const pkData = await pkRes.json();
      console.log('Registered Pickup Locations:', JSON.stringify(pkData?.data?.shipping_address || pkData, null, 2));

      // Test Serviceability for route 481556 -> 462022
      const sUrl = `https://apiv2.shiprocket.in/v1/external/courier/serviceability?pickup_postcode=481556&delivery_postcode=462022&weight=0.5&cod=0`;
      const sRes = await fetch(sUrl, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.token}`
        }
      });
      console.log('Serviceability HTTP Status:', sRes.status);
      const sData = await sRes.json();
      console.log('Serviceability Couriers Count:', sData?.data?.available_courier_companies?.length || 0);
      if (sData?.data?.available_courier_companies?.length > 0) {
        console.log('First Courier:', JSON.stringify(sData.data.available_courier_companies[0], null, 2));
      } else {
        console.log('Serviceability Response:', JSON.stringify(sData, null, 2));
      }
    } else {
      console.error('❌ Shiprocket Auth Failed:', data);
    }
  } catch (err) {
    console.error('Shiprocket Auth exception:', err.message);
  }
}

testShiprocketAuth().catch(console.error);
