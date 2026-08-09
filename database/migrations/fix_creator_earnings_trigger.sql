-- Fix handle_order_status_earnings_change trigger function to insert 'pending' instead of 'completed'
-- This resolves the check constraint violation 'creator_earnings_status_check' on the creator_earnings table.

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
    -- Using 'pending' satisfies status check constraints ('pending', 'available', 'paid')
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


-- 2. Sync / Fix any existing orders that were successfully paid but stuck in 'pending' payment status
UPDATE public.orders
SET 
  payment_status = 'paid',
  status = 'confirmed',
  paid_at = COALESCE(paid_at, NOW())
WHERE 
  status = 'Completed' 
  AND payment_status = 'pending' 
  AND payment_provider = 'Cashfree';
