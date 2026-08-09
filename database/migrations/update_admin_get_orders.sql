-- Run this SQL query in your Supabase SQL Editor to update the admin_get_orders function.
-- This ensures that payment_provider and payment_status columns are selected and returned to the admin dashboard.

DROP FUNCTION IF EXISTS public.admin_get_orders(TEXT);

CREATE OR REPLACE FUNCTION public.admin_get_orders(p_admin_email TEXT)
RETURNS TABLE (
  id UUID,
  store_id UUID,
  store_name TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  total_amount NUMERIC(10, 2),
  status TEXT,
  payment_status TEXT,
  payment_provider TEXT,
  shipping_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE lower(email) = lower(p_admin_email)) THEN
    RAISE EXCEPTION 'Unauthorized admin access.';
  END IF;

  RETURN QUERY
  SELECT 
    o.id, 
    o.store_id, 
    s.name as store_name, 
    o.customer_name, 
    o.customer_email, 
    o.customer_phone, 
    o.total_amount, 
    o.status, 
    o.payment_status,
    o.payment_provider,
    o.shipping_address, 
    o.created_at
  FROM public.orders o
  LEFT JOIN public.stores s ON o.store_id = s.id
  ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
