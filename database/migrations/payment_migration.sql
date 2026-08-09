-- Safe migration to update check constraints and RLS policies for order lifecycle.
-- Run this in your Supabase SQL Editor.

-- 1. Drop existing constraints if they exist
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

-- 2. Add the payment-related columns if they don't exist
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_order_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;

-- 3. Add updated check constraints to support both old and new lifecycle statuses
ALTER TABLE public.orders 
  ADD CONSTRAINT orders_status_check CHECK (
    status IN ('Pending', 'Completed', 'Cancelled', 'pending_payment', 'confirmed', 'awaiting_payment', 'Processing', 'Shipped', 'Delivered')
  );

ALTER TABLE public.orders 
  ADD CONSTRAINT orders_payment_status_check CHECK (
    payment_status IN ('pending', 'paid', 'failed', 'refunded', 'Pending', 'Paid', 'Failed', 'Refunded')
  );

-- 4. Enable Row Level Security (RLS) and define update policy
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Drop existing update policy if it conflicts
DROP POLICY IF EXISTS "Allow creators to update own store orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public update of orders" ON public.orders;

-- Creator can update their own store's orders
CREATE POLICY "Allow creators to update own store orders" ON public.orders 
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND creator_id = auth.uid())
  );

-- Customers and storefront visitors can update order details (e.g. payment reference & status) during checkout
CREATE POLICY "Allow public update of orders" ON public.orders 
  FOR UPDATE USING (true) WITH CHECK (true);

-- Customers and storefront visitors can select order details by ID during checkout
DROP POLICY IF EXISTS "Allow public select of orders" ON public.orders;
CREATE POLICY "Allow public select of orders" ON public.orders 
  FOR SELECT USING (true);
