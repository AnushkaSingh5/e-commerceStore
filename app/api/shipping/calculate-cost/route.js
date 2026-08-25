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

    if (!storeId) {
      return NextResponse.json({ success: false, message: 'Missing required storeId in request body.' }, { status: 400 });
    }
    if (!destinationPincode) {
      return NextResponse.json({ success: false, message: 'Missing required destinationPincode in request body.' }, { status: 400 });
    }
    if (!cartItems || !Array.isArray(cartItems)) {
      return NextResponse.json({ success: false, message: 'Missing or invalid cartItems in request body.' }, { status: 400 });
    }

    console.log(`🔄 [api/shipping/calculate-cost]: Calculating shipping cost for store: ${storeId}, destination: ${destinationPincode}, mode: ${paymentMode}`);

    const result = await shippingService.calculateShippingCost({
      storeId,
      destinationPincode,
      paymentMode: paymentMode || 'Prepaid',
      cartItems
    });

    console.log(`📤 [API Response] Status: 200 | Body:`, JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    const errMsg = error.message || 'Internal Server Error during shipping cost calculation.';
    console.error(`❌ [api/shipping/calculate-cost]: Failed to calculate shipping cost:`, errMsg);
    return NextResponse.json({ success: false, message: errMsg }, { status: 400 });
  }
}
