-- ==========================================
-- LAUNCHCART - MULTI-STORE E-COMMERCE SCHEMA
-- ==========================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES BASE TABLE
-- Stores core user identity metadata synced from Supabase Auth
CREATE TABLE IF NOT EXISTS public.profiles_base (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'creator' CHECK (role IN ('creator', 'admin', 'customer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for Profiles Base
ALTER TABLE public.profiles_base ENABLE ROW LEVEL SECURITY;

-- 1.2. SELLERS (CREATORS) TABLE
-- Stores profile metadata for content creators / store owners
CREATE TABLE IF NOT EXISTS public.sellers (
  id UUID PRIMARY KEY REFERENCES public.profiles_base(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_step INTEGER NOT NULL DEFAULT 0,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
  profile_image TEXT,
  bio TEXT,
  business_name TEXT,
  business_type TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  postal_code TEXT,
  verification_status TEXT CHECK (verification_status IN ('Not Submitted', 'Under Review', 'Verified', 'Rejected')) DEFAULT 'Not Submitted',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for Sellers
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;

-- 1.3. PROFILES BACKWARD-COMPATIBLE VIEW
-- Joins profiles_base and sellers to act as a seamless drop-in replacement for queries/code expecting profiles table
CREATE OR REPLACE VIEW public.profiles 
WITH (security_invoker = true) AS
SELECT 
  p.id,
  p.email,
  p.role,
  p.created_at,
  s.name,
  s.phone,
  s.onboarding_completed,
  s.onboarding_step,
  s.date_of_birth,
  s.gender,
  s.profile_image,
  s.bio,
  s.business_name,
  s.business_type,
  s.address,
  s.city,
  s.state,
  s.country,
  s.postal_code,
  s.verification_status,
  s.updated_at
FROM public.profiles_base p
LEFT JOIN public.sellers s ON p.id = s.id;

-- Trigger function to handle insertions through profiles view
CREATE OR REPLACE FUNCTION public.handle_profiles_view_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles_base (id, email, role, created_at)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.role, 'creator'), COALESCE(NEW.created_at, now()))
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      role = COALESCE(EXCLUDED.role, profiles_base.role);

  IF COALESCE(NEW.role, 'creator') = 'creator' THEN
    INSERT INTO public.sellers (
      id, name, phone, onboarding_completed, onboarding_step, date_of_birth, gender,
      profile_image, bio, business_name, business_type, address, city, state, country,
      postal_code, verification_status
    ) VALUES (
      NEW.id, NEW.name, NEW.phone, 
      COALESCE(NEW.onboarding_completed, FALSE), 
      COALESCE(NEW.onboarding_step, 0),
      NEW.date_of_birth, NEW.gender, NEW.profile_image, NEW.bio, 
      NEW.business_name, NEW.business_type, NEW.address, NEW.city, NEW.state, NEW.country,
      NEW.postal_code, COALESCE(NEW.verification_status, 'Not Submitted')
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      onboarding_completed = EXCLUDED.onboarding_completed,
      onboarding_step = EXCLUDED.onboarding_step,
      date_of_birth = EXCLUDED.date_of_birth,
      gender = EXCLUDED.gender,
      profile_image = EXCLUDED.profile_image,
      bio = EXCLUDED.bio,
      business_name = EXCLUDED.business_name,
      business_type = EXCLUDED.business_type,
      address = EXCLUDED.address,
      city = EXCLUDED.city,
      state = EXCLUDED.state,
      country = EXCLUDED.country,
      postal_code = EXCLUDED.postal_code,
      verification_status = EXCLUDED.verification_status,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_profiles_view_insert
  INSTEAD OF INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profiles_view_insert();

-- Trigger function to handle updates through profiles view
CREATE OR REPLACE FUNCTION public.handle_profiles_view_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles_base
  SET email = COALESCE(NEW.email, OLD.email),
      role = COALESCE(NEW.role, OLD.role)
  WHERE id = OLD.id;

  IF COALESCE(NEW.role, OLD.role) = 'creator' THEN
    INSERT INTO public.sellers (id)
    VALUES (OLD.id)
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.sellers
    SET name = NEW.name,
        phone = NEW.phone,
        onboarding_completed = NEW.onboarding_completed,
        onboarding_step = NEW.onboarding_step,
        date_of_birth = NEW.date_of_birth,
        gender = NEW.gender,
        profile_image = NEW.profile_image,
        bio = NEW.bio,
        business_name = NEW.business_name,
        business_type = NEW.business_type,
        address = NEW.address,
        city = NEW.city,
        state = NEW.state,
        country = NEW.country,
        postal_code = NEW.postal_code,
        verification_status = NEW.verification_status,
        updated_at = now()
    WHERE id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_profiles_view_update
  INSTEAD OF UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profiles_view_update();

-- 1.5. CUSTOMERS TABLE
-- Stores profile metadata for retail customers
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

-- Enable RLS for Customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 1.6. CUSTOMER ADDRESSES TABLE
-- Stores multiple shipping addresses for customer checkouts
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

-- Enable RLS for Customer Addresses
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- 2. STORES TABLE
-- Stores individual merchant shop instances
CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'disabled')),
  status_reason TEXT,
  theme_settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  seo_title TEXT,
  seo_description TEXT,
  og_title TEXT,
  og_description TEXT,
  canonical_url TEXT
);

-- Enable RLS for Stores
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- 2b. STORE STATUS AUDIT LOGS TABLE
-- Tracks status history transitions for stores
CREATE TABLE IF NOT EXISTS public.store_status_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  admin_id UUID,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for Store Status Audit Logs
ALTER TABLE public.store_status_audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. CATEGORIES TABLE
-- Stores products categorization inside specific stores
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (store_id, slug)
);

