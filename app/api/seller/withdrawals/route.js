import { NextResponse } from 'next/server';
import { payoutService } from '@/services/payoutService';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sellerId = searchParams.get('sellerId');

    if (!sellerId) {
      return NextResponse.json({ success: false, error: 'Seller ID is required.' }, { status: 400 });
    }

    const history = await payoutService.getPayoutRequests(sellerId);
    return NextResponse.json({ success: true, data: history });
  } catch (err) {
    console.error('❌ [API GET /api/seller/withdrawals] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { sellerId, storeId, bankAccountId, amount, fee = 0 } = body;

    if (!sellerId || !bankAccountId || !amount) {
      return NextResponse.json({ success: false, error: 'Missing required withdrawal fields.' }, { status: 400 });
    }

    const res = await payoutService.createPayoutRequest(sellerId, storeId, bankAccountId, amount, fee);

    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: res.withdrawal });
  } catch (err) {
    console.error('❌ [API POST /api/seller/withdrawals] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
