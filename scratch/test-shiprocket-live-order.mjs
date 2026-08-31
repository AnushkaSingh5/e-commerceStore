// scratch/test-shiprocket-live-order.mjs
import path from 'path';
import fs from 'fs';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');
  for (const l of lines) {
    const trimmed = l.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq !== -1) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      process.env[key] = val;
    }
  }
}

import { ShiprocketProvider } from '../services/shipping/shiprocketProvider.js';

async function testLiveShiprocketShipment() {
  console.log('================================================================');
  console.log('🚀 LIVE SHIPROCKET SHIPMENT CREATION & AUTHENTICATION TEST');
  console.log('================================================================\n');

  const provider = new ShiprocketProvider();

  // 1. Authenticate
  console.log('Step 1: Authenticating with Shiprocket API...');
  const token = await provider._getToken();
  console.log('✅ Authentication SUCCESS! Token received (JWT length):', token.length);

  // 2. Fetch Pickup Locations
  console.log('\nStep 2: Fetching Pickup Locations...');
  const pickups = await provider._getPickupLocations(token);
  console.log('Registered Pickups:', JSON.stringify(pickups.map(p => ({ id: p.id, name: p.pickup_location, pin: p.pin_code })), null, 2));

  // 3. Create Sample Test Shipment Payload
  const testOrderId = `TEST-SR-${Date.now().toString().slice(-6)}`;
  console.log(`\nStep 3: Creating Live Test Shipment for Order ID: ${testOrderId}...`);

  const mockOrderDetails = {
    id: testOrderId,
    store_id: '5c54596b-3d25-4c56-95f0-7208271a2d56',
    customer_name: 'Anushka Singh',
    customer_email: 'anushka.singh@example.com',
    customer_phone: '8468055528',
    shipping_address_line1: 'Ho.No. 74 Shivanagar Nathmalpur',
    shipping_address_city: 'Bhopal',
    shipping_address_state: 'Madhya Pradesh',
    shipping_address_pincode: '462022',
    shipping_address_country: 'India',
    payment_status: 'paid',
    created_at: new Date().toISOString(),
    items: [
      {
        product_id: 'p1',
        name: 'Parrot Handcrafted Figurine',
        productName: 'Parrot Handcrafted Figurine',
        price: 390,
        quantity: 1,
        weight: 500
      }
    ]
  };

  const mockPickupSettings = {
    warehouse_name: 'Primary',
    pincode: '481556',
    address: 'ward no. 05, Paraswada Baihar balaghat',
    city: 'Balaghat',
    state: 'Madhya Pradesh',
    phone: '7898219052',
    email: 'poshankb@gmail.com',
    contact_person: 'Seller'
  };

  try {
    const result = await provider.createShipment(testOrderId, mockOrderDetails, mockPickupSettings);
    console.log('\n================================================================');
    console.log('🎉 SHIPROCKET SHIPMENT CREATION: 100% SUCCESSFUL!');
    console.log('================================================================');
    console.log('Shipment ID :', result.shipment_id);
    console.log('AWB Number  :', result.awb_number || '<Pending / Auto-Assign>');
    console.log('Courier Name:', result.courier_name);
    console.log('Status      :', result.status);
    console.log('Tracking URL:', result.tracking_url);
    console.log('================================================================\n');
  } catch (shipErr) {
    console.error('❌ Shiprocket createShipment failed:', shipErr.message);
    process.exit(1);
  }
}

testLiveShiprocketShipment().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
