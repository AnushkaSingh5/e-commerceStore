// scratch/test-awb-failure-fallback.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import { shippingService } from '../services/shipping/shippingService.js';
import { shippingFactory } from '../services/shipping/shippingFactory.js';
import { orderService } from '../services/orderService.js';

async function testScenario() {
  console.log('======================================================================');
  console.log('🧪 TESTING SHIPROCKET AWB ALLOCATION FAILURE -> DELHIVERY FALLBACK');
  console.log('======================================================================\n');

  const srProvider = shippingFactory.getProvider('Shiprocket');
  const dlProvider = shippingFactory.getProvider('Delhivery');

  // Create a mock order in orderService
  const order = await orderService.createOrder({
    store_id: 'test-store-id',
    customer_name: 'Anushka Sharma',
    customer_email: 'test@example.com',
    customer_phone: '9876543210',
    shipping_address: '123 Main Street, Near City Center, Bhopal, MP - 462022',
    shipping_address_line1: '123 Main Street',
    shipping_address_city: 'Bhopal',
    shipping_address_state: 'Madhya Pradesh',
    shipping_address_pincode: '462022',
    shipping_address_country: 'India',
    total_amount: 500,
    items: [{ id: 'p1', name: 'Sample Item', price: 500, quantity: 1, weight: 500 }]
  });

  console.log('Created test order:', order.id);

  // Mock Shiprocket createShipment to simulate: order created (shipment_id = 1548219483), but AWB allocation fails (400)
  const origSrCreate = srProvider.createShipment;
  srProvider.createShipment = async (orderId, orderDetails, pickupSettings) => {
    console.log(`[Shipping] Shiprocket order created: shipmentId=1548219483`);
    console.log(`[Shipping] Shiprocket AWB allocation started for shipmentId: 1548219483`);
    const errMsg = 'Given courier not serviceable.';
    console.warn(`[Shipping] Shiprocket AWB allocation failed: ${errMsg}`);
    console.warn(`[Shipping] Shiprocket shipment considered FAILED: ${errMsg}`);
    throw new Error(`Shiprocket AWB allocation failed: ${errMsg}`);
  };

  try {
    const result = await shippingService.createShipment(order.id);
    console.log('\n--- createShipment Result ---');
    console.log(JSON.stringify(result, null, 2));

    if (result.success && result.awb_number && result.courier_name.includes('Delhivery')) {
      console.log('\n✅ TEST PASSED: Shiprocket AWB failure successfully triggered Delhivery fallback!');
      console.log(`✅ Provider: ${result.courier_name} | AWB: ${result.awb_number}`);
    } else {
      throw new Error('Test Failed: Result did not use Delhivery or missing AWB.');
    }
  } finally {
    srProvider.createShipment = origSrCreate;
  }

  // TEST 2: Duplicate check with shipment_id but NO AWB
  console.log('\n--- TEST 2: Duplicate check with shipment_id present but awb_number empty ---');
  const orderWithPartialShipment = await orderService.createOrder({
    store_id: 'test-store-id-2',
    customer_name: 'Anushka Sharma',
    customer_email: 'test@example.com',
    customer_phone: '9876543210',
    shipping_address: '123 Main Street, Near City Center, Bhopal, MP - 462022',
    shipping_address_line1: '123 Main Street',
    shipping_address_city: 'Bhopal',
    shipping_address_state: 'Madhya Pradesh',
    shipping_address_pincode: '462022',
    shipping_address_country: 'India',
    total_amount: 500,
    items: [{ id: 'p1', name: 'Sample Item', price: 500, quantity: 1, weight: 500 }]
  });

  // Manually set shipment_id on order but awb_number null
  orderWithPartialShipment.shipment_id = '1548219483';
  orderWithPartialShipment.awb_number = null;

  // Mock orderService.getOrderDetails to return orderWithPartialShipment
  const origGetOrder = orderService.getOrderDetails;
  orderService.getOrderDetails = async () => orderWithPartialShipment;

  try {
    const result2 = await shippingService.createShipment(orderWithPartialShipment.id);
    if (result2.success && result2.awb_number) {
      console.log('✅ TEST 2 PASSED: Order with shipment_id but NO AWB was not falsely skipped by duplicate check and successfully got an AWB:', result2.awb_number);
    } else {
      throw new Error('Test 2 Failed');
    }
  } finally {
    orderService.getOrderDetails = origGetOrder;
  }

  console.log('\n🎉 ALL AWB FAILURE & FALLBACK TESTS PASSED 100%!');
}

testScenario().catch(err => {
  console.error('💥 Test error:', err);
  process.exit(1);
});
