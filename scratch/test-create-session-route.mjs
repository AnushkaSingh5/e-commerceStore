// scratch/test-create-session-route.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import { POST } from '../app/api/payment/cashfree/create-session/route.js';

async function testRoute() {
  console.log('================================================================');
  console.log('🧪 TESTING /api/payment/cashfree/create-session ROUTE HANDLER');
  console.log('================================================================\n');

  const reqBody = {
    orderId: `route_test_${Date.now()}`,
    amount: 1.00,
    customerInfo: {
      id: 'cust_route_test',
      email: 'test@kreatorstore.in',
      phone: '9876543210',
      name: 'Anushka Sharma'
    },
    slug: 'cutestore'
  };

  const req = new Request('https://www.kreatorstore.in/api/payment/cashfree/create-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'host': 'www.kreatorstore.in'
    },
    body: JSON.stringify(reqBody)
  });

  const res = await POST(req);
  console.log('HTTP Status:', res.status);
  const data = await res.json();
  console.log('Response JSON:', {
    id: data.id,
    payment_session_id_present: Boolean(data.payment_session_id),
    payment_session_id_length: data.payment_session_id?.length,
    environment: data.environment,
    mock: data.mock
  });

  if (res.status === 200 && data.payment_session_id && data.environment === 'production' && data.mock === false) {
    console.log('\n🎉 SUCCESS: Route handler generated a valid Cashfree PRODUCTION payment session!');
  } else {
    throw new Error('Route test failed: ' + JSON.stringify(data));
  }
}

testRoute().catch(err => {
  console.error('💥 Test error:', err);
  process.exit(1);
});
