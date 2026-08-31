// scratch/test-shipping-flows.js
import { ShiprocketProvider } from '../services/shipping/shiprocketProvider.js';
import { DelhiveryProvider } from '../services/shipping/delhiveryProvider.js';
import { shippingService } from '../services/shipping/shippingService.js';
import { shippingFactory } from '../services/shipping/shippingFactory.js';
import { checkoutService } from '../services/checkoutService.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 RUNNING COMPREHENSIVE MULTI-SELLER SHIPPING TEST SUITE (12 TESTS)');
  console.log('===============================================================\n');

  const shiprocket = new ShiprocketProvider();
  const delhivery = new DelhiveryProvider();

  // -------------------------------------------------------------
  // TEST 1: Shiprocket serviceable -> Shiprocket selected, Delhivery NOT selected
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: Shiprocket Serviceable (Primary Provider) ---');
  {
    const res = await shippingService.calculateShippingCost({
      storeId: 'store-1',
      destinationPincode: '462022',
      paymentMode: 'Prepaid',
      cartItems: [{ id: 'p1', store_id: 'store-1', name: 'Shirt', price: 400, quantity: 1, weight: 300 }]
    });

    assert(res.success === true, 'Test 1: Result is success');
    assert(res.serviceable === true, 'Test 1: Result is serviceable');
    assert(res.shipments.length === 1, 'Test 1: Exactly 1 shipment created');
    assert(res.shipments[0].provider === 'Shiprocket', 'Test 1: Shiprocket selected as primary provider');
    assert(res.total_amount > 0, `Test 1: Total shipping amount calculated (₹${res.total_amount})`);
  }

  // -------------------------------------------------------------
  // TEST 2: Shiprocket non-serviceable -> Delhivery serviceability checked -> Delhivery selected
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Shiprocket Non-Serviceable -> Delhivery Fallback ---');
  {
    // Temporarily stub Shiprocket to return non-serviceable
    const originalSrCalc = shiprocket.calculateShippingCost;
    shiprocket.calculateShippingCost = async () => ({
      success: false,
      serviceable: false,
      provider: 'Shiprocket',
      reason: 'Route unserviceable by Shiprocket'
    });
    // Replace in factory
    shippingFactory.providers['Shiprocket'] = shiprocket;

    const res = await shippingService.calculateShippingCost({
      storeId: 'store-1',
      destinationPincode: '462022',
      paymentMode: 'Prepaid',
      cartItems: [{ id: 'p1', store_id: 'store-1', name: 'Shoes', price: 1200, quantity: 1, weight: 800 }]
    });

    assert(res.success === true, 'Test 2: Result is success with fallback');
    assert(res.serviceable === true, 'Test 2: Result is serviceable via fallback');
    assert(res.shipments[0].provider === 'Delhivery', 'Test 2: Delhivery successfully selected as fallback');

    // Restore
    shiprocket.calculateShippingCost = originalSrCalc;
    shippingFactory.providers['Shiprocket'] = shiprocket;
  }

  // -------------------------------------------------------------
  // TEST 3: Shiprocket API timeout -> Delhivery attempted
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Shiprocket API Timeout -> Delhivery Fallback ---');
  {
    const originalSrCalc = shiprocket.calculateShippingCost;
    shiprocket.calculateShippingCost = async () => ({
      success: false,
      serviceable: false,
      provider: 'Shiprocket',
      reason: 'Shiprocket API request timed out.'
    });
    shippingFactory.providers['Shiprocket'] = shiprocket;

    const res = await shippingService.calculateShippingCost({
      storeId: 'store-1',
      destinationPincode: '462022',
      paymentMode: 'Prepaid',
      cartItems: [{ id: 'p1', store_id: 'store-1', name: 'Cap', price: 250, quantity: 1, weight: 200 }]
    });

    assert(res.success === true, 'Test 3: Result succeeded despite Shiprocket timeout');
    assert(res.shipments[0].provider === 'Delhivery', 'Test 3: Delhivery fallback successfully engaged upon timeout');

    // Restore
    shiprocket.calculateShippingCost = originalSrCalc;
    shippingFactory.providers['Shiprocket'] = shiprocket;
  }

  // -------------------------------------------------------------
  // TEST 4: Both providers unavailable -> Checkout blocked with clear message
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Both Providers Non-Serviceable ---');
  {
    const res = await shippingService.calculateShippingCost({
      storeId: 'store-1',
      destinationPincode: '999999', // Triggers unserviceable in mock mode
      paymentMode: 'Prepaid',
      cartItems: [{ id: 'p1', store_id: 'store-1', name: 'Item', price: 500, quantity: 1 }]
    });

    assert(res.success === false, 'Test 4: Response is marked not success');
    assert(res.serviceable === false, 'Test 4: Response is marked unserviceable');
    assert(res.total_amount === 0, 'Test 4: Total amount is 0');
    assert(res.message.includes('not serviceable'), 'Test 4: Clear unserviceable error message returned');
  }

  // -------------------------------------------------------------
  // TEST 5: Two products from SAME seller -> One seller shipment
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Two Products from SAME Seller -> One Shipment ---');
  {
    const res = await shippingService.calculateShippingCost({
      storeId: 'store-A',
      destinationPincode: '462022',
      paymentMode: 'Prepaid',
      cartItems: [
        { id: 'p1', store_id: 'store-A', name: 'Product 1', price: 300, quantity: 2, weight: 200 },
        { id: 'p2', store_id: 'store-A', name: 'Product 2', price: 600, quantity: 1, weight: 400 }
      ]
    });

    assert(res.shipments.length === 1, 'Test 5: Exactly 1 shipment for single seller multi-item cart');
    assert(res.shipments[0].sellerId === 'store-A', 'Test 5: Shipment correctly assigned to store-A');
  }

  // -------------------------------------------------------------
  // TEST 6: Products from TWO different sellers -> Two independent seller shipments
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Products from TWO Different Sellers -> Two Independent Shipments ---');
  {
    // Mock settings for store-A and store-B
    await shippingService.saveShippingSettings('seller-A', {
      warehouse_name: 'Warehouse A',
      contact_person: 'Seller A',
      email: 'sellera@store.com',
      phone: '9876543210',
      address: 'Lane 1, Delhi',
      pincode: '110016',
      city: 'Delhi',
      state: 'Delhi'
    });

    await shippingService.saveShippingSettings('seller-B', {
      warehouse_name: 'Warehouse B',
      contact_person: 'Seller B',
      email: 'sellerb@store.com',
      phone: '9876543211',
      address: 'Plot 2, Bhopal',
      pincode: '462022',
      city: 'Bhopal',
      state: 'Madhya Pradesh'
    });

    const res = await shippingService.calculateShippingCost({
      destinationPincode: '560001',
      paymentMode: 'Prepaid',
      cartItems: [
        { id: 'p1', store_id: 'seller-A', name: 'Seller A Item', price: 500, quantity: 1, weight: 300 },
        { id: 'p2', store_id: 'seller-B', name: 'Seller B Item', price: 800, quantity: 1, weight: 500 }
      ]
    });

    assert(res.shipments.length === 2, 'Test 6: Exactly 2 independent shipments created for 2 sellers');
    assert(res.shipments.some(s => s.sellerId === 'seller-A'), 'Test 6: Contains shipment for seller-A');
    assert(res.shipments.some(s => s.sellerId === 'seller-B'), 'Test 6: Contains shipment for seller-B');
    const expectedSum = res.shipments.reduce((sum, s) => sum + s.shippingCost, 0);
    assert(res.total_amount === expectedSum, `Test 6: Total shipping equals sum of seller shipments (₹${res.total_amount})`);
  }

  // -------------------------------------------------------------
  // TEST 7: Different seller pickup pincodes
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Independent Seller Pickup Pincodes ---');
  {
    const res = await shippingService.calculateShippingCost({
      destinationPincode: '560001',
      paymentMode: 'Prepaid',
      cartItems: [
        { id: 'p1', store_id: 'seller-A', name: 'Item A', price: 200, quantity: 1 },
        { id: 'p2', store_id: 'seller-B', name: 'Item B', price: 300, quantity: 1 }
      ]
    });

    const shipmentA = res.shipments.find(s => s.sellerId === 'seller-A');
    const shipmentB = res.shipments.find(s => s.sellerId === 'seller-B');

    assert(shipmentA.pickupPincode === '110016', 'Test 7: Shipment A used seller A pickup pincode (110016)');
    assert(shipmentB.pickupPincode === '462022', 'Test 7: Shipment B used seller B pickup pincode (462022)');
  }

  // -------------------------------------------------------------
  // TEST 8: Different package weights
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: Package Weight Handling ---');
  {
    const resLight = await shippingService.calculateShippingCost({
      storeId: 'seller-A',
      destinationPincode: '560001',
      paymentMode: 'Prepaid',
      cartItems: [{ id: 'p1', store_id: 'seller-A', name: 'Light Item', price: 100, quantity: 1, weight: 200 }]
    });

    const resHeavy = await shippingService.calculateShippingCost({
      storeId: 'seller-A',
      destinationPincode: '560001',
      paymentMode: 'Prepaid',
      cartItems: [{ id: 'p2', store_id: 'seller-A', name: 'Heavy Item', price: 100, quantity: 1, weight: 2500 }]
    });

    assert(resHeavy.total_amount > resLight.total_amount, `Test 8: Heavy package (₹${resHeavy.total_amount}) cost is appropriately higher than light package (₹${resLight.total_amount})`);
  }

  // -------------------------------------------------------------
  // TEST 9: No Tax -> Total = Subtotal + Shipping
  // -------------------------------------------------------------
  console.log('\n--- TEST 9: Strict 0% Tax Invariant ---');
  {
    const cart = [
      { id: 'p1', store_id: 'seller-A', name: 'Book', price: 399, quantity: 1, weight: 400 }
    ];
    const customer = {
      name: 'Test Customer',
      email: 'customer@example.com',
      phone: '9876543210',
      address: '123 Test Street',
      city: 'Bhopal',
      state: 'Madhya Pradesh',
      pincode: '462022'
    };

    const checkoutRes = await checkoutService.processCheckout(cart, customer);
    const order = checkoutRes.orders[0];
    const subtotal = 399;
    const shipping = order.shipping_cost;
    const expectedTotal = subtotal + shipping;

    assert(order.total_amount === expectedTotal, `Test 9: Total (₹${order.total_amount}) equals Subtotal (₹${subtotal}) + Shipping (₹${shipping}) without any tax`);
  }

  // -------------------------------------------------------------
  // TEST 10: Payment Amount Matches Exactly
  // -------------------------------------------------------------
  console.log('\n--- TEST 10: Payment Gateway Payload Consistency ---');
  {
    const cart = [
      { id: 'p1', store_id: 'seller-A', name: 'Headphones', price: 1500, quantity: 1, weight: 300 }
    ];
    const customer = {
      name: 'Anushka',
      email: 'anushka@example.com',
      phone: '9876543210',
      address: '456 Tech Park',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001'
    };

    const checkoutRes = await checkoutService.processCheckout(cart, customer);
    const order = checkoutRes.orders[0];
    const payableAmount = order.total_amount;

    assert(payableAmount === (1500 + order.shipping_cost), `Test 10: Payable total ₹${payableAmount} strictly matches subtotal ₹1500 + shipping ₹${order.shipping_cost}`);
  }

  // -------------------------------------------------------------
  // TEST 11: Successful Shiprocket Shipment Creation -> Duplicate Prevention
  // -------------------------------------------------------------
  console.log('\n--- TEST 11: Duplicate Shipment Prevention ---');
  {
    // Create an order first
    const cart = [{ id: 'p1', store_id: 'seller-A', name: 'Lamp', price: 900, quantity: 1, weight: 500 }];
    const customer = {
      name: 'Ravi',
      email: 'ravi@example.com',
      phone: '9876543210',
      address: '789 Garden Road',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110016'
    };
    const checkoutRes = await checkoutService.processCheckout(cart, customer);
    const orderId = checkoutRes.orders[0].id;

    // Step 1: Create shipment
    const shipment1 = await shippingService.createShipment(orderId);
    assert(shipment1.success === true, 'Test 11: Initial shipment creation succeeded');
    const awb1 = shipment1.awb_number;

    // Step 2: Attempt duplicate creation for same order
    const shipment2 = await shippingService.createShipment(orderId);
    assert(shipment2.awb_number === awb1, 'Test 11: Duplicate creation returned existing AWB instead of creating new physical shipment');
  }

  // -------------------------------------------------------------
  // TEST 12: Shiprocket creation failure -> Delhivery fallback with safe verification
  // -------------------------------------------------------------
  console.log('\n--- TEST 12: Shipment Creation Failure -> Safe Fallback ---');
  {
    const cart = [{ id: 'p1', store_id: 'seller-A', name: 'Art', price: 2000, quantity: 1, weight: 600 }];
    const customer = {
      name: 'Simran',
      email: 'simran@example.com',
      phone: '9876543210',
      address: '321 Palace Road',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110016'
    };
    const checkoutRes = await checkoutService.processCheckout(cart, customer);
    const orderId = checkoutRes.orders[0].id;

    // Stub Shiprocket createShipment to fail
    const originalSrCreate = shiprocket.createShipment;
    shiprocket.createShipment = async () => {
      throw new Error('Shiprocket API 500 Internal Error during order creation');
    };
    shippingFactory.providers['Shiprocket'] = shiprocket;

    const shipmentResult = await shippingService.createShipment(orderId);
    assert(shipmentResult.success === true, 'Test 12: Shipment creation succeeded via Delhivery fallback');
    assert(shipmentResult.courier_name.toLowerCase().includes('delhivery'), 'Test 12: Delhivery courier used after Shiprocket creation error');

    // Restore
    shiprocket.createShipment = originalSrCreate;
    shippingFactory.providers['Shiprocket'] = shiprocket;
  }

  console.log('\n===============================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('===============================================================\n');
}

runTests().catch(err => {
  console.error('💥 Test suite failed:', err);
  process.exit(1);
});