-- Enable RLS for Categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- 4. PRODUCTS TABLE
-- Stores items for sale inside specific stores
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  image_url TEXT,
  images TEXT[] DEFAULT '{}'::text[],
  status TEXT NOT NULL DEFAULT 'Published' CHECK (status IN ('Published', 'Draft')),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  seo_title TEXT,
  seo_description TEXT,
  og_title TEXT,
  og_description TEXT,
  canonical_url TEXT,
  UNIQUE (store_id, slug)
);

-- Enable RLS for Products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 4.5. COUPONS TABLE
-- Stores discount coupon configurations per store
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
  max_uses INTEGER NOT NULL CHECK (max_uses >= 0),
  current_uses INTEGER NOT NULL DEFAULT 0 CHECK (current_uses >= 0),
  minimum_order_amount NUMERIC(10, 2) DEFAULT 0 CHECK (minimum_order_amount >= 0),
  expiry_date TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (store_id, code)
);

-- Enable RLS for Coupons
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- 5. ORDERS TABLE
-- Stores customer purchases inside specific stores
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed', 'Cancelled')),
  shipping_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
  coupon_code TEXT,
  discount_amount NUMERIC(10, 2) DEFAULT 0 CHECK (discount_amount >= 0)
);

-- Enable RLS for Orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 6. ORDER_ITEMS TABLE
-- Stores list of items purchased under an order
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  snap_product_name TEXT NOT NULL,
  snap_product_image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for Order Items
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;


-- ==========================================
-- TRIGGER: PROFILE CREATION ON USER SIGNUP
-- ==========================================

-- Automatically create a profile row in public.profiles when a new user registers in Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_role TEXT;
  v_name TEXT;
  v_phone TEXT;
-- Automatically create appropriate profiles on signup
BEGIN
  v_role := COALESCE(new.raw_user_meta_data->>'role', 'creator');
  v_name := COALESCE(new.raw_user_meta_data->>'name', 'User');
  v_phone := new.raw_user_meta_data->>'phone';

  -- 1. Insert into public.profiles_base
  INSERT INTO public.profiles_base (id, email, role)
  VALUES (
    new.id,
    new.email,
    v_role
  )
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role;

  -- 2. If customer role, create customer record. If creator role, create seller record.
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
  ELSIF v_role = 'creator' THEN
    INSERT INTO public.sellers (id, name, phone, verification_status)
    VALUES (
      new.id,
      v_name,
      v_phone,
      'Not Submitted'
    )
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        phone = EXCLUDED.phone;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to auth.users insertions
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- A. PROFILES BASE POLICIES
CREATE POLICY "Allow public read of profiles_base" ON public.profiles_base FOR SELECT USING (true);
CREATE POLICY "Allow user updates of own profile_base" ON public.profiles_base FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Allow user inserts of own profile_base" ON public.profiles_base FOR INSERT WITH CHECK (auth.uid() = id);

