-- Migration for Phase 12: Creator Earnings & Payouts System

-- 1. Create creator_earnings table
CREATE TABLE IF NOT EXISTS public.creator_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE UNIQUE,
  order_amount NUMERIC(10, 2) NOT NULL,
  platform_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  creator_amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'available', 'paid')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create payout_requests table
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  payout_method TEXT NOT NULL CHECK (payout_method IN ('Bank Transfer', 'UPI')),
  account_details TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'completed')) DEFAULT 'pending',
  admin_notes TEXT,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE
);

-- 3. Enable RLS and setup policies
ALTER TABLE public.creator_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

-- Policies for creator_earnings
DROP POLICY IF EXISTS "Allow creators to view their own earnings" ON public.creator_earnings;
CREATE POLICY "Allow creators to view their own earnings" ON public.creator_earnings
  FOR SELECT USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Allow admin to view all earnings" ON public.creator_earnings;
CREATE POLICY "Allow admin to view all earnings" ON public.creator_earnings
  FOR SELECT USING (public.is_admin());

-- Policies for payout_requests
DROP POLICY IF EXISTS "Allow creators to view their own payout requests" ON public.payout_requests;
CREATE POLICY "Allow creators to view their own payout requests" ON public.payout_requests
  FOR SELECT USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Allow creators to create payout requests" ON public.payout_requests;
CREATE POLICY "Allow creators to create payout requests" ON public.payout_requests
  FOR INSERT WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "Allow admin to view all payout requests" ON public.payout_requests;
CREATE POLICY "Allow admin to view all payout requests" ON public.payout_requests
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Allow admin to update payout requests" ON public.payout_requests;
CREATE POLICY "Allow admin to update payout requests" ON public.payout_requests
  FOR UPDATE USING (public.is_admin());


-- 4. Create trigger to handle earnings additions and refund removals
CREATE OR REPLACE FUNCTION public.handle_order_status_earnings_change()
RETURNS TRIGGER AS $$
DECLARE
  v_store_creator_id UUID;
BEGIN
  -- If order transitions to paid, add creator earnings
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND lower(NEW.payment_status) = 'paid' AND (OLD.payment_status IS NULL OR lower(OLD.payment_status) != 'paid') THEN
    -- Get store creator_id
    SELECT creator_id INTO v_store_creator_id FROM public.stores WHERE id = NEW.store_id;
    
    -- Insert into creator_earnings (prevent duplicates via UNIQUE constraint)
    INSERT INTO public.creator_earnings (creator_id, store_id, order_id, order_amount, platform_fee, creator_amount, status)
    VALUES (v_store_creator_id, NEW.store_id, NEW.id, NEW.total_amount, 0.00, NEW.total_amount, 'pending')
    ON CONFLICT (order_id) DO NOTHING;
  END IF;

  -- If order status changes to Cancelled or refunded, remove earnings unless already paid out
  IF TG_OP = 'UPDATE' AND lower(NEW.status) IN ('cancelled', 'refunded') AND (OLD.status IS NULL OR (lower(OLD.status) != 'cancelled' AND lower(lower(OLD.status)) != 'refunded')) THEN
    DELETE FROM public.creator_earnings
    WHERE order_id = NEW.id AND status != 'paid';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on orders
DROP TRIGGER IF EXISTS trigger_order_earnings_change ON public.orders;
CREATE TRIGGER trigger_order_earnings_change
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_status_earnings_change();


-- 5. Create admin payout completion RPC
CREATE OR REPLACE FUNCTION public.admin_complete_payout(p_request_id UUID, p_admin_email TEXT)
RETURNS boolean AS $$
DECLARE
  v_admin_id UUID;
  v_creator_id UUID;
  v_amount NUMERIC;
  v_accumulated NUMERIC := 0.00;
  v_rec RECORD;
BEGIN
  -- Auth check
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE lower(email) = lower(p_admin_email)) THEN
    RAISE EXCEPTION 'Unauthorized admin access.';
  END IF;

  -- Get request info
  SELECT creator_id, amount INTO v_creator_id, v_amount 
  FROM public.payout_requests 
  WHERE id = p_request_id AND (status = 'approved' OR status = 'pending'); -- Allow direct complete if preferred

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Payout request not found.';
  END IF;

  -- Update request status
  UPDATE public.payout_requests
  SET status = 'completed', processed_at = timezone('utc'::text, now())
  WHERE id = p_request_id;

  -- Loop through available earnings and mark as paid
  FOR v_rec IN 
    SELECT id, creator_amount FROM public.creator_earnings 
    WHERE creator_id = v_creator_id AND status = 'available' 
    ORDER BY created_at ASC
  LOOP
    IF v_accumulated < v_amount THEN
      UPDATE public.creator_earnings SET status = 'paid' WHERE id = v_rec.id;
      v_accumulated := v_accumulated + v_rec.creator_amount;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
