import { NextResponse } from 'next/server';
import { payoutService } from '@/services/payoutService';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Payout ID is required.' }, { status: 400 });
    }

    const details = await payoutService.adminGetPayoutDetails(id);
    if (!details) {
      return NextResponse.json({ success: false, error: 'Payout not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: details });
  } catch (err) {
    console.error('❌ [API GET /api/admin/payouts/[id]] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
