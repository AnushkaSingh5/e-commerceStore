// scratch/test-cashfree-sdk.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import { Cashfree } from 'cashfree-pg';

async function testCashfree(envMode, envLabel) {
  console.log(`\n====================================================`);
  console.log(`🧪 Testing Cashfree with Environment: ${envLabel}`);
  console.log(`====================================================`);

  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;

  console.log(`[Cashfree] Environment: ${envLabel}`);
  console.log(`[Cashfree] Client ID present: ${Boolean(clientId)}`);
  console.log(`[Cashfree] Client ID length: ${clientId?.length || 0}`);
  console.log(`[Cashfree] Secret present: ${Boolean(clientSecret)}`);
  console.log(`[Cashfree] Secret length: ${clientSecret?.length || 0}`);
  console.log(`[Cashfree] Secret prefix: ${clientSecret ? clientSecret.slice(0, 15) + '...' : 'N/A'}`);
  console.log(`[Cashfree] API endpoint: ${envMode === Cashfree.PRODUCTION ? 'https://api.cashfree.com/pg/orders' : 'https://sandbox.cashfree.com/pg/orders'}`);

  const cashfree = new Cashfree(envMode, clientId, clientSecret);

  const testOrderId = `test_order_${Date.now()}`;
  const requestPayload = {
    order_amount: 1.00,
    order_currency: 'INR',
    order_id: testOrderId,
    customer_details: {
      customer_id: 'cust_test_123',
      customer_phone: '9999999999',
      customer_email: 'test@example.com'
    },
    order_meta: {
      return_url: `https://www.kreatorstore.in/api/payment/cashfree/verify?order_id={order_id}&slug=store1`
    }
  };

  try {
    const response = await cashfree.PGCreateOrder(requestPayload);
    console.log(`✅ [Cashfree] Order Creation SUCCESS!`);
    console.log(`   - HTTP Status: ${response.status || 200}`);
    console.log(`   - Order ID: ${response.data?.order_id}`);
    console.log(`   - Payment Session ID Present: ${Boolean(response.data?.payment_session_id)}`);
    console.log(`   - Payment Session ID Length: ${response.data?.payment_session_id?.length || 0}`);
    return { success: true, data: response.data };
  } catch (error) {
    console.log(`❌ [Cashfree] Order Creation FAILED!`);
    console.log(`   - Error Message: ${error.message}`);
    if (error.response) {
      console.log(`   - HTTP Status: ${error.response.status}`);
      console.log(`   - Response Data:`, JSON.stringify(error.response.data, null, 2));
    }
    return { success: false, error };
  }
}

async function run() {
  // Test 1: Test with current Sandbox configuration
  console.log('--- TEST 1: Current configuration (Cashfree.SANDBOX) ---');
  await testCashfree(Cashfree.SANDBOX, 'SANDBOX');

  // Test 2: Test with Production configuration
  console.log('\n--- TEST 2: Production configuration (Cashfree.PRODUCTION) ---');
  await testCashfree(Cashfree.PRODUCTION, 'PRODUCTION');
}

run().catch(console.error);
