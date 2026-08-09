-- Safe Migration Script to create only missing customer tables, indexes, triggers, and RLS policies.
-- Do NOT recreate or drop existing tables. Do NOT modify existing tables.

-- 1. Create customers table if not exists
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create customer_addresses table if not exists
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  name TEXT,
  full_name TEXT,
  phone TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  postal_code TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.5 Add name column to customer_addresses if not exists, and customer_id column to orders table if not exists
ALTER TABLE public.customer_addresses 
  ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;


-- 3. Create required indexes for optimization
CREATE INDEX IF NOT EXISTS idx_customers_auth_id ON public.customers(auth_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON public.customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_is_default ON public.customer_addresses(customer_id, is_default);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to prevent errors, then recreate them
DO $$
BEGIN
  -- Customers table policies
  DROP POLICY IF EXISTS "Allow customer read of own profile" ON public.customers;
  DROP POLICY IF EXISTS "Allow customer update of own profile" ON public.customers;
  DROP POLICY IF EXISTS "Allow customer insert of own profile" ON public.customers;
  DROP POLICY IF EXISTS "Allow admin to view all customers" ON public.customers;
  DROP POLICY IF EXISTS "Allow admin to update all customers" ON public.customers;
  DROP POLICY IF EXISTS "Allow admin to delete any customer" ON public.customers;

  -- Customer addresses table policies
  DROP POLICY IF EXISTS "Allow customer read of own addresses" ON public.customer_addresses;
  DROP POLICY IF EXISTS "Allow customer insert of own addresses" ON public.customer_addresses;
  DROP POLICY IF EXISTS "Allow customer update of own addresses" ON public.customer_addresses;
  DROP POLICY IF EXISTS "Allow customer delete of own addresses" ON public.customer_addresses;
  DROP POLICY IF EXISTS "Allow admin to view all customer addresses" ON public.customer_addresses;
  DROP POLICY IF EXISTS "Allow admin to update all customer addresses" ON public.customer_addresses;
  DROP POLICY IF EXISTS "Allow admin to delete any customer address" ON public.customer_addresses;

  -- Orders and Order Items customer policies
  DROP POLICY IF EXISTS "Allow customer to view own orders" ON public.orders;
  DROP POLICY IF EXISTS "Allow customer to view own order items" ON public.order_items;
END
$$;

-- Create policies
CREATE POLICY "Allow customer read of own profile" ON public.customers FOR SELECT USING (auth.uid() = auth_id);
CREATE POLICY "Allow customer update of own profile" ON public.customers FOR UPDATE USING (auth.uid() = auth_id);
CREATE POLICY "Allow customer insert of own profile" ON public.customers FOR INSERT WITH CHECK (auth.uid() = auth_id);
CREATE POLICY "Allow admin to view all customers" ON public.customers FOR SELECT USING (public.is_admin());
CREATE POLICY "Allow admin to update all customers" ON public.customers FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin to delete any customer" ON public.customers FOR DELETE USING (public.is_admin());

CREATE POLICY "Allow customer read of own addresses" ON public.customer_addresses FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.customers WHERE id = customer_id AND auth_id = auth.uid())
);
CREATE POLICY "Allow customer insert of own addresses" ON public.customer_addresses FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.customers WHERE id = customer_id AND auth_id = auth.uid())
);
CREATE POLICY "Allow customer update of own addresses" ON public.customer_addresses FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.customers WHERE id = customer_id AND auth_id = auth.uid())
);
CREATE POLICY "Allow customer delete of own addresses" ON public.customer_addresses FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.customers WHERE id = customer_id AND auth_id = auth.uid())
);
CREATE POLICY "Allow admin to view all customer addresses" ON public.customer_addresses FOR SELECT USING (public.is_admin());
CREATE POLICY "Allow admin to update all customer addresses" ON public.customer_addresses FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin to delete any customer address" ON public.customer_addresses FOR DELETE USING (public.is_admin());

-- Orders and Order Items customer policies
CREATE POLICY "Allow customer to view own orders" ON public.orders FOR SELECT USING (
  customer_id IN (SELECT id FROM public.customers WHERE auth_id = auth.uid())
);

CREATE POLICY "Allow customer to view own order items" ON public.order_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND o.customer_id IN (SELECT id FROM public.customers WHERE auth_id = auth.uid())
  )
);

-- 5. Trigger Function & Binding (Safe modification)
-- Updates public.handle_new_user function to support customer creation upon auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_role TEXT;
  v_name TEXT;
  v_phone TEXT;
BEGIN
  v_role := COALESCE(new.raw_user_meta_data->>'role', 'creator');
  v_name := COALESCE(new.raw_user_meta_data->>'name', 'User');
  v_phone := new.raw_user_meta_data->>'phone';

  -- 1. Insert into public.profiles
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    new.id,
    v_name,
    new.email,
    v_role
  )
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      role = EXCLUDED.role;

  -- 2. If the role is 'customer', automatically populate the customers table
  IF v_role = 'customer' THEN
    INSERT INTO public.customers (id, auth_id, full_name, email, phone)
    VALUES (
      gen_random_uuid(),
      new.id,
      v_name,
      new.email,
      v_phone
    )
    ON CONFLICT (email) DO UPDATE
    SET auth_id = EXCLUDED.auth_id,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rebind trigger safely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
