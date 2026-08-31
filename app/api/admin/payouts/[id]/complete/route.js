import { NextResponse } from 'next/server';
import { payoutService } from '@/services/payoutService';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { adminUser, utrReference = '', notes = '' } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Payout ID is required.' }, { status: 400 });
    }

    if (!utrReference || !utrReference.trim()) {
      return NextResponse.json({ success: false, error: 'UTR / Transaction reference is required.' }, { status: 400 });
    }

    const res = await payoutService.adminCompletePayout(id, adminUser, utrReference.trim(), notes);
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: res });
  } catch (err) {
    console.error('❌ [API POST /api/admin/payouts/[id]/complete] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
