-- 1. Re-create trigger function to automatically create profiles for new users with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  metadata_name TEXT;
  metadata_role TEXT;
BEGIN
  metadata_name := COALESCE(NEW.raw_user_meta_data->>'name', 'New Creator');
  metadata_role := COALESCE(NEW.raw_user_meta_data->>'role', 'creator');

  -- Insert into profiles_base
  INSERT INTO public.profiles_base (id, email, role)
  VALUES (NEW.id, NEW.email, metadata_role)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = COALESCE(profiles_base.role, EXCLUDED.role);

  -- Insert into sellers if role is creator
  IF metadata_role = 'creator' THEN
    INSERT INTO public.sellers (id, name, onboarding_completed, onboarding_step)
    VALUES (NEW.id, metadata_name, false, 1)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Ensure trigger is attached to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Backfill any missing profiles and sellers for existing auth users
INSERT INTO public.profiles_base (id, email, role)
SELECT 
  id, 
  email, 
  COALESCE(raw_user_meta_data->>'role', 'creator') as role
FROM auth.users
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sellers (id, name, onboarding_completed, onboarding_step)
SELECT 
  u.id, 
  COALESCE(u.raw_user_meta_data->>'name', 'New Creator') as name,
  false as onboarding_completed,
  1 as onboarding_step
FROM auth.users u
JOIN public.profiles_base p ON u.id = p.id
WHERE p.role = 'creator'
ON CONFLICT (id) DO NOTHING;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
