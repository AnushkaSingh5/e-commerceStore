// scratch/test-shipping-calc-cutestore.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import { shippingService } from '../services/shipping/shippingService.js';

async function testCalc() {
  const storeId = '5c54596b-3d25-4c56-95f0-7208271a2d56';
  const destinationPincode = '273001';

  console.log('Testing shippingService.calculateShippingCost for CuteStore -> 273001...');
  const res = await shippingService.calculateShippingCost({
    storeId,
    destinationPincode,
    paymentMode: 'Prepaid',
    cartItems: [{
      id: 'c3a05cb7-93ce-4042-bd72-d2d9d3d60c28',
      name: 'parrot',
      price: 300,
      quantity: 1,
      weight: 0.5
    }]
  });

  console.log('calculateShippingCost result:');
  console.log(JSON.stringify(res, null, 2));
}

testCalc().catch(console.error);
