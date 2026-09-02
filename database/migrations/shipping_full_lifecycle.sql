-- Migration: Full Shiprocket Shipping Lifecycle, Label, Manifest & Pickup Support
-- Run this in your Supabase SQL Editor.

-- 1. Add label, manifest, and pickup columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_label_url TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_manifest_url TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_scheduled_date TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_token_number TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_status TEXT;

-- 2. Drop restrictive check constraint on orders shipping_status to allow full lifecycle statuses
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_shipping_status_check;

-- 3. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
