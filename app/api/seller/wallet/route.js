import { NextResponse } from 'next/server';
import { walletService } from '@/services/walletService';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sellerId = searchParams.get('sellerId');
    const storeId = searchParams.get('storeId');

    if (!sellerId) {
      return NextResponse.json({ success: false, error: 'Seller ID is required.' }, { status: 400 });
    }

    const [overview, transactions] = await Promise.all([
      walletService.getWalletOverview(sellerId, storeId),
      walletService.getWalletTransactions(sellerId)
    ]);

    return NextResponse.json({
      success: true,
      data: {
        overview,
        transactions
      }
    });
  } catch (err) {
    console.error('❌ [API /api/seller/wallet] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
