import { NextResponse } from 'next/server';
import { Cashfree, CFEnvironment } from 'cashfree-pg';
import { orderService } from '@/services/orderService';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawOrderId = searchParams.get('order_id');
  const slug = searchParams.get('slug') || 'store1';

  const envUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = host.includes('localhost') 
    ? `${protocol}://${host}`
    : ((envUrl && envUrl.trim() !== '') ? envUrl : `${protocol}://${host}`);

  if (!rawOrderId) {
    return NextResponse.redirect(`${baseUrl}/store/${slug}`);
  }

  const orderId = rawOrderId.length >= 36 ? rawOrderId.slice(0, 36) : rawOrderId;

  try {
    // 1. Handle mock payment redirection verification
    if (rawOrderId.startsWith('cf_mock_order_') || rawOrderId.startsWith('rzp_mock_') || rawOrderId.startsWith('mock_')) {
      console.log(`ℹ️ [verify-redirect]: Processing mock transaction verification for: ${rawOrderId}`);
      await orderService.updateOrderPayment(orderId, {
        paymentStatus: 'paid',
        status: 'confirmed',
        paymentProvider: 'Cashfree',
        paymentId: `cf_pay_mock_${Date.now()}`,
        paymentOrderId: orderId
      });
      return NextResponse.redirect(`${baseUrl}/store/${slug}/checkout/success?orderId=${orderId}`);
    }

    const clientId = process.env.CASHFREE_CLIENT_ID;
    const clientSecret = process.env.CASHFREE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.warn('⚠️ [verify-redirect]: Cashfree credentials missing on server. Treating as failed redirect.');
      return NextResponse.redirect(`${baseUrl}/store/${slug}/checkout/failed?orderId=${orderId}&error=Credentials+missing`);
    }

    const isProduction = process.env.CASHFREE_ENV === 'PRODUCTION' || 
                         process.env.NEXT_PUBLIC_CASHFREE_ENV === 'PRODUCTION' ||
                         (clientSecret && clientSecret.startsWith('cfsk_ma_prod_'));

    const environment = isProduction ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
    const cashfree = new Cashfree(environment, clientId, clientSecret);

    console.log(`🔄 [verify-redirect]: Fetching order status from Cashfree for ID: ${rawOrderId}`);
    const response = await cashfree.PGFetchOrder(rawOrderId);
    const cfOrder = response.data;

    if (cfOrder && cfOrder.order_status === 'PAID') {
      console.log(`✅ [verify-redirect]: Cashfree order ${orderId} is PAID. Marking confirmed in database.`);
      const transactionId = cfOrder.payment_session_id || `cf_txn_${Date.now()}`;
      await orderService.updateOrderPayment(orderId, {
        paymentStatus: 'paid',
        status: 'confirmed',
        paymentProvider: 'Cashfree',
        paymentId: transactionId,
        paymentOrderId: orderId
      });

      // Auto-trigger Shiprocket shipment creation (handled gracefully so failures do not block customer success view)
      try {
        const { shippingService } = await import('@/services/shipping/shippingService');
        await shippingService.createShipment(orderId);
      } catch (shipErr) {
        console.error('⚠️ [verify-redirect]: Auto shipment creation failed:', shipErr.message);
      }
      
      return NextResponse.redirect(`${baseUrl}/store/${slug}/checkout/success?orderId=${orderId}`);
    } else {
      console.log(`❌ [verify-redirect]: Cashfree order ${orderId} status is: ${cfOrder?.order_status || 'UNKNOWN'}. Marking failed.`);
      await orderService.updateOrderPayment(orderId, {
        paymentStatus: 'failed',
        status: 'awaiting_payment',
        paymentProvider: 'Cashfree'
      });
      return NextResponse.redirect(`${baseUrl}/store/${slug}/checkout/failed?orderId=${orderId}&error=Payment+unconfirmed`);
    }

  } catch (error) {
    console.error('❌ [verify-redirect] Exception details:', error.message);
    if (error.response && error.response.data) {
      console.error('   - Cashfree API Error Response:', JSON.stringify(error.response.data, null, 2));
    }
    const errorMsg = error.response?.data?.message || error.message || 'Verification error';
    return NextResponse.redirect(`${baseUrl}/store/${slug}/checkout/failed?orderId=${orderId}&error=${encodeURIComponent(errorMsg)}`);
  }
}
