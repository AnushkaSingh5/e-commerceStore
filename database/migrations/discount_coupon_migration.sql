-- Create coupons table
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
  max_uses INTEGER NOT NULL CHECK (max_uses >= 0),
  current_uses INTEGER NOT NULL DEFAULT 0 CHECK (current_uses >= 0),
  minimum_order_amount NUMERIC(10, 2) DEFAULT 0 CHECK (minimum_order_amount >= 0),
  expiry_date TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (store_id, code)
);

-- Enable RLS for coupons
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for coupons:
-- 1. Anyone can SELECT coupons (to validate on checkout)
-- 2. Creators can manage coupons where store_id belongs to a store they own.
CREATE POLICY "Allow public read of coupons" ON public.coupons FOR SELECT USING (true);
CREATE POLICY "Allow creator inserts of coupons" ON public.coupons FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.stores
    WHERE stores.id = coupons.store_id AND stores.creator_id = auth.uid()
  )
);
CREATE POLICY "Allow creator updates of own coupons" ON public.coupons FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.stores
    WHERE stores.id = coupons.store_id AND stores.creator_id = auth.uid()
  )
);
CREATE POLICY "Allow creator deletes of own coupons" ON public.coupons FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.stores
    WHERE stores.id = coupons.store_id AND stores.creator_id = auth.uid()
  )
);

-- Admin RLS policies for coupons
CREATE POLICY "Allow admin updates of all coupons" ON public.coupons FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin deletes of all coupons" ON public.coupons FOR DELETE USING (public.is_admin());

-- Add fields to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) DEFAULT 0 CHECK (discount_amount >= 0);

-- 1. Create check trigger function to secure public updates
CREATE OR REPLACE FUNCTION public.check_coupon_update_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- If user is the store creator or an admin, allow all changes
  IF EXISTS (
    SELECT 1 FROM public.stores
    WHERE stores.id = OLD.store_id AND stores.creator_id = auth.uid()
  ) OR (SELECT public.is_admin()) THEN
    RETURN NEW;
  END IF;

  -- Otherwise, it is a guest checkout incrementing usage. Enforce restrictions:
  IF NEW.id <> OLD.id OR
     NEW.store_id <> OLD.store_id OR
     NEW.code <> OLD.code OR
     NEW.discount_type <> OLD.discount_type OR
     NEW.discount_value <> OLD.discount_value OR
     NEW.max_uses <> OLD.max_uses OR
     NEW.minimum_order_amount IS DISTINCT FROM OLD.minimum_order_amount OR
     NEW.expiry_date IS DISTINCT FROM OLD.expiry_date OR
     NEW.is_active <> OLD.is_active OR
     NEW.created_at <> OLD.created_at OR
     NOT (NEW.current_uses = OLD.current_uses + 1 OR NEW.current_uses = OLD.current_uses)
  THEN
    RAISE EXCEPTION 'Permission denied: Guests can only increment current_uses.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Bind trigger to coupons table
DROP TRIGGER IF EXISTS tr_check_coupon_update_fields ON public.coupons;
CREATE TRIGGER tr_check_coupon_update_fields
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.check_coupon_update_fields();

-- 3. Simplified RLS policy allowing public updates (trigger enforces security)
DROP POLICY IF EXISTS "Allow public update of coupon usage count" ON public.coupons;
CREATE POLICY "Allow public update of coupon usage count" ON public.coupons 
FOR UPDATE 
USING (true) 
WITH CHECK (true);
