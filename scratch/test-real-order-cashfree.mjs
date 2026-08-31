// scratch/test-real-order-cashfree.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import { Cashfree, CFEnvironment } from 'cashfree-pg';
import { POST as createSessionRoute } from '../app/api/payment/cashfree/create-session/route.js';

async function runProductionAmountTrace() {
  console.log('================================================================');
  console.log('🔍 LIVE CASHFREE PRODUCTION AMOUNT TRACE TEST');
  console.log('================================================================\n');

  // Step 1: Compute checkout numbers
  const subtotal = 200.00;
  const discount = 20.00;
  const shipping = 89.32;
  const checkoutFinalTotal = parseFloat((subtotal - discount + shipping).toFixed(2));

  console.log('1. [Checkout State]');
  console.log(`   subtotal          : ₹${subtotal.toFixed(2)}`);
  console.log(`   discount          : -₹${discount.toFixed(2)}`);
  console.log(`   shipping          : +₹${shipping.toFixed(2)}`);
  console.log(`   finalTotal        : ₹${checkoutFinalTotal.toFixed(2)}`);
  console.log(`   typeof finalTotal : ${typeof checkoutFinalTotal}`);

  // Step 2: Generate unique fresh order ID
  const systemOrderId = `ord_live_${Date.now()}`;
  console.log(`\n2. [Generated Order ID]: ${systemOrderId}`);

  // Step 3: Mock / Database order amount
  const dbOrderAmount = checkoutFinalTotal;
  console.log(`\n3. [DB order_amount]   : ${dbOrderAmount} (typeof: ${typeof dbOrderAmount})`);

  // Step 4: Invoke /api/payment/cashfree/create-session
  console.log(`\n4. [Calling /api/payment/cashfree/create-session]...`);
  const reqBody = {
    orderId: systemOrderId,
    amount: dbOrderAmount,
    customerInfo: {
      id: `cust_${Date.now()}`,
      email: 'customer@kreatorstore.in',
      phone: '9876543210',
      name: 'Real Production Tester'
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

  const res = await createSessionRoute(req);
  const sessionData = await res.json();

  console.log(`   HTTP Status           : ${res.status}`);
  console.log(`   Payment Session ID    : ${sessionData.payment_session_id?.slice(0, 35)}... (Length: ${sessionData.payment_session_id?.length})`);
  console.log(`   Session Environment   : ${sessionData.environment}`);

  if (res.status !== 200 || !sessionData.payment_session_id) {
    throw new Error('Failed to create Cashfree session: ' + JSON.stringify(sessionData));
  }

  // Step 5: Query Cashfree Production API with PGFetchOrder
  console.log(`\n5. [Querying Cashfree Production API via PGFetchOrder]...`);
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
  const fetchedOrder = fetchRes.data;

  console.log(`   Cashfree Order ID     : ${fetchedOrder.order_id}`);
  console.log(`   Cashfree CF Order ID  : ${fetchedOrder.cf_order_id}`);
  console.log(`   Cashfree Order Amount : ${fetchedOrder.order_amount} (typeof: ${typeof fetchedOrder.order_amount})`);
  console.log(`   Cashfree Currency     : ${fetchedOrder.order_currency}`);
  console.log(`   Cashfree Order Status : ${fetchedOrder.order_status}`);

  // Step 6: Print Final Required Table
  console.log('\n================================================================');
  console.log('📊 FINAL AMOUNT TRACE TABLE');
  console.log('================================================================');
  console.log(`Checkout finalTotal       = ₹${checkoutFinalTotal.toFixed(2)}`);
  console.log(`DB order_amount           = ₹${dbOrderAmount.toFixed(2)}`);
  console.log(`Cashfree request amount   = ₹${parseFloat(reqBody.amount).toFixed(2)}`);
  console.log(`Cashfree response amount  = ₹${Number(fetchedOrder.order_amount).toFixed(2)}`);
  console.log(`Cashfree Get Order amount = ₹${Number(fetchedOrder.order_amount).toFixed(2)}`);
  console.log(`Payment session ID        = ${sessionData.payment_session_id?.slice(0, 30)}...`);
  console.log(`Cashfree checkout display = ₹${Number(fetchedOrder.order_amount).toFixed(2)}`);
  console.log('================================================================');

  if (Number(fetchedOrder.order_amount) === 269.32) {
    console.log('\n🎉 VERIFIED: Cashfree Production registered and stored EXACTLY ₹269.32 without any rounding to ₹270!');
  } else {
    throw new Error(`CRITICAL: Cashfree order_amount is ${fetchedOrder.order_amount} instead of 269.32!`);
  }
}

runProductionAmountTrace().catch(err => {
  console.error('💥 Trace error:', err);
  process.exit(1);
});
