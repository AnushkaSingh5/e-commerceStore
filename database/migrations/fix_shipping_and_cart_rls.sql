-- SQL Migration: Fix shipping settings, customer cart, and order items RLS policies
-- Run this in your Supabase SQL Editor.

-- 1. Fix store_shipping_settings select policy
DROP POLICY IF EXISTS "Allow creators to view own store shipping settings" ON public.store_shipping_settings;
DROP POLICY IF EXISTS "Allow public read of store shipping settings" ON public.store_shipping_settings;

CREATE POLICY "Allow public read of store shipping settings" ON public.store_shipping_settings 
  FOR SELECT USING (true);


-- 2. Fix customer_carts policies to allow public operations
DROP POLICY IF EXISTS "Allow customer select of own cart" ON public.customer_carts;
DROP POLICY IF EXISTS "Allow customer insert of own cart" ON public.customer_carts;
DROP POLICY IF EXISTS "Allow customer update of own cart" ON public.customer_carts;
DROP POLICY IF EXISTS "Allow customer delete of own cart" ON public.customer_carts;
DROP POLICY IF EXISTS "Allow public select of carts" ON public.customer_carts;
DROP POLICY IF EXISTS "Allow public insert of carts" ON public.customer_carts;
DROP POLICY IF EXISTS "Allow public update of carts" ON public.customer_carts;
DROP POLICY IF EXISTS "Allow public delete of carts" ON public.customer_carts;

CREATE POLICY "Allow public select of carts" ON public.customer_carts FOR SELECT USING (true);
CREATE POLICY "Allow public insert of carts" ON public.customer_carts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update of carts" ON public.customer_carts FOR UPDATE USING (true);
CREATE POLICY "Allow public delete of carts" ON public.customer_carts FOR DELETE USING (true);


-- 3. Fix cart_items policies to allow public operations
DROP POLICY IF EXISTS "Allow customer select of own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Allow customer insert of own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Allow customer update of own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Allow customer delete of own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Allow public select of cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Allow public insert of cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Allow public update of cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Allow public delete of cart items" ON public.cart_items;

CREATE POLICY "Allow public select of cart items" ON public.cart_items FOR SELECT USING (true);
CREATE POLICY "Allow public insert of cart items" ON public.cart_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update of cart items" ON public.cart_items FOR UPDATE USING (true);
CREATE POLICY "Allow public delete of cart items" ON public.cart_items FOR DELETE USING (true);


-- 4. Fix order_items select policy to allow public select (so server-side APIs can read them)
DROP POLICY IF EXISTS "Allow public select of order_items" ON public.order_items;
CREATE POLICY "Allow public select of order_items" ON public.order_items FOR SELECT USING (true);


-- 5. Add Delhivery-specific warehouse configuration fields to store_shipping_settings if they don't exist
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS pickup_address_line2 TEXT;
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS landmark TEXT;
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS warehouse_status TEXT;
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS last_synced TIMESTAMPTZ;

-- 6. Add pickup_id column to orders table if it doesn't exist
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_id TEXT;
