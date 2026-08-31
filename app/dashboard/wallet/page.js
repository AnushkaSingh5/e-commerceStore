'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { walletService } from '@/services/walletService';
import { payoutService } from '@/services/payoutService';
import { bankAccountService } from '@/services/bankAccountService';
import Table from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';

export default function CreatorWallet() {
  const { store, user } = useAuth();
  const sellerId = store?.creator_id || user?.id;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingBank, setSavingBank] = useState(false);

  // Modals state
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);

  // Overview stats state
  const [overview, setOverview] = useState({
    totalEarnings: 0,
    pendingEarnings: 0,
    availableBalance: 0,
    reservedBalance: 0,
    withdrawableBalance: 0,
    totalPayouts: 0
  });

  // Transactions state
  const [transactions, setTransactions] = useState([]);

  // Bank Accounts state
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBankId, setSelectedBankId] = useState('');

  // Withdrawal form state
  const [withdrawAmount, setWithdrawAmount] = useState('');

  // Add Bank form state
  const [bankForm, setBankForm] = useState({
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifscCode: '',
    accountType: 'SAVINGS'
  });

  useEffect(() => {
    if (sellerId) {
      loadWalletData();
    }
  }, [sellerId, store]);

  const loadWalletData = async () => {
    if (!sellerId) return;
    setLoading(true);
    try {
      const [stats, txs, banks] = await Promise.all([
        walletService.getWalletOverview(sellerId, store?.id),
        walletService.getWalletTransactions(sellerId),
        bankAccountService.getBankAccounts(sellerId)
      ]);
      setOverview(stats);
      setTransactions(txs);
      setBankAccounts(banks);
      if (banks.length > 0) {
        const defaultBank = banks.find(b => b.is_default) || banks[0];
        setSelectedBankId(defaultBank.id);
      }
    } catch (e) {
      console.error('Error loading wallet data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    if (!sellerId) return;

    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid withdrawal amount.');
      return;
    }

    if (amt < 500) {
      alert('Minimum withdrawal amount is ₹500.');
      return;
    }

    if (amt > overview.availableBalance) {
      alert(`Withdrawal amount cannot exceed your available balance of ₹${overview.availableBalance.toLocaleString()}.`);
      return;
    }

    if (!selectedBankId) {
      alert('Please select or add a bank account first.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await payoutService.createPayoutRequest(
        sellerId,
        store?.id,
        selectedBankId,
        amt,
        0 // Fee
      );

      if (res.success) {
        alert('Withdrawal request submitted successfully! Funds have been reserved.');
        setWithdrawModalOpen(false);
        setWithdrawAmount('');
        await loadWalletData();
      } else {
        alert('Failed to submit withdrawal: ' + res.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error submitting request: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBankSubmit = async (e) => {
    e.preventDefault();
    if (!sellerId) return;

    setSavingBank(true);
    try {
      const res = await bankAccountService.addBankAccount(sellerId, bankForm);
      if (res.success) {
        alert('Bank account added successfully!');
        setBankModalOpen(false);
        setBankForm({
          accountHolderName: '',
          bankName: '',
          accountNumber: '',
          confirmAccountNumber: '',
          ifscCode: '',
          accountType: 'SAVINGS'
        });
        await loadWalletData();
      } else {
        alert('Failed to save bank account: ' + res.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error saving bank account: ' + err.message);
    } finally {
      setSavingBank(false);
    }
  };

  const openAddBankModal = () => {
    setBankForm({
      accountHolderName: '',
      bankName: '',
      accountNumber: '',
      confirmAccountNumber: '',
      ifscCode: '',
      accountType: 'SAVINGS'
    });
    setBankModalOpen(true);
  };

  const getTransactionTypeColor = (type) => {
    switch (type) {
      case 'Sale Credit': return '#10b981';
      case 'Refund Adjustment': return '#ef4444';
      case 'Payout Request':
      case 'Withdrawal Reserve': return '#f59e0b';
      case 'Payout Completed':
      case 'Withdrawal Settled': return '#8b5cf6';
      default: return '#64748b';
    }
  };

  const selectedBank = bankAccounts.find(b => b.id === selectedBankId) || bankAccounts[0];

  const columns = [
    { 
      field: 'created_at', 
      label: 'DATE', 
      render: (row) => <span className="text-secondary">{row.created_at ? new Date(row.created_at).toLocaleDateString() : 'N/A'}</span> 
    },
    { 
      field: 'type', 
      label: 'TRANSACTION TYPE', 
      render: (row) => (
        <span className="tx-type-pill" style={{ background: `${getTransactionTypeColor(row.type)}15`, color: getTransactionTypeColor(row.type) }}>
          {row.type}
        </span>
      )
    },
    { 
      field: 'amount', 
      label: 'AMOUNT', 
      render: (row) => {
        const isNegative = row.amount < 0;
        return (
          <span className={`font-bold ${isNegative ? 'text-red' : 'text-green'}`}>
            {isNegative ? '-' : '+'}₹{Math.abs(row.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      }
    },
    { 
      field: 'status', 
      label: 'STATUS', 
      render: (row) => (
        <span className={`status-badge status-${(row.status || 'pending').toLowerCase()}`}>
          {row.status}
        </span>
      ) 
    },
    {
      field: 'reference_id',
      label: 'REFERENCE ID',
      render: (row) => <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94a3b8' }}>#{row.reference_id ? row.reference_id.substring(0, 8) : 'N/A'}</span>
    }
  ];

  if (loading && transactions.length === 0) {
    return <div className="loading-state">Loading authoritative wallet ledger...</div>;
  }

  const numericWithdrawAmount = parseFloat(withdrawAmount) || 0;
  const remainingAvailable = Math.max(0, overview.availableBalance - numericWithdrawAmount);

  return (
    <div className="wallet-page">
      <div className="page-header">
        <div className="header-text">
          <h1>Seller Wallet</h1>
          <p>Review ledger transactions, track withdrawals, and inspect sales credits.</p>
        </div>
        <button 
          className="btn-payout-trigger" 
          onClick={() => setWithdrawModalOpen(true)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
          Withdraw Money
        </button>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="icon-wrapper total">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          </div>
          <div className="card-data">
            <span className="card-label">Total Earnings</span>
            <h3 className="card-value">₹{overview.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <span className="card-hint">All historical sales credit</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="icon-wrapper pending">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div className="card-data">
            <span className="card-label">Pending Earnings</span>
            <h3 className="card-value">₹{overview.pendingEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <span className="card-hint">Locked under holding period</span>
          </div>
        </div>

        <div className="summary-card highlight-available">
          <div className="icon-wrapper available">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
          </div>
          <div className="card-data">
            <span className="card-label">Available Balance</span>
            <h3 className="card-value available-text">₹{overview.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <span className="card-hint">Withdrawable funds</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="icon-wrapper reserved">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          </div>
          <div className="card-data">
            <span className="card-label">Reserved Withdrawals</span>
            <h3 className="card-value">₹{(overview.reservedBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <span className="card-hint">Pending / processing</span>
          </div>
        </div>
      </div>

      {/* Bank Account Section */}
      <div className="bank-section dashboard-card">
        <div className="bank-header">
          <div className="bank-title-box">
            <div className="bank-icon-circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v4M12 14v4M16 14v4"></path></svg>
            </div>
            <div>
              <h3>Payout Bank Account</h3>
              <p>Your withdrawal disbursements will be directly transferred to this account</p>
            </div>
          </div>
          <button 
            className="btn-secondary-action" 
            onClick={openAddBankModal}
          >
            {bankAccounts.length > 0 ? 'Change Bank Details' : '+ Add Bank Account'}
          </button>
        </div>

        {selectedBank ? (
          <div className="bank-card-display">
            <div className="bank-chip">
              <span className="chip-badge">Primary Payout Method</span>
              <span className="bank-name">{selectedBank.bank_name}</span>
            </div>
            <div className="bank-details-grid">
              <div className="detail-item">
                <span className="lbl">Account Holder</span>
                <span className="val">{selectedBank.account_holder_name}</span>
              </div>
              <div className="detail-item">
                <span className="lbl">Account Number</span>
                <span className="val mono">{selectedBank.account_number_masked}</span>
              </div>
              <div className="detail-item">
                <span className="lbl">IFSC Code</span>
                <span className="val mono">{selectedBank.ifsc_code}</span>
              </div>
              <div className="detail-item">
                <span className="lbl">Account Type</span>
                <span className="val">{selectedBank.account_type || 'Savings'}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="no-bank-banner">
            <p>No bank account linked yet. Please link your bank details to enable payouts.</p>
            <button className="btn-add-bank" onClick={openAddBankModal}>Add Bank Account</button>
          </div>
        )}
      </div>

      {/* Wallet Transactions Table */}
      <div className="table-card">
        <div className="card-header">
          <h3>Wallet Transactions Ledger</h3>
          <span className="card-badge">{transactions.length} records</span>
        </div>
        <Table columns={columns} data={transactions} loading={loading} />
      </div>

      {/* Modal: Withdraw Money */}
      <Modal
        isOpen={withdrawModalOpen}
        onClose={() => setWithdrawModalOpen(false)}
        title="Withdraw Money"
      >
        <form onSubmit={handleWithdrawSubmit} className="withdrawal-modal-form">
          <div className="modal-balance-banner">
            <span className="banner-lbl">Available to Withdraw</span>
            <h2 className="banner-val">₹{overview.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
            {overview.reservedBalance > 0 && (
              <span className="banner-subtext">₹{overview.reservedBalance.toLocaleString()} currently reserved in pending withdrawals</span>
            )}
          </div>

          {/* Bank Destination Card */}
          <div className="form-group">
            <label>Payout Destination</label>
            {selectedBank ? (
              <div className="selected-bank-box">
                <div className="sb-left">
                  <strong>{selectedBank.bank_name}</strong>
                  <span>{selectedBank.account_holder_name}</span>
                  <span className="sb-acc">{selectedBank.account_number_masked}</span>
                </div>
                <button type="button" className="sb-change-btn" onClick={() => { setWithdrawModalOpen(false); openAddBankModal(); }}>
                  Change
                </button>
              </div>
            ) : (
              <div className="no-bank-alert">
                <span>No bank account found. Please add a bank account first.</span>
                <button type="button" className="btn-add-bank-inline" onClick={() => { setWithdrawModalOpen(false); openAddBankModal(); }}>
                  + Add Bank Details
                </button>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="withdraw-amount">Withdrawal Amount (₹)</label>
            <div className="input-currency-wrapper">
              <span className="currency-symbol">₹</span>
              <input
                id="withdraw-amount"
                type="number"
                placeholder="e.g. 1000"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                min="500"
                max={overview.availableBalance}
                step="0.01"
                required
                disabled={overview.availableBalance < 500}
              />
            </div>
            <span className="field-hint">Minimum withdrawal is ₹500. Maximum is your available balance.</span>
          </div>

          {numericWithdrawAmount > 0 && (
            <div className="calculation-breakdown">
              <div className="calc-row">
                <span>Withdrawal Amount:</span>
                <span>₹{numericWithdrawAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="calc-row">
                <span>Processing Fee:</span>
                <span className="text-green">FREE (₹0.00)</span>
              </div>
              <div className="calc-row total-row">
                <span>You Receive:</span>
                <strong>₹{numericWithdrawAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
              <div className="calc-row remaining-row">
                <span>Remaining Available:</span>
                <span>₹{remainingAvailable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}

          {overview.availableBalance < 500 && (
            <div className="info-notice">
              💡 Your available balance (₹{overview.availableBalance.toLocaleString()}) is below the minimum threshold of ₹500. Pending earnings will unlock once the holding period clears.
            </div>
          )}

          <div className="form-actions">
            <button 
              type="button" 
              className="btn-cancel" 
              onClick={() => setWithdrawModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-submit" 
              disabled={submitting || !selectedBank || overview.availableBalance < 500 || numericWithdrawAmount < 500 || numericWithdrawAmount > overview.availableBalance}
            >
              {submitting ? 'Reserving Funds...' : 'Confirm Withdrawal'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add/Update Bank Account */}
      <Modal
        isOpen={bankModalOpen}
        onClose={() => setBankModalOpen(false)}
        title="Add Bank Account"
      >
        <form onSubmit={handleBankSubmit} className="bank-modal-form" autoComplete="off">
          <div className="form-group">
            <label htmlFor="account-holder">Account Holder Name (as in bank)</label>
            <input
              id="account-holder"
              name="holder_name_no_autofill"
              type="text"
              placeholder="e.g. Anushka Singh"
              value={bankForm.accountHolderName}
              onChange={(e) => setBankForm({ ...bankForm, accountHolderName: e.target.value })}
              autoComplete="off"
              data-lpignore="true"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="bank-name">Bank Name</label>
            <input
              id="bank-name"
              name="bank_name_no_autofill"
              type="text"
              placeholder="e.g. HDFC Bank, SBI, ICICI Bank"
              value={bankForm.bankName}
              onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
              autoComplete="off"
              data-lpignore="true"
              required
            />
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="acc-num">Account Number</label>
              <input
                id="acc-num"
                name="bank_acc_num_field"
                type="text"
                inputMode="numeric"
                placeholder="Enter bank account number"
                value={bankForm.accountNumber}
                onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value.replace(/\D/g, '') })}
                autoComplete="off"
                data-lpignore="true"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="acc-confirm">Confirm Account Number</label>
              <input
                id="acc-confirm"
                name="bank_acc_confirm_field"
                type="text"
                inputMode="numeric"
                placeholder="Re-enter account number"
                value={bankForm.confirmAccountNumber}
                onChange={(e) => setBankForm({ ...bankForm, confirmAccountNumber: e.target.value.replace(/\D/g, '') })}
                autoComplete="off"
                data-lpignore="true"
                required
              />
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="ifsc">IFSC Code</label>
              <input
                id="ifsc"
                name="bank_ifsc_field"
                type="text"
                placeholder="e.g. HDFC0000123"
                value={bankForm.ifscCode}
                onChange={(e) => setBankForm({ ...bankForm, ifscCode: e.target.value.toUpperCase() })}
                maxLength={11}
                autoComplete="off"
                data-lpignore="true"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="acc-type">Account Type</label>
              <select
                id="acc-type"
                name="bank_acc_type"
                value={bankForm.accountType}
                onChange={(e) => setBankForm({ ...bankForm, accountType: e.target.value })}
              >
                <option value="SAVINGS">Savings Account</option>
                <option value="CURRENT">Current Account</option>
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              className="btn-cancel" 
              onClick={() => setBankModalOpen(false)}
              disabled={savingBank}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-submit" 
              disabled={savingBank}
            >
              {savingBank ? 'Verifying & Saving...' : 'Save Bank Account'}
            </button>
          </div>
        </form>
      </Modal>

      <style jsx global>{`
        .wallet-page {
          width: 100%;
          max-width: 100%;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 28px;
          overflow-x: hidden;
          box-sizing: border-box;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-text h1 {
          font-size: 28px;
          font-weight: 800;
          color: #1e293b;
          margin: 0 0 6px 0;
        }

        .header-text p {
          color: #64748b;
          font-size: 15px;
          margin: 0;
        }

        .btn-payout-trigger {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: #fff;
          border: none;
          padding: 12px 24px;
          border-radius: 14px;
          font-weight: 700;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);
        }

        .btn-payout-trigger:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(245, 158, 11, 0.35);
        }

        /* Summary Cards */
        .summary-cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
        }

        .summary-card {
          background: #fff;
          border-radius: 20px;
          padding: 24px;
          display: flex;
          align-items: flex-start;
          gap: 16px;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.02), 0 8px 10px -6px rgba(0,0,0,0.02);
          border: 1px solid #f1f5f9;
        }

        .summary-card.highlight-available {
          border: 1.5px solid #8b5cf630;
          background: linear-gradient(to bottom right, #ffffff, #faf5ff);
        }

        .summary-card .icon-wrapper {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .summary-card .icon-wrapper.total { background: #ecfdf5; }
        .summary-card .icon-wrapper.pending { background: #fffbeb; }
        .summary-card .icon-wrapper.available { background: #f5f3ff; }
        .summary-card .icon-wrapper.reserved { background: #eef2ff; }

        .card-data {
          display: flex;
          flex-direction: column;
        }

        .card-label {
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          margin-bottom: 4px;
        }

        .card-value {
          font-size: 26px;
          font-weight: 800;
          color: #1e293b;
          margin: 0 0 4px 0;
        }

        .available-text {
          color: #7c3aed;
        }

        .card-hint {
          font-size: 12px;
          color: #94a3b8;
        }

        /* Bank Account Section */
        .bank-section {
          background: #fff;
          border-radius: 20px;
          padding: 24px;
          border: 1px solid #f1f5f9;
        }

        .bank-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .bank-title-box {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .bank-icon-circle {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: #eff6ff;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .bank-title-box h3 {
          margin: 0 0 2px 0;
          font-size: 17px;
          font-weight: 700;
          color: #1e293b;
        }

        .bank-title-box p {
          margin: 0;
          font-size: 13px;
          color: #64748b;
        }

        .btn-secondary-action {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-secondary-action:hover {
          background: #f1f5f9;
          color: #1e293b;
        }

        .bank-card-display {
          background: linear-gradient(135deg, #1e293b, #0f172a);
          border-radius: 16px;
          padding: 24px;
          color: #fff;
        }

        .bank-chip {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .chip-badge {
          background: rgba(255, 255, 255, 0.15);
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .bank-name {
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        .bank-details-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .detail-item .lbl {
          font-size: 11px;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .detail-item .val {
          font-size: 15px;
          font-weight: 600;
          color: #f8fafc;
        }

        .detail-item .mono {
          font-family: monospace;
          letter-spacing: 1px;
        }

        .no-bank-banner {
          background: #f8fafc;
          border: 1.5px dashed #cbd5e1;
          border-radius: 14px;
          padding: 24px;
          text-align: center;
        }

        .btn-add-bank {
          background: #3b82f6;
          color: #fff;
          border: none;
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 600;
          margin-top: 10px;
          cursor: pointer;
        }

        /* Table Card */
        .table-card {
          background: #fff;
          border-radius: 20px;
          padding: 24px;
          border: 1px solid #f1f5f9;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .card-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #1e293b;
        }

        .card-badge {
          background: #f1f5f9;
          color: #64748b;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }

        .tx-type-pill {
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
        }

        .status-badge {
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          text-transform: capitalize;
        }

        .status-badge.status-completed { background: #dcfce7; color: #15803d; }
        .status-badge.status-pending { background: #fef3c7; color: #b45309; }
        .status-badge.status-processing { background: #ede9fe; color: #6d28d9; }
        .status-badge.status-rejected, .status-badge.status-failed { background: #fee2e2; color: #b91c1c; }

        .text-green { color: #10b981; }
        .text-red { color: #ef4444; }
        .font-bold { font-weight: 700; }

        /* Modal Styles */
        .modal-balance-banner {
          background: linear-gradient(135deg, #f5f3ff, #ede9fe);
          border: 1px solid #ddd6fe;
          border-radius: 14px;
          padding: 18px;
          text-align: center;
          margin-bottom: 20px;
        }

        .banner-lbl {
          font-size: 12px;
          font-weight: 600;
          color: #6d28d9;
          text-transform: uppercase;
        }

        .banner-val {
          font-size: 32px;
          font-weight: 800;
          color: #5b21b6;
          margin: 4px 0 0 0;
        }

        .banner-subtext {
          font-size: 12px;
          color: #7c3aed;
          display: block;
          margin-top: 4px;
        }

        .selected-bank-box {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px;
        }

        .sb-left {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .sb-left strong {
          color: #1e293b;
          font-size: 14px;
        }

        .sb-left span {
          font-size: 12px;
          color: #64748b;
        }

        .sb-acc {
          font-family: monospace;
          color: #0f172a !important;
          font-weight: 600;
        }

        .sb-change-btn {
          background: none;
          border: 1px solid #cbd5e1;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
        }

        .input-currency-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .currency-symbol {
          position: absolute;
          left: 14px;
          font-size: 16px;
          font-weight: 700;
          color: #64748b;
        }

        .input-currency-wrapper input {
          width: 100%;
          padding: 12px 14px 12px 32px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
        }

        .calculation-breakdown {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px;
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .calc-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: #64748b;
        }

        .calc-row.total-row {
          border-top: 1px dashed #cbd5e1;
          padding-top: 8px;
          color: #0f172a;
          font-size: 15px;
        }

        .calc-row.remaining-row {
          font-size: 12px;
          color: #7c3aed;
        }

        .info-notice {
          background: #fffbeb;
          border: 1px solid #fef3c7;
          color: #92400e;
          padding: 12px;
          border-radius: 10px;
          font-size: 13px;
          margin-top: 14px;
        }

        .form-row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .form-group {
          margin-bottom: 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-size: 13px;
          font-weight: 600;
          color: #334155;
        }

        .form-group input, .form-group select {
          padding: 10px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          font-size: 14px;
        }

        .field-hint {
          font-size: 12px;
          color: #94a3b8;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 20px;
        }

        .btn-cancel {
          background: #f1f5f9;
          border: none;
          padding: 10px 18px;
          border-radius: 10px;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
        }

        .btn-submit {
          background: #7c3aed;
          color: #fff;
          border: none;
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-submit:disabled {
          background: #cbd5e1;
          cursor: not-allowed;
        }

        @media (max-width: 900px) {
          .summary-cards { grid-template-columns: repeat(2, 1fr); }
          .bank-details-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 600px) {
          .summary-cards { grid-template-columns: 1fr; }
          .bank-details-grid { grid-template-columns: 1fr; }
          .form-row-2 { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
