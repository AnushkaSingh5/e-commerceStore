import { NextResponse } from 'next/server';
import { supabaseClient } from '@/lib/supabase';
import { payoutService } from '@/services/payoutService';

export async function POST(request) {
  try {
    const body = await request.json();
    const { event, data } = body;

    // Support Cashfree Payouts webhook structure
    const transferId = data?.transferId || data?.referenceId || body.transferId;
    const transferStatus = (data?.status || body.status || '').toUpperCase();
    const utr = data?.utr || data?.referenceId || '';
    const failureReason = data?.reason || body.reason || '';

    if (!transferId) {
      return NextResponse.json({ success: false, error: 'Missing transferId in webhook.' }, { status: 400 });
    }

    if (!supabaseClient) {
      return NextResponse.json({ success: false, error: 'Database unavailable.' }, { status: 500 });
    }

    // Locate withdrawal by number or provider reference
    const { data: withdrawal, error: findErr } = await supabaseClient
      .from('withdrawals')
      .select('*')
      .or(`withdrawal_number.eq.${transferId},payout_reference_id.eq.${transferId}`)
      .single();

    if (findErr || !withdrawal) {
      return NextResponse.json({ success: false, error: 'Withdrawal not found for webhook.' }, { status: 404 });
    }

    // Idempotency: Ignore if already terminal
    if (['completed', 'rejected'].includes(withdrawal.status)) {
      return NextResponse.json({ success: true, message: 'Already processed terminal state.' });
    }

    if (transferStatus === 'SUCCESS' || transferStatus === 'COMPLETED') {
      await payoutService.adminCompletePayout(withdrawal.id, null, utr, 'Settled via Payout Provider Webhook');
    } else if (transferStatus === 'FAILED' || transferStatus === 'REJECTED' || transferStatus === 'ERROR') {
      // Revert status to failed and release reservation
      await supabaseClient.rpc('process_withdrawal_status_atomic', {
        p_withdrawal_id: withdrawal.id,
        p_new_status: 'failed',
        p_admin_notes: `Failed via provider: ${failureReason}`,
        p_rejection_reason: failureReason
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('❌ [API POST /api/payouts/webhook] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
