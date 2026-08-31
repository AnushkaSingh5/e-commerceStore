import { supabaseClient } from '@/lib/supabase';

export const walletService = {
  /**
   * Authoritative calculation of seller wallet & financial ledger overview.
   * Guarantees that pending withdrawals reserve funds and reduce withdrawable balance.
   */
  getWalletOverview: async (sellerId, storeId) => {
    if (!sellerId) {
      return {
        totalEarnings: 0,
        pendingEarnings: 0,
        availableBalance: 0,
        reservedBalance: 0,
        withdrawableBalance: 0,
        totalPayouts: 0
      };
    }

    // Try SQL RPC first for maximum database atomicity
    if (supabaseClient) {
      try {
        const { data: summary, error: rpcError } = await supabaseClient
          .rpc('get_seller_financial_summary', { p_seller_id: sellerId });

        if (!rpcError && summary) {
          const totalEarn = parseFloat(summary.total_earnings || 0);
          const pendingEarn = parseFloat(summary.pending_earnings || 0);
          const availEarn = parseFloat(summary.available_balance || 0);
          const pendingWith = parseFloat(summary.pending_withdrawals || 0);
          const totalWith = parseFloat(summary.total_withdrawn || 0);
          const withdrawable = Math.max(0, availEarn - pendingWith);

          return {
            totalEarnings: totalEarn,
            pendingEarnings: pendingEarn,
            availableBalance: withdrawable, // Withdrawable balance after subtracting locked withdrawals
            rawAvailableEarnings: availEarn,
            reservedBalance: pendingWith,
            withdrawableBalance: withdrawable,
            totalPayouts: totalWith
          };
        }
      } catch (e) {
        // Fallback to direct tables query
      }
    }

    // Direct table query reconciliation fallback
    try {
      if (!supabaseClient) throw new Error('Supabase client unavailable');

      // 1. Fetch creator earnings
      const { data: earningsData, error: earnError } = await supabaseClient
        .from('creator_earnings')
        .select('creator_amount, status, created_at')
        .eq('creator_id', sellerId);

      if (earnError) throw earnError;

      const earnings = earningsData || [];
      const totalEarnings = earnings.reduce((sum, e) => sum + parseFloat(e.creator_amount || 0), 0);
      const pendingEarnings = earnings.filter(e => e.status === 'pending').reduce((sum, e) => sum + parseFloat(e.creator_amount || 0), 0);
      const rawAvailable = earnings.filter(e => e.status === 'available').reduce((sum, e) => sum + parseFloat(e.creator_amount || 0), 0);

      // 2. Fetch withdrawals
      let reservedBalance = 0;
      let totalWithdrawn = 0;

      const { data: withdrawalsData } = await supabaseClient
        .from('withdrawals')
        .select('amount, status')
        .eq('seller_id', sellerId);

      if (withdrawalsData && withdrawalsData.length > 0) {
        reservedBalance += withdrawalsData
          .filter(w => w.status === 'pending' || w.status === 'processing')
          .reduce((sum, w) => sum + parseFloat(w.amount || 0), 0);
        totalWithdrawn += withdrawalsData
          .filter(w => w.status === 'completed')
          .reduce((sum, w) => sum + parseFloat(w.amount || 0), 0);
      }

      // Check legacy payout_requests
      const { data: legacyPayouts } = await supabaseClient
        .from('payout_requests')
        .select('amount, status')
        .eq('creator_id', sellerId);

      if (legacyPayouts && legacyPayouts.length > 0) {
        reservedBalance += legacyPayouts
          .filter(p => p.status === 'pending' || p.status === 'approved')
          .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        totalWithdrawn += legacyPayouts
          .filter(p => p.status === 'completed')
          .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
      }

      const withdrawableBalance = Math.max(0, rawAvailable - reservedBalance);

      return {
        totalEarnings,
        pendingEarnings,
        availableBalance: withdrawableBalance,
        rawAvailableEarnings: rawAvailable,
        reservedBalance,
        withdrawableBalance,
        totalPayouts: totalWithdrawn
      };
    } catch (err) {
      console.error('❌ [walletService.getWalletOverview] Error:', err);
      return {
        totalEarnings: 0,
        pendingEarnings: 0,
        availableBalance: 0,
        reservedBalance: 0,
        withdrawableBalance: 0,
        totalPayouts: 0
      };
    }
  },

  /**
   * Fetch immutable wallet ledger transactions
   */
  getWalletTransactions: async (sellerId) => {
    if (!supabaseClient || !sellerId) return [];

    try {
      const { data, error } = await supabaseClient
        .from('wallet_transactions')
        .select('*')
        .eq('creator_id', sellerId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('⚠️ [walletService.getWalletTransactions] Notice:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('⚠️ [walletService.getWalletTransactions] Exception:', err.message);
      return [];
    }
  }
};
