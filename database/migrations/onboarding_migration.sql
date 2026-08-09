-- Database migration to add onboarding fields to public.profiles table.
-- Run this in your Supabase SQL Editor.

-- 1. Add onboarding columns if they don't already exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0;
