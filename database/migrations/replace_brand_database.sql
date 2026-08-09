-- 1. Update stores name, description, and slug
UPDATE public.stores
SET name = REPLACE(name, 'LaunchCart', 'Kreatorstore'),
    description = REPLACE(description, 'LaunchCart', 'Kreatorstore'),
    slug = REPLACE(slug, 'launchcart', 'kreatorstore');

-- 2. Update sellers name, bio, and business_name
UPDATE public.sellers
SET name = REPLACE(name, 'LaunchCart', 'Kreatorstore'),
    bio = REPLACE(bio, 'LaunchCart', 'Kreatorstore'),
    business_name = REPLACE(business_name, 'LaunchCart', 'Kreatorstore');

-- 3. Update products name and description
UPDATE public.products
SET name = REPLACE(name, 'LaunchCart', 'Kreatorstore'),
    description = REPLACE(description, 'LaunchCart', 'Kreatorstore');

-- 4. Update categories name and description
UPDATE public.categories
SET name = REPLACE(name, 'LaunchCart', 'Kreatorstore'),
    description = REPLACE(description, 'LaunchCart', 'Kreatorstore');

-- 5. Reload schema cache
NOTIFY pgrst, 'reload schema';
