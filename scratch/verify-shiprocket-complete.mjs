// scratch/verify-shiprocket-complete.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import { shippingFactory } from '../services/shipping/shippingFactory.js';
import { shippingService } from '../services/shipping/shippingService.js';

async function testComplete() {
  console.log('===============================================================');
  console.log('🧪 VERIFYING SHIPROCKET AUTH & OPERATIONS IN NEXT.JS RUNTIME');
  console.log('===============================================================\n');

  const provider = shippingFactory.getProvider('Shiprocket');

  // Test 1: Authenticate
  console.log('1. Testing _getToken()...');
  const token = await provider._getToken();
  console.log('✅ Authentication SUCCESS! Token Length:', token.length);

  // Test 2: Calculate Shipping Cost
  console.log('\n2. Testing calculateShippingCost(481556, 462022, 500, "Prepaid")...');
  const costResult = await provider.calculateShippingCost('481556', '462022', 500, 'Prepaid');
  console.log('Rate Result:', JSON.stringify(costResult, null, 2));
  if (costResult.success && costResult.serviceable) {
    console.log('✅ calculateShippingCost SUCCESS! Courier:', costResult.courier_name, '| Rate: ₹' + costResult.total_amount);
  } else {
    throw new Error('calculateShippingCost failed: ' + costResult.reason);
  }

  // Test 3: Pickup Locations Lookup
  console.log('\n3. Testing _getPickupLocations()...');
  const pickups = await provider._getPickupLocations(token);
  console.log('✅ Pickup locations retrieved:', pickups.length);

  console.log('\n🎉 ALL SHIPROCKET RUNTIME VERIFICATIONS PASSED 100%!');
}

testComplete().catch(err => {
  console.error('💥 Verification Failed:', err);
  process.exit(1);
});
