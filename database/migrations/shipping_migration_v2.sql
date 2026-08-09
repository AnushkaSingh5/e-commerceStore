-- Database Migration v2: Add pickup location details to settings and orders
-- Run this inside your Supabase SQL Editor.

-- 1. Alter store_shipping_settings table
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS pickup_location_name TEXT;
ALTER TABLE public.store_shipping_settings ADD COLUMN IF NOT EXISTS pickup_location_id TEXT;

-- 2. Alter orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_location_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_location_id TEXT;

-- 3. Notify PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';
