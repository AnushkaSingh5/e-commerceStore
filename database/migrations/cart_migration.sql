-- Cart System Migration Script
-- Creates customer_carts and cart_items tables with RLS and indexes.

-- 1. Create customer_carts table if not exists
CREATE TABLE IF NOT EXISTS public.customer_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create cart_items table if not exists
CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID REFERENCES public.customer_carts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (cart_id, product_id)
);

-- 3. Create indexes for optimization
CREATE INDEX IF NOT EXISTS idx_customer_carts_customer_id ON public.customer_carts(customer_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON public.cart_items(product_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.customer_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies to prevent conflicts
DO $$
BEGIN
  -- customer_carts policies
  DROP POLICY IF EXISTS "Allow customer select of own cart" ON public.customer_carts;
  DROP POLICY IF EXISTS "Allow customer insert of own cart" ON public.customer_carts;
  DROP POLICY IF EXISTS "Allow customer update of own cart" ON public.customer_carts;
  DROP POLICY IF EXISTS "Allow customer delete of own cart" ON public.customer_carts;

  -- cart_items policies
  DROP POLICY IF EXISTS "Allow customer select of own cart items" ON public.cart_items;
  DROP POLICY IF EXISTS "Allow customer insert of own cart items" ON public.cart_items;
  DROP POLICY IF EXISTS "Allow customer update of own cart items" ON public.cart_items;
  DROP POLICY IF EXISTS "Allow customer delete of own cart items" ON public.cart_items;
END
$$;

-- 6. Create RLS policies
-- customer_carts table RLS
CREATE POLICY "Allow public select of carts" ON public.customer_carts FOR SELECT USING (true);
CREATE POLICY "Allow public insert of carts" ON public.customer_carts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update of carts" ON public.customer_carts FOR UPDATE USING (true);
CREATE POLICY "Allow public delete of carts" ON public.customer_carts FOR DELETE USING (true);

-- cart_items table RLS
CREATE POLICY "Allow public select of cart items" ON public.cart_items FOR SELECT USING (true);
CREATE POLICY "Allow public insert of cart items" ON public.cart_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update of cart items" ON public.cart_items FOR UPDATE USING (true);
CREATE POLICY "Allow public delete of cart items" ON public.cart_items FOR DELETE USING (true);
