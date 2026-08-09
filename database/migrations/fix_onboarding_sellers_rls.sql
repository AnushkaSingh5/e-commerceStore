-- Migration to fix Row Level Security (RLS) issues during store creation / onboarding.
-- This script marks the `handle_profiles_view_update` trigger function as `SECURITY DEFINER`
-- to bypass RLS restrictions when modifying view rows, and ensures the necessary INSERT policies
-- are in place for the `sellers` table.

-- 1. Recreate the trigger function with SECURITY DEFINER
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Ensure INSERT policies exist on the sellers table so that direct insertions are also permitted
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow user inserts of own seller profile" ON public.sellers;
END $$;

CREATE POLICY "Allow user inserts of own seller profile" 
  ON public.sellers 
  FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- 3. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
