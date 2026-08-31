import { NextResponse } from 'next/server';
import { payoutService } from '@/services/payoutService';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, notes = '', rejectionReason = '' } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: 'Withdrawal ID and target status required.' }, { status: 400 });
    }

    const res = await payoutService.adminUpdatePayoutStatus(id, status, notes, rejectionReason);

    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: res });
  } catch (err) {
    console.error('❌ [API POST /api/admin/withdrawals/[id]] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
