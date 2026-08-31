import { NextResponse } from 'next/server';
import { payoutService } from '@/services/payoutService';

export async function GET() {
  try {
    const requests = await payoutService.adminGetPayoutRequests();
    
    // Aggregate platform metrics
    const totalWithdrawn = requests
      .filter(r => r.status === 'completed')
      .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

    const pendingPayouts = requests
      .filter(r => r.status === 'pending' || r.status === 'processing')
      .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        requests,
        stats: {
          totalWithdrawn,
          pendingPayouts,
          totalRequests: requests.length
        }
      }
    });
  } catch (err) {
    console.error('❌ [API GET /api/admin/withdrawals] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
