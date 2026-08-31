import { NextResponse } from 'next/server';
import { payoutService } from '@/services/payoutService';

export async function GET() {
  try {
    const report = await payoutService.adminGetReconciliation();
    return NextResponse.json({ success: true, data: report });
  } catch (err) {
    console.error('❌ [API GET /api/admin/payouts/reconciliation] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
