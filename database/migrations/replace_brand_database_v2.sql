-- 1. Update stores name, description, and slug
UPDATE public.stores
SET name = REPLACE(REPLACE(name, 'KreateStore', 'Kreatorstore'), 'Kreate Store', 'Kreator Store'),
    description = REPLACE(REPLACE(description, 'KreateStore', 'Kreatorstore'), 'Kreate Store', 'Kreator Store'),
    slug = REPLACE(slug, 'kreatestore', 'kreatorstore');

-- 2. Update sellers name, bio, and business_name
UPDATE public.sellers
SET name = REPLACE(REPLACE(name, 'KreateStore', 'Kreatorstore'), 'Kreate Store', 'Kreator Store'),
    bio = REPLACE(REPLACE(bio, 'KreateStore', 'Kreatorstore'), 'Kreate Store', 'Kreator Store'),
    business_name = REPLACE(REPLACE(business_name, 'KreateStore', 'Kreatorstore'), 'Kreate Store', 'Kreator Store');

-- 3. Update products name and description
UPDATE public.products
SET name = REPLACE(REPLACE(name, 'KreateStore', 'Kreatorstore'), 'Kreate Store', 'Kreator Store'),
    description = REPLACE(REPLACE(description, 'KreateStore', 'Kreatorstore'), 'Kreate Store', 'Kreator Store');

-- 4. Update categories name and description
UPDATE public.categories
SET name = REPLACE(REPLACE(name, 'KreateStore', 'Kreatorstore'), 'Kreate Store', 'Kreator Store'),
    description = REPLACE(REPLACE(description, 'KreateStore', 'Kreatorstore'), 'Kreate Store', 'Kreator Store');

-- 5. Reload schema cache
NOTIFY pgrst, 'reload schema';
