-- Database Migration v3: Add address snapshot columns to orders and pickup settings columns to store_shipping_settings
-- Run this inside your Supabase SQL Editor.

-- 1. Alter orders table to permanently store its own shipping address snapshot
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_address_2 TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_city TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_state TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_country TEXT DEFAULT 'India';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_pincode TEXT;

-- 2. Alter store_shipping_settings table to support warehouse pickup details
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS pickup_contact TEXT;
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS pickup_phone TEXT;
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS pickup_email TEXT;
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS pickup_address TEXT;
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS pickup_city TEXT;
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS pickup_state TEXT;
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS pickup_country TEXT DEFAULT 'India';
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS pickup_pincode TEXT;

-- 3. Notify PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';
