-- Migration: Add is_deleted column to products table to support soft-deletion
-- This enables customer carts to detect deleted items and show unavailability warnings.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
