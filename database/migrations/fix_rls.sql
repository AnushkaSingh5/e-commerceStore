-- Safe Migration to fix RLS Policies for Categories and Products
-- Run this in your Supabase SQL Editor to ensure creator and admin RLS permissions are correct.

-- Enable Row Level Security (RLS) on both tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Clean up any existing policies to avoid conflicts
DO $$
BEGIN
  -- Categories policies cleanup
  DROP POLICY IF EXISTS "Allow public read of categories" ON public.categories;
  DROP POLICY IF EXISTS "Allow creator inserts of categories" ON public.categories;
  DROP POLICY IF EXISTS "Allow creator updates of own categories" ON public.categories;
  DROP POLICY IF EXISTS "Allow creator deletes of own categories" ON public.categories;
  DROP POLICY IF EXISTS "Allow admin inserts of categories" ON public.categories;
  DROP POLICY IF EXISTS "Allow admin updates of all categories" ON public.categories;
  DROP POLICY IF EXISTS "Allow admin deletes of all categories" ON public.categories;

  -- Products policies cleanup
  DROP POLICY IF EXISTS "Allow public read of products" ON public.products;
  DROP POLICY IF EXISTS "Allow creator inserts of products" ON public.products;
  DROP POLICY IF EXISTS "Allow creator updates of own products" ON public.products;
  DROP POLICY IF EXISTS "Allow creator deletes of own products" ON public.products;
  DROP POLICY IF EXISTS "Allow admin inserts of products" ON public.products;
  DROP POLICY IF EXISTS "Allow admin updates of all products" ON public.products;
  DROP POLICY IF EXISTS "Allow admin deletes of all products" ON public.products;
END
$$;

-- =======================================================
-- 1. CATEGORIES RLS POLICIES
-- =======================================================
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

CREATE POLICY "Allow admin inserts of categories" ON public.categories FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Allow admin updates of all categories" ON public.categories FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin deletes of all categories" ON public.categories FOR DELETE USING (public.is_admin());

-- =======================================================
-- 2. PRODUCTS RLS POLICIES
-- =======================================================
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

CREATE POLICY "Allow admin inserts of products" ON public.products FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Allow admin updates of all products" ON public.products FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin deletes of all products" ON public.products FOR DELETE USING (public.is_admin());

-- =======================================================
-- 3. PROFILES RLS POLICIES
-- =======================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow public read of profiles" ON public.profiles;
  DROP POLICY IF EXISTS "Allow user updates of own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Allow user inserts of own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Allow admin updates of all profiles" ON public.profiles;
  DROP POLICY IF EXISTS "Allow admin deletes of all profiles" ON public.profiles;
END
$$;

CREATE POLICY "Allow public read of profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow user updates of own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Allow user inserts of own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Allow admin updates of all profiles" ON public.profiles FOR UPDATE USING (public.is_admin());
CREATE POLICY "Allow admin deletes of all profiles" ON public.profiles FOR DELETE USING (public.is_admin());

-- =======================================================
-- 4. STORAGE BUCKETS & POLICIES SETUP
-- =======================================================

-- Create storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('store-assets', 'store-assets', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Clean up any existing policies to avoid conflicts
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow public read of store assets" ON storage.objects;
  DROP POLICY IF EXISTS "Allow public read of product images" ON storage.objects;
  DROP POLICY IF EXISTS "Allow auth upload of store assets" ON storage.objects;
  DROP POLICY IF EXISTS "Allow auth upload of product images" ON storage.objects;
  DROP POLICY IF EXISTS "Allow auth update of store assets" ON storage.objects;
  DROP POLICY IF EXISTS "Allow auth delete of store assets" ON storage.objects;
  DROP POLICY IF EXISTS "Allow auth update of product images" ON storage.objects;
  DROP POLICY IF EXISTS "Allow auth delete of product images" ON storage.objects;
END
$$;

-- Allow public access to read objects in product-images and store-assets
CREATE POLICY "Allow public read of store assets" ON storage.objects FOR SELECT USING (bucket_id = 'store-assets');
CREATE POLICY "Allow public read of product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');

-- Allow authenticated users to upload objects to product-images and store-assets
CREATE POLICY "Allow auth upload of store assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'store-assets');
CREATE POLICY "Allow auth upload of product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');

-- Allow authenticated users to update/delete their own objects
CREATE POLICY "Allow auth update of store assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'store-assets');
CREATE POLICY "Allow auth delete of store assets" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'store-assets');
CREATE POLICY "Allow auth update of product images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images');
CREATE POLICY "Allow auth delete of product images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images');
