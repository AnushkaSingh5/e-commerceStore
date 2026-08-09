-- Migration: Add sort_order column to categories table to support custom sorting
-- This allows sellers to arrange categories in custom orders.

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
