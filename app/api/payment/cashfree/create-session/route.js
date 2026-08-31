import { NextResponse } from 'next/server';
import { Cashfree, CFEnvironment } from 'cashfree-pg';
import { supabaseClient } from '@/lib/supabase';

export async function POST(request) {
  try {
    const { orderId, amount, customerInfo, slug } = await request.json();

    if (!orderId || !amount || !customerInfo || !customerInfo.email) {
      return NextResponse.json(
        { error: 'Missing required parameters: orderId, amount, and customer email are required.' },
        { status: 400 }
      );
    }

    if (supabaseClient && slug) {
      const { data: storeDetails, error: storeError } = await supabaseClient
        .from('stores')
        .select('status')
        .eq('slug', slug)
        .single();
      
      if (storeError) {
        console.error('Failed to query store details in Cashfree session API:', storeError);
      } else if (storeDetails?.status !== 'approved') {
        return NextResponse.json(
          { error: 'This store is currently under admin review and is not available for orders.' },
          { status: 400 }
        );
      }
    }

    const clientId = process.env.CASHFREE_CLIENT_ID;
    const clientSecret = process.env.CASHFREE_CLIENT_SECRET;

    const isProduction = process.env.CASHFREE_ENV === 'PRODUCTION' || 
                         process.env.NEXT_PUBLIC_CASHFREE_ENV === 'PRODUCTION' ||
                         (clientSecret && clientSecret.startsWith('cfsk_ma_prod_'));

    console.log('[Cashfree] Environment:', isProduction ? 'PRODUCTION' : 'SANDBOX');
    console.log('[Cashfree] Client ID present:', Boolean(clientId));
    console.log('[Cashfree] Client ID length:', clientId?.length || 0);
    console.log('[Cashfree] Secret present:', Boolean(clientSecret));
    console.log('[Cashfree] Secret length:', clientSecret?.length || 0);
    console.log('[Cashfree] Secret prefix:', clientSecret ? clientSecret.slice(0, 15) + '...' : 'N/A');
    console.log('[Cashfree] API endpoint:', isProduction ? 'https://api.cashfree.com/pg/orders' : 'https://sandbox.cashfree.com/pg/orders');

    // If API credentials are not configured, generate a Mock session for local development
    if (!clientId || !clientSecret) {
      console.log('ℹ️ [create-session]: Cashfree credentials not configured. Generating a Mock Payment Session.');
      return NextResponse.json({
        id: `cf_mock_order_${Date.now()}`,
        payment_session_id: `cf_mock_session_${Date.now()}`,
        mock: true
      });
    }

    // Configure Cashfree SDK
    const environment = isProduction ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
    const cashfree = new Cashfree(environment, clientId, clientSecret);

    // Build return redirect URL
    const envUrl = process.env.NEXT_PUBLIC_BASE_URL;
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = host.includes('localhost') 
      ? `${protocol}://${host}`
      : ((envUrl && envUrl.trim() !== '') ? envUrl : `${protocol}://${host}`);
    const storeSlug = slug || 'store1';
    const returnUrl = `${baseUrl}/api/payment/cashfree/verify?order_id={order_id}&slug=${storeSlug}`;

    console.log(`🔄 [create-session]: Creating Cashfree order for system order ID: ${orderId}, amount: ${amount}, return_url: ${returnUrl}`);

    const formattedAmount = parseFloat(parseFloat(amount).toFixed(2));

    const requestPayload = {
      order_amount: formattedAmount,
      order_currency: 'INR',
      order_id: orderId,
      customer_details: {
        customer_id: customerInfo.id || `cust_${Date.now()}`,
        customer_phone: customerInfo.phone ? customerInfo.phone.trim() : '9999999999',
        customer_email: customerInfo.email
      },
      order_meta: {
        return_url: returnUrl
      }
    };

    const response = await cashfree.PGCreateOrder(requestPayload);
    const responseData = response.data;

    console.log(`[Cashfree Debug]`);
    console.log(`  environment = ${isProduction ? 'PRODUCTION' : 'SANDBOX'}`);
    console.log(`  API endpoint = ${isProduction ? 'https://api.cashfree.com/pg/orders' : 'https://sandbox.cashfree.com/pg/orders'}`);
    console.log(`  amount sent to Cashfree = ${formattedAmount}`);
    console.log(`  payment_session_id present = ${Boolean(responseData.payment_session_id)}`);
    console.log(`  payment_session_id length = ${responseData.payment_session_id?.length || 0}`);
    console.log(`  order ID = ${responseData.order_id}`);

    return NextResponse.json({
      id: responseData.order_id,
      payment_session_id: responseData.payment_session_id,
      environment: isProduction ? 'production' : 'sandbox',
      mock: false
    });

  } catch (error) {
    console.error('❌ [create-session] Exception details:', error.message);
    if (error.response && error.response.data) {
      console.error('   - Cashfree API Error Response:', JSON.stringify(error.response.data, null, 2));
    }
    return NextResponse.json(
      { error: error.response?.data?.message || error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
