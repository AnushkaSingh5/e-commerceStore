// scratch/test-cart-resilience.mjs
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

import { cartService } from '../services/cartService.js';

async function testCart() {
  console.log('====================================================');
  console.log('🧪 TESTING CART PGRST116 ABSENT STATE HANDLING');
  console.log('====================================================\n');

  // Test 1: Query cart for non-existent customer
  const randomCustomerId = '00000000-0000-0000-0000-000000000000';
  console.log(`Test 1: Calling cartService.getCart('${randomCustomerId}')...`);
  const cart = await cartService.getCart(randomCustomerId);
  console.log('Result for non-existent cart:', cart);
  if (cart === null) {
    console.log('✅ TEST 1 PASSED: Absent cart returned null (valid state), no PGRST116 exception thrown.');
  } else {
    throw new Error('Test 1 Failed: Expected null');
  }

  // Test 2: Query cart items for non-existent cartId
  console.log(`\nTest 2: Calling cartService.getCartItems('non-existent-cart-id')...`);
  const items = await cartService.getCartItems('00000000-0000-0000-0000-000000000000');
  console.log('Result for non-existent cart items:', items);
  if (Array.isArray(items) && items.length === 0) {
    console.log('✅ TEST 2 PASSED: Absent cart items returned [] cleanly.');
  } else {
    throw new Error('Test 2 Failed: Expected empty array');
  }

  // Test 3: Query cart items for null/undefined cartId
  console.log(`\nTest 3: Calling cartService.getCartItems(null)...`);
  const nullItems = await cartService.getCartItems(null);
  if (Array.isArray(nullItems) && nullItems.length === 0) {
    console.log('✅ TEST 3 PASSED: Null cartId handled cleanly without errors.');
  } else {
    throw new Error('Test 3 Failed: Expected empty array');
  }

  console.log('\n🎉 ALL CART RESILIENCE TESTS PASSED PERFECTLY!');
}

testCart().catch(err => {
  console.error('💥 Test failed:', err);
  process.exit(1);
});
