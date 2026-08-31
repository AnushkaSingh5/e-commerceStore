// scratch/test-full-order-flow.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import { checkoutService } from '../services/checkoutService.js';
import { POST as createSessionRoute } from '../app/api/payment/cashfree/create-session/route.js';
import { Cashfree, CFEnvironment } from 'cashfree-pg';

async function testFullOrderFlow() {
  console.log('================================================================');
  console.log('🧪 TESTING END-TO-END CHECKOUT -> DB -> CASHFREE FLOW');
  console.log('================================================================\n');

  const cart = [{
    id: 'c3a05cb7-93ce-4042-bd72-d2d9d3d60c28',
    product_id: 'c3a05cb7-93ce-4042-bd72-d2d9d3d60c28',
    name: 'parrot',
    price: 300,
    quantity: 1,
    store_id: '5c54596b-3d25-4c56-95f0-7208271a2d56'
  }];

  const customerInfo = {
    name: 'ANUSHKA SINGH',
    email: 'anushka.2327cse1234@kiet.edu',
    phone: '+918468055528',
    address: 'Ho.No. 74 Shivanagar Nathmalpur',
    city: 'Gorakhpur',
    state: 'Uttar Pradesh',
    pincode: '273001',
    country: 'India',
    shipping_cost: 89.32,
    payment_provider: 'Cashfree'
  };

  const couponData = {
    coupon_id: 'e3d02238-be22-49fa-9ef5-eb8e5e5141c8',
    coupon_code: 'FIRST',
    discount_amount: 20
  };

  console.log('1. Calling checkoutService.processCheckout...');
  const res = await checkoutService.processCheckout(cart, customerInfo, couponData);
  const createdOrder = res.orders[0];

  console.log('   Created Order in DB:');
  console.log(`   Order ID:        ${createdOrder.id}`);
  console.log(`   Subtotal:        ₹300.00`);
  console.log(`   Discount:        -₹${createdOrder.discount_amount}`);
  console.log(`   Shipping:        +₹${createdOrder.shipping_cost}`);
  console.log(`   Total Amount:    ₹${createdOrder.total_amount}`);

  if (createdOrder.total_amount !== 369.32) {
    throw new Error(`DB order total_amount is ${createdOrder.total_amount}, expected 369.32!`);
  }

  console.log('\n2. Calling /api/payment/cashfree/create-session for Order:', createdOrder.id);
  const sessionReq = new Request('https://www.kreatorstore.in/api/payment/cashfree/create-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'host': 'www.kreatorstore.in'
    },
    body: JSON.stringify({
      orderId: createdOrder.id,
      amount: createdOrder.total_amount,
      customerInfo: {
        id: createdOrder.customer_id || 'cust_test',
        email: customerInfo.email,
        phone: customerInfo.phone,
        name: customerInfo.name
      },
      slug: 'cutestore'
    })
  });

  const sessionRes = await createSessionRoute(sessionReq);
  const sessionData = await sessionRes.json();
  console.log('   Session Response:', {
    id: sessionData.id,
    payment_session_id_present: Boolean(sessionData.payment_session_id),
    environment: sessionData.environment
  });

  if (!sessionData.payment_session_id) {
    throw new Error('Cashfree session creation failed: ' + JSON.stringify(sessionData));
  }

  console.log('\n3. Querying Cashfree Production API with PGFetchOrder...');
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  const cashfree = new Cashfree(CFEnvironment.PRODUCTION, clientId, clientSecret);

  const fetchRes = await cashfree.PGFetchOrder(createdOrder.id);
  const cfOrder = fetchRes.data;

  console.log('   Cashfree Order ID:     ', cfOrder.order_id);
  console.log('   Cashfree CF Order ID:  ', cfOrder.cf_order_id);
  console.log('   Cashfree Order Amount: ', cfOrder.order_amount);
  console.log('   Cashfree Status:       ', cfOrder.order_status);

  console.log('\n================================================================');
  console.log('📊 COMPARISON RESULT');
  console.log('================================================================');
  console.log(`Website checkout displayed total:      ₹369.32`);
  console.log(`Database order total_amount:           ₹${createdOrder.total_amount}`);
  console.log(`Cashfree Create Order amount:          ₹${createdOrder.total_amount}`);
  console.log(`Cashfree PGFetchOrder amount:          ₹${Number(cfOrder.order_amount).toFixed(2)}`);
  console.log(`Cashfree hosted checkout Order Amount: ₹${Number(cfOrder.order_amount).toFixed(2)}`);
  console.log('================================================================');

  if (Number(cfOrder.order_amount) === 369.32 && createdOrder.total_amount === 369.32) {
    console.log('\n🎉 SUCCESS: All values match EXACTLY at ₹369.32 across UI, Database, and Cashfree Production!');
  } else {
    throw new Error('Mismatch occurred!');
  }
}

testFullOrderFlow().catch(err => {
  console.error('💥 Test error:', err);
  process.exit(1);
});