-- A.1 SELLERS POLICIES
CREATE POLICY "Allow public read of sellers" ON public.sellers FOR SELECT USING (true);
CREATE POLICY "Allow user updates of own seller profile" ON public.sellers FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Allow user inserts of own seller profile" ON public.sellers FOR INSERT WITH CHECK (auth.uid() = id);

-- A.2 CUSTOMERS POLICIES
CREATE POLICY "Allow customer read of own profile" ON public.customers FOR SELECT USING (auth.uid() = auth_id);
CREATE POLICY "Allow customer update of own profile" ON public.customers FOR UPDATE USING (auth.uid() = auth_id);
CREATE POLICY "Allow customer insert of own profile" ON public.customers FOR INSERT WITH CHECK (auth.uid() = auth_id);

-- A.3 CUSTOMER ADDRESSES POLICIES
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

-- B. STORES POLICIES
-- Stores are publicly visible; creators can manage their own store; admins manage all
CREATE POLICY "Allow public read of stores" ON public.stores FOR SELECT USING (true);
CREATE POLICY "Allow creator inserts of stores" ON public.stores FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Allow creator updates of own stores" ON public.stores FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Allow creator deletes of own stores" ON public.stores FOR DELETE USING (auth.uid() = creator_id);

-- Bb. STORE STATUS AUDIT LOGS POLICIES
CREATE POLICY "Allow creators to view their own store audit logs" ON public.store_status_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = store_id AND stores.creator_id = auth.uid()
    )
  );
CREATE POLICY "Allow admin to view all audit logs" ON public.store_status_audit_logs
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Allow admin to insert audit logs" ON public.store_status_audit_logs
  FOR INSERT WITH CHECK (public.is_admin());

-- C. CATEGORIES POLICIES
-- Categories are publicly visible; creators manage their own store's categories
CREATE POLICY "Allow public read of categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Allow creator inserts of categories" ON public.categories FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND creator_id = auth.uid())
);
CREATE POLICY "Allow creator updates of own categories" ON public.categories FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND creator_id = auth.uid())
);
CREATE POLICY "Allow creator deletes of own categories" ON public.categories FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND creator_id = auth.uid())
);

-- D. PRODUCTS POLICIES
-- Products are publicly visible; creators manage their own products
CREATE POLICY "Allow public read of products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Allow creator inserts of products" ON public.products FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND creator_id = auth.uid())
);
CREATE POLICY "Allow creator updates of own products" ON public.products FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND creator_id = auth.uid())
);
CREATE POLICY "Allow creator deletes of own products" ON public.products FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND creator_id = auth.uid())
);

-- E. ORDERS POLICIES
-- Public checkout can create orders; creators view their own store's orders
CREATE POLICY "Allow public creation of orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow creators to view own store orders" ON public.orders FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND creator_id = auth.uid())
);
CREATE POLICY "Allow creators to update own store orders" ON public.orders FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND creator_id = auth.uid())
);
CREATE POLICY "Allow customer to view own orders" ON public.orders FOR SELECT USING (
  customer_id IN (SELECT id FROM public.customers WHERE auth_id = auth.uid())
);

-- F. ORDER ITEMS POLICIES
-- Public checkout can create order items; creators view their order items
CREATE POLICY "Allow public creation of order items" ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow creators to view own order items" ON public.order_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.stores s ON o.store_id = s.id
    WHERE o.id = order_id AND s.creator_id = auth.uid()
  )
);
CREATE POLICY "Allow customer to view own order items" ON public.order_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND o.customer_id IN (SELECT id FROM public.customers WHERE auth_id = auth.uid())
  )
);


-- ==========================================
-- ADMIN SECURITY-DEFINER FUNCTION & POLICIES
-- ==========================================

-- Helper function to check if the authenticated user is an administrator
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles_base
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- A. ADMIN PROFILES BASE AND SELLERS POLICIES
CREATE POLICY "Allow admin updates of all profiles_base" ON public.profiles_base FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin deletes of all profiles_base" ON public.profiles_base FOR DELETE USING (public.is_admin());
CREATE POLICY "Allow admin updates of all sellers" ON public.sellers FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin deletes of all sellers" ON public.sellers FOR DELETE USING (public.is_admin());

-- A.2 ADMIN CUSTOMERS POLICIES
CREATE POLICY "Allow admin to view all customers" ON public.customers FOR SELECT USING (public.is_admin());
CREATE POLICY "Allow admin to update all customers" ON public.customers FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin to delete any customer" ON public.customers FOR DELETE USING (public.is_admin());

