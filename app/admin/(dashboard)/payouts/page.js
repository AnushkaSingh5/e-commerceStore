'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { payoutService } from '@/services/payoutService';
import Table from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import PageLoader from '@/components/PageLoader';
import { useRouter } from 'next/navigation';

export default function AdminPayouts() {
  const { adminUser, loading: authLoading } = useAdminAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [payoutsData, setPayoutsData] = useState({
    payouts: [],
    totalCount: 0,
    totalPages: 1,
    currentPage: 1,
    stats: {
      platformRevenue: 0,
      totalSettled: 0,
      pendingRequests: 0,
      outstandingAvailable: 0
    }
  });

  // Filters & Pagination
  const [currentTab, setCurrentTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Reconciliation data state
  const [reconciliationList, setReconciliationList] = useState([]);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);

  // Detail Drawer & Modals state
  const [selectedPayoutId, setSelectedPayoutId] = useState(null);
  const [drawerData, setDrawerData] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [completingId, setCompletingId] = useState(null);
  const [txnNotes, setTxnNotes] = useState('');
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    if (!authLoading && !adminUser) {
      router.push('/admin/login');
    }
  }, [adminUser, authLoading, router]);

  const loadPayouts = async (page = 1, status = currentTab, search = searchQuery) => {
    setLoading(true);
    try {
      const res = await payoutService.adminGetPayoutRequests({
        page,
        limit: 15,
        status,
        search
      });
      setPayoutsData(res);
    } catch (e) {
      console.error('Error fetching admin payouts:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadReconciliation = async () => {
    setReconciliationLoading(true);
    try {
      const report = await payoutService.adminGetReconciliation();
      setReconciliationList(report);
    } catch (e) {
      console.error('Error fetching reconciliation report:', e);
    } finally {
      setReconciliationLoading(false);
    }
  };

  useEffect(() => {
    if (adminUser) {
      if (currentTab === 'Reconciliation') {
        loadReconciliation();
      } else {
        loadPayouts(currentPage, currentTab, searchQuery);
      }
    }
  }, [adminUser, currentTab, currentPage]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    loadPayouts(1, currentTab, searchQuery);
  };

  const openDrawer = async (payoutId) => {
    setSelectedPayoutId(payoutId);
    setDrawerLoading(true);
    try {
      const details = await payoutService.adminGetPayoutDetails(payoutId);
      setDrawerData(details);
    } catch (err) {
      console.error(err);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleApprove = async (id) => {
    if (!confirm('Approve and initiate payout transfer for this request?')) return;

    setActioning(true);
    try {
      const res = await payoutService.adminApprovePayout(id, adminUser, 'Approved by admin');
      if (res.success) {
        alert('Payout approved and transfer initiated!');
        if (selectedPayoutId) await openDrawer(selectedPayoutId);
        await loadPayouts(currentPage, currentTab, searchQuery);
      } else {
        alert('Failed to approve: ' + res.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error approving payout: ' + err.message);
    } finally {
      setActioning(false);
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      alert('Please enter a rejection reason.');
      return;
    }

    setActioning(true);
    try {
      const res = await payoutService.adminRejectPayout(rejectingId, adminUser, rejectReason.trim());
      if (res.success) {
        alert('Payout rejected and funds released back to seller available balance.');
        setRejectingId(null);
        setRejectReason('');
        if (selectedPayoutId) await openDrawer(selectedPayoutId);
        await loadPayouts(currentPage, currentTab, searchQuery);
      } else {
        alert('Failed to reject: ' + res.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error rejecting payout: ' + err.message);
    } finally {
      setActioning(false);
    }
  };

  const handleComplete = async (e) => {
    e.preventDefault();
    if (!txnNotes.trim()) {
      alert('Please provide transaction / UTR reference details.');
      return;
    }

    setActioning(true);
    try {
      const res = await payoutService.adminCompletePayout(completingId, adminUser, txnNotes.trim(), 'Settled by admin');
      if (res.success) {
        alert('Payout marked as completed and settled in seller ledger.');
        setCompletingId(null);
        setTxnNotes('');
        if (selectedPayoutId) await openDrawer(selectedPayoutId);
        await loadPayouts(currentPage, currentTab, searchQuery);
      } else {
        alert('Failed to complete payout: ' + res.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error completing payout: ' + err.message);
    } finally {
      setActioning(false);
    }
  };

  const handleRetry = async (id) => {
    if (!confirm('Retry payout transfer for this failed request?')) return;

    setActioning(true);
    try {
      const res = await payoutService.adminRetryPayout(id, adminUser, 'Retry initiated by admin');
      if (res.success) {
        alert('Payout retry initiated successfully!');
        if (selectedPayoutId) await openDrawer(selectedPayoutId);
        await loadPayouts(currentPage, currentTab, searchQuery);
      } else {
        alert('Failed to retry: ' + res.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error retrying payout: ' + err.message);
    } finally {
      setActioning(false);
    }
  };

  if (authLoading || (loading && payoutsData.payouts.length === 0 && !adminUser)) {
    return <PageLoader />;
  }

  if (!adminUser) return null;

  const stats = payoutsData.stats || {
    platformRevenue: 0,
    totalSettled: 0,
    pendingRequests: 0,
    outstandingAvailable: 0
  };

  const columns = [
    { 
      field: 'withdrawalNumber', 
      label: 'PAYOUT ID', 
      render: (row) => (
        <button className="id-btn" onClick={() => openDrawer(row.id)}>
          #{row.withdrawalNumber || row.id.substring(0, 8)}
        </button>
      ) 
    },
    { 
      field: 'sellerName', 
      label: 'SELLER / STORE', 
      render: (row) => (
        <div className="creator-cell">
          <strong>{row.sellerName}</strong>
          <span className="creator-store">{row.storeName || 'Store'}</span>
        </div>
      ) 
    },
    { 
      field: 'amount', 
      label: 'AMOUNT', 
      render: (row) => <span className="font-bold">₹{parseFloat(row.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> 
    },
    { field: 'method', label: 'METHOD' },
    { 
      field: 'accountDetails', 
      label: 'BANK ACCOUNT', 
      render: (row) => (
        <div className="bank-cell" title={row.accountDetails}>
          <span className="bank-val">{row.accountDetails}</span>
        </div>
      ) 
    },
    { field: 'requestedAt', label: 'REQUESTED ON' },
    { 
      field: 'status', 
      label: 'STATUS', 
      render: (row) => (
        <span className={`status-pill ${row.status.toLowerCase()}`}>
          <span className={`status-dot ${row.status.toLowerCase()}`}></span>
          {row.status}
        </span>
      ) 
    },
    {
      field: 'actions',
      label: 'ACTIONS',
      render: (row) => (
        <div className="action-buttons">
          <button className="btn-action btn-view" onClick={() => openDrawer(row.id)} title="View Full Details">
            View
          </button>
          {row.status === 'pending' && (
            <>
              <button className="btn-action btn-approve" onClick={() => handleApprove(row.id)} disabled={actioning}>Approve</button>
              <button className="btn-action btn-reject" onClick={() => setRejectingId(row.id)} disabled={actioning}>Reject</button>
            </>
          )}
          {(row.status === 'approved' || row.status === 'processing') && (
            <>
              <button className="btn-action btn-complete" onClick={() => setCompletingId(row.id)} disabled={actioning}>Settle</button>
              <button className="btn-action btn-reject" onClick={() => setRejectingId(row.id)} disabled={actioning}>Reject</button>
            </>
          )}
          {row.status === 'failed' && (
            <button className="btn-action btn-retry" onClick={() => handleRetry(row.id)} disabled={actioning}>Retry</button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="admin-payouts-page">
      <div className="page-header">
        <div>
          <h1>Financial Payout Ledger</h1>
          <p>Inspect authoritatively reconciled seller withdrawals, moderate payout disbursements, and audit transactions.</p>
        </div>
        <button className="btn-refresh" onClick={() => loadPayouts(currentPage, currentTab, searchQuery)} disabled={loading}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
          Refresh Data
        </button>
      </div>

      {/* 4 Authoritative Top Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="lbl">Platform Creator Revenue</span>
          <h3 className="val">₹{stats.platformRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          <span className="sub">Total valid sales earnings</span>
        </div>
        <div className="metric-card">
          <span className="lbl">Total Settled / Paid Out</span>
          <h3 className="val text-green">₹{stats.totalSettled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          <span className="sub">Successfully disbursed</span>
        </div>
        <div className="metric-card">
          <span className="lbl">Pending Payout Requests</span>
          <h3 className="val text-amber">{stats.pendingRequests}</h3>
          <span className="sub">Active awaiting settlement</span>
        </div>
        <div className="metric-card highlight-card">
          <span className="lbl">Outstanding Available Balance</span>
          <h3 className="val text-purple">₹{stats.outstandingAvailable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          <span className="sub">Withdrawable across all sellers</span>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="content-card">
        <div className="filter-bar">
          <div className="tab-buttons">
            {['All', 'Pending', 'Approved', 'Processing', 'Completed', 'Failed', 'Rejected', 'Reconciliation'].map((tab) => (
              <button 
                key={tab} 
                className={`tab-btn ${currentTab === tab ? 'active' : ''}`}
                onClick={() => { setCurrentTab(tab); setCurrentPage(1); }}
              >
                {tab}
              </button>
            ))}
          </div>

          {currentTab !== 'Reconciliation' && (
            <form onSubmit={handleSearchSubmit} className="search-form">
              <input 
                type="text" 
                placeholder="Search ID, Seller, Store, Ref..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="search-btn">Search</button>
            </form>
          )}
        </div>

        {currentTab === 'Reconciliation' ? (
          <div className="reconciliation-view">
            <div className="rec-header">
              <h3>Platform Financial Reconciliation Analysis</h3>
              <p>Compares lifetime earnings against reservations and settled payouts for every seller.</p>
            </div>
            {reconciliationLoading ? (
              <div className="loading-state">Analyzing seller ledgers...</div>
            ) : (
              <table className="rec-table">
                <thead>
                  <tr>
                    <th>SELLER</th>
                    <th>LIFETIME SALES</th>
                    <th>PENDING SALES</th>
                    <th>ACTIVE RESERVED</th>
                    <th>TOTAL PAID OUT</th>
                    <th>AVAILABLE BALANCE</th>
                    <th>HEALTH STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliationList.map((rec) => (
                    <tr key={rec.sellerId}>
                      <td><strong>{rec.sellerName}</strong></td>
                      <td>₹{rec.totalEarnings.toLocaleString()}</td>
                      <td>₹{rec.pendingEarnings.toLocaleString()}</td>
                      <td>₹{rec.reservedBalance.toLocaleString()}</td>
                      <td>₹{rec.totalPayouts.toLocaleString()}</td>
                      <td className="font-bold text-purple">₹{rec.availableBalance.toLocaleString()}</td>
                      <td>
                        <span className={`status-pill ${rec.isBalanced ? 'completed' : 'rejected'}`}>
                          {rec.isBalanced ? '✓ Reconciled & Balanced' : '⚠️ Discrepancy Detected'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <>
            <Table columns={columns} data={payoutsData.payouts} loading={loading} />

            {/* Server-Side Pagination */}
            <div className="pagination-bar">
              <span className="page-info">
                Showing {payoutsData.payouts.length} of {payoutsData.totalCount} records
              </span>
              <div className="page-buttons">
                <button 
                  className="btn-page" 
                  disabled={currentPage <= 1 || loading}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="current-page-num">Page {currentPage} of {payoutsData.totalPages || 1}</span>
                <button 
                  className="btn-page" 
                  disabled={currentPage >= payoutsData.totalPages || loading}
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Payout Detail Drawer / Modal */}
      <Modal
        isOpen={Boolean(selectedPayoutId)}
        onClose={() => { setSelectedPayoutId(null); setDrawerData(null); }}
        title="Payout Request Details"
      >
        {drawerLoading || !drawerData ? (
          <div className="drawer-loading">Loading comprehensive payout details...</div>
        ) : (
          <div className="payout-drawer-content">
            {/* Header Status */}
            <div className="drawer-top-banner">
              <div>
                <span className="drawer-payout-num">#{drawerData.payout.withdrawalNumber}</span>
                <h3 className="drawer-amount">₹{drawerData.payout.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
              </div>
              <span className={`status-pill ${drawerData.payout.status.toLowerCase()}`}>
                <span className={`status-dot ${drawerData.payout.status.toLowerCase()}`}></span>
                {drawerData.payout.status}
              </span>
            </div>

            {/* Financial Impact Breakdown */}
            <div className="drawer-section">
              <h4 className="section-title">Financial Impact on Seller Ledger</h4>
              <div className="financial-grid">
                <div className="fg-box">
                  <span className="lbl">Available Before</span>
                  <strong className="val">₹{drawerData.financialEffect.sellerAvailableBefore.toLocaleString()}</strong>
                </div>
                <div className="fg-box fg-reserved">
                  <span className="lbl">Withdrawal Reserved</span>
                  <strong className="val text-amber">-₹{drawerData.financialEffect.withdrawalReserved.toLocaleString()}</strong>
                </div>
                <div className="fg-box fg-after">
                  <span className="lbl">Available After</span>
                  <strong className="val text-purple">₹{drawerData.financialEffect.sellerAvailableAfter.toLocaleString()}</strong>
                </div>
              </div>
            </div>

            {/* Beneficiary & Bank Details */}
            <div className="drawer-section">
              <h4 className="section-title">Beneficiary & Destination Bank</h4>
              <div className="info-grid-2">
                <div className="info-field">
                  <span className="lbl">Seller Name</span>
                  <span className="val">{drawerData.payout.sellerName}</span>
                </div>
                <div className="info-field">
                  <span className="lbl">Store</span>
                  <span className="val">{drawerData.payout.storeName}</span>
                </div>
                <div className="info-field">
                  <span className="lbl">Bank Name</span>
                  <span className="val">{drawerData.payout.bankAccount?.bankName || 'N/A'}</span>
                </div>
                <div className="info-field">
                  <span className="lbl">Account Number</span>
                  <span className="val mono">{drawerData.payout.bankAccount?.accountNumberMasked || '••••'}</span>
                </div>
                <div className="info-field">
                  <span className="lbl">IFSC Code</span>
                  <span className="val mono">{drawerData.payout.bankAccount?.ifscCode || 'N/A'}</span>
                </div>
                <div className="info-field">
                  <span className="lbl">Account Type</span>
                  <span className="val">{drawerData.payout.bankAccount?.accountType || 'Savings'}</span>
                </div>
              </div>
            </div>

            {/* Audit Timeline */}
            <div className="drawer-section">
              <h4 className="section-title">Audit Trail & Transaction History</h4>
              <div className="audit-timeline">
                {drawerData.auditLogs && drawerData.auditLogs.length > 0 ? (
                  drawerData.auditLogs.map((log) => (
                    <div className="timeline-item" key={log.id}>
                      <div className="tl-dot"></div>
                      <div className="tl-content">
                        <div className="tl-header">
                          <strong className="tl-action">{log.action}</strong>
                          <span className="tl-time">{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                        <p className="tl-reason">{log.reason || 'System operation executed'}</p>
                        {log.admin_email && <span className="tl-admin">By: {log.admin_email}</span>}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="no-audit">No previous audit records logged.</div>
                )}
              </div>
            </div>

            {/* Drawer Actions */}
            <div className="drawer-actions-bar">
              {drawerData.payout.status === 'pending' && (
                <>
                  <button className="btn-action-lg btn-approve" onClick={() => handleApprove(drawerData.payout.id)} disabled={actioning}>
                    Approve & Initiate Transfer
                  </button>
                  <button className="btn-action-lg btn-reject" onClick={() => setRejectingId(drawerData.payout.id)} disabled={actioning}>
                    Reject Withdrawal
                  </button>
                </>
              )}
              {(drawerData.payout.status === 'approved' || drawerData.payout.status === 'processing') && (
                <>
                  <button className="btn-action-lg btn-complete" onClick={() => setCompletingId(drawerData.payout.id)} disabled={actioning}>
                    Settle & Mark Completed
                  </button>
                  <button className="btn-action-lg btn-reject" onClick={() => setRejectingId(drawerData.payout.id)} disabled={actioning}>
                    Reject Withdrawal
                  </button>
                </>
              )}
              {drawerData.payout.status === 'failed' && (
                <button className="btn-action-lg btn-retry" onClick={() => handleRetry(drawerData.payout.id)} disabled={actioning}>
                  Retry Transfer
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Reject Request */}
      <Modal
        isOpen={Boolean(rejectingId)}
        onClose={() => setRejectingId(null)}
        title="Reject Payout Request"
      >
        <form onSubmit={handleReject} className="modal-form">
          <p className="modal-desc">
            Rejecting this request will immediately release the reserved funds back into the seller's available wallet balance.
          </p>
          <div className="form-group">
            <label htmlFor="reject-reason">Rejection Reason (Mandatory)</label>
            <textarea
              id="reject-reason"
              rows={3}
              placeholder="e.g. Incorrect bank account details, KYC verification required, or duplicate request"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              required
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={() => setRejectingId(null)} disabled={actioning}>Cancel</button>
            <button type="submit" className="btn-reject-confirm" disabled={actioning}>
              {actioning ? 'Rejecting & Releasing Funds...' : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Complete / Settle Request */}
      <Modal
        isOpen={Boolean(completingId)}
        onClose={() => setCompletingId(null)}
        title="Settle & Complete Payout"
      >
        <form onSubmit={handleComplete} className="modal-form">
          <p className="modal-desc">
            Marking this payout as completed will finalize the debit in the seller's immutable ledger and record the transaction as paid.
          </p>
          <div className="form-group">
            <label htmlFor="txn-notes">UTR / Bank Transaction Reference (Mandatory)</label>
            <input
              id="txn-notes"
              type="text"
              placeholder="e.g. UTR1234567890 or IMPS Ref #48291"
              value={txnNotes}
              onChange={(e) => setTxnNotes(e.target.value)}
              required
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={() => setCompletingId(null)} disabled={actioning}>Cancel</button>
            <button type="submit" className="btn-complete-confirm" disabled={actioning}>
              {actioning ? 'Settling Ledger...' : 'Confirm Settlement'}
            </button>
          </div>
        </form>
      </Modal>

      <style jsx global>{`
        .admin-payouts-page {
          display: flex;
          flex-direction: column;
          gap: 24px;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          overflow-x: hidden;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .page-header h1 {
          font-size: 24px;
          font-weight: 800;
          color: #0f172a;
          margin: 0 0 4px 0;
        }

        .page-header p {
          color: #64748b;
          font-size: 14px;
          margin: 0;
        }

        .btn-refresh {
          background: #fff;
          border: 1px solid #e2e8f0;
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          width: 100%;
        }

        .metric-card {
          background: #fff;
          border: 1px solid #f1f5f9;
          border-radius: 16px;
          padding: 20px;
          display: flex;
          flex-direction: column;
        }

        .metric-card.highlight-card {
          border: 1.5px solid #8b5cf630;
          background: linear-gradient(to bottom right, #ffffff, #faf5ff);
        }

        .metric-card .lbl {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .metric-card .val {
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          margin: 4px 0;
        }

        .metric-card .sub {
          font-size: 12px;
          color: #94a3b8;
        }

        .content-card {
          background: #fff;
          border: 1px solid #f1f5f9;
          border-radius: 16px;
          padding: 24px;
          width: 100%;
          box-sizing: border-box;
        }

        .filter-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          gap: 16px;
          flex-wrap: wrap;
        }

        .tab-buttons {
          display: flex;
          gap: 6px;
          background: #f8fafc;
          padding: 4px;
          border-radius: 10px;
          flex-wrap: wrap;
        }

        .tab-btn {
          background: none;
          border: none;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
        }

        .tab-btn.active {
          background: #fff;
          color: #0f172a;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .search-form {
          display: flex;
          gap: 8px;
        }

        .search-form input {
          padding: 8px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          font-size: 13px;
          width: 240px;
        }

        .search-btn {
          background: #3b82f6;
          color: #fff;
          border: none;
          padding: 8px 14px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .id-btn {
          background: none;
          border: none;
          font-family: monospace;
          font-weight: 700;
          color: #2563eb;
          cursor: pointer;
          padding: 0;
        }

        .id-btn:hover {
          text-decoration: underline;
        }

        .creator-cell {
          display: flex;
          flex-direction: column;
        }

        .creator-store {
          font-size: 12px;
          color: #64748b;
        }

        .bank-cell {
          font-size: 13px;
          color: #1e293b;
        }

        .status-pill {
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          text-transform: capitalize;
        }

        .status-pill.completed { background: #dcfce7; color: #15803d; }
        .status-pill.pending { background: #fef3c7; color: #b45309; }
        .status-pill.processing, .status-pill.approved { background: #ede9fe; color: #6d28d9; }
        .status-pill.rejected, .status-pill.failed { background: #fee2e2; color: #b91c1c; }

        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .status-dot.completed { background: #16a34a; }
        .status-dot.pending { background: #d97706; }
        .status-dot.processing, .status-dot.approved { background: #7c3aed; }
        .status-dot.rejected, .status-dot.failed { background: #dc2626; }

        .action-buttons {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .btn-action {
          border: none;
          padding: 5px 10px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-view { background: #f1f5f9; color: #334155; }
        .btn-approve { background: #eff6ff; color: #2563eb; }
        .btn-complete { background: #dcfce7; color: #15803d; }
        .btn-reject { background: #fee2e2; color: #b91c1c; }
        .btn-retry { background: #fef3c7; color: #b45309; }

        .pagination-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid #f1f5f9;
        }

        .page-info {
          font-size: 13px;
          color: #64748b;
        }

        .page-buttons {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .btn-page {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
        }

        .btn-page:disabled {
          color: #cbd5e1;
          cursor: not-allowed;
        }

        .current-page-num {
          font-size: 13px;
          font-weight: 600;
          color: #475569;
        }

        /* Reconciliation Table */
        .rec-header {
          margin-bottom: 18px;
        }

        .rec-header h3 {
          margin: 0 0 4px 0;
          font-size: 18px;
          font-weight: 700;
        }

        .rec-header p {
          margin: 0;
          font-size: 13px;
          color: #64748b;
        }

        .rec-table {
          width: 100%;
          border-collapse: collapse;
        }

        .rec-table th {
          background: #f8fafc;
          padding: 12px 16px;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }

        .rec-table td {
          padding: 14px 16px;
          font-size: 13px;
          border-bottom: 1px solid #f1f5f9;
        }

        /* Drawer Details Modal */
        .payout-drawer-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .drawer-top-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 16px;
        }

        .drawer-payout-num {
          font-family: monospace;
          font-size: 13px;
          color: #64748b;
        }

        .drawer-amount {
          margin: 2px 0 0 0;
          font-size: 26px;
          font-weight: 800;
          color: #0f172a;
        }

        .drawer-section {
          background: #fff;
          border: 1px solid #f1f5f9;
          border-radius: 14px;
          padding: 16px;
        }

        .section-title {
          margin: 0 0 12px 0;
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .financial-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .fg-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 12px;
          display: flex;
          flex-direction: column;
        }

        .fg-box .lbl {
          font-size: 11px;
          color: #64748b;
        }

        .fg-box .val {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin-top: 2px;
        }

        .info-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .info-field {
          display: flex;
          flex-direction: column;
        }

        .info-field .lbl {
          font-size: 11px;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .info-field .val {
          font-size: 14px;
          font-weight: 600;
          color: #1e293b;
        }

        .info-field .mono {
          font-family: monospace;
        }

        .audit-timeline {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .timeline-item {
          display: flex;
          gap: 12px;
        }

        .tl-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #3b82f6;
          margin-top: 4px;
          flex-shrink: 0;
        }

        .tl-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .tl-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tl-action {
          font-size: 13px;
          color: #0f172a;
        }

        .tl-time {
          font-size: 11px;
          color: #94a3b8;
        }

        .tl-reason {
          font-size: 12px;
          color: #475569;
          margin: 0;
        }

        .tl-admin {
          font-size: 11px;
          color: #64748b;
        }

        .drawer-actions-bar {
          display: flex;
          gap: 12px;
          padding-top: 12px;
          border-top: 1px solid #f1f5f9;
        }

        .btn-action-lg {
          flex: 1;
          border: none;
          padding: 10px 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .text-green { color: #16a34a; }
        .text-amber { color: #d97706; }
        .text-purple { color: #7c3aed; }
        .font-bold { font-weight: 700; }

        @media (max-width: 900px) {
          .metrics-grid { grid-template-columns: repeat(2, 1fr); }
          .financial-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 600px) {
          .metrics-grid { grid-template-columns: 1fr; }
          .info-grid-2 { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
