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
  
  const [payouts, setPayouts] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTab, setCurrentTab] = useState('All');
  
  // Modals state
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

  const loadAdminPayoutData = async () => {
    setLoading(true);
    try {
      const [payoutRequests, allEarnings] = await Promise.all([
        payoutService.adminGetPayoutRequests(),
        payoutService.adminGetAllEarnings()
      ]);
      setPayouts(payoutRequests);
      setEarnings(allEarnings);
    } catch (e) {
      console.error('Error fetching admin payout data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminUser) {
      loadAdminPayoutData();
    }
  }, [adminUser]);

  if (authLoading || (loading && payouts.length === 0)) {
    return <PageLoader />;
  }

  if (!adminUser) return null;

  // Moderation Actions
  const handleApprove = async (id) => {
    if (confirm('Approve and initiate payout transfer for this request?')) {
      setActioning(true);
      try {
        const res = await payoutService.adminUpdatePayoutStatus(id, 'approved', 'Payout approved and transfer initiated');
        if (res.success) {
          alert('Payout transfer initiated successfully!');
          await loadAdminPayoutData();
        } else {
          alert('Failed to approve request: ' + res.error);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setActioning(false);
      }
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
      const res = await payoutService.adminUpdatePayoutStatus(rejectingId, 'rejected', '', rejectReason.trim());
      if (res.success) {
        alert('Payout request rejected. Reserved funds have been restored to the seller wallet.');
        setRejectingId(null);
        setRejectReason('');
        await loadAdminPayoutData();
      } else {
        alert('Failed to reject request: ' + res.error);
      }
    } catch (err) {
      console.error(err);
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
      const res = await payoutService.adminUpdatePayoutStatus(completingId, 'completed', txnNotes.trim());
      if (res.success) {
        alert('Payout marked as completed and settled in seller ledger.');
        setCompletingId(null);
        setTxnNotes('');
        await loadAdminPayoutData();
      } else {
        alert('Failed to complete payout: ' + res.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActioning(false);
    }
  };

  // Authoritative Metrics calculations
  const totalPlatformEarnings = earnings.reduce((sum, e) => sum + parseFloat(e.creator_amount || 0), 0);
  const totalPaidOut = payouts.filter(r => r.status === 'completed').reduce((sum, r) => sum + r.amount, 0);
  const pendingPayoutsAmount = payouts.filter(r => r.status === 'pending' || r.status === 'processing' || r.status === 'approved').reduce((sum, r) => sum + r.amount, 0);
  const pendingRequestsCount = payouts.filter(r => r.status === 'pending' || r.status === 'processing' || r.status === 'approved').length;

  // Tab Filtering & Search
  const filteredByTab = currentTab === 'All' ? payouts : payouts.filter(r => r.status.toLowerCase() === currentTab.toLowerCase());
  
  const filteredPayouts = filteredByTab.filter(r => {
    const query = searchQuery.toLowerCase();
    return (
      (r.creatorName || '').toLowerCase().includes(query) ||
      (r.storeName || '').toLowerCase().includes(query) ||
      (r.withdrawalNumber || '').toLowerCase().includes(query) ||
      (r.id || '').toLowerCase().includes(query)
    );
  });

  const columns = [
    { 
      field: 'withdrawalNumber', 
      label: 'PAYOUT ID', 
      render: (row) => <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>#{row.withdrawalNumber || row.id.substring(0, 8)}</span> 
    },
    { 
      field: 'creatorName', 
      label: 'SELLER / STORE', 
      render: (row) => (
        <div className="creator-cell">
          <strong>{row.creatorName}</strong>
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
      label: 'BANK DETAILS', 
      render: (row) => (
        <div className="bank-cell" title={row.accountDetails}>
          <span className="bank-val">{row.accountDetails}</span>
          {row.ifsc && row.ifsc !== 'N/A' && <span className="ifsc-val">IFSC: {row.ifsc}</span>}
        </div>
      ) 
    },
    { field: 'requestedAt', label: 'REQUESTED ON', render: (row) => <span className="date-text">{row.requestedAt}</span> },
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
      field: 'adminNotes', 
      label: 'REMARKS/NOTES', 
      render: (row) => <span className="notes-text" style={{ color: row.status === 'rejected' ? '#ef4444' : '#64748b' }}>{row.adminNotes || row.rejectionReason || '--'}</span> 
    }
  ];

  const actions = (row) => (
    <div className="action-buttons">
      {(row.status === 'pending' || row.status === 'approved' || row.status === 'processing') && (
        <>
          <button className="btn-action btn-complete" onClick={() => setCompletingId(row.id)} disabled={actioning}>Settle</button>
          <button className="btn-action btn-reject" onClick={() => setRejectingId(row.id)} disabled={actioning}>Reject</button>
        </>
      )}
    </div>
  );

  return (
    <div className="admin-payouts-page">
      <div className="page-header">
        <div>
          <h1>Financial Payout Requests</h1>
          <p>Moderate seller withdrawal requests, authorize disbursements, and inspect ledger settlements.</p>
        </div>
        <button className="btn-refresh" onClick={loadAdminPayoutData} disabled={loading}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
          Refresh Data
        </button>
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="lbl">Platform Total Earnings</span>
          <h3 className="val">₹{totalPlatformEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          <span className="sub">All sales gross ledger</span>
        </div>
        <div className="metric-card">
          <span className="lbl">Total Settled Payouts</span>
          <h3 className="val" style={{ color: '#16a34a' }}>₹{totalPaidOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          <span className="sub">Successfully disbursed</span>
        </div>
        <div className="metric-card">
          <span className="lbl">Pending Payouts Value</span>
          <h3 className="val" style={{ color: '#d97706' }}>₹{pendingPayoutsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          <span className="sub">{pendingRequestsCount} active requests</span>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="content-card">
        <div className="filter-bar">
          <div className="tab-buttons">
            {['All', 'Pending', 'Processing', 'Completed', 'Rejected'].map((tab) => (
              <button 
                key={tab} 
                className={`tab-btn ${currentTab === tab ? 'active' : ''}`}
                onClick={() => setCurrentTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="search-box">
            <input 
              type="text" 
              placeholder="Search by seller, store, or ID..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <Table columns={columns} data={filteredPayouts} actions={actions} loading={loading} />
      </div>

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
            <label htmlFor="reject-reason">Rejection Reason</label>
            <textarea
              id="reject-reason"
              rows={3}
              placeholder="e.g. Invalid bank account details or verification pending"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              required
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={() => setRejectingId(null)} disabled={actioning}>Cancel</button>
            <button type="submit" className="btn-reject-confirm" disabled={actioning}>
              {actioning ? 'Rejecting...' : 'Confirm Rejection'}
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
            <label htmlFor="txn-notes">UTR / Bank Transaction Reference</label>
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
              {actioning ? 'Settling...' : 'Confirm Settlement'}
            </button>
          </div>
        </form>
      </Modal>

      <style jsx global>{`
        .admin-payouts-page {
          display: flex;
          flex-direction: column;
          gap: 24px;
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
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        .metric-card {
          background: #fff;
          border: 1px solid #f1f5f9;
          border-radius: 16px;
          padding: 20px;
          display: flex;
          flex-direction: column;
        }

        .metric-card .lbl {
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
        }

        .metric-card .val {
          font-size: 24px;
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
        }

        .filter-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          gap: 16px;
        }

        .tab-buttons {
          display: flex;
          gap: 6px;
          background: #f8fafc;
          padding: 4px;
          border-radius: 10px;
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

        .search-box input {
          padding: 8px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          font-size: 13px;
          width: 260px;
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
          display: flex;
          flex-direction: column;
        }

        .bank-val {
          font-size: 13px;
          color: #1e293b;
        }

        .ifsc-val {
          font-size: 11px;
          color: #94a3b8;
          font-family: monospace;
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
          gap: 8px;
        }

        .btn-action {
          border: none;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-complete { background: #dcfce7; color: #15803d; }
        .btn-reject { background: #fee2e2; color: #b91c1c; }

        .modal-desc {
          font-size: 14px;
          color: #64748b;
          margin-bottom: 16px;
        }

        .modal-form .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 16px;
        }

        .modal-form label {
          font-size: 13px;
          font-weight: 600;
          color: #334155;
        }

        .modal-form input, .modal-form textarea {
          padding: 10px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          font-size: 14px;
        }

        .btn-complete-confirm {
          background: #16a34a;
          color: #fff;
          border: none;
          padding: 10px 18px;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-reject-confirm {
          background: #dc2626;
          color: #fff;
          border: none;
          padding: 10px 18px;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
        }

        .font-bold { font-weight: 700; }
        .text-secondary { color: #64748b; }
      `}</style>
    </div>
  );
}
