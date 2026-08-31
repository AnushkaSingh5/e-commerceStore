import { supabaseClient } from '@/lib/supabase';

export const bankAccountService = {
  /**
   * Validate Indian IFSC code format (e.g. HDFC0000123)
   */
  isValidIFSC: (ifsc) => {
    if (!ifsc || typeof ifsc !== 'string') return false;
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    return ifscRegex.test(ifsc.trim().toUpperCase());
  },

  /**
   * Generate masked account number (e.g. "•••• •••• 1234")
   */
  maskAccountNumber: (accountNumber) => {
    if (!accountNumber || typeof accountNumber !== 'string') return '••••';
    const clean = accountNumber.replace(/\s+/g, '');
    if (clean.length <= 4) return `•••• ${clean}`;
    const last4 = clean.slice(-4);
    return `•••• •••• ${last4}`;
  },

  /**
   * Fetch all saved bank accounts for a seller
   */
  getBankAccounts: async (sellerId) => {
    if (!supabaseClient || !sellerId) return [];

    try {
      const { data, error } = await supabaseClient
        .from('seller_bank_accounts')
        .select('id, seller_id, account_holder_name, bank_name, account_number_masked, ifsc_code, account_type, is_default, created_at')
        .eq('seller_id', sellerId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('⚠️ [bankAccountService.getBankAccounts] Notice:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('⚠️ [bankAccountService.getBankAccounts] Exception:', err.message);
      return [];
    }
  },

  /**
   * Fetch default bank account for a seller
   */
  getDefaultBankAccount: async (sellerId) => {
    if (!supabaseClient || !sellerId) return null;

    try {
      const { data, error } = await supabaseClient
        .from('seller_bank_accounts')
        .select('*')
        .eq('seller_id', sellerId)
        .order('is_default', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('⚠️ [bankAccountService.getDefaultBankAccount] Notice:', error.message);
        return null;
      }
      return data || null;
    } catch (err) {
      console.warn('⚠️ [bankAccountService.getDefaultBankAccount] Exception:', err.message);
      return null;
    }
  },

  /**
   * Save a new bank account for a seller
   */
  addBankAccount: async (sellerId, payload) => {
    if (!supabaseClient || !sellerId) {
      return { success: false, error: 'Database client or seller ID unavailable.' };
    }

    const { accountHolderName, bankName, accountNumber, confirmAccountNumber, ifscCode, accountType = 'SAVINGS' } = payload;

    // Validation
    if (!accountHolderName?.trim()) {
      return { success: false, error: 'Account holder name is required.' };
    }
    if (!bankName?.trim()) {
      return { success: false, error: 'Bank name is required.' };
    }
    if (!accountNumber?.trim()) {
      return { success: false, error: 'Account number is required.' };
    }
    const cleanAccount = accountNumber.replace(/\s+/g, '');
    const cleanConfirm = (confirmAccountNumber || '').replace(/\s+/g, '');
    if (cleanAccount.length < 8 || cleanAccount.length > 20) {
      return { success: false, error: 'Account number must be between 8 and 20 digits.' };
    }
    if (cleanConfirm && cleanAccount !== cleanConfirm) {
      return { success: false, error: 'Account numbers do not match.' };
    }
    const cleanIFSC = (ifscCode || '').trim().toUpperCase();
    if (!bankAccountService.isValidIFSC(cleanIFSC)) {
      return { success: false, error: 'Invalid IFSC code format (e.g. HDFC0000123).' };
    }

    const masked = bankAccountService.maskAccountNumber(cleanAccount);

    try {
      // Check existing accounts
      const { data: existingAccounts } = await supabaseClient
        .from('seller_bank_accounts')
        .select('id')
        .eq('seller_id', sellerId);

      const isFirst = !existingAccounts || existingAccounts.length === 0;

      const { data, error } = await supabaseClient
        .from('seller_bank_accounts')
        .insert([{
          seller_id: sellerId,
          account_holder_name: accountHolderName.trim(),
          bank_name: bankName.trim(),
          account_number_masked: masked,
          account_number_encrypted: cleanAccount, // In production, pass through encryption helper
          ifsc_code: cleanIFSC,
          account_type: accountType,
          is_default: isFirst
        }])
        .select()
        .single();

      if (error) {
        throw error;
      }

      return { success: true, bankAccount: data };
    } catch (err) {
      console.error('❌ [bankAccountService.addBankAccount] Error:', err);
      return { success: false, error: err.message || 'Failed to save bank account.' };
    }
  },

  /**
   * Delete a bank account
   */
  deleteBankAccount: async (sellerId, bankAccountId) => {
    if (!supabaseClient || !sellerId || !bankAccountId) {
      return { success: false, error: 'Missing parameters.' };
    }

    try {
      const { error } = await supabaseClient
        .from('seller_bank_accounts')
        .delete()
        .eq('id', bankAccountId)
        .eq('seller_id', sellerId);

      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to delete bank account.' };
    }
  }
};
