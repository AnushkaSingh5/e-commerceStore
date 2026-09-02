// app/api/shipping/pickup/route.js
import { NextResponse } from 'next/server';
import { shippingService } from '@/services/shipping/shippingService';

export async function POST(request) {
  try {
    let orderId;
    let pickupDate;
    try {
      const body = await request.json();
      orderId = body.orderId;
      pickupDate = body.pickupDate;
    } catch (parseErr) {
      return NextResponse.json({ success: false, message: 'Invalid JSON request body.' }, { status: 400 });
    }

    if (!orderId) {
      return NextResponse.json({ success: false, message: 'Missing required orderId in request body.' }, { status: 400 });
    }

    console.log(`🔄 [api/shipping/pickup]: Triggering pickup for Order: ${orderId}`);
    const result = await shippingService.requestPickup(orderId, pickupDate);

    return NextResponse.json({
      success: true,
      message: 'Pickup scheduled successfully with courier partner.',
      ...result
    });
  } catch (error) {
    console.error('❌ [api/shipping/pickup] Error:', error.message);
    return NextResponse.json({ success: false, message: error.message || 'Failed to schedule pickup.' }, { status: 500 });
  }
}
