// app/api/shipping/manifest/route.js
import { NextResponse } from 'next/server';
import { shippingService } from '@/services/shipping/shippingService';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('order_id');

    if (!orderId) {
      return NextResponse.json({ success: false, message: 'Missing required order_id parameter.' }, { status: 400 });
    }

    console.log(`🔄 [api/shipping/manifest]: Generating / retrieving manifest for Order: ${orderId}`);
    const result = await shippingService.generateManifest(orderId);

    if (result.manifest_url) {
      // Redirect to the direct PDF manifest
      return NextResponse.redirect(result.manifest_url);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ [api/shipping/manifest] Error:', error.message);
    return NextResponse.json({ success: false, message: error.message || 'Failed to generate manifest.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    let orderId;
    try {
      const body = await request.json();
      orderId = body.orderId;
    } catch (parseErr) {
      return NextResponse.json({ success: false, message: 'Invalid JSON request body.' }, { status: 400 });
    }

    if (!orderId) {
      return NextResponse.json({ success: false, message: 'Missing required orderId parameter.' }, { status: 400 });
    }

    console.log(`🔄 [api/shipping/manifest]: Generating manifest for Order: ${orderId}`);
    const result = await shippingService.generateManifest(orderId);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ [api/shipping/manifest] Error:', error.message);
    return NextResponse.json({ success: false, message: error.message || 'Failed to generate manifest.' }, { status: 500 });
  }
}