-- A.3 ADMIN CUSTOMER ADDRESSES POLICIES
CREATE POLICY "Allow admin to view all customer addresses" ON public.customer_addresses FOR SELECT USING (public.is_admin());
CREATE POLICY "Allow admin to update all customer addresses" ON public.customer_addresses FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin to delete any customer address" ON public.customer_addresses FOR DELETE USING (public.is_admin());

-- B. ADMIN STORES POLICIES
CREATE POLICY "Allow admin inserts of stores" ON public.stores FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Allow admin updates of all stores" ON public.stores FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin deletes of all stores" ON public.stores FOR DELETE USING (public.is_admin());

-- C. ADMIN CATEGORIES POLICIES
CREATE POLICY "Allow admin inserts of categories" ON public.categories FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Allow admin updates of all categories" ON public.categories FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin deletes of all categories" ON public.categories FOR DELETE USING (public.is_admin());

-- D. ADMIN PRODUCTS POLICIES
CREATE POLICY "Allow admin inserts of products" ON public.products FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Allow admin updates of all products" ON public.products FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin deletes of all products" ON public.products FOR DELETE USING (public.is_admin());

-- E. ADMIN ORDERS POLICIES
CREATE POLICY "Allow admin to view all orders" ON public.orders FOR SELECT USING (public.is_admin());
CREATE POLICY "Allow admin to update all orders" ON public.orders FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin to delete any order" ON public.orders FOR DELETE USING (public.is_admin());

-- F. ADMIN ORDER ITEMS POLICIES
CREATE POLICY "Allow admin to view all order items" ON public.order_items FOR SELECT USING (public.is_admin());
CREATE POLICY "Allow admin to update all order items" ON public.order_items FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin to delete any order item" ON public.order_items FOR DELETE USING (public.is_admin());


-- ==========================================
-- G. DEDICATED ADMIN AUTHENTICATION
-- ==========================================

-- Create dedicated table for company internal admins (completely isolated from creators)
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for admin_users (do not allow direct public access)
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Manually seed a default company administrator with secure bcrypt password ('admin123')
INSERT INTO public.admin_users (email, password_hash, full_name)
VALUES (
  'admin@kreatorstore.com', 
  crypt('admin123', gen_salt('bf')), 
  'System Administrator'
)
ON CONFLICT (email) DO NOTHING;


-- ==========================================
-- H. SECURE DEFINER DATABASE ADMIN RPCs
-- ==========================================

-- RPC Security definer function for secure, isolated admin password verification
CREATE OR REPLACE FUNCTION public.verify_admin_credentials(p_email TEXT, p_password TEXT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.email, a.full_name
  FROM public.admin_users a
  WHERE lower(a.email) = lower(p_email)
    AND a.password_hash = crypt(p_password, a.password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin approve store action (SECURITY DEFINER to bypass RLS securely for validated admins)
CREATE OR REPLACE FUNCTION public.admin_approve_store(p_admin_email TEXT, p_store_id UUID)
RETURNS boolean AS $$
DECLARE
  v_admin_id UUID;
  v_prev_status TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE lower(email) = lower(p_admin_email)) THEN
    RAISE EXCEPTION 'Unauthorized admin access.';
  END IF;

  SELECT id INTO v_admin_id FROM public.admin_users WHERE lower(email) = lower(p_admin_email);
  SELECT status INTO v_prev_status FROM public.stores WHERE id = p_store_id;

  UPDATE public.stores
  SET status = 'approved', status_reason = NULL
  WHERE id = p_store_id;

  INSERT INTO public.store_status_audit_logs (store_id, admin_id, previous_status, new_status, reason)
  VALUES (p_store_id, v_admin_id, v_prev_status, 'approved', NULL);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin reject store action (accepts reason)
CREATE OR REPLACE FUNCTION public.admin_reject_store(p_admin_email TEXT, p_store_id UUID, p_reason TEXT)
RETURNS boolean AS $$
DECLARE
  v_admin_id UUID;
  v_prev_status TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE lower(email) = lower(p_admin_email)) THEN
    RAISE EXCEPTION 'Unauthorized admin access.';
  END IF;

  SELECT id INTO v_admin_id FROM public.admin_users WHERE lower(email) = lower(p_admin_email);
  SELECT status INTO v_prev_status FROM public.stores WHERE id = p_store_id;

  UPDATE public.stores
  SET status = 'rejected', status_reason = p_reason
  WHERE id = p_store_id;

  INSERT INTO public.store_status_audit_logs (store_id, admin_id, previous_status, new_status, reason)
  VALUES (p_store_id, v_admin_id, v_prev_status, 'rejected', p_reason);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin disable store action (accepts reason)
