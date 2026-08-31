// app/api/shipping/calculate-cost/route.js
import { NextResponse } from 'next/server';
import { shippingService } from '@/services/shipping/shippingService';

export async function POST(request) {
  const reqUrl = request.url;
  const reqMethod = request.method;
  console.log(`📥 [API Request] URL: ${reqUrl} | Method: ${reqMethod}`);

  try {
    let body;
    try {
      body = await request.json();
    } catch (parseErr) {
      console.error('❌ [api/shipping/calculate-cost] Failed to parse request body as JSON:', parseErr);
      return NextResponse.json({ success: false, message: 'Invalid JSON request body.' }, { status: 400 });
    }

    const { storeId, destinationPincode, paymentMode, cartItems } = body;

    const hasStoreId = storeId || (Array.isArray(cartItems) && cartItems.some(i => i.store_id));
    if (!hasStoreId) {
      return NextResponse.json({ success: false, serviceable: false, message: 'Missing required storeId or items with store_id in request body.' }, { status: 400 });
    }
    if (!destinationPincode || destinationPincode.toString().trim().replace(/\D/g, '').length !== 6) {
      return NextResponse.json({ success: false, serviceable: false, message: 'Missing or invalid 6-digit destinationPincode in request body.' }, { status: 400 });
    }
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return NextResponse.json({ success: false, serviceable: false, message: 'Missing or empty cartItems in request body.' }, { status: 400 });
    }

    console.log(`🔄 [api/shipping/calculate-cost]: Calculating shipping cost for destination: ${destinationPincode}, mode: ${paymentMode || 'Prepaid'}, items count: ${cartItems.length}`);

    const result = await shippingService.calculateShippingCost({
      storeId,
      destinationPincode,
      paymentMode: paymentMode || 'Prepaid',
      cartItems
    });

    console.log(`📤 [API Response] Serviceable: ${result.serviceable} | Total Amount: ₹${result.total_amount || 0}`);
    return NextResponse.json(result);
  } catch (error) {
    const errMsg = error.message || 'Internal Server Error during shipping cost calculation.';
    console.error(`❌ [api/shipping/calculate-cost]: Failed to calculate shipping cost:`, errMsg);
    return NextResponse.json({ success: false, serviceable: false, message: errMsg }, { status: 500 });
  }
}
