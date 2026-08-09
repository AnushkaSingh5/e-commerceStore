-- Safe migration to update orders table and configure store shipping settings table.
-- Run this in your Supabase SQL Editor.

-- 1. Add shipping tracking & metrics columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_provider TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipment_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS awb_number TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_status TEXT DEFAULT 'Pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_delivery TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;

-- 2. Add structured customer shipping address columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_address_line1 TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_address_line2 TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_address_city TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_address_state TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_address_pincode TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_address_country TEXT DEFAULT 'India';

-- 3. Add shipping_status check constraint
-- Drop existing check constraint if any
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_shipping_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_shipping_status_check 
  CHECK (shipping_status IN ('Pending', 'Shipment Created', 'Picked Up', 'In Transit', 'Out For Delivery', 'Delivered', 'Cancelled', 'Returned'));

-- 4. Create store_shipping_settings table
CREATE TABLE IF NOT EXISTS public.store_shipping_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE UNIQUE,
  warehouse_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  pincode TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  gstin TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.store_shipping_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow creators to view own store shipping settings" ON public.store_shipping_settings;
DROP POLICY IF EXISTS "Allow creators to insert own store shipping settings" ON public.store_shipping_settings;
DROP POLICY IF EXISTS "Allow creators to update own store shipping settings" ON public.store_shipping_settings;
DROP POLICY IF EXISTS "Allow admin to view all shipping settings" ON public.store_shipping_settings;

CREATE POLICY "Allow public read of store shipping settings" ON public.store_shipping_settings 
  FOR SELECT USING (true);

CREATE POLICY "Allow creators to insert own store shipping settings" ON public.store_shipping_settings 
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND creator_id = auth.uid())
  );

CREATE POLICY "Allow creators to update own store shipping settings" ON public.store_shipping_settings 
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND creator_id = auth.uid())
  );

CREATE POLICY "Allow admin to view all shipping settings" ON public.store_shipping_settings
  FOR SELECT USING (public.is_admin());

-- 5. Add latitude, longitude, and registration status to store_shipping_settings
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS lat NUMERIC;
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS lon NUMERIC;
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS shiprocket_registered BOOLEAN DEFAULT false;
