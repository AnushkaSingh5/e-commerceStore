// scratch/test-cfenvironment.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import { Cashfree, CFEnvironment } from 'cashfree-pg';

console.log('Cashfree.SANDBOX:', Cashfree.SANDBOX); // undefined!
console.log('Cashfree.PRODUCTION:', Cashfree.PRODUCTION); // undefined!
console.log('CFEnvironment.SANDBOX:', CFEnvironment.SANDBOX); // 1
console.log('CFEnvironment.PRODUCTION:', CFEnvironment.PRODUCTION); // 2

async function testWithCFEnvironment() {
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;

  console.log('\n--- Instantiating with CFEnvironment.PRODUCTION (2) ---');
  const cashfree = new Cashfree(CFEnvironment.PRODUCTION, clientId, clientSecret);

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
    console.log('🎉🎉🎉 SUCCESS WITH CFEnvironment.PRODUCTION!');
    console.log('HTTP Status:', response.status || 200);
    console.log('Order ID:', response.data?.order_id);
    console.log('Payment Session ID present:', Boolean(response.data?.payment_session_id));
    console.log('Payment Session ID length:', response.data?.payment_session_id?.length);
  } catch (err) {
    console.log('❌ Failed with CFEnvironment.PRODUCTION:', err.message);
    if (err.response) {
      console.log('HTTP Status:', err.response.status);
      console.log('Response data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

testWithCFEnvironment().catch(console.error);
