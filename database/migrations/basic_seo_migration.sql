-- Add SEO fields to stores
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS og_title TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS og_description TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS canonical_url TEXT;

-- Add slug and SEO fields to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS og_title TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS og_description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS canonical_url TEXT;

-- PL/pgSQL block to backfill unique slugs for existing products per store_id
DO $$
DECLARE
    r RECORD;
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER;
BEGIN
    FOR r IN SELECT id, store_id, name FROM public.products WHERE slug IS NULL LOOP
        base_slug := lower(regexp_replace(r.name, '[^a-zA-Z0-9]+', '-', 'g'));
        base_slug := trim(both '-' from base_slug);
        IF base_slug = '' THEN
            base_slug := 'product';
        END IF;
        
        final_slug := base_slug;
        counter := 1;
        
        WHILE EXISTS (SELECT 1 FROM public.products WHERE store_id = r.store_id AND slug = final_slug AND id <> r.id) LOOP
            final_slug := base_slug || '-' || counter;
            counter := counter + 1;
        END LOOP;
        
        UPDATE public.products SET slug = final_slug WHERE id = r.id;
    END LOOP;
END $$;

-- Set product slug to NOT NULL and add store_id + slug unique constraint
ALTER TABLE public.products ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.products ADD CONSTRAINT products_store_id_slug_key UNIQUE (store_id, slug);
