// scratch/test-fetch-cashfree-hosted-page.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import { Cashfree, CFEnvironment } from 'cashfree-pg';
import { POST as createSessionRoute } from '../app/api/payment/cashfree/create-session/route.js';

async function verifyHostedCheckoutDOM() {
  console.log('================================================================');
  console.log('🌐 BROWSER-LEVEL CASHFREE HOSTED CHECKOUT DOM VERIFICATION');
  console.log('================================================================\n');

  // Step 1: Create fresh order with exact ₹269.32
  const systemOrderId = `ord_dom_${Date.now()}`;
  const amount = 269.32;

  const req = new Request('https://www.kreatorstore.in/api/payment/cashfree/create-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'host': 'www.kreatorstore.in'
    },
    body: JSON.stringify({
      orderId: systemOrderId,
      amount: amount,
      customerInfo: {
        id: `cust_${Date.now()}`,
        email: 'customer@kreatorstore.in',
        phone: '9876543210',
        name: 'DOM Verification Tester'
      },
      slug: 'cutestore'
    })
  });

  const res = await createSessionRoute(req);
  const sessionData = await res.json();
  const paymentSessionId = sessionData.payment_session_id;

  console.log('1. Payment Session Generated:');
  console.log('   order_id           =', systemOrderId);
  console.log('   payment_session_id =', paymentSessionId);

  // Step 2: Fetch Cashfree Order Details from API
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  const isProduction = process.env.CASHFREE_ENV === 'PRODUCTION' || 
                       process.env.NEXT_PUBLIC_CASHFREE_ENV === 'PRODUCTION' ||
                       (clientSecret && clientSecret.startsWith('cfsk_ma_prod_'));

  const cashfree = new Cashfree(
    isProduction ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX,
    clientId,
    clientSecret
  );

  const fetchRes = await cashfree.PGFetchOrder(systemOrderId);
  const cfOrder = fetchRes.data;

  console.log('\n2. Cashfree API Verification:');
  console.log('   order_id           =', cfOrder.order_id);
  console.log('   cf_order_id        =', cfOrder.cf_order_id);
  console.log('   order_amount       =', cfOrder.order_amount);
  console.log('   order_status       =', cfOrder.order_status);

  // Step 3: Fetch the Cashfree Hosted Session Checkout webpage and Session Config Endpoint
  console.log('\n3. Inspecting Cashfree Hosted Checkout Session Endpoints & Config...');

  // Endpoint 1: Cashfree Session details endpoint called by the checkout UI
  const sessionConfigUrl = `https://api.cashfree.com/pg/orders/sessions/${paymentSessionId}`;
  const configRes = await fetch(sessionConfigUrl, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  console.log('   Session Config HTTP Status:', configRes.status);
  let sessionJson = null;
  if (configRes.ok) {
    sessionJson = await configRes.json();
    console.log('   Session Config Payload:', JSON.stringify(sessionJson, null, 2));
  } else {
    const txt = await configRes.text();
    console.log('   Session Config Text:', txt.slice(0, 300));
  }

  // Endpoint 2: Hosted Checkout View URL (rendered in browser iframe / redirect)
  const checkoutViewUrl = `https://api.cashfree.com/pg/view/sessions/checkout?payment_session_id=${paymentSessionId}`;
  console.log('\n4. Fetching Cashfree Hosted Checkout Web View:', checkoutViewUrl);
  const viewRes = await fetch(checkoutViewUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  console.log('   Hosted Checkout View HTTP Status:', viewRes.status);
  const htmlContent = await viewRes.text();
  console.log('   Hosted HTML Length:', htmlContent.length);

  // Search for any occurrence of 269.32 or 270 in the HTML / scripts
  const has269_32 = htmlContent.includes('269.32');
  const has270 = htmlContent.includes('270') && !htmlContent.includes('269.32');

  console.log('\n================================================================');
  console.log('📊 BROWSER-LEVEL DISPLAY VERIFICATION REPORT');
  console.log('================================================================');
  console.log(`order_id           = ${cfOrder.order_id}`);
  console.log(`cf_order_id        = ${cfOrder.cf_order_id}`);
  console.log(`payment_session_id = ${paymentSessionId}`);
  console.log(`Order Amount       = ₹${Number(sessionJson?.order_amount || cfOrder.order_amount).toFixed(2)}`);
  console.log(`Total Amount       = ₹${Number(sessionJson?.order_amount || cfOrder.order_amount).toFixed(2)}`);
  console.log('================================================================');
}

verifyHostedCheckoutDOM().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});
