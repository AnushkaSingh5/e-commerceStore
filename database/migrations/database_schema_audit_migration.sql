-- ========================================================
-- LAUNCHCART - PRODUCTION-GRADE DATABASE SCHEMA AUDIT
-- ========================================================

-- Disable triggers temporarily if needed (optional)
SET session_replication_role = 'replica';

-- ========================================================
-- 1. PRE-CLEANUP & PREPARATION FOR TABLE SPLIT
-- ========================================================

-- Consolidate duplicate profile name columns first
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='full_name') THEN
    UPDATE public.profiles SET name = COALESCE(full_name, name) WHERE name IS NULL;
  END IF;
END $$;

-- Rename public.profiles to public.profiles_base
ALTER TABLE public.profiles RENAME TO profiles_base;

-- ========================================================
-- 2. CREATE SELLERS TABLE & MIGRATE CREATOR DATA
-- ========================================================

-- Create dedicated sellers table
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

-- Backfill existing creators data from profiles_base to sellers
INSERT INTO public.sellers (
  id, name, phone, onboarding_completed, onboarding_step, date_of_birth, gender,
  profile_image, bio, business_name, business_type, address, city, state, country,
  postal_code, verification_status, created_at
)
SELECT 
  id, 
  name, 
  COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles_base' AND column_name='phone') THEN phone ELSE NULL END, 
    NULL
  ),
  COALESCE(onboarding_completed, FALSE),
  COALESCE(onboarding_step, 0),
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles_base' AND column_name='date_of_birth') THEN date_of_birth ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles_base' AND column_name='gender') THEN gender ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles_base' AND column_name='profile_image') THEN profile_image ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles_base' AND column_name='bio') THEN bio ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles_base' AND column_name='business_name') THEN business_name ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles_base' AND column_name='business_type') THEN business_type ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles_base' AND column_name='address') THEN address ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles_base' AND column_name='city') THEN city ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles_base' AND column_name='state') THEN state ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles_base' AND column_name='country') THEN country ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles_base' AND column_name='postal_code') THEN postal_code ELSE NULL END,
  COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles_base' AND column_name='verification_status') THEN verification_status ELSE NULL END, 
    'Not Submitted'
  ),
  created_at
FROM public.profiles_base
WHERE role = 'creator'
ON CONFLICT (id) DO NOTHING;

-- Clean up seller-specific columns from profiles_base to drop redundancies
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS name;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS full_name;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS phone;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS onboarding_completed;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS onboarding_step;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS date_of_birth;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS gender;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS profile_image;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS bio;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS business_name;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS business_type;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS address;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS city;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS state;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS country;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS postal_code;
ALTER TABLE public.profiles_base DROP COLUMN IF EXISTS verification_status;

-- ========================================================
-- 3. CREATE BACKWARD-COMPATIBLE PROFILES VIEW & TRIGGERS
-- ========================================================

-- Recreate public.profiles as a view joining profiles_base and sellers
-- Use WITH (security_invoker = true) so that Row Level Security is enforced based on caller credentials
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

-- Create trigger function to handle insertions through profiles view
CREATE OR REPLACE FUNCTION public.handle_profiles_view_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into profiles_base
  INSERT INTO public.profiles_base (id, email, role, created_at)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.role, 'creator'), COALESCE(NEW.created_at, now()))
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      role = COALESCE(EXCLUDED.role, profiles_base.role);

  -- If creator role, insert into sellers table
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

-- Create trigger function to handle updates through profiles view
CREATE OR REPLACE FUNCTION public.handle_profiles_view_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Update profiles_base
  UPDATE public.profiles_base
  SET email = COALESCE(NEW.email, OLD.email),
      role = COALESCE(NEW.role, OLD.role)
  WHERE id = OLD.id;

  -- Update sellers if role is creator
  IF COALESCE(NEW.role, OLD.role) = 'creator' THEN
    -- Ensure seller record exists
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

-- ========================================================
-- 4. REBUILD AUTH NEW USER TRIGGER (REMOVE DUPLICATION)
-- ========================================================

-- Modify handle_new_user to insert into profiles_base and sellers/customers without duplication
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

-- Re-enable triggers
SET session_replication_role = 'origin';

-- ========================================================
-- 5. UPDATE CORE HELPER FUNCTIONS & FOREIGN KEYS
-- ========================================================

-- Update is_admin to query profiles_base to prevent circular dependencies on profiles view
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles_base
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add foreign key constraint to link store status logs back to admin_users table
ALTER TABLE public.store_status_audit_logs 
  DROP CONSTRAINT IF EXISTS fk_store_status_audit_logs_admin;

ALTER TABLE public.store_status_audit_logs 
  ADD CONSTRAINT fk_store_status_audit_logs_admin 
  FOREIGN KEY (admin_id) REFERENCES public.admin_users(id) 
  ON DELETE SET NULL;

-- ========================================================
-- 6. ENABLE ROW LEVEL SECURITY (RLS) & POLICIES
-- ========================================================

ALTER TABLE public.profiles_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;

-- Re-apply policies on profiles_base
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow public read of profiles_base" ON public.profiles_base;
  DROP POLICY IF EXISTS "Allow user updates of own profile_base" ON public.profiles_base;
  DROP POLICY IF EXISTS "Allow admin updates of all profiles_base" ON public.profiles_base;
  DROP POLICY IF EXISTS "Allow admin deletes of all profiles_base" ON public.profiles_base;
END $$;

CREATE POLICY "Allow public read of profiles_base" ON public.profiles_base FOR SELECT USING (true);
CREATE POLICY "Allow user updates of own profile_base" ON public.profiles_base FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Allow admin updates of all profiles_base" ON public.profiles_base FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin deletes of all profiles_base" ON public.profiles_base FOR DELETE USING (public.is_admin());

-- Re-apply policies on sellers
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow public read of sellers" ON public.sellers;
  DROP POLICY IF EXISTS "Allow user updates of own seller profile" ON public.sellers;
  DROP POLICY IF EXISTS "Allow admin updates of all sellers" ON public.sellers;
  DROP POLICY IF EXISTS "Allow admin deletes of all sellers" ON public.sellers;
END $$;

CREATE POLICY "Allow public read of sellers" ON public.sellers FOR SELECT USING (true);
CREATE POLICY "Allow user updates of own seller profile" ON public.sellers FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Allow admin updates of all sellers" ON public.sellers FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin deletes of all sellers" ON public.sellers FOR DELETE USING (public.is_admin());

-- ========================================================
-- 7. CREATE MISSING PERFORMANCE INDEXES
-- ========================================================

CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_categories_store_id ON public.categories(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_coupons_store_id ON public.coupons(store_id);
CREATE INDEX IF NOT EXISTS idx_store_status_audit_logs_store_id ON public.store_status_audit_logs(store_id);

-- ========================================================
-- 8. PRESERVE HISTORICAL ORDER DATA INTEGRITY
-- ========================================================

-- Add snapshot columns to store product state at time of transaction
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS snap_product_name TEXT;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS snap_product_image TEXT;

-- Backfill existing order items snapshot columns from products table
UPDATE public.order_items oi
SET snap_product_name = p.name,
    snap_product_image = p.image_url
FROM public.products p
WHERE oi.product_id = p.id AND oi.snap_product_name IS NULL;

-- Backfill fallback for items where product was already deleted
UPDATE public.order_items 
SET snap_product_name = 'Deleted Product'
WHERE snap_product_name IS NULL;

-- Enforce constraints: snap_product_name cannot be null for future orders
ALTER TABLE public.order_items ALTER COLUMN snap_product_name SET NOT NULL;
