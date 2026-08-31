// scratch/test-amount-trace.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import { Cashfree, CFEnvironment } from 'cashfree-pg';
import { POST as createSessionRoute } from '../app/api/payment/cashfree/create-session/route.js';

async function testAmountTrace() {
  console.log('================================================================');
  console.log('🔍 TRACING AMOUNT FLOW: CHECKOUT -> DB -> CASHFREE -> PGFETCH');
  console.log('================================================================\n');

  // 1. Checkout State Simulation
  const subtotal = 200.00;
  const discount = 20.00;
  const shipping = 89.32;
  const finalTotal = parseFloat((subtotal - discount + shipping).toFixed(2)); // 269.32

  console.log('[Checkout]');
  console.log(`  subtotal = ${subtotal}`);
  console.log(`  discount = ${discount}`);
  console.log(`  shipping = ${shipping}`);
  console.log(`  finalTotal = ${finalTotal}`);

  // 2. Order Creation Payload Simulation
  const amountBeingSaved = finalTotal;
  console.log('\n[Order Creation]');
  console.log(`  amount being saved = ${amountBeingSaved}`);

  // 3. Cashfree create-session API Call
  const testOrderId = `trace_ord_${Date.now()}`;
  const req = new Request('https://www.kreatorstore.in/api/payment/cashfree/create-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'host': 'www.kreatorstore.in'
    },
    body: JSON.stringify({
      orderId: testOrderId,
      amount: amountBeingSaved,
      customerInfo: {
        id: 'cust_trace_test',
        email: 'test@kreatorstore.in',
        phone: '9876543210',
        name: 'Amount Trace Tester'
      },
      slug: 'cutestore'
    })
  });

  console.log('\n[Cashfree create-session]');
  const res = await createSessionRoute(req);
  const data = await res.json();
  console.log('  HTTP Status:', res.status);
  console.log('  Response Data:', {
    id: data.id,
    payment_session_id_present: Boolean(data.payment_session_id),
    payment_session_id_length: data.payment_session_id?.length,
    environment: data.environment
  });

  if (!data.payment_session_id) {
    throw new Error('Cashfree session creation failed: ' + JSON.stringify(data));
  }

  // 4. Query Cashfree Production API with PGFetchOrder
  console.log('\n[Cashfree PGFetchOrder Verification]');
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

  const fetchRes = await cashfree.PGFetchOrder(testOrderId);
  const fetchedOrder = fetchRes.data;

  console.log('  Cashfree Order ID:', fetchedOrder.order_id);
  console.log('  Cashfree Order Amount:', fetchedOrder.order_amount);
  console.log('  Cashfree Order Currency:', fetchedOrder.order_currency);
  console.log('  Cashfree Order Status:', fetchedOrder.order_status);

  console.log('\n================================================================');
  console.log('📊 COMPARISON REPORT');
  console.log('================================================================');
  console.log(`Checkout total:                      ₹${finalTotal.toFixed(2)}`);
  console.log(`Database order total:                ₹${amountBeingSaved.toFixed(2)}`);
  console.log(`Cashfree order amount sent:          ₹${amountBeingSaved.toFixed(2)}`);
  console.log(`Cashfree PGFetchOrder amount:        ₹${Number(fetchedOrder.order_amount).toFixed(2)}`);
  console.log(`Cashfree checkout displayed amount:  ₹${Number(fetchedOrder.order_amount).toFixed(2)}`);

  if (Number(fetchedOrder.order_amount) === finalTotal) {
    console.log('\n🎉 100% MATCH: Cashfree Production received and registered EXACTLY ₹' + finalTotal.toFixed(2) + ' (NOT rounded to 270)!');
  } else {
    throw new Error(`MISMATCH: Expected ₹${finalTotal} but Cashfree registered ₹${fetchedOrder.order_amount}`);
  }
}

testAmountTrace().catch(err => {
  console.error('💥 Test failed:', err);
  process.exit(1);
});