CREATE OR REPLACE FUNCTION public.admin_disable_store(p_admin_email TEXT, p_store_id UUID, p_reason TEXT)
RETURNS boolean AS $$
DECLARE
  v_admin_id UUID;
  v_prev_status TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE lower(email) = lower(p_admin_email)) THEN
    RAISE EXCEPTION 'Unauthorized admin access.';
  END IF;

  SELECT id INTO v_admin_id FROM public.admin_users WHERE lower(email) = lower(p_admin_email);
  SELECT status INTO v_prev_status FROM public.stores WHERE id = p_store_id;

  UPDATE public.stores
  SET status = 'disabled', status_reason = p_reason
  WHERE id = p_store_id;

  INSERT INTO public.store_status_audit_logs (store_id, admin_id, previous_status, new_status, reason)
  VALUES (p_store_id, v_admin_id, v_prev_status, 'disabled', p_reason);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin remove product action
CREATE OR REPLACE FUNCTION public.admin_remove_product(p_admin_email TEXT, p_product_id UUID)
RETURNS boolean AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE lower(email) = lower(p_admin_email)) THEN
    RAISE EXCEPTION 'Unauthorized admin access.';
  END IF;

  DELETE FROM public.products
  WHERE id = p_product_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin secure view of all orders (SECURITY DEFINER to bypass RLS securely)
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

-- Admin secure view of all stores with creator details
CREATE OR REPLACE FUNCTION public.admin_get_stores(p_admin_email TEXT)
RETURNS TABLE (
  id UUID,
  creator_id UUID,
  creator_name TEXT,
  creator_email TEXT,
  name TEXT,
  slug TEXT,
  description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  status TEXT,
  status_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE lower(email) = lower(p_admin_email)) THEN
    RAISE EXCEPTION 'Unauthorized admin access.';
  END IF;

  RETURN QUERY
  SELECT s.id, s.creator_id, p.name as creator_name, p.email as creator_email, s.name, s.slug, s.description, s.logo_url, s.banner_url, s.status, s.status_reason, s.created_at
  FROM public.stores s
  LEFT JOIN public.profiles p ON s.creator_id = p.id
  ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin secure view of all products with store/category details
CREATE OR REPLACE FUNCTION public.admin_get_products(p_admin_email TEXT)
RETURNS TABLE (
  id UUID,
  store_id UUID,
  store_name TEXT,
  category_id UUID,
  category_name TEXT,
  name TEXT,
  description TEXT,
  price NUMERIC(10, 2),
  image_url TEXT,
  status TEXT,
  stock INTEGER,
  featured BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE lower(email) = lower(p_admin_email)) THEN
    RAISE EXCEPTION 'Unauthorized admin access.';
  END IF;

  RETURN QUERY
  SELECT p.id, p.store_id, s.name as store_name, p.category_id, c.name as category_name, p.name, p.description, p.price, p.image_url, p.status, p.stock, p.featured, p.created_at
  FROM public.products p
  LEFT JOIN public.stores s ON p.store_id = s.id
  LEFT JOIN public.categories c ON p.category_id = c.id
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 13. CUSTOMER CARTS & CART ITEMS
-- Stores persistent shopping carts for registered customers
CREATE TABLE IF NOT EXISTS public.customer_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID REFERENCES public.customer_carts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (cart_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_carts_customer_id ON public.customer_carts(customer_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON public.cart_items(product_id);

ALTER TABLE public.customer_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow customer select of own cart" ON public.customer_carts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.customers WHERE id = customer_id AND auth_id = auth.uid())
);
CREATE POLICY "Allow customer insert of own cart" ON public.customer_carts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.customers WHERE id = customer_id AND auth_id = auth.uid())
);
CREATE POLICY "Allow customer update of own cart" ON public.customer_carts FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.customers WHERE id = customer_id AND auth_id = auth.uid())
);
CREATE POLICY "Allow customer delete of own cart" ON public.customer_carts FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.customers WHERE id = customer_id AND auth_id = auth.uid())
);

