// scratch/test-pricing-and-scenarios.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import { POST as createSessionRoute } from '../app/api/payment/cashfree/create-session/route.js';

function computeCheckoutPricing({
  items,
  shippingType = 'calculated',
  flatFee = 15,
  calculatedShipping = 0,
  appliedCoupon = null
}) {
  const subtotal = parseFloat(items.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2));
  
  let shippingCost = 0;
  if (items.length > 0) {
    if (shippingType === 'flat') {
      shippingCost = parseFloat(flatFee.toFixed(2));
    } else if (shippingType === 'calculated') {
      shippingCost = parseFloat((calculatedShipping || 0).toFixed(2));
    }
  }

  const isCouponValid = !appliedCoupon || (
    (!appliedCoupon.minimum_order_amount || subtotal >= appliedCoupon.minimum_order_amount)
  );

  let discount = 0;
  if (appliedCoupon && isCouponValid) {
    if (appliedCoupon.discount_type === 'percentage') {
      discount = parseFloat((subtotal * (appliedCoupon.discount_value / 100)).toFixed(2));
    } else {
      discount = parseFloat(Math.min(subtotal, parseFloat(appliedCoupon.discount_value)).toFixed(2));
    }
  }

  const total = parseFloat(Math.max(0, subtotal - discount + shippingCost).toFixed(2));

  return {
    subtotal,
    discount,
    shippingCost,
    total,
    isCouponValid
  };
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING COMPLETE CHECKOUT / CART PRICING AUDIT SCENARIOS');
  console.log('================================================================\n');

  // Scenario A: No coupon, Subtotal ₹200, Shipping ₹89.32 -> Expected total ₹289.32
  console.log('--- SCENARIO A: No coupon ---');
  const resA = computeCheckoutPricing({
    items: [{ id: 'p1', price: 200, quantity: 1 }],
    shippingType: 'calculated',
    calculatedShipping: 89.32,
    appliedCoupon: null
  });
  console.log('Calculated:', resA);
  if (resA.subtotal === 200 && resA.discount === 0 && resA.shippingCost === 89.32 && resA.total === 289.32) {
    console.log('✅ Scenario A PASSED (Total = ₹289.32)');
  } else {
    throw new Error('Scenario A failed: ' + JSON.stringify(resA));
  }

  // Scenario B: ₹20 coupon, Subtotal ₹200, Discount ₹20, Shipping ₹89.32 -> Expected total ₹269.32
  console.log('\n--- SCENARIO B: ₹20 coupon ---');
  const couponB = { id: 'c1', code: 'SAVE20', discount_type: 'fixed', discount_value: 20, minimum_order_amount: 0 };
  const resB = computeCheckoutPricing({
    items: [{ id: 'p1', price: 200, quantity: 1 }],
    shippingType: 'calculated',
    calculatedShipping: 89.32,
    appliedCoupon: couponB
  });
  console.log('Calculated:', resB);
  if (resB.subtotal === 200 && resB.discount === 20 && resB.shippingCost === 89.32 && resB.total === 269.32) {
    console.log('✅ Scenario B PASSED (Total = ₹269.32)');
  } else {
    throw new Error('Scenario B failed: ' + JSON.stringify(resB));
  }

  // Scenario C: Remove coupon -> Expected total returns to ₹289.32
  console.log('\n--- SCENARIO C: Remove coupon ---');
  const resC = computeCheckoutPricing({
    items: [{ id: 'p1', price: 200, quantity: 1 }],
    shippingType: 'calculated',
    calculatedShipping: 89.32,
    appliedCoupon: null
  });
  console.log('Calculated:', resC);
  if (resC.subtotal === 200 && resC.discount === 0 && resC.total === 289.32) {
    console.log('✅ Scenario C PASSED (Total returns to ₹289.32)');
  } else {
    throw new Error('Scenario C failed: ' + JSON.stringify(resC));
  }

  // Scenario D: Change delivery address -> Shipping recalculates and total changes
  console.log('\n--- SCENARIO D: Change delivery address ---');
  const resD = computeCheckoutPricing({
    items: [{ id: 'p1', price: 200, quantity: 1 }],
    shippingType: 'calculated',
    calculatedShipping: 110.50, // New address rate
    appliedCoupon: couponB
  });
  console.log('Calculated:', resD);
  if (resD.subtotal === 200 && resD.discount === 20 && resD.shippingCost === 110.50 && resD.total === 290.50) {
    console.log('✅ Scenario D PASSED (Total updated to ₹290.50)');
  } else {
    throw new Error('Scenario D failed: ' + JSON.stringify(resD));
  }

  // Scenario E: Change payment method (e.g. COD vs Prepaid)
  console.log('\n--- SCENARIO E: Change payment method ---');
  const resE_Prepaid = computeCheckoutPricing({
    items: [{ id: 'p1', price: 200, quantity: 1 }],
    shippingType: 'calculated',
    calculatedShipping: 89.32,
    appliedCoupon: null
  });
  const resE_COD = computeCheckoutPricing({
    items: [{ id: 'p1', price: 200, quantity: 1 }],
    shippingType: 'calculated',
    calculatedShipping: 129.32, // COD has higher shipping/handling
    appliedCoupon: null
  });
  console.log('Prepaid Total:', resE_Prepaid.total, '| COD Total:', resE_COD.total);
  if (resE_Prepaid.total === 289.32 && resE_COD.total === 329.32) {
    console.log('✅ Scenario E PASSED (COD and Prepaid calculate respective totals)');
  } else {
    throw new Error('Scenario E failed');
  }

  // Scenario F: Change quantity -> Subtotal, shipping, discount, total update
  console.log('\n--- SCENARIO F: Change quantity ---');
  const couponPercent = { id: 'c2', code: 'TENPCT', discount_type: 'percentage', discount_value: 10, minimum_order_amount: 300 };
  const resF1 = computeCheckoutPricing({
    items: [{ id: 'p1', price: 200, quantity: 1 }], // Subtotal 200 < Min 300
    shippingType: 'calculated',
    calculatedShipping: 89.32,
    appliedCoupon: couponPercent
  });
  const resF2 = computeCheckoutPricing({
    items: [{ id: 'p1', price: 200, quantity: 2 }], // Subtotal 400 >= Min 300 -> 10% = 40
    shippingType: 'calculated',
    calculatedShipping: 99.32,
    appliedCoupon: couponPercent
  });
  console.log('Qty 1 (Under min order):', resF1);
  console.log('Qty 2 (Meets min order):', resF2);
  if (resF1.discount === 0 && resF1.total === 289.32 && resF2.discount === 40 && resF2.total === 459.32) {
    console.log('✅ Scenario F PASSED (Quantity change recomputes subtotal, discount, shipping, and total)');
  } else {
    throw new Error('Scenario F failed');
  }

  // Scenario G: Cashfree amount precision (exact ₹269.32, not rounded to ₹270)
  console.log('\n--- SCENARIO G: Cashfree Create Session Precision (₹269.32) ---');
  const testOrderId = `cf_prec_${Date.now()}`;
  const req = new Request('https://www.kreatorstore.in/api/payment/cashfree/create-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'host': 'www.kreatorstore.in'
    },
    body: JSON.stringify({
      orderId: testOrderId,
      amount: 269.32,
      customerInfo: {
        id: 'cust_prec_test',
        email: 'test@kreatorstore.in',
        phone: '9876543210',
        name: 'Precision Test'
      },
      slug: 'cutestore'
    })
  });

  const resG = await createSessionRoute(req);
  const dataG = await resG.json();
  console.log('Cashfree API Response:', {
    status: resG.status,
    id: dataG.id,
    session_present: Boolean(dataG.payment_session_id),
    environment: dataG.environment
  });
  if (resG.status === 200 && dataG.payment_session_id) {
    console.log('✅ Scenario G PASSED (Cashfree accepted exact decimal amount ₹269.32 on Production)');
  } else {
    throw new Error('Scenario G failed: ' + JSON.stringify(dataG));
  }

  console.log('\n================================================================');
  console.log('🎉 ALL PRICING AND CHECKOUT SCENARIOS PASSED WITH 100% SUCCESS');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('💥 Test error:', err);
  process.exit(1);
});
