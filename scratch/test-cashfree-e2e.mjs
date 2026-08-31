// scratch/test-cashfree-e2e.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import { Cashfree, CFEnvironment } from 'cashfree-pg';

async function testCompleteFlow() {
  console.log('================================================================');
  console.log('🧪 VERIFYING CASHFREE PRODUCTION INTEGRATION WITH NEW CREDENTIALS');
  console.log('================================================================\n');

  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  const cashfreeEnv = process.env.CASHFREE_ENV;

  console.log('[Cashfree] Environment Configured:', cashfreeEnv);
  console.log('[Cashfree] Client ID present:', Boolean(clientId));
  console.log('[Cashfree] Client ID length:', clientId?.length || 0);
  console.log('[Cashfree] Secret present:', Boolean(clientSecret));
  console.log('[Cashfree] Secret length:', clientSecret?.length || 0);
  console.log('[Cashfree] Secret prefix:', clientSecret ? clientSecret.slice(0, 15) + '...' : 'N/A');

  const isProduction = cashfreeEnv === 'PRODUCTION' || 
                       process.env.NEXT_PUBLIC_CASHFREE_ENV === 'PRODUCTION' ||
                       (clientSecret && clientSecret.startsWith('cfsk_ma_prod_'));

  const environment = isProduction ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
  console.log('[Cashfree] Resolved Environment Mode:', isProduction ? 'PRODUCTION (2)' : 'SANDBOX (1)');
  console.log('[Cashfree] Target API Endpoint:', isProduction ? 'https://api.cashfree.com/pg/orders' : 'https://sandbox.cashfree.com/pg/orders');

  const cashfree = new Cashfree(environment, clientId, clientSecret);

  // Step 1: Create a test order session
  const testOrderId = `cf_test_${Date.now()}`;
  const requestPayload = {
    order_amount: 1.00,
    order_currency: 'INR',
    order_id: testOrderId,
    customer_details: {
      customer_id: 'cust_audit_test',
      customer_phone: '9876543210',
      customer_email: 'audit@kreatorstore.in'
    },
    order_meta: {
      return_url: `https://www.kreatorstore.in/api/payment/cashfree/verify?order_id={order_id}&slug=store1`
    }
  };

  console.log(`\n🔄 Step 1: Calling PGCreateOrder on Cashfree Production...`);
  const response = await cashfree.PGCreateOrder(requestPayload);
  const data = response.data;

  console.log('✅ PGCreateOrder SUCCESS:');
  console.log('   - Cashfree Order ID:', data.order_id);
  console.log('   - Order Status:', data.order_status);
  console.log('   - Payment Session ID Present:', Boolean(data.payment_session_id));
  console.log('   - Payment Session ID Length:', data.payment_session_id?.length);

  // Step 2: Fetch order status from Cashfree to verify PGFetchOrder compatibility
  console.log(`\n🔄 Step 2: Calling PGFetchOrder on Cashfree Production for ID: ${testOrderId}...`);
  const fetchResponse = await cashfree.PGFetchOrder(testOrderId);
  const fetchData = fetchResponse.data;

  console.log('✅ PGFetchOrder SUCCESS:');
  console.log('   - Fetched Order ID:', fetchData.order_id);
  console.log('   - Fetched Order Status:', fetchData.order_status);
  console.log('   - Fetched Order Amount: ₹' + fetchData.order_amount);

  console.log('\n🎉 ALL CASHFREE PRODUCTION CHECKS COMPLETED 100% SUCCESSFULLY!');
}

testCompleteFlow().catch(err => {
  console.error('💥 Test error:', err.message);
  if (err.response) {
    console.error('Response data:', JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
});
