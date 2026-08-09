-- Migration for Phase 13: Creator Profile & Wallet System

-- 1. Extend profiles table with personal and business details
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_image TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_status TEXT CHECK (verification_status IN ('Not Submitted', 'Under Review', 'Verified', 'Rejected')) DEFAULT 'Not Submitted';


-- 2. Create creator_documents table
CREATE TABLE IF NOT EXISTS public.creator_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('Government ID Proof', 'Address Proof', 'Business Registration Document')),
  document_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Not Submitted', 'Under Review', 'Verified', 'Rejected')) DEFAULT 'Under Review',
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (creator_id, document_type)
);


-- 3. Create wallet_transactions table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('Sale Credit', 'Payout Request', 'Payout Completed', 'Refund Adjustment')),
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'rejected')) DEFAULT 'pending',
  reference_id UUID, -- order_id or payout_request_id
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- 4. Enable RLS and setup policies
ALTER TABLE public.creator_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for creator_documents
DROP POLICY IF EXISTS "Allow creators to view their own documents" ON public.creator_documents;
CREATE POLICY "Allow creators to view their own documents" ON public.creator_documents
  FOR SELECT USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Allow creators to upload their own documents" ON public.creator_documents;
CREATE POLICY "Allow creators to upload their own documents" ON public.creator_documents
  FOR INSERT WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "Allow creators to update their own documents" ON public.creator_documents;
CREATE POLICY "Allow creators to update their own documents" ON public.creator_documents
  FOR UPDATE USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Allow admin to view all creator documents" ON public.creator_documents;
CREATE POLICY "Allow admin to view all creator documents" ON public.creator_documents
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Allow admin to update creator documents" ON public.creator_documents;
CREATE POLICY "Allow admin to update creator documents" ON public.creator_documents
  FOR UPDATE USING (public.is_admin());

-- Policies for wallet_transactions
DROP POLICY IF EXISTS "Allow creators to view their own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Allow creators to view their own wallet transactions" ON public.wallet_transactions
  FOR SELECT USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Allow admin to view all wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Allow admin to view all wallet transactions" ON public.wallet_transactions
  FOR SELECT USING (public.is_admin());


-- 5. Create triggers to sync transactions automatically

-- Trigger function on creator_earnings (synced to Sale Credit and Refund Adjustment)
CREATE OR REPLACE FUNCTION public.handle_creator_earnings_transaction_sync()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.wallet_transactions (creator_id, type, amount, status, reference_id, created_at)
    VALUES (NEW.creator_id, 'Sale Credit', NEW.creator_amount, 'completed', NEW.order_id, NEW.created_at);
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.wallet_transactions (creator_id, type, amount, status, reference_id, created_at)
    VALUES (OLD.creator_id, 'Refund Adjustment', -OLD.creator_amount, 'completed', OLD.order_id, now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_earnings_to_transaction_sync ON public.creator_earnings;
CREATE TRIGGER trigger_earnings_to_transaction_sync
  AFTER INSERT OR DELETE ON public.creator_earnings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_creator_earnings_transaction_sync();


-- Trigger function on payout_requests (synced to Payout Request and Payout Completed/Rejected)
CREATE OR REPLACE FUNCTION public.handle_payout_request_transaction_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT: log payout request as pending
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.wallet_transactions (creator_id, type, amount, status, reference_id, created_at)
    VALUES (NEW.creator_id, 'Payout Request', -NEW.amount, 'pending', NEW.id, NEW.requested_at);
  END IF;

  -- On UPDATE: transition status/type on completion or rejection
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'completed' THEN
      UPDATE public.wallet_transactions
      SET type = 'Payout Completed', status = 'completed'
      WHERE reference_id = NEW.id;
    ELSIF NEW.status = 'rejected' THEN
      UPDATE public.wallet_transactions
      SET status = 'rejected'
      WHERE reference_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_payout_request_transaction_sync ON public.payout_requests;
CREATE TRIGGER trigger_payout_request_transaction_sync
  AFTER INSERT OR UPDATE ON public.payout_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_payout_request_transaction_sync();
