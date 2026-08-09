-- Migration for Phase 11: Store Approval System

-- 1. Alter stores status column default to 'pending'
ALTER TABLE public.stores ALTER COLUMN status SET DEFAULT 'pending';

-- 2. Add status_reason column to public.stores
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS status_reason TEXT;

-- 3. Create store status audit log table
CREATE TABLE IF NOT EXISTS public.store_status_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  admin_id UUID, -- Can be NULL or refer to admin_users.id (stored as UUID)
  previous_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on audit logs
ALTER TABLE public.store_status_audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to allow safe re-runs)
DROP POLICY IF EXISTS "Allow creators to view their own store audit logs" ON public.store_status_audit_logs;
DROP POLICY IF EXISTS "Allow admin to view all audit logs" ON public.store_status_audit_logs;
DROP POLICY IF EXISTS "Allow admin to insert audit logs" ON public.store_status_audit_logs;

-- Policies for store status audit logs
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


-- 4. Replace Admin security-definer RPC functions to support status reason & log transitions

-- Drop legacy functions
DROP FUNCTION IF EXISTS public.admin_get_stores(TEXT);
DROP FUNCTION IF EXISTS public.admin_approve_store(TEXT, UUID);
DROP FUNCTION IF EXISTS public.admin_reject_store(TEXT, UUID);
DROP FUNCTION IF EXISTS public.admin_reject_store(TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.admin_disable_store(TEXT, UUID);
DROP FUNCTION IF EXISTS public.admin_disable_store(TEXT, UUID, TEXT);

-- Updated admin_approve_store
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

-- Updated admin_reject_store (accepts p_reason)
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

-- Updated admin_disable_store (accepts p_reason)
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


-- 5. Updated admin_get_stores function to include status_reason
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

