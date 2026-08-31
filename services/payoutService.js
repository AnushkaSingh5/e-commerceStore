import { supabaseClient } from '@/lib/supabase';
import { walletService } from './walletService';
import { PayoutFactory } from './payout/PayoutFactory';

export const payoutService = {
  /**
   * Fetch earnings overview directly from authoritative wallet ledger
   */
  getCreatorEarningsSummary: async (creatorId, storeId) => {
    const overview = await walletService.getWalletOverview(creatorId, storeId);
    
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
      availableEarnings: overview.withdrawableBalance,
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
      const { data: withdrawals, error } = await supabaseClient
        .from('withdrawals')
        .select('*, bank_account:bank_account_id(*)')
        .eq('seller_id', creatorId)
        .order('requested_at', { ascending: false });

      let results = [];
      if (!error && withdrawals && withdrawals.length > 0) {
        results = withdrawals.map(w => ({
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

      // Legacy fallback
      const { data: legacy } = await supabaseClient
        .from('payout_requests')
        .select('*')
        .eq('creator_id', creatorId)
        .order('requested_at', { ascending: false });

      const legacyResults = (legacy || []).map(r => ({
        id: r.id,
        withdrawalNumber: r.id.substring(0, 8).toUpperCase(),
        amount: parseFloat(r.amount),
        fee: 0,
        netAmount: parseFloat(r.amount),
        method: r.payout_method || 'Bank Transfer',
        bankName: r.payout_method || 'Bank Transfer',
        accountDetails: r.account_details || 'Bank Account',
        status: r.status,
        adminNotes: r.admin_notes,
        requestedAt: r.requested_at ? r.requested_at.split('T')[0] : 'N/A',
        processedAt: r.processed_at ? r.processed_at.split('T')[0] : null
      }));

      // Combine and return unique by ID
      const all = [...results, ...legacyResults.filter(l => !results.some(r => r.id === l.id))];
      return all;
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
        // Fallback
      }
    }

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
   * Fetch all creator earnings across platform (for admin calculations)
   */
  adminGetAllEarnings: async () => {
    if (!supabaseClient) return [];
    try {
      const { data, error } = await supabaseClient
        .from('creator_earnings')
        .select('creator_amount, status, created_at');
      if (error) return [];
      return data || [];
    } catch (e) {
      return [];
    }
  },

  /**
   * Fetch comprehensive Admin Payouts list with metrics, search, filtering, and pagination
   */
  adminGetPayoutRequests: async (options = {}) => {
    if (!supabaseClient) {
      return {
        payouts: [],
        totalCount: 0,
        stats: { platformRevenue: 0, totalSettled: 0, pendingRequests: 0, outstandingAvailable: 0 }
      };
    }

    const { page = 1, limit = 25, status = 'All', search = '' } = options;

    try {
      // 1. Calculate Authoritative Platform Metrics
      const [earningsRes, withdrawalsRes, legacyRes] = await Promise.all([
        supabaseClient.from('creator_earnings').select('creator_amount, status, created_at'),
        supabaseClient.from('withdrawals').select(`
          *,
          bank_account:bank_account_id(id, account_holder_name, bank_name, account_number_masked, ifsc_code, account_type),
          seller:seller_id(id, name, phone),
          store:store_id(id, name, slug)
        `),
        supabaseClient.from('payout_requests').select('*, seller:creator_id(id, name, phone)')
      ]);

      const allEarnings = earningsRes.data || [];
      const allWithdrawals = withdrawalsRes.data || [];
      const allLegacy = legacyRes.data || [];

      // Total creator revenue generated from valid sales
      const platformRevenue = allEarnings.reduce((sum, e) => sum + parseFloat(e.creator_amount || 0), 0);

      // Total settled (completed payouts)
      const totalSettledWithdrawals = allWithdrawals
        .filter(w => w.status === 'completed')
        .reduce((sum, w) => sum + parseFloat(w.amount || 0), 0);
      const totalSettledLegacy = allLegacy
        .filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
      const totalSettled = totalSettledWithdrawals + totalSettledLegacy;

      // Pending payout requests count (in pending, approved, processing)
      const pendingCountWithdrawals = allWithdrawals.filter(w => ['pending', 'approved', 'processing'].includes(w.status)).length;
      const pendingCountLegacy = allLegacy.filter(p => ['pending', 'approved'].includes(p.status)).length;
      const pendingRequests = pendingCountWithdrawals + pendingCountLegacy;

      // Total reserved balance
      const totalReserved = allWithdrawals
        .filter(w => ['pending', 'approved', 'processing'].includes(w.status))
        .reduce((sum, w) => sum + parseFloat(w.amount || 0), 0) +
        allLegacy
          .filter(p => ['pending', 'approved'].includes(p.status))
          .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      // Available unwithdrawn earnings
      const totalAvailableRaw = allEarnings
        .filter(e => e.status === 'available')
        .reduce((sum, e) => sum + parseFloat(e.creator_amount || 0), 0);

      // Outstanding Available Balance = Raw Available minus Reserved
      const outstandingAvailable = Math.max(0, totalAvailableRaw - totalReserved);

      // 2. Format All Withdrawals & Legacy Requests into Unified List
      const formattedWithdrawals = allWithdrawals.map(w => ({
        id: w.id,
        withdrawalNumber: w.withdrawal_number,
        sellerId: w.seller_id,
        sellerName: w.seller?.name || 'Seller',
        sellerPhone: w.seller?.phone || 'N/A',
        storeName: w.store?.name || 'Store',
        storeSlug: w.store?.slug || '',
        amount: parseFloat(w.amount),
        fee: parseFloat(w.fee || 0),
        netAmount: parseFloat(w.net_amount || w.amount),
        method: 'Bank Transfer',
        bankName: w.bank_account?.bank_name || 'Bank',
        accountHolder: w.bank_account?.account_holder_name || w.seller?.name || 'N/A',
        accountNumberMasked: w.bank_account?.account_number_masked || '••••',
        accountDetails: w.bank_account ? `${w.bank_account.bank_name} (${w.bank_account.account_number_masked})` : 'Bank Transfer',
        ifsc: w.bank_account?.ifsc_code || 'N/A',
        accountType: w.bank_account?.account_type || 'SAVINGS',
        status: w.status || 'pending',
        adminNotes: w.admin_notes,
        failureReason: w.failure_reason,
        rejectionReason: w.rejection_reason,
        payoutProvider: w.payout_provider || 'MOCK',
        providerRefId: w.payout_reference_id,
        requestedAt: w.requested_at ? new Date(w.requested_at).toLocaleString() : 'N/A',
        requestedAtRaw: w.requested_at ? new Date(w.requested_at).getTime() : 0,
        processedAt: w.processed_at ? new Date(w.processed_at).toLocaleString() : null,
        completedAt: w.completed_at ? new Date(w.completed_at).toLocaleString() : null,
        isLegacy: false
      }));

      const formattedLegacy = allLegacy.map(p => ({
        id: p.id,
        withdrawalNumber: p.id.substring(0, 8).toUpperCase(),
        sellerId: p.creator_id,
        sellerName: p.seller?.name || 'Seller',
        sellerPhone: p.seller?.phone || 'N/A',
        storeName: 'Store',
        storeSlug: '',
        amount: parseFloat(p.amount),
        fee: 0,
        netAmount: parseFloat(p.amount),
        method: p.payout_method || 'Bank Transfer',
        bankName: p.payout_method || 'Bank Account',
        accountHolder: p.seller?.name || 'N/A',
        accountNumberMasked: p.account_details || '••••',
        accountDetails: p.account_details || p.payout_method || 'Bank Transfer',
        ifsc: 'N/A',
        accountType: 'SAVINGS',
        status: p.status || 'pending',
        adminNotes: p.admin_notes,
        failureReason: null,
        rejectionReason: null,
        payoutProvider: 'MOCK',
        providerRefId: p.id.substring(0, 8).toUpperCase(),
        requestedAt: p.requested_at ? new Date(p.requested_at).toLocaleString() : 'N/A',
        requestedAtRaw: p.requested_at ? new Date(p.requested_at).getTime() : 0,
        processedAt: p.processed_at ? new Date(p.processed_at).toLocaleString() : null,
        completedAt: p.status === 'completed' && p.processed_at ? new Date(p.processed_at).toLocaleString() : null,
        isLegacy: true
      }));

      // Combine unified requests, avoiding ID duplicates
      let allCombined = [
        ...formattedWithdrawals,
        ...formattedLegacy.filter(l => !formattedWithdrawals.some(w => w.id === l.id))
      ];

      // Sort by newest requested_at first
      allCombined.sort((a, b) => b.requestedAtRaw - a.requestedAtRaw);

      // Status Filtering
      if (status && status !== 'All') {
        allCombined = allCombined.filter(r => r.status.toLowerCase() === status.toLowerCase());
      }

      // Search filtering
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        allCombined = allCombined.filter(r =>
          (r.withdrawalNumber || '').toLowerCase().includes(q) ||
          (r.sellerName || '').toLowerCase().includes(q) ||
          (r.storeName || '').toLowerCase().includes(q) ||
          (r.providerRefId || '').toLowerCase().includes(q) ||
          (r.accountHolder || '').toLowerCase().includes(q) ||
          (r.accountDetails || '').toLowerCase().includes(q)
        );
      }

      // Pagination
      const totalCount = allCombined.length;
      const from = (page - 1) * limit;
      const paginated = allCombined.slice(from, from + limit);

      return {
        payouts: paginated,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
        currentPage: page,
        stats: {
          platformRevenue,
          totalSettled,
          pendingRequests,
          outstandingAvailable
        }
      };
    } catch (err) {
      console.error('❌ [payoutService.adminGetPayoutRequests] Error:', err);
      return {
        payouts: [],
        totalCount: 0,
        totalPages: 1,
        currentPage: 1,
        stats: { platformRevenue: 0, totalSettled: 0, pendingRequests: 0, outstandingAvailable: 0 }
      };
    }
  },

  /**
   * Fetch complete payout drawer details including financial impact, timeline & audit log
   */
  adminGetPayoutDetails: async (withdrawalId) => {
    if (!supabaseClient || !withdrawalId) return null;

    try {
      // 1. Check withdrawals table
      const { data: w } = await supabaseClient
        .from('withdrawals')
        .select(`
          *,
          bank_account:bank_account_id(*),
          seller:seller_id(id, name, phone),
          store:store_id(id, name, slug)
        `)
        .eq('id', withdrawalId)
        .maybeSingle();

      let targetRecord = null;
      let isLegacy = false;

      if (w) {
        targetRecord = w;
      } else {
        // Check legacy payout_requests
        const { data: leg } = await supabaseClient
          .from('payout_requests')
          .select('*, seller:creator_id(id, name, phone)')
          .eq('id', withdrawalId)
          .maybeSingle();

        if (leg) {
          targetRecord = {
            id: leg.id,
            withdrawal_number: leg.id.substring(0, 8).toUpperCase(),
            seller_id: leg.creator_id,
            seller: leg.seller,
            store_id: null,
            store: { name: 'Store', slug: '' },
            amount: leg.amount,
            fee: 0,
            net_amount: leg.amount,
            status: leg.status,
            bank_account: null,
            payout_provider: 'MOCK',
            payout_reference_id: leg.id.substring(0, 8).toUpperCase(),
            admin_notes: leg.admin_notes,
            rejection_reason: null,
            failure_reason: null,
            requested_at: leg.requested_at,
            processed_at: leg.processed_at,
            completed_at: leg.status === 'completed' ? leg.processed_at : null
          };
          isLegacy = true;
        }
      }

      if (!targetRecord) return null;

      // 2. Fetch Seller Ledger Snapshot
      const sellerOverview = await walletService.getWalletOverview(targetRecord.seller_id, targetRecord.store_id);

      // 3. Fetch Audit Logs
      const { data: auditLogs } = await supabaseClient
        .from('payout_audit_logs')
        .select('*')
        .eq('withdrawal_id', withdrawalId)
        .order('created_at', { ascending: false });

      // 4. Fetch Payout Attempts
      const { data: attempts } = await supabaseClient
        .from('payout_attempts')
        .select('*')
        .eq('withdrawal_id', withdrawalId)
        .order('created_at', { ascending: false });

      return {
        payout: {
          id: targetRecord.id,
          withdrawalNumber: targetRecord.withdrawal_number,
          sellerId: targetRecord.seller_id,
          sellerName: targetRecord.seller?.name || 'Seller',
          sellerPhone: targetRecord.seller?.phone || 'N/A',
          storeName: targetRecord.store?.name || 'Store',
          storeSlug: targetRecord.store?.slug || '',
          amount: parseFloat(targetRecord.amount),
          fee: parseFloat(targetRecord.fee || 0),
          netAmount: parseFloat(targetRecord.net_amount || targetRecord.amount),
          method: 'Bank Transfer',
          bankAccount: targetRecord.bank_account ? {
            bankName: targetRecord.bank_account.bank_name,
            accountHolderName: targetRecord.bank_account.account_holder_name,
            accountNumberMasked: targetRecord.bank_account.account_number_masked,
            ifscCode: targetRecord.bank_account.ifsc_code,
            accountType: targetRecord.bank_account.account_type
          } : null,
          status: targetRecord.status,
          payoutProvider: targetRecord.payout_provider,
          payoutReferenceId: targetRecord.payout_reference_id,
          adminNotes: targetRecord.admin_notes,
          rejectionReason: targetRecord.rejection_reason,
          failureReason: targetRecord.failure_reason,
          requestedAt: targetRecord.requested_at,
          processedAt: targetRecord.processed_at,
          completedAt: targetRecord.completed_at,
          isLegacy
        },
        financialEffect: {
          sellerLifetimeEarnings: sellerOverview.totalEarnings,
          sellerAvailableBefore: sellerOverview.withdrawableBalance + (['pending', 'approved', 'processing'].includes(targetRecord.status) ? parseFloat(targetRecord.amount) : 0),
          withdrawalReserved: parseFloat(targetRecord.amount),
          sellerAvailableAfter: sellerOverview.withdrawableBalance,
          sellerPendingEarnings: sellerOverview.pendingEarnings
        },
        auditLogs: auditLogs || [],
        attempts: attempts || []
      };
    } catch (err) {
      console.error('❌ [payoutService.adminGetPayoutDetails] Error:', err);
      return null;
    }
  },

  /**
   * Admin Approve Payout with Idempotent Transfer Execution
   */
  adminApprovePayout: async (withdrawalId, adminUser, notes = '') => {
    if (!supabaseClient || !withdrawalId) {
      return { success: false, error: 'Missing parameters.' };
    }

    try {
      const { data: withdrawal } = await supabaseClient
        .from('withdrawals')
        .select('*, bank_account:bank_account_id(*)')
        .eq('id', withdrawalId)
        .maybeSingle();

      if (withdrawal) {
        if (withdrawal.status !== 'pending' && withdrawal.status !== 'approved') {
          return { success: false, error: `Cannot approve withdrawal with status: ${withdrawal.status}` };
        }

        const provider = PayoutFactory.getProvider();
        const transferRes = await provider.createTransfer({
          withdrawalId: withdrawal.id,
          withdrawalNumber: withdrawal.withdrawal_number,
          amount: parseFloat(withdrawal.net_amount || withdrawal.amount),
          bankAccount: withdrawal.bank_account
        });

        if (!transferRes.success) {
          return { success: false, error: transferRes.error || 'Payout provider rejected transfer.' };
        }

        const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc('process_withdrawal_status_atomic', {
          p_withdrawal_id: withdrawalId,
          p_new_status: 'processing',
          p_admin_id: adminUser?.id || null,
          p_admin_email: adminUser?.email || 'admin',
          p_admin_notes: notes || transferRes.message || 'Payout transfer initiated',
          p_provider_ref: transferRes.providerRefId
        });

        if (rpcErr) {
          await supabaseClient.from('withdrawals').update({
            status: 'processing',
            payout_provider: provider.name,
            payout_reference_id: transferRes.providerRefId,
            admin_notes: notes || transferRes.message,
            processed_at: new Date().toISOString()
          }).eq('id', withdrawalId);
        }

        return { success: true, status: 'processing', providerRefId: transferRes.providerRefId };
      }

      // Handle legacy payout_requests
      const { data: leg } = await supabaseClient
        .from('payout_requests')
        .select('*')
        .eq('id', withdrawalId)
        .maybeSingle();

      if (leg) {
        await supabaseClient.from('payout_requests').update({
          status: 'approved',
          admin_notes: notes || 'Approved by admin',
          processed_at: new Date().toISOString()
        }).eq('id', withdrawalId);

        return { success: true, status: 'approved' };
      }

      return { success: false, error: 'Withdrawal record not found.' };
    } catch (err) {
      console.error('❌ [payoutService.adminApprovePayout] Error:', err);
      return { success: false, error: err.message || 'Failed to approve payout.' };
    }
  },

  /**
   * Admin Reject Payout & Release Reserved Balance
   */
  adminRejectPayout: async (withdrawalId, adminUser, reason = '') => {
    if (!supabaseClient || !withdrawalId) {
      return { success: false, error: 'Missing parameters.' };
    }

    if (!reason || !reason.trim()) {
      return { success: false, error: 'A rejection reason is mandatory.' };
    }

    try {
      const { data: withdrawal } = await supabaseClient
        .from('withdrawals')
        .select('*')
        .eq('id', withdrawalId)
        .maybeSingle();

      if (withdrawal) {
        if (['completed', 'rejected', 'cancelled'].includes(withdrawal.status)) {
          return { success: false, error: `Withdrawal is already in terminal state: ${withdrawal.status}` };
        }

        const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc('process_withdrawal_status_atomic', {
          p_withdrawal_id: withdrawalId,
          p_new_status: 'rejected',
          p_admin_id: adminUser?.id || null,
          p_admin_email: adminUser?.email || 'admin',
          p_admin_notes: reason.trim(),
          p_rejection_reason: reason.trim()
        });

        if (rpcErr) {
          await supabaseClient.from('withdrawals').update({
            status: 'rejected',
            rejection_reason: reason.trim(),
            admin_notes: reason.trim(),
            processed_at: new Date().toISOString()
          }).eq('id', withdrawalId);

          await supabaseClient.from('wallet_transactions').update({
            status: 'rejected'
          }).eq('reference_id', withdrawalId);
        }

        return { success: true, status: 'rejected' };
      }

      // Handle legacy payout_requests
      const { data: leg } = await supabaseClient
        .from('payout_requests')
        .select('*')
        .eq('id', withdrawalId)
        .maybeSingle();

      if (leg) {
        await supabaseClient.from('payout_requests').update({
          status: 'rejected',
          admin_notes: reason.trim(),
          processed_at: new Date().toISOString()
        }).eq('id', withdrawalId);

        await supabaseClient.from('wallet_transactions').update({
          status: 'rejected'
        }).eq('reference_id', withdrawalId);

        return { success: true, status: 'rejected' };
      }

      return { success: false, error: 'Withdrawal not found.' };
    } catch (err) {
      console.error('❌ [payoutService.adminRejectPayout] Error:', err);
      return { success: false, error: err.message || 'Failed to reject payout.' };
    }
  },

  /**
   * Admin Retry Failed Payout
   */
  adminRetryPayout: async (withdrawalId, adminUser, notes = '') => {
    if (!supabaseClient || !withdrawalId) {
      return { success: false, error: 'Missing parameters.' };
    }

    try {
      const { data: withdrawal } = await supabaseClient
        .from('withdrawals')
        .select('*, bank_account:bank_account_id(*)')
        .eq('id', withdrawalId)
        .single();

      if (!withdrawal) {
        return { success: false, error: 'Withdrawal not found.' };
      }

      if (withdrawal.status !== 'failed') {
        return { success: false, error: 'Only failed payouts can be retried.' };
      }

      const provider = PayoutFactory.getProvider();
      const transferRes = await provider.createTransfer({
        withdrawalId: withdrawal.id,
        withdrawalNumber: withdrawal.withdrawal_number,
        amount: parseFloat(withdrawal.net_amount || withdrawal.amount),
        bankAccount: withdrawal.bank_account
      });

      if (!transferRes.success) {
        return { success: false, error: transferRes.error };
      }

      await supabaseClient.from('withdrawals').update({
        status: 'processing',
        payout_reference_id: transferRes.providerRefId,
        admin_notes: notes || 'Retry payout initiated',
        updated_at: new Date().toISOString()
      }).eq('id', withdrawalId);

      return { success: true, status: 'processing', providerRefId: transferRes.providerRefId };
    } catch (err) {
      console.error('❌ [payoutService.adminRetryPayout] Error:', err);
      return { success: false, error: err.message || 'Failed to retry payout.' };
    }
  },

  /**
   * Admin Complete & Settle Payout with UTR Reference
   */
  adminCompletePayout: async (withdrawalId, adminUser, utrReference = '', notes = '') => {
    if (!supabaseClient || !withdrawalId) {
      return { success: false, error: 'Missing parameters.' };
    }

    try {
      const { data: withdrawal } = await supabaseClient
        .from('withdrawals')
        .select('*')
        .eq('id', withdrawalId)
        .maybeSingle();

      if (withdrawal) {
        const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc('process_withdrawal_status_atomic', {
          p_withdrawal_id: withdrawalId,
          p_new_status: 'completed',
          p_admin_id: adminUser?.id || null,
          p_admin_email: adminUser?.email || 'admin',
          p_admin_notes: notes || `Settled via UTR: ${utrReference}`,
          p_provider_ref: utrReference
        });

        if (rpcErr) {
          await supabaseClient.from('withdrawals').update({
            status: 'completed',
            payout_reference_id: utrReference,
            admin_notes: notes || `Settled via UTR: ${utrReference}`,
            completed_at: new Date().toISOString(),
            processed_at: new Date().toISOString()
          }).eq('id', withdrawalId);

          await supabaseClient.from('wallet_transactions').update({
            status: 'completed',
            type: 'Payout Completed'
          }).eq('reference_id', withdrawalId);
        }

        return { success: true, status: 'completed' };
      }

      // Handle legacy payout_requests
      const { data: leg } = await supabaseClient
        .from('payout_requests')
        .select('*')
        .eq('id', withdrawalId)
        .maybeSingle();

      if (leg) {
        await supabaseClient.from('payout_requests').update({
          status: 'completed',
          admin_notes: notes || `Settled via UTR: ${utrReference}`,
          processed_at: new Date().toISOString()
        }).eq('id', withdrawalId);

        // Mark creator earnings as paid
        await supabaseClient
          .from('creator_earnings')
          .update({ status: 'paid' })
          .eq('creator_id', leg.creator_id)
          .eq('status', 'available');

        await supabaseClient.from('wallet_transactions').update({
          status: 'completed',
          type: 'Payout Completed'
        }).eq('reference_id', withdrawalId);

        return { success: true, status: 'completed' };
      }

      return { success: false, error: 'Withdrawal record not found.' };
    } catch (err) {
      console.error('❌ [payoutService.adminCompletePayout] Error:', err);
      return { success: false, error: err.message || 'Failed to complete payout.' };
    }
  },

  /**
   * Platform-wide Financial Reconciliation Analysis
   */
  adminGetReconciliation: async () => {
    if (!supabaseClient) return [];

    try {
      const { data: sellers } = await supabaseClient.from('sellers').select('id, name');
      if (!sellers || sellers.length === 0) return [];

      const reconciliationReport = await Promise.all(sellers.map(async (seller) => {
        const overview = await walletService.getWalletOverview(seller.id);
        const discrepancy = (overview.totalEarnings - overview.totalPayouts - overview.reservedBalance - overview.pendingEarnings) - overview.availableBalance;

        return {
          sellerId: seller.id,
          sellerName: seller.name || 'Seller',
          totalEarnings: overview.totalEarnings,
          pendingEarnings: overview.pendingEarnings,
          availableBalance: overview.availableBalance,
          reservedBalance: overview.reservedBalance,
          totalPayouts: overview.totalPayouts,
          isBalanced: Math.abs(discrepancy) < 0.01,
          discrepancy: discrepancy
        };
      }));

      return reconciliationReport;
    } catch (err) {
      console.error('❌ [payoutService.adminGetReconciliation] Error:', err);
      return [];
    }
  }
};

export default payoutService;
