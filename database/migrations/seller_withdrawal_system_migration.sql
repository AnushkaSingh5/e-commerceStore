-- ==============================================================================
-- Migration: Complete Seller Bank Accounts, Withdrawals & Audit Ledger System
-- Phase: Production Financial Payout Management
-- ==============================================================================

-- 1. Create seller_bank_accounts table
CREATE TABLE IF NOT EXISTS public.seller_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  account_holder_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number_masked TEXT NOT NULL,
  account_number_encrypted TEXT NOT NULL,
  ifsc_code TEXT NOT NULL,
  account_type TEXT DEFAULT 'SAVINGS' CHECK (account_type IN ('SAVINGS', 'CURRENT')),
  is_default BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seller_bank_accounts_seller_id ON public.seller_bank_accounts(seller_id);

-- 2. Create withdrawals table
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_number TEXT UNIQUE NOT NULL,
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  bank_account_id UUID REFERENCES public.seller_bank_accounts(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (fee >= 0),
  net_amount NUMERIC(10, 2) NOT NULL CHECK (net_amount > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'rejected', 'failed', 'cancelled')) DEFAULT 'pending',
  payout_provider TEXT DEFAULT 'MOCK',
  payout_reference_id TEXT,
  failure_reason TEXT,
  rejection_reason TEXT,
  admin_notes TEXT,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_seller_id ON public.withdrawals(seller_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_requested_at ON public.withdrawals(requested_at DESC);

-- 3. Create payout_audit_logs table
CREATE TABLE IF NOT EXISTS public.payout_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id UUID REFERENCES public.withdrawals(id) ON DELETE CASCADE,
  admin_id UUID,
  admin_email TEXT,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  amount NUMERIC(10, 2),
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payout_audit_withdrawal_id ON public.payout_audit_logs(withdrawal_id);
CREATE INDEX IF NOT EXISTS idx_payout_audit_created_at ON public.payout_audit_logs(created_at DESC);

-- 4. Create payout_attempts table
CREATE TABLE IF NOT EXISTS public.payout_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id UUID NOT NULL REFERENCES public.withdrawals(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL DEFAULT 1,
  provider TEXT NOT NULL,
  provider_reference_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('INITIATED', 'PROCESSING', 'SUCCESS', 'FAILED')),
  error_message TEXT,
  raw_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payout_attempts_withdrawal_id ON public.payout_attempts(withdrawal_id);

-- 5. Enable RLS
ALTER TABLE public.seller_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_attempts ENABLE ROW LEVEL SECURITY;

-- Policies for seller_bank_accounts
DROP POLICY IF EXISTS "Sellers can view own bank accounts" ON public.seller_bank_accounts;
CREATE POLICY "Sellers can view own bank accounts" ON public.seller_bank_accounts
  FOR SELECT USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "Sellers can insert own bank accounts" ON public.seller_bank_accounts;
CREATE POLICY "Sellers can insert own bank accounts" ON public.seller_bank_accounts
  FOR INSERT WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS "Sellers can update own bank accounts" ON public.seller_bank_accounts;
CREATE POLICY "Sellers can update own bank accounts" ON public.seller_bank_accounts
  FOR UPDATE USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "Sellers can delete own bank accounts" ON public.seller_bank_accounts;
CREATE POLICY "Sellers can delete own bank accounts" ON public.seller_bank_accounts
  FOR DELETE USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all bank accounts" ON public.seller_bank_accounts;
CREATE POLICY "Admins can view all bank accounts" ON public.seller_bank_accounts
  FOR ALL USING (public.is_admin());

-- Policies for withdrawals
DROP POLICY IF EXISTS "Sellers can view own withdrawals" ON public.withdrawals;
CREATE POLICY "Sellers can view own withdrawals" ON public.withdrawals
  FOR SELECT USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "Sellers can create own withdrawals" ON public.withdrawals;
CREATE POLICY "Sellers can create own withdrawals" ON public.withdrawals
  FOR INSERT WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all withdrawals" ON public.withdrawals;
CREATE POLICY "Admins can manage all withdrawals" ON public.withdrawals
  FOR ALL USING (public.is_admin());

-- Policies for audit logs and attempts
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.payout_audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.payout_audit_logs
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view payout attempts" ON public.payout_attempts;
CREATE POLICY "Admins can view payout attempts" ON public.payout_attempts
  FOR ALL USING (public.is_admin());

-- 6. Atomic Function: Calculate accurate Withdrawable Balance
CREATE OR REPLACE FUNCTION public.get_seller_financial_summary(p_seller_id UUID)
RETURNS JSON AS $$
DECLARE
  v_total_earnings NUMERIC(10, 2) := 0.00;
  v_pending_earnings NUMERIC(10, 2) := 0.00;
  v_available_earnings NUMERIC(10, 2) := 0.00;
  v_pending_withdrawals NUMERIC(10, 2) := 0.00;
  v_total_withdrawn NUMERIC(10, 2) := 0.00;
  v_withdrawable_balance NUMERIC(10, 2) := 0.00;
BEGIN
  -- Auto transition eligible pending earnings (> 7 days) to available
  UPDATE public.creator_earnings
  SET status = 'available'
  WHERE creator_id = p_seller_id 
    AND status = 'pending' 
    AND created_at <= (now() - INTERVAL '7 days');

  -- 1. Total lifetime earnings
  SELECT COALESCE(SUM(creator_amount), 0.00) INTO v_total_earnings
  FROM public.creator_earnings
  WHERE creator_id = p_seller_id;

  -- 2. Pending order earnings (< 7 days)
  SELECT COALESCE(SUM(creator_amount), 0.00) INTO v_pending_earnings
  FROM public.creator_earnings
  WHERE creator_id = p_seller_id AND status = 'pending';

  -- 3. Available unwithdrawn earnings
  SELECT COALESCE(SUM(creator_amount), 0.00) INTO v_available_earnings
  FROM public.creator_earnings
  WHERE creator_id = p_seller_id AND status = 'available';

  -- 4. Currently pending/processing/approved withdrawal requests (locking funds)
  SELECT COALESCE(SUM(amount), 0.00) INTO v_pending_withdrawals
  FROM public.withdrawals
  WHERE seller_id = p_seller_id AND status IN ('pending', 'approved', 'processing');

  -- Also check legacy payout_requests if any pending
  SELECT v_pending_withdrawals + COALESCE(SUM(amount), 0.00) INTO v_pending_withdrawals
  FROM public.payout_requests
  WHERE creator_id = p_seller_id AND status IN ('pending', 'approved');

  -- 5. Total completed withdrawals
  SELECT COALESCE(SUM(amount), 0.00) INTO v_total_withdrawn
  FROM public.withdrawals
  WHERE seller_id = p_seller_id AND status = 'completed';

  -- Add legacy completed payouts
  SELECT v_total_withdrawn + COALESCE(SUM(amount), 0.00) INTO v_total_withdrawn
  FROM public.payout_requests
  WHERE creator_id = p_seller_id AND status = 'completed';

  -- 6. Withdrawable Balance = Available Earnings minus Locked Pending Withdrawals
  v_withdrawable_balance := GREATEST(0.00, v_available_earnings - v_pending_withdrawals);

  RETURN json_build_object(
    'total_earnings', v_total_earnings,
    'pending_earnings', v_pending_earnings,
    'available_balance', v_available_earnings,
    'pending_withdrawals', v_pending_withdrawals,
    'total_withdrawn', v_total_withdrawn,
    'withdrawable_balance', v_withdrawable_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Atomic Function: Submit Withdrawal Request with Double-Spend Protection
CREATE OR REPLACE FUNCTION public.create_seller_withdrawal_locked(
  p_seller_id UUID,
  p_store_id UUID,
  p_bank_account_id UUID,
  p_amount NUMERIC(10, 2),
  p_fee NUMERIC(10, 2) DEFAULT 0.00
)
RETURNS JSON AS $$
DECLARE
  v_summary JSON;
  v_withdrawable NUMERIC(10, 2);
  v_net_amount NUMERIC(10, 2);
  v_withdrawal_num TEXT;
  v_withdrawal_record RECORD;
BEGIN
  IF p_amount IS NULL OR p_amount < 500.00 THEN
    RETURN json_build_object('success', false, 'error', 'Minimum withdrawal amount is ₹500.00');
  END IF;

  v_net_amount := p_amount - COALESCE(p_fee, 0.00);
  IF v_net_amount <= 0.00 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid net withdrawal amount after fees.');
  END IF;

  -- Lock seller row to prevent concurrent double-spend race condition
  PERFORM id FROM public.sellers WHERE id = p_seller_id FOR UPDATE;

  -- Verify live withdrawable balance
  v_summary := public.get_seller_financial_summary(p_seller_id);
  v_withdrawable := (v_summary->>'withdrawable_balance')::NUMERIC;

  IF p_amount > v_withdrawable THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Insufficient withdrawable balance. You have ₹' || v_withdrawable || ' available for withdrawal.'
    );
  END IF;

  -- Verify bank account belongs to seller
  IF NOT EXISTS (SELECT 1 FROM public.seller_bank_accounts WHERE id = p_bank_account_id AND seller_id = p_seller_id) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or unassociated bank account.');
  END IF;

  -- Generate unique withdrawal number (e.g., WD2609014821)
  v_withdrawal_num := 'WD' || to_char(now(), 'YYMMDD') || lpad(floor(random() * 10000)::text, 4, '0');

  INSERT INTO public.withdrawals (
    withdrawal_number,
    seller_id,
    store_id,
    bank_account_id,
    amount,
    fee,
    net_amount,
    status,
    requested_at
  )
  VALUES (
    v_withdrawal_num,
    p_seller_id,
    p_store_id,
    p_bank_account_id,
    p_amount,
    COALESCE(p_fee, 0.00),
    v_net_amount,
    'pending',
    now()
  )
  RETURNING * INTO v_withdrawal_record;

  -- Ledger transaction record
  INSERT INTO public.wallet_transactions (
    creator_id,
    type,
    amount,
    status,
    reference_id,
    created_at
  )
  VALUES (
    p_seller_id,
    'Payout Request',
    -p_amount,
    'pending',
    v_withdrawal_record.id,
    now()
  );

  -- Audit log
  INSERT INTO public.payout_audit_logs (
    withdrawal_id,
    action,
    previous_status,
    new_status,
    amount,
    reason
  )
  VALUES (
    v_withdrawal_record.id,
    'PAYOUT_CREATED',
    NULL,
    'pending',
    p_amount,
    'Seller initiated withdrawal request'
  );

  RETURN json_build_object(
    'success', true,
    'withdrawal', row_to_json(v_withdrawal_record)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Atomic Function: Process / Complete / Reject Withdrawal with Audit Logs
CREATE OR REPLACE FUNCTION public.process_withdrawal_status_atomic(
  p_withdrawal_id UUID,
  p_new_status TEXT,
  p_admin_id UUID DEFAULT NULL,
  p_admin_email TEXT DEFAULT NULL,
  p_admin_notes TEXT DEFAULT NULL,
  p_provider_ref TEXT DEFAULT NULL,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_withdrawal RECORD;
  v_accumulated NUMERIC(10, 2) := 0.00;
  v_earning RECORD;
  v_prev_status TEXT;
BEGIN
  SELECT * INTO v_withdrawal 
  FROM public.withdrawals 
  WHERE id = p_withdrawal_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal record not found.');
  END IF;

  v_prev_status := v_withdrawal.status;

  IF v_prev_status IN ('completed', 'rejected', 'cancelled') THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal is already in a terminal state: ' || v_prev_status);
  END IF;

  IF p_new_status = 'completed' THEN
    -- Mark corresponding available earnings as paid
    FOR v_earning IN 
      SELECT id, creator_amount 
      FROM public.creator_earnings 
      WHERE creator_id = v_withdrawal.seller_id AND status = 'available'
      ORDER BY created_at ASC 
      FOR UPDATE
    LOOP
      IF v_accumulated < v_withdrawal.amount THEN
        UPDATE public.creator_earnings 
        SET status = 'paid' 
        WHERE id = v_earning.id;

        v_accumulated := v_accumulated + v_earning.creator_amount;
      END IF;
    END LOOP;

    UPDATE public.withdrawals
    SET 
      status = 'completed',
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      payout_reference_id = COALESCE(p_provider_ref, payout_reference_id),
      processed_at = COALESCE(processed_at, now()),
      completed_at = now(),
      updated_at = now()
    WHERE id = p_withdrawal_id;

    UPDATE public.wallet_transactions
    SET 
      status = 'completed',
      type = 'Payout Completed'
    WHERE reference_id = p_withdrawal_id;

    INSERT INTO public.payout_audit_logs (
      withdrawal_id,
      admin_id,
      admin_email,
      action,
      previous_status,
      new_status,
      amount,
      reason
    )
    VALUES (
      p_withdrawal_id,
      p_admin_id,
      p_admin_email,
      'PAYOUT_COMPLETED',
      v_prev_status,
      'completed',
      v_withdrawal.amount,
      p_admin_notes
    );

    RETURN json_build_object('success', true, 'status', 'completed');

  ELSIF p_new_status = 'rejected' OR p_new_status = 'failed' THEN
    UPDATE public.withdrawals
    SET 
      status = p_new_status,
      rejection_reason = p_rejection_reason,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      processed_at = now(),
      updated_at = now()
    WHERE id = p_withdrawal_id;

    UPDATE public.wallet_transactions
    SET status = p_new_status
    WHERE reference_id = p_withdrawal_id;

    INSERT INTO public.payout_audit_logs (
      withdrawal_id,
      admin_id,
      admin_email,
      action,
      previous_status,
      new_status,
      amount,
      reason
    )
    VALUES (
      p_withdrawal_id,
      p_admin_id,
      p_admin_email,
      CASE WHEN p_new_status = 'rejected' THEN 'PAYOUT_REJECTED' ELSE 'PAYOUT_FAILED' END,
      v_prev_status,
      p_new_status,
      v_withdrawal.amount,
      COALESCE(p_rejection_reason, p_admin_notes)
    );

    RETURN json_build_object('success', true, 'status', p_new_status);

  ELSIF p_new_status = 'processing' OR p_new_status = 'approved' THEN
    UPDATE public.withdrawals
    SET 
      status = p_new_status,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      payout_reference_id = COALESCE(p_provider_ref, payout_reference_id),
      processed_at = now(),
      updated_at = now()
    WHERE id = p_withdrawal_id;

    INSERT INTO public.payout_audit_logs (
      withdrawal_id,
      admin_id,
      admin_email,
      action,
      previous_status,
      new_status,
      amount,
      reason
    )
    VALUES (
      p_withdrawal_id,
      p_admin_id,
      p_admin_email,
      CASE WHEN p_new_status = 'approved' THEN 'PAYOUT_APPROVED' ELSE 'PAYOUT_PROCESSING' END,
      v_prev_status,
      p_new_status,
      v_withdrawal.amount,
      p_admin_notes
    );

    RETURN json_build_object('success', true, 'status', p_new_status);
  ELSE
    RETURN json_build_object('success', false, 'error', 'Unsupported status transition.');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
