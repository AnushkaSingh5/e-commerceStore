import { NextResponse } from 'next/server';
import { payoutService } from '@/services/payoutService';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const status = searchParams.get('status') || 'All';
    const search = searchParams.get('search') || '';

    const result = await payoutService.adminGetPayoutRequests({ page, limit, status, search });

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('❌ [API GET /api/admin/payouts] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
