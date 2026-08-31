'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { payoutService } from '@/services/payoutService';
import Table from '@/components/UI/Table';

export default function EarningsPage() {
  const { store, user } = useAuth();
  const sellerId = store?.creator_id || user?.id;
  const router = useRouter();

  const [summary, setSummary] = useState({
    totalEarnings: 0,
    pendingEarnings: 0,
    availableEarnings: 0,
    lifetimeOrders: 0
  });
  const [earnings, setEarnings] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadEarningsData = async () => {
    if (!sellerId) return;
    setLoading(true);
    try {
      const [sumRes, earnList, payRequests] = await Promise.all([
        payoutService.getCreatorEarningsSummary(sellerId, store?.id),
        payoutService.getCreatorEarningsList(sellerId, store?.id),
        payoutService.getPayoutRequests(sellerId)
      ]);
      setSummary(sumRes);
      setEarnings(earnList);
      setPayouts(payRequests);
    } catch (e) {
      console.error('Error loading creator earnings data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sellerId) {
      loadEarningsData();
    }
  }, [sellerId, store]);

  const earningColumns = [
    { 
      field: 'orderId', 
      label: 'ORDER ID', 
      render: (row) => <span className="font-bold">#{row.orderId ? row.orderId.substring(0, 8) : 'N/A'}</span> 
    },
    { 
      field: 'date', 
      label: 'DATE', 
      render: (row) => <span className="text-secondary">{row.date}</span> 
    },
    { 
      field: 'orderAmount', 
      label: 'ORDER AMOUNT', 
      render: (row) => <span>₹{parseFloat(row.orderAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> 
    },
    { 
      field: 'creatorAmount', 
      label: 'SELLER AMOUNT', 
      render: (row) => (
        <span className="font-bold text-green">
          ₹{parseFloat(row.creatorAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ) 
    },
    { 
      field: 'status', 
      label: 'STATUS', 
      render: (row) => (
        <span className={`status-badge status-${(row.status || 'pending').toLowerCase()}`}>
          {row.status}
        </span>
      ) 
    }
  ];

  const payoutColumns = [
    { 
      field: 'withdrawalNumber', 
      label: 'PAYOUT ID', 
      render: (row) => <span className="font-bold">#{row.withdrawalNumber || row.id.substring(0, 8).toUpperCase()}</span> 
    },
    { 
      field: 'amount', 
      label: 'AMOUNT', 
      render: (row) => <span className="font-bold">₹{parseFloat(row.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> 
    },
    { 
      field: 'accountDetails', 
      label: 'METHOD / ACCOUNT', 
      render: (row) => <span className="text-secondary">{row.accountDetails}</span> 
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
      field: 'requestedAt', 
      label: 'REQUESTED ON', 
      render: (row) => <span className="text-secondary">{row.requestedAt}</span> 
    }
  ];

  return (
    <div className="earnings-page">
      <div className="page-header">
        <div className="header-text">
          <h1>Seller Earnings & Payouts</h1>
          <p>Track your sales revenues, available balance, and withdrawal requests.</p>
        </div>
        <button 
          className="btn-payout-trigger" 
          onClick={() => router.push('/dashboard/wallet')}
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
            <h3 className="card-value">₹{summary.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <span className="card-hint">All historical revenues</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="icon-wrapper pending">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div className="card-data">
            <span className="card-label">Pending Earnings</span>
            <h3 className="card-value">₹{summary.pendingEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <span className="card-hint">Under 7-day holding period</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="icon-wrapper available">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
          </div>
          <div className="card-data">
            <span className="card-label">Available Earnings</span>
            <h3 className="card-value available-text">₹{summary.availableEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <span className="card-hint">Eligible for withdrawal</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="icon-wrapper orders">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
          </div>
          <div className="card-data">
            <span className="card-label">Lifetime Orders</span>
            <h3 className="card-value">{summary.lifetimeOrders}</h3>
            <span className="card-hint">Revenues generated</span>
          </div>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="tables-grid">
        <div className="table-card">
          <div className="card-header">
            <h3>Recent Earnings Ledger</h3>
          </div>
          <Table columns={earningColumns} data={earnings.slice(0, 15)} loading={loading} />
        </div>

        <div className="table-card">
          <div className="card-header">
            <h3>Payout Withdrawal Requests</h3>
          </div>
          <Table columns={payoutColumns} data={payouts} loading={loading} />
        </div>
      </div>

      <style jsx global>{`
        .earnings-page {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 28px;
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
          background: linear-gradient(135deg, #7c3aed, #6d28d9);
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
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.25);
        }

        .btn-payout-trigger:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(124, 58, 237, 0.35);
        }

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
        .summary-card .icon-wrapper.orders { background: #eff6ff; }

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

        .tables-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        .table-card {
          background: #fff;
          border-radius: 20px;
          padding: 24px;
          border: 1px solid #f1f5f9;
        }

        .card-header h3 {
          margin: 0 0 16px 0;
          font-size: 17px;
          font-weight: 700;
          color: #1e293b;
        }

        .status-badge {
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          text-transform: capitalize;
        }

        .status-badge.status-completed, .status-badge.status-paid, .status-badge.status-available { background: #dcfce7; color: #15803d; }
        .status-badge.status-pending { background: #fef3c7; color: #b45309; }
        .status-badge.status-processing { background: #ede9fe; color: #6d28d9; }
        .status-badge.status-rejected, .status-badge.status-failed { background: #fee2e2; color: #b91c1c; }

        .font-bold { font-weight: 700; }
        .text-green { color: #10b981; }

        @media (max-width: 900px) {
          .summary-cards { grid-template-columns: repeat(2, 1fr); }
          .tables-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 600px) {
          .summary-cards { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