CREATE POLICY "Allow customer select of own cart items" ON public.cart_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.customer_carts c
    JOIN public.customers cust ON cust.id = c.customer_id
    WHERE c.id = cart_id AND cust.auth_id = auth.uid()
  )
);
CREATE POLICY "Allow customer insert of own cart items" ON public.cart_items FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.customer_carts c
    JOIN public.customers cust ON cust.id = c.customer_id
    WHERE c.id = cart_id AND cust.auth_id = auth.uid()
  )
);
CREATE POLICY "Allow customer update of own cart items" ON public.cart_items FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.customer_carts c
    JOIN public.customers cust ON cust.id = c.customer_id
    WHERE c.id = cart_id AND cust.auth_id = auth.uid()
  )
);
CREATE POLICY "Allow customer delete of own cart items" ON public.cart_items FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.customer_carts c
    JOIN public.customers cust ON cust.id = c.customer_id
    WHERE c.id = cart_id AND cust.auth_id = auth.uid()
  )
);


-- 10. RLS POLICIES FOR COUPONS
CREATE POLICY "Allow public read of coupons" ON public.coupons FOR SELECT USING (true);
CREATE POLICY "Allow creator inserts of coupons" ON public.coupons FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.stores
    WHERE stores.id = coupons.store_id AND stores.creator_id = auth.uid()
  )
);
CREATE POLICY "Allow creator updates of own coupons" ON public.coupons FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.stores
    WHERE stores.id = coupons.store_id AND stores.creator_id = auth.uid()
  )
);
CREATE POLICY "Allow creator deletes of own coupons" ON public.coupons FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.stores
    WHERE stores.id = coupons.store_id AND stores.creator_id = auth.uid()
  )
);

-- Admin RLS policies for coupons
CREATE POLICY "Allow admin updates of all coupons" ON public.coupons FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin deletes of all coupons" ON public.coupons FOR DELETE USING (public.is_admin());

-- 1. Create check trigger function to secure public updates
CREATE OR REPLACE FUNCTION public.check_coupon_update_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- If user is the store creator or an admin, allow all changes
  IF EXISTS (
    SELECT 1 FROM public.stores
    WHERE stores.id = OLD.store_id AND stores.creator_id = auth.uid()
  ) OR (SELECT public.is_admin()) THEN
    RETURN NEW;
  END IF;

  -- Otherwise, it is a guest checkout incrementing usage. Enforce restrictions:
  IF NEW.id <> OLD.id OR
     NEW.store_id <> OLD.store_id OR
     NEW.code <> OLD.code OR
     NEW.discount_type <> OLD.discount_type OR
     NEW.discount_value <> OLD.discount_value OR
     NEW.max_uses <> OLD.max_uses OR
     NEW.minimum_order_amount IS DISTINCT FROM OLD.minimum_order_amount OR
     NEW.expiry_date IS DISTINCT FROM OLD.expiry_date OR
     NEW.is_active <> OLD.is_active OR
     NEW.created_at <> OLD.created_at OR
     NOT (NEW.current_uses = OLD.current_uses + 1 OR NEW.current_uses = OLD.current_uses)
  THEN
    RAISE EXCEPTION 'Permission denied: Guests can only increment current_uses.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Bind trigger to coupons table
DROP TRIGGER IF EXISTS tr_check_coupon_update_fields ON public.coupons;
CREATE TRIGGER tr_check_coupon_update_fields
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.check_coupon_update_fields();

-- 3. Simplified RLS policy allowing public updates (trigger enforces security)
DROP POLICY IF EXISTS "Allow public update of coupon usage count" ON public.coupons;
CREATE POLICY "Allow public update of coupon usage count" ON public.coupons 
FOR UPDATE 
USING (true) 
WITH CHECK (true);


-- PHASE 12: Creator Earnings & Payouts System

-- Creator Earnings table
CREATE TABLE IF NOT EXISTS public.creator_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE UNIQUE,
  order_amount NUMERIC(10, 2) NOT NULL,
  platform_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  creator_amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'available', 'paid')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Payout Requests table
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  payout_method TEXT NOT NULL CHECK (payout_method IN ('Bank Transfer', 'UPI')),
  account_details TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'completed')) DEFAULT 'pending',
  admin_notes TEXT,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS on new tables
ALTER TABLE public.creator_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

