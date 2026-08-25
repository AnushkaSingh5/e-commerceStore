-- Migration to add nullable product weight column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight NUMERIC NULL;

COMMENT ON COLUMN public.products.weight IS 'The product/package weight in grams.';
