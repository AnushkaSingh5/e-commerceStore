// app/api/shipping/track/route.js
import { NextResponse } from 'next/server';
import { shippingFactory } from '@/services/shipping/shippingFactory';
import { supabaseClient } from '@/lib/supabase';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const waybill = searchParams.get('waybill');
    const orderId = searchParams.get('order_id');
    const explicitProvider = searchParams.get('provider');

    if (!waybill && !orderId) {
      return NextResponse.json({ success: false, message: 'Missing required waybill or order_id parameter.' }, { status: 400 });
    }

    let targetWaybill = waybill;
    let resolvedProviderName = explicitProvider || null;

    // 1. If provider is not explicitly passed in query params, look up the order in database
    if (!resolvedProviderName && supabaseClient) {
      try {
        let query = supabaseClient.from('orders').select('id, shipping_provider, awb_number, tracking_number');
        if (orderId) {
          query = query.eq('id', orderId);
        } else if (waybill) {
          query = query.or(`awb_number.eq.${waybill},tracking_number.eq.${waybill}`);
        }

        const { data: orderData } = await query.maybeSingle();

        if (orderData) {
          if (orderData.shipping_provider) {
            resolvedProviderName = orderData.shipping_provider;
            console.log(`🔍 [api/shipping/track]: Found order ${orderData.id} with shipping_provider: "${resolvedProviderName}"`);
          }
          if (!targetWaybill) {
            targetWaybill = orderData.awb_number || orderData.tracking_number;
          }
        }
      } catch (dbErr) {
        console.warn('⚠️ [api/shipping/track]: Failed to query order from database:', dbErr.message);
      }
    }

    // 2. Fallback heuristic based on waybill format if not found in database
    if (!resolvedProviderName && targetWaybill) {
      const cleanWaybill = targetWaybill.trim();
      // Delhivery standard waybills are 14-digit numbers (e.g. 57855210000243)
      if (/^\d{14}$/.test(cleanWaybill) || cleanWaybill.startsWith('578')) {
        resolvedProviderName = 'Delhivery';
      } else {
        resolvedProviderName = process.env.NEXT_PUBLIC_ACTIVE_SHIPPING_PROVIDER || 'Shiprocket';
      }
      console.log(`🔍 [api/shipping/track]: Resolved provider by heuristic format: "${resolvedProviderName}"`);
    }

    if (!targetWaybill) {
      return NextResponse.json({ success: false, message: 'No valid waybill or tracking number found.' }, { status: 400 });
    }

    // Default fallback if still unresolved
    if (!resolvedProviderName) {
      resolvedProviderName = 'Delhivery';
    }

    console.log(`🔍 [api/shipping/track]: Querying tracking details for waybill ${targetWaybill} via provider: "${resolvedProviderName}"`);
    
    // IMPORTANT: Get only the resolved provider (If Delhivery -> DelhiveryProvider only, NEVER Shiprocket)
    const provider = shippingFactory.getProvider(resolvedProviderName);
    const trackingInfo = await provider.getTrackingStatus(targetWaybill);
    
    return NextResponse.json({
      success: true,
      provider: resolvedProviderName,
      waybill: targetWaybill,
      tracking: trackingInfo
    });
  } catch (error) {
    console.error('❌ [api/shipping/track] Error:', error.message);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