-- Policies for creator_earnings
DROP POLICY IF EXISTS "Allow creators to view their own earnings" ON public.creator_earnings;
CREATE POLICY "Allow creators to view their own earnings" ON public.creator_earnings
  FOR SELECT USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Allow admin to view all earnings" ON public.creator_earnings;
CREATE POLICY "Allow admin to view all earnings" ON public.creator_earnings
  FOR SELECT USING (public.is_admin());

-- Policies for payout_requests
DROP POLICY IF EXISTS "Allow creators to view their own payout requests" ON public.payout_requests;
CREATE POLICY "Allow creators to view their own payout requests" ON public.payout_requests
  FOR SELECT USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Allow creators to create payout requests" ON public.payout_requests;
CREATE POLICY "Allow creators to create payout requests" ON public.payout_requests
  FOR INSERT WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "Allow admin to view all payout requests" ON public.payout_requests;
CREATE POLICY "Allow admin to view all payout requests" ON public.payout_requests
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Allow admin to update payout requests" ON public.payout_requests;
CREATE POLICY "Allow admin to update payout requests" ON public.payout_requests
  FOR UPDATE USING (public.is_admin());

-- Trigger function to handle earnings additions and reversals
CREATE OR REPLACE FUNCTION public.handle_order_status_earnings_change()
RETURNS TRIGGER AS $$
DECLARE
  v_store_creator_id UUID;
BEGIN
  -- If order transitions to paid, add creator earnings
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND lower(NEW.payment_status) = 'paid' AND (OLD.payment_status IS NULL OR lower(OLD.payment_status) != 'paid') THEN
    -- Get store creator_id
    SELECT creator_id INTO v_store_creator_id FROM public.stores WHERE id = NEW.store_id;
    
    -- Insert into creator_earnings (prevent duplicates via UNIQUE constraint)
    INSERT INTO public.creator_earnings (creator_id, store_id, order_id, order_amount, platform_fee, creator_amount, status)
    VALUES (v_store_creator_id, NEW.store_id, NEW.id, NEW.total_amount, 0.00, NEW.total_amount, 'pending')
    ON CONFLICT (order_id) DO NOTHING;
  END IF;

  -- If order status changes to Cancelled or refunded, remove earnings unless already paid out
  IF TG_OP = 'UPDATE' AND lower(NEW.status) IN ('cancelled', 'refunded') AND (OLD.status IS NULL OR (lower(OLD.status) != 'cancelled' AND lower(lower(OLD.status)) != 'refunded')) THEN
    DELETE FROM public.creator_earnings
    WHERE order_id = NEW.id AND status != 'paid';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on orders
DROP TRIGGER IF EXISTS trigger_order_earnings_change ON public.orders;
CREATE TRIGGER trigger_order_earnings_change
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_status_earnings_change();

-- Admin payout completion RPC
CREATE OR REPLACE FUNCTION public.admin_complete_payout(p_request_id UUID, p_admin_email TEXT)
RETURNS boolean AS $$
DECLARE
  v_admin_id UUID;
  v_creator_id UUID;
  v_amount NUMERIC;
  v_accumulated NUMERIC := 0.00;
  v_rec RECORD;
BEGIN
  -- Auth check
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE lower(email) = lower(p_admin_email)) THEN
    RAISE EXCEPTION 'Unauthorized admin access.';
  END IF;

  -- Get request info
  SELECT creator_id, amount INTO v_creator_id, v_amount 
  FROM public.payout_requests 
  WHERE id = p_request_id AND (status = 'approved' OR status = 'pending');

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Payout request not found.';
  END IF;

  -- Update request status
  UPDATE public.payout_requests
  SET status = 'completed', processed_at = timezone('utc'::text, now())
  WHERE id = p_request_id;

  -- Loop through available earnings and mark as paid
  FOR v_rec IN 
    SELECT id, creator_amount FROM public.creator_earnings 
    WHERE creator_id = v_creator_id AND status = 'available' 
    ORDER BY created_at ASC
  LOOP
    IF v_accumulated < v_amount THEN
      UPDATE public.creator_earnings SET status = 'paid' WHERE id = v_rec.id;
      v_accumulated := v_accumulated + v_rec.creator_amount;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================
-- LAUNCHCART - CREATOR PROFILE & WALLET SYSTEM (PHASE 13)
-- ==========================================

