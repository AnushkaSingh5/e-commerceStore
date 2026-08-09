-- Database migration to implement atomic inventory stock changes on order confirmation and cancellation.
-- Run this in your Supabase SQL Editor.

-- 1. Create or replace trigger function
CREATE OR REPLACE FUNCTION public.manage_order_stock()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
BEGIN
  -- A. When order becomes Confirmed/confirmed (paid)
  IF (TG_OP = 'INSERT' AND NEW.status IN ('confirmed', 'Confirmed')) OR
     (TG_OP = 'UPDATE' AND NEW.status IN ('confirmed', 'Confirmed') AND OLD.status NOT IN ('confirmed', 'Confirmed')) THEN
    FOR item IN SELECT product_id, quantity FROM public.order_items WHERE order_id = NEW.id LOOP
      -- Update stock. If it goes below 0, check constraint stock >= 0 throws check_violation (23514)
      UPDATE public.products 
      SET stock = stock - item.quantity 
      WHERE id = item.product_id;
    END LOOP;
  END IF;

  -- B. When order is cancelled (restoring stock)
  IF (TG_OP = 'UPDATE' AND NEW.status IN ('Cancelled', 'cancelled') AND OLD.status IN ('confirmed', 'Confirmed')) THEN
    FOR item IN SELECT product_id, quantity FROM public.order_items WHERE order_id = NEW.id LOOP
      UPDATE public.products 
      SET stock = stock + item.quantity 
      WHERE id = item.product_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_manage_order_stock ON public.orders;

-- 3. Bind trigger to public.orders table
CREATE TRIGGER trg_manage_order_stock
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.manage_order_stock();
