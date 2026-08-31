import { supabaseClient } from '@/lib/supabase';
import { walletService } from './walletService';
import { PayoutFactory } from './payout/PayoutFactory';

export const payoutService = {
  /**
   * Fetch earnings overview directly from authoritative wallet ledger
   */
  getCreatorEarningsSummary: async (creatorId, storeId) => {
    const overview = await walletService.getWalletOverview(creatorId, storeId);
    
    // Count lifetime orders
    let orderCount = 0;
    if (supabaseClient && creatorId) {
      const { count } = await supabaseClient
        .from('creator_earnings')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', creatorId);
      orderCount = count || 0;
    }

    return {
      totalEarnings: overview.totalEarnings,
      pendingEarnings: overview.pendingEarnings,
      availableEarnings: overview.withdrawableBalance, // Strict withdrawable balance
      rawAvailableEarnings: overview.rawAvailableEarnings,
      reservedBalance: overview.reservedBalance,
      totalPayouts: overview.totalPayouts,
      lifetimeOrders: orderCount
    };
  },

  /**
   * Fetch detailed list of order earnings
   */
  getCreatorEarningsList: async (creatorId, storeId) => {
    if (!supabaseClient || !creatorId) return [];

    try {
      const { data, error } = await supabaseClient
        .from('creator_earnings')
        .select('id, order_id, order_amount, creator_amount, status, created_at')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('⚠️ [payoutService.getCreatorEarningsList] Notice:', error.message);
        return [];
      }
      return (data || []).map(e => ({
        id: e.id,
        orderId: e.order_id,
        date: e.created_at ? e.created_at.split('T')[0] : 'N/A',
        orderAmount: parseFloat(e.order_amount || 0),
        creatorAmount: parseFloat(e.creator_amount || 0),
        status: e.status
      }));
    } catch (err) {
      console.warn('⚠️ [payoutService.getCreatorEarningsList] Exception:', err.message);
      return [];
    }
  },

  /**
   * Fetch withdrawal requests for a seller
   */
  getPayoutRequests: async (creatorId) => {
    if (!supabaseClient || !creatorId) return [];

    try {
      // 1. Fetch from new withdrawals table
      const { data: withdrawals, error } = await supabaseClient
        .from('withdrawals')
        .select('*, bank_account:bank_account_id(*)')
        .eq('seller_id', creatorId)
        .order('requested_at', { ascending: false });

      if (!error && withdrawals && withdrawals.length > 0) {
        return withdrawals.map(w => ({
          id: w.id,
          withdrawalNumber: w.withdrawal_number,
          amount: parseFloat(w.amount),
          fee: parseFloat(w.fee || 0),
          netAmount: parseFloat(w.net_amount || w.amount),
          method: 'Bank Transfer',
          bankName: w.bank_account?.bank_name || 'Bank Account',
          accountDetails: w.bank_account ? `${w.bank_account.bank_name} (${w.bank_account.account_number_masked})` : 'Bank Transfer',
          status: w.status,
          adminNotes: w.admin_notes || w.failure_reason || w.rejection_reason,
          requestedAt: w.requested_at ? w.requested_at.split('T')[0] : 'N/A',
          processedAt: w.processed_at ? w.processed_at.split('T')[0] : null
        }));
      }

      // Fallback to legacy payout_requests
      const { data: legacy } = await supabaseClient
        .from('payout_requests')
        .select('*')
        .eq('creator_id', creatorId)
        .order('requested_at', { ascending: false });

      return (legacy || []).map(r => ({
        id: r.id,
        withdrawalNumber: r.id.substring(0, 8).toUpperCase(),
        amount: parseFloat(r.amount),
        fee: 0,
        netAmount: parseFloat(r.amount),
        method: r.payout_method,
        bankName: r.payout_method,
        accountDetails: r.account_details,
        status: r.status,
        adminNotes: r.admin_notes,
        requestedAt: r.requested_at ? r.requested_at.split('T')[0] : 'N/A',
        processedAt: r.processed_at ? r.processed_at.split('T')[0] : null
      }));
    } catch (err) {
      console.warn('⚠️ [payoutService.getPayoutRequests] Exception:', err.message);
      return [];
    }
  },

  /**
   * Submit a new withdrawal request with atomic balance reservation
   */
  createPayoutRequest: async (creatorId, storeId, bankAccountId, amount, fee = 0) => {
    const reqAmount = parseFloat(amount);
    if (isNaN(reqAmount) || reqAmount <= 0) {
      return { success: false, error: 'Invalid payout amount.' };
    }

    const minPayout = 500.00;
    if (reqAmount < minPayout) {
      return { success: false, error: `Minimum withdrawal amount is ₹${minPayout}.` };
    }

    if (!bankAccountId) {
      return { success: false, error: 'Please select or add a bank account first.' };
    }

    // Try atomic SQL function first
    if (supabaseClient) {
      try {
        const { data: rpcResult, error: rpcError } = await supabaseClient.rpc('create_seller_withdrawal_locked', {
          p_seller_id: creatorId,
          p_store_id: storeId,
          p_bank_account_id: bankAccountId,
          p_amount: reqAmount,
          p_fee: fee
        });

        if (!rpcError && rpcResult) {
          if (rpcResult.success) {
            return { success: true, withdrawal: rpcResult.withdrawal };
          } else {
            return { success: false, error: rpcResult.error };
          }
        }
      } catch (e) {
        // Fallback to manual check & insert
      }
    }

    // Fallback reservation logic
    try {
      const summary = await walletService.getWalletOverview(creatorId, storeId);
      if (reqAmount > summary.withdrawableBalance) {
        return {
          success: false,
          error: `Insufficient withdrawable balance. You have ₹${summary.withdrawableBalance.toLocaleString()} available.`
        };
      }

      const withdrawalNumber = 'WD' + Date.now().toString().slice(-8);
      const netAmount = reqAmount - fee;

      const { data: withdrawal, error } = await supabaseClient
        .from('withdrawals')
        .insert([{
          withdrawal_number: withdrawalNumber,
          seller_id: creatorId,
          store_id: storeId,
          bank_account_id: bankAccountId,
          amount: reqAmount,
          fee: fee,
          net_amount: netAmount,
          status: 'pending'
        }])
        .select()
        .single();

      if (error) throw error;

      // Log in wallet_transactions
      await supabaseClient
        .from('wallet_transactions')
        .insert([{
          creator_id: creatorId,
          type: 'Payout Request',
          amount: -reqAmount,
          status: 'pending',
          reference_id: withdrawal.id
        }]);

      return { success: true, withdrawal };
    } catch (err) {
      console.error('❌ [payoutService.createPayoutRequest] Error:', err);
      return { success: false, error: err.message || 'Failed to submit withdrawal request.' };
    }
  },

  /**
   * Fetch all payout requests for platform admin moderation
   */
  adminGetPayoutRequests: async () => {
    if (!supabaseClient) return [];

    try {
      // 1. Fetch from withdrawals
      const { data: withdrawals, error } = await supabaseClient
        .from('withdrawals')
        .select(`
          *,
          bank_account:bank_account_id(*),
          seller:seller_id(name, phone),
          store:store_id(name, slug)
        `)
        .order('requested_at', { ascending: false });

      if (!error && withdrawals && withdrawals.length > 0) {
        return withdrawals.map(w => ({
          id: w.id,
          withdrawalNumber: w.withdrawal_number,
          creatorId: w.seller_id,
          creatorName: w.seller?.name || 'Seller',
          storeName: w.store?.name || 'Store',
          storeSlug: w.store?.slug || '',
          amount: parseFloat(w.amount),
          fee: parseFloat(w.fee || 0),
          netAmount: parseFloat(w.net_amount || w.amount),
          method: 'Bank Transfer',
          bankName: w.bank_account?.bank_name || 'Bank',
          accountHolder: w.bank_account?.account_holder_name || 'N/A',
          accountDetails: w.bank_account ? `${w.bank_account.bank_name} (${w.bank_account.account_number_masked})` : 'Bank Transfer',
          ifsc: w.bank_account?.ifsc_code || 'N/A',
          status: w.status,
          adminNotes: w.admin_notes,
          failureReason: w.failure_reason,
          rejectionReason: w.rejection_reason,
          payoutProvider: w.payout_provider || 'MOCK',
          providerRefId: w.payout_reference_id,
          requestedAt: w.requested_at ? w.requested_at.split('T')[0] : 'N/A',
          processedAt: w.processed_at ? w.processed_at.split('T')[0] : null
        }));
      }

      // Fallback to legacy payout_requests
      const { data: legacy } = await supabaseClient
        .from('payout_requests')
        .select('*, creator:creator_id(name)')
        .order('requested_at', { ascending: false });

      return (legacy || []).map(r => ({
        id: r.id,
        withdrawalNumber: r.id.substring(0, 8).toUpperCase(),
        creatorId: r.creator_id,
        creatorName: r.creator?.name || 'Seller',
        storeName: 'Store',
        amount: parseFloat(r.amount),
        fee: 0,
        netAmount: parseFloat(r.amount),
        method: r.payout_method,
        bankName: r.payout_method,
        accountHolder: 'N/A',
        accountDetails: r.account_details,
        ifsc: 'N/A',
        status: r.status,
        adminNotes: r.admin_notes,
        requestedAt: r.requested_at ? r.requested_at.split('T')[0] : 'N/A',
        processedAt: r.processed_at ? r.processed_at.split('T')[0] : null
      }));
    } catch (err) {
      console.error('❌ [payoutService.adminGetPayoutRequests] Error:', err);
      return [];
    }
  },

  /**
   * Admin actions: Approve, Process Payout Transfer, Reject, or Mark Complete
   */
  adminUpdatePayoutStatus: async (withdrawalId, targetStatus, notes = '', rejectionReason = '') => {
    if (!supabaseClient || !withdrawalId) {
      return { success: false, error: 'Missing parameters.' };
    }

    try {
      // If completing or approving with provider payout
      if (targetStatus === 'processing' || targetStatus === 'approved') {
        const provider = PayoutFactory.getProvider();

        // Fetch withdrawal & bank details
        const { data: withdrawal } = await supabaseClient
          .from('withdrawals')
          .select('*, bank_account:bank_account_id(*)')
          .eq('id', withdrawalId)
          .single();

        if (withdrawal && withdrawal.bank_account) {
          const transferRes = await provider.createTransfer({
            withdrawalId: withdrawal.id,
            withdrawalNumber: withdrawal.withdrawal_number,
            amount: parseFloat(withdrawal.net_amount || withdrawal.amount),
            bankAccount: withdrawal.bank_account
          });

          if (transferRes.success) {
            // Update withdrawal with provider reference
            await supabaseClient
              .from('withdrawals')
              .update({
                status: 'processing',
                payout_provider: provider.name,
                payout_reference_id: transferRes.providerRefId,
                admin_notes: notes || transferRes.message,
                processed_at: new Date().toISOString()
              })
              .eq('id', withdrawalId);

            return { success: true, status: 'processing', providerRefId: transferRes.providerRefId };
          }
        }
      }

      // Complete via atomic RPC
      if (targetStatus === 'completed') {
        const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc('process_withdrawal_status_atomic', {
          p_withdrawal_id: withdrawalId,
          p_new_status: 'completed',
          p_admin_notes: notes
        });

        if (!rpcErr && rpcRes && rpcRes.success) {
          return { success: true, status: 'completed' };
        }
      }

      // Reject via atomic RPC
      if (targetStatus === 'rejected') {
        const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc('process_withdrawal_status_atomic', {
          p_withdrawal_id: withdrawalId,
          p_new_status: 'rejected',
          p_admin_notes: notes,
          p_rejection_reason: rejectionReason
        });

        if (!rpcErr && rpcRes && rpcRes.success) {
          return { success: true, status: 'rejected' };
        }
      }

      // Direct status fallback
      await supabaseClient
        .from('withdrawals')
        .update({
          status: targetStatus,
          admin_notes: notes,
          rejection_reason: rejectionReason,
          processed_at: new Date().toISOString(),
          completed_at: targetStatus === 'completed' ? new Date().toISOString() : null
        })
        .eq('id', withdrawalId);

      // Sync wallet_transactions
      await supabaseClient
        .from('wallet_transactions')
        .update({
          status: targetStatus,
          type: targetStatus === 'completed' ? 'Payout Completed' : 'Payout Request'
        })
        .eq('reference_id', withdrawalId);

      return { success: true };
    } catch (err) {
      console.error('❌ [payoutService.adminUpdatePayoutStatus] Error:', err);
      return { success: false, error: err.message || 'Failed to update withdrawal status.' };
    }
  }
};

export default payoutService;