-- 1. Create creator_documents table
CREATE TABLE IF NOT EXISTS public.creator_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('Government ID Proof', 'Address Proof', 'Business Registration Document')),
  document_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Not Submitted', 'Under Review', 'Verified', 'Rejected')) DEFAULT 'Under Review',
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (creator_id, document_type)
);


-- 2. Create wallet_transactions table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('Sale Credit', 'Payout Request', 'Payout Completed', 'Refund Adjustment')),
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'rejected')) DEFAULT 'pending',
  reference_id UUID, -- order_id or payout_request_id
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- 3. Indexes for performance optimization (Finding 2)
CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_categories_store_id ON public.categories(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_coupons_store_id ON public.coupons(store_id);
CREATE INDEX IF NOT EXISTS idx_store_status_audit_logs_store_id ON public.store_status_audit_logs(store_id);

-- 4. Enforce referential integrity on audit logs (Finding 4)
ALTER TABLE public.store_status_audit_logs 
  DROP CONSTRAINT IF EXISTS fk_store_status_audit_logs_admin;
ALTER TABLE public.store_status_audit_logs 
  ADD CONSTRAINT fk_store_status_audit_logs_admin 
  FOREIGN KEY (admin_id) REFERENCES public.admin_users(id) 
  ON DELETE SET NULL;


-- 5. Enable RLS and setup policies
ALTER TABLE public.creator_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for creator_documents
DROP POLICY IF EXISTS "Allow creators to view their own documents" ON public.creator_documents;
CREATE POLICY "Allow creators to view their own documents" ON public.creator_documents
  FOR SELECT USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Allow creators to upload their own documents" ON public.creator_documents;
CREATE POLICY "Allow creators to upload their own documents" ON public.creator_documents
  FOR INSERT WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "Allow creators to update their own documents" ON public.creator_documents;
CREATE POLICY "Allow creators to update their own documents" ON public.creator_documents
  FOR UPDATE USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Allow admin to view all creator documents" ON public.creator_documents;
CREATE POLICY "Allow admin to view all creator documents" ON public.creator_documents
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Allow admin to update creator documents" ON public.creator_documents;
CREATE POLICY "Allow admin to update creator documents" ON public.creator_documents
  FOR UPDATE USING (public.is_admin());

-- Policies for wallet_transactions
DROP POLICY IF EXISTS "Allow creators to view their own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Allow creators to view their own wallet transactions" ON public.wallet_transactions
  FOR SELECT USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Allow admin to view all wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Allow admin to view all wallet transactions" ON public.wallet_transactions
  FOR SELECT USING (public.is_admin());


-- 5. Create triggers to sync transactions automatically

-- Trigger function on creator_earnings (synced to Sale Credit and Refund Adjustment)
CREATE OR REPLACE FUNCTION public.handle_creator_earnings_transaction_sync()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.wallet_transactions (creator_id, type, amount, status, reference_id, created_at)
    VALUES (NEW.creator_id, 'Sale Credit', NEW.creator_amount, 'completed', NEW.order_id, NEW.created_at);
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.wallet_transactions (creator_id, type, amount, status, reference_id, created_at)
    VALUES (OLD.creator_id, 'Refund Adjustment', -OLD.creator_amount, 'completed', OLD.order_id, now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_earnings_to_transaction_sync ON public.creator_earnings;
CREATE TRIGGER trigger_earnings_to_transaction_sync
  AFTER INSERT OR DELETE ON public.creator_earnings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_creator_earnings_transaction_sync();


-- Trigger function on payout_requests (synced to Payout Request and Payout Completed/Rejected)
CREATE OR REPLACE FUNCTION public.handle_payout_request_transaction_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT: log payout request as pending
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.wallet_transactions (creator_id, type, amount, status, reference_id, created_at)
    VALUES (NEW.creator_id, 'Payout Request', -NEW.amount, 'pending', NEW.id, NEW.requested_at);
  END IF;

  -- On UPDATE: transition status/type on completion or rejection
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'completed' THEN
      UPDATE public.wallet_transactions
      SET type = 'Payout Completed', status = 'completed'
      WHERE reference_id = NEW.id;
    ELSIF NEW.status = 'rejected' THEN
      UPDATE public.wallet_transactions
      SET status = 'rejected'
      WHERE reference_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_payout_request_transaction_sync ON public.payout_requests;
CREATE TRIGGER trigger_payout_request_transaction_sync
  AFTER INSERT OR UPDATE ON public.payout_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_payout_request_transaction_sync();




