-- 1. Delete stores where creator_id doesn't match any seller in sellers table
DELETE FROM public.stores 
WHERE creator_id NOT IN (SELECT id FROM public.sellers);

-- 2. Delete sellers where id doesn't match any profile in profiles_base
DELETE FROM public.sellers 
WHERE id NOT IN (SELECT id FROM public.profiles_base);

-- 3. Delete profiles where id doesn't match any user in auth.users
DELETE FROM public.profiles_base 
WHERE id NOT IN (SELECT id FROM auth.users);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
