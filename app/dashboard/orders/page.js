'use client';

import { useState, useEffect } from 'react';
import Table from '@/components/UI/Table';
import Button from '@/components/UI/Button';
import Select from '@/components/UI/Select';
import Modal from '@/components/UI/Modal';
import { useDashboard } from '@/context/DashboardContext';
import { orderService } from '@/services/orderService';

export default function OrdersPage() {
  const { orders: contextOrders, loading } = useDashboard();
  const getPaymentStatusColor = (paymentStatus) => {
    const status = (paymentStatus || '').toLowerCase();
    switch (status) {
      case 'paid': return { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' };
      case 'failed': return { bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444' };
      case 'pending_payment':
      case 'pending':
      default: return { bg: '#fffbeb', text: '#b45309', dot: '#f59e0b' };
    }
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [trackingData, setTrackingData] = useState(null);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [isSellerTrackingModalOpen, setIsSellerTrackingModalOpen] = useState(false);

  useEffect(() => {
    if (!selectedOrder) {
      setOrderDetails(null);
      setTrackingData(null);
      return;
    }
    const fetchDetails = async () => {
      setLoadingDetails(true);
      setLoadingTracking(true);
      try {
        const details = await orderService.getOrderDetails(selectedOrder.rawId);
        setOrderDetails(details);

        const awb = details?.awb_number || selectedOrder.awb_number;
        if (awb) {
          const res = await fetch(`/api/shipping/track?waybill=${awb}`);
          if (res.ok) {
            const trackRes = await res.json();
            if (trackRes.success) {
              setTrackingData(trackRes.tracking);
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch order details or tracking:', e);
      } finally {
        setLoadingDetails(false);
        setLoadingTracking(false);
      }
    };
    fetchDetails();
  }, [selectedOrder]);

  const handleStatusChange = async (newStatus) => {
    if (!selectedOrder) return;
    try {
      await orderService.updateOrderStatus(selectedOrder.rawId, newStatus);
      alert(`Order status updated successfully to: ${newStatus}`);
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert('Failed to update order status: ' + e.message);
    }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  const [filters, setFilters] = useState({
    status: [],
    paymentStatus: [],
    amount: 'All',
    dateRange: 'all',
    customerType: 'All Customers',
    shippingMethod: 'All Methods',
    sortBy: 'newest'
  });

  const orders = (contextOrders || []).map(o => ({
    id: String(o.id || '').slice(0, 8).toUpperCase(),
    rawId: o.id,
    customer: o.customer_name,
    email: o.customer_email,
    phone: o.customer_phone || 'N/A',
    date: o.created_at,
    total: parseFloat(o.total_amount || 0),
    status: o.status,
    payment: o.payment_provider === 'COD' && o.payment_status === 'pending' ? 'Pay on Delivery' : (o.payment_status || 'Pending'),
    payment_provider: o.payment_provider,
    shipping_address: o.shipping_address,
    shipping_address_line1: o.shipping_address_line1,
    shipping_address_line2: o.shipping_address_line2,
    shipping_address_city: o.shipping_address_city,
    shipping_address_state: o.shipping_address_state,
    shipping_address_pincode: o.shipping_address_pincode,
    shipping_address_country: o.shipping_address_country,
    shipping_provider: o.shipping_provider,
    shipment_id: o.shipment_id,
    awb_number: o.awb_number,
    courier_name: o.courier_name,
    tracking_number: o.tracking_number,
    tracking_url: o.tracking_url,
    shipping_status: o.shipping_status || 'Pending',
    estimated_delivery: o.estimated_delivery,
    shipped_at: o.shipped_at,
    delivered_at: o.delivered_at
  }));

  const filteredOrders = orders.filter(order => {
    const matchesSearch = String(order.id || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                         String(order.customer || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filters.status.length === 0 || filters.status.some(s => {
      const orderStatusLower = order.status.toLowerCase();
      const sLower = s.toLowerCase();
      if (sLower === 'pending') {
        return orderStatusLower === 'pending' || orderStatusLower === 'pending_payment' || orderStatusLower === 'awaiting_payment';
      }
      if (sLower === 'processing') {
        return orderStatusLower === 'processing' || orderStatusLower === 'confirmed';
      }
      return orderStatusLower === sLower;
    });
    
    const matchesPayment = filters.paymentStatus.length === 0 || filters.paymentStatus.some(p => {
      const orderPaymentLower = order.payment.toLowerCase();
      const pLower = p.toLowerCase();
      if (pLower === 'paid') {
        return orderPaymentLower === 'paid';
      }
      if (pLower === 'unpaid' || pLower === 'pending') {
        return orderPaymentLower === 'unpaid' || orderPaymentLower === 'pending' || orderPaymentLower === 'pending_payment';
      }
      return orderPaymentLower === pLower;
    }); 

    let matchesAmount = true;
    if (filters.amount === '₹0 - ₹100') matchesAmount = order.total <= 100;
    else if (filters.amount === '₹100 - ₹500') matchesAmount = order.total > 100 && order.total <= 500;
    else if (filters.amount === '₹500+') matchesAmount = order.total > 500;

    return matchesSearch && matchesStatus && matchesAmount && matchesPayment;
  }).sort((a, b) => {
    if (filters.sortBy === 'newest') return new Date(b.date) - new Date(a.date);
    if (filters.sortBy === 'oldest') return new Date(a.date) - new Date(b.date);
    if (filters.sortBy === 'highest') return b.total - a.total;
    if (filters.sortBy === 'lowest') return a.total - b.total;
    return 0;
  });

  const toggleFilter = (type, value) => {
    setFilters(prev => {
      const current = prev[type];
      const next = current.includes(value) 
        ? current.filter(v => v !== value) 
        : [...current, value];
      return { ...prev, [type]: next };
    });
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    setFilters({
      status: [],
      paymentStatus: [],
      amount: 'All',
      dateRange: 'all',
      customerType: 'All Customers',
      shippingMethod: 'All Methods',
      sortBy: 'newest'
    });
  };

  const getStatusColor = (statusVal) => {
    const status = (statusVal || '').toLowerCase();
    switch (status) {
      case 'delivered': return { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' };
      case 'shipped': return { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' };
      case 'pending': 
      case 'pending_payment':
      case 'awaiting_payment':
        return { bg: '#fffbeb', text: '#b45309', dot: '#f59e0b' };
      case 'cancelled': return { bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444' };
      case 'processing':
      case 'confirmed':
        return { bg: '#f5f3ff', text: '#6d28d9', dot: '#8b5cf6' };
      case 'refunded': return { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' };
      default: return { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' };
    }
  };

  const activeFilterCount = filters.status.length + filters.paymentStatus.length + 
                           (filters.amount !== 'All' ? 1 : 0) + 
                           (filters.customerType !== 'All Customers' ? 1 : 0);

  const exportToCSV = () => {
    const headers = ['Order ID', 'Customer', 'Status', 'Payment', 'Total', 'Date'];
    const rows = filteredOrders.map(o => [
      o.id,
      o.customer,
      o.status,
      o.payment,
      o.total,
      o.date
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `orders_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculate dynamic summary counts from context
  const totalOrdersCount = orders.length;
  const paidOrdersCount = orders.filter(o => o.payment.toLowerCase() === 'paid').length;
  const pendingPaymentsCount = orders.filter(o => o.payment.toLowerCase() === 'pending' || o.payment.toLowerCase() === 'pending_payment').length;
  const failedPaymentsCount = orders.filter(o => o.payment.toLowerCase() === 'failed').length;
  const cancelledOrdersCount = orders.filter(o => o.status.toLowerCase() === 'cancelled' || o.status.toLowerCase() === 'refunded').length;

  // Calculate dynamic monthly trends to replace hardcoded values
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const currentPeriodOrders = orders.filter(o => new Date(o.date) >= thirtyDaysAgo);
  const previousPeriodOrders = orders.filter(o => {
    const d = new Date(o.date);
    return d >= sixtyDaysAgo && d < thirtyDaysAgo;
  });

  const getGrowthText = (curr, prev) => {
    if (prev > 0) {
      const pct = ((curr - prev) / prev) * 100;
      return `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(0)}% from last month`;
    }
    return curr > 0 ? '↑ 100% from last month' : '0% from last month';
  };

  const getGrowthClass = (curr, prev) => {
    if (prev > 0) {
      return ((curr - prev) / prev) >= 0 ? 'positive' : 'negative';
    }
    return curr > 0 ? 'positive' : 'neutral';
  };

  const totalGrowthText = getGrowthText(currentPeriodOrders.length, previousPeriodOrders.length);
  const totalGrowthClass = getGrowthClass(currentPeriodOrders.length, previousPeriodOrders.length);

  const paidGrowthText = getGrowthText(
    currentPeriodOrders.filter(o => o.payment.toLowerCase() === 'paid').length,
    previousPeriodOrders.filter(o => o.payment.toLowerCase() === 'paid').length
  );
  const paidGrowthClass = getGrowthClass(
    currentPeriodOrders.filter(o => o.payment.toLowerCase() === 'paid').length,
    previousPeriodOrders.filter(o => o.payment.toLowerCase() === 'paid').length
  );

  const pendingPaymentsGrowthText = getGrowthText(
    currentPeriodOrders.filter(o => o.payment.toLowerCase() === 'pending' || o.payment.toLowerCase() === 'pending_payment').length,
    previousPeriodOrders.filter(o => o.payment.toLowerCase() === 'pending' || o.payment.toLowerCase() === 'pending_payment').length
  );
  const pendingPaymentsGrowthClass = getGrowthClass(
    currentPeriodOrders.filter(o => o.payment.toLowerCase() === 'pending' || o.payment.toLowerCase() === 'pending_payment').length,
    previousPeriodOrders.filter(o => o.payment.toLowerCase() === 'pending' || o.payment.toLowerCase() === 'pending_payment').length
  );

  const failedPaymentsGrowthText = getGrowthText(
    currentPeriodOrders.filter(o => o.payment.toLowerCase() === 'failed').length,
    previousPeriodOrders.filter(o => o.payment.toLowerCase() === 'failed').length
  );
  const failedPaymentsGrowthClass = getGrowthClass(
    currentPeriodOrders.filter(o => o.payment.toLowerCase() === 'failed').length,
    previousPeriodOrders.filter(o => o.payment.toLowerCase() === 'failed').length
  );

  const cancelledGrowthText = getGrowthText(
    currentPeriodOrders.filter(o => o.status.toLowerCase() === 'cancelled' || o.status.toLowerCase() === 'refunded').length,
    previousPeriodOrders.filter(o => o.status.toLowerCase() === 'cancelled' || o.status.toLowerCase() === 'refunded').length
  );
  const cancelledGrowthClass = getGrowthClass(
    currentPeriodOrders.filter(o => o.status.toLowerCase() === 'cancelled' || o.status.toLowerCase() === 'refunded').length,
    previousPeriodOrders.filter(o => o.status.toLowerCase() === 'cancelled' || o.status.toLowerCase() === 'refunded').length
  );

  return (
    <div className="orders-page">
      <div className="header-row">
        <div className="header-left">
          <h1>Orders</h1>
          <p>Track and manage customer orders.</p>
        </div>
        <div className="header-right">
          <button className="export-btn" onClick={exportToCSV}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Export CSV
          </button>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card">
          <div className="card-top">
            <div className="icon-wrapper" style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
            </div>
            <div className="card-info">
              <span className="value">{totalOrdersCount}</span>
              <span className="label">Total Orders</span>
            </div>
          </div>
          <div className={`trend ${totalGrowthClass}`}>{totalGrowthText}</div>
        </div>
        <div className="summary-card">
          <div className="card-top">
            <div className="icon-wrapper" style={{ background: '#f0fdf4', color: '#22c55e' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <div className="card-info">
              <span className="value">{paidOrdersCount}</span>
              <span className="label">Paid Orders</span>
            </div>
          </div>
          <div className={`trend ${paidGrowthClass}`}>{paidGrowthText}</div>
        </div>
        <div className="summary-card">
          <div className="card-top">
            <div className="icon-wrapper" style={{ background: '#fffbeb', color: '#f59e0b' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <div className="card-info">
              <span className="value">{pendingPaymentsCount}</span>
              <span className="label">Pending Payments</span>
            </div>
          </div>
          <div className={`trend ${pendingPaymentsGrowthClass}`}>{pendingPaymentsGrowthText}</div>
        </div>
        <div className="summary-card">
          <div className="card-top">
            <div className="icon-wrapper" style={{ background: '#fef2f2', color: '#ef4444' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
            </div>
            <div className="card-info">
              <span className="value">{failedPaymentsCount}</span>
              <span className="label">Failed Payments</span>
            </div>
          </div>
          <div className={`trend ${failedPaymentsGrowthClass}`}>{failedPaymentsGrowthText}</div>
        </div>
        <div className="summary-card">
          <div className="card-top">
            <div className="icon-wrapper" style={{ background: '#f1f5f9', color: '#475569' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
            </div>
            <div className="card-info">
              <span className="value">{cancelledOrdersCount}</span>
              <span className="label">Cancelled</span>
            </div>
          </div>
          <div className={`trend ${cancelledGrowthClass}`}>{cancelledGrowthText}</div>
        </div>
      </div>

      <div className="actions-bar">
        <div className="search-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input 
            type="text" 
            placeholder="Search by order ID or customer name..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="action-right-group">
          <button className={`filter-btn-toggle ${isFilterOpen ? 'active' : ''}`} onClick={() => setIsFilterOpen(!isFilterOpen)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            Filters
            {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
          </button>
          
          <div className="sort-dropdown-container">
            <select className="bar-select" value={filters.sortBy} onChange={(e) => handleFilterChange('sortBy', e.target.value)}>
              <option value="newest">Sort: Newest First</option>
              <option value="oldest">Sort: Oldest First</option>
              <option value="highest">Sort: Highest Amount</option>
              <option value="lowest">Sort: Lowest Amount</option>
            </select>
          </div>
        </div>
      </div>

      {(activeFilterCount > 0 || searchQuery) && (
        <div className="active-filters-row">
          <div className="active-chips">
            <span className="results-text">{filteredOrders.length} orders found</span>
            {filters.status.map(s => (
              <div key={s} className="filter-chip">
                Status: {s}
                <button onClick={() => toggleFilter('status', s)}>&times;</button>
              </div>
            ))}
            {filters.amount !== 'All' && (
              <div className="filter-chip">
                Amount: {filters.amount}
                <button onClick={() => handleFilterChange('amount', 'All')}>&times;</button>
              </div>
            )}
          </div>
          <button className="clear-all-btn" onClick={resetFilters}>Clear all</button>
        </div>
      )}

      <div className="quick-filters-bar">
        <button className={`quick-chip ${filters.status.includes('Pending') ? 'active' : ''}`} onClick={() => toggleFilter('status', 'Pending')}>
          <span className="dot yellow"></span> Pending
        </button>
        <button className={`quick-chip ${filters.status.includes('Cancelled') ? 'active' : ''}`} onClick={() => toggleFilter('status', 'Cancelled')}>
          <span className="dot red"></span> Cancelled
        </button>
        <button className={`quick-chip ${filters.amount === '₹500+' ? 'active' : ''}`} onClick={() => handleFilterChange('amount', filters.amount === '₹500+' ? 'All' : '$500+')}>
          <span className="dot purple"></span> High Value (₹500+)
        </button>
        <button className="quick-chip">
          <span className="dot blue"></span> COD Orders
        </button>
        <button className="quick-chip">
          <span className="dot green"></span> Today
        </button>
      </div>

      <div className="list-container">
        <div className="list-header">
          <div className="col-id">ORDER ID</div>
          <div className="col-customer">CUSTOMER</div>
          <div className="col-date">DATE</div>
          <div className="col-total">TOTAL</div>
          <div className="col-status">STATUS</div>
          <div className="col-actions">ACTIONS</div>
        </div>

        <div className="list-body">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading orders...</div>
          ) : filteredOrders.map(order => {
            const status = getStatusColor(order.status);
            return (
              <div key={order.id} className="order-row">
                {/* Desktop-only Columns Container */}
                <div className="desktop-columns">
                  <div className="col-id"><strong>{order.id}</strong></div>
                  <div className="col-customer">
                    <div className="cust-info">
                      <strong>{order.customer || 'Guest Customer'}</strong>
                      <span>{order.email || 'no-email@example.com'}</span>
                    </div>
                  </div>
                  <div className="col-date">
                    <div className="date-info">
                      <strong>{new Date(order.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                      <span>10:30 AM</span>
                    </div>
                  </div>
                  <div className="col-total"><strong>₹{order.total.toFixed(2)}</strong></div>
                  <div className="col-status">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="status-pill" style={{ background: status.bg, color: status.text }}>
                        <span className="dot" style={{ background: status.dot }}></span>
                        {order.status}
                      </span>
                      <span className="status-pill" style={{ 
                        background: getPaymentStatusColor(order.payment).bg, 
                        color: getPaymentStatusColor(order.payment).text,
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '99px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        fontWeight: '700'
                      }}>
                        <span className="dot" style={{ 
                          background: getPaymentStatusColor(order.payment).dot,
                          width: '5px',
                          height: '5px',
                          borderRadius: '50%',
                          marginRight: '4px'
                        }}></span>
                        {order.payment}
                      </span>
                    </div>
                  </div>
                  <div className="col-actions">
                    <div className="action-btns">
                      <button className="row-btn view" onClick={() => setSelectedOrder(order)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        View Details
                      </button>
                    </div>
                  </div>
                </div>

                {/* Mobile-only Card Wrapper */}
                <div className="mobile-card-wrapper">
                  <div className="mobile-card-top">
                    {/* Left Icon */}
                    <div className="mobile-order-icon" style={{ background: status.bg, color: status.text }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    </div>

                    {/* Middle Info Column */}
                    <div className="mobile-order-info">
                      {/* Row 1: Date & Badge 1 */}
                      <div className="mobile-date-badge-row">
                        <div className="mobile-date-row">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                          <span>{new Date(order.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                        <span className="status-pill-mini" style={{ background: status.bg, color: status.text }}>
                          <span className="dot" style={{ background: status.dot }}></span>
                          {order.status}
                        </span>
                      </div>

                      {/* Row 2: Time & Badge 2 */}
                      <div className="mobile-time-badge-row">
                        <div className="mobile-time-row">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                          <span>{new Date(order.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                        </div>
                        <span className="status-pill-mini" style={{ 
                          background: getPaymentStatusColor(order.payment).bg, 
                          color: getPaymentStatusColor(order.payment).text,
                        }}>
                          <span className="dot" style={{ background: getPaymentStatusColor(order.payment).dot }}></span>
                          {order.payment}
                        </span>
                      </div>

                      {/* Row 3: Name & Price Flex Container */}
                      <div className="mobile-name-price-row">
                        <span className="mobile-cust-name-lbl">
                          {order.customer || 'Guest Customer'}
                        </span>
                        <div className="mobile-price-lbl">
                          ₹{order.total.toFixed(2)}
                        </div>
                      </div>

                      {/* Row 4: Order ID */}
                      <span className="mobile-order-id-lbl">
                        ID: {order.id}
                      </span>

                      {/* Row 5: Email */}
                      <div className="mobile-cust-email-row">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                        <span>{order.email || 'no-email@example.com'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mobile-card-footer">
                    <button className="mobile-details-btn" onClick={() => setSelectedOrder(order)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="list-footer">
          <p>Showing 1 to {filteredOrders.length} of 24 orders</p>
          <div className="footer-right">
            <button className="nav-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
            <button className="num-btn active">1</button>
            <button className="num-btn">2</button>
            <button className="num-btn">3</button>
            <button className="num-btn">...</button>
            <button className="num-btn">6</button>
            <button className="nav-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
          </div>
        </div>
      </div>

      {/* Filter Drawer */}
      <div className={`filter-drawer ${isFilterOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <h2>Filter Orders</h2>
          <button className="close-drawer" onClick={() => setIsFilterOpen(false)}>&times;</button>
        </div>
        
        <div className="drawer-content">
          <div className="filter-section">
            <div className="section-header">
              <h3>Order Status</h3>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </div>
            <div className="filter-options">
              {['Delivered', 'Shipped', 'Pending', 'Cancelled', 'Refunded', 'Processing'].map(s => (
                <label key={s} className="checkbox-label">
                  <input type="checkbox" checked={filters.status.includes(s)} onChange={() => toggleFilter('status', s)} />
                  <span className="checkbox-custom"></span>
                  {s}
                </label>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <div className="section-header">
              <h3>Payment Status</h3>
            </div>
            <div className="filter-options">
              {['Paid', 'Unpaid', 'Refunded', 'Failed'].map(p => (
                <label key={p} className="checkbox-label">
                  <input type="checkbox" checked={filters.paymentStatus.includes(p)} onChange={() => toggleFilter('paymentStatus', p)} />
                  <span className="checkbox-custom"></span>
                  {p}
                </label>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <div className="section-header">
              <h3>Order Amount</h3>
            </div>
            <div className="filter-options">
              {['All', '₹0 - ₹100', '₹100 - ₹500', '₹500+'].map(a => (
                <label key={a} className="radio-label">
                  <input type="radio" name="oAmount" checked={filters.amount === a} onChange={() => handleFilterChange('amount', a)} />
                  <span className="radio-custom"></span>
                  {a}
                </label>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <div className="section-header">
              <h3>Date Range</h3>
            </div>
            <select className="drawer-select" value={filters.dateRange} onChange={(e) => handleFilterChange('dateRange', e.target.value)}>
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="last7">Last 7 Days</option>
              <option value="last30">Last 30 Days</option>
            </select>
          </div>

          <div className="filter-section">
            <div className="section-header">
              <h3>Customer Type</h3>
            </div>
            <div className="filter-options">
              {['All Customers', 'New Customers', 'Returning Customers'].map(ct => (
                <label key={ct} className="radio-label">
                  <input type="radio" name="cType" checked={filters.customerType === ct} onChange={() => handleFilterChange('customerType', ct)} />
                  <span className="radio-custom"></span>
                  {ct}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="drawer-footer">
          <button className="reset-btn" onClick={resetFilters}>Reset</button>
          <button className="apply-btn" onClick={() => setIsFilterOpen(false)}>Apply Filters</button>
        </div>
      </div>
      {isFilterOpen && <div className="drawer-overlay" onClick={() => setIsFilterOpen(false)}></div>}

      <style jsx>{`
        .orders-page {
          display: flex;
          flex-direction: column;
          gap: 32px;
          max-width: 100%;
          overflow-x: hidden;
        }

        .breadcrumbs {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #94a3b8;
          margin-bottom: -8px;
        }

        .breadcrumbs svg { color: #cbd5e1; }
        .breadcrumbs span.current { color: #8b5cf6; font-weight: 600; }

        .header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-left h1 {
          font-size: 28px;
          font-weight: 800;
          color: #1e293b;
          margin: 0;
        }

        .header-left p {
          font-size: 14px;
          color: #64748b;
          margin: 4px 0 0 0;
        }

        .status-select-wrapper {
          position: relative;
          min-width: 160px;
        }

        .status-select-wrapper select {
          width: 100%;
          padding: 10px 40px 10px 16px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: #fff;
          font-size: 14px;
          font-weight: 600;
          color: #1e293b;
          appearance: none;
          cursor: pointer;
          outline: none;
        }

        .select-icon {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          color: #64748b;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
        }

        .summary-card {
          background: #fff;
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.02);
          border: 1px solid #f1f5f9;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
        }

        .summary-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 12px 24px rgba(0,0,0,0.06);
          border-color: #e0e7ff;
        }

        .card-top {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .icon-wrapper {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .icon-wrapper svg {
          width: 18px;
          height: 18px;
        }

        .card-info {
          display: flex;
          flex-direction: column;
        }

        .card-info .value {
          font-size: 20px;
          font-weight: 800;
          color: #1e293b;
        }

        .card-info .label {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
        }

        .trend {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 0;
        }

        .trend.positive { color: #10b981; }
        .trend.negative { color: #ef4444; }

        .actions-bar {
          display: flex;
          justify-content: space-between;
          gap: 16px;
        }

        .search-box {
          flex: 1;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          display: flex;
          align-items: center;
          padding: 0 16px;
          gap: 12px;
          height: 48px;
        }

        .search-box input {
          border: none;
          outline: none;
          width: 100%;
          font-size: 14px;
          color: #1e293b;
          background: transparent;
        }

        .action-right-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .filter-btn-toggle {
          background: #fff;
          border: 1px solid #e2e8f0;
          padding: 0 20px;
          height: 48px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          font-size: 14px;
          color: #1e293b;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
        }

        .filter-btn-toggle:hover, .filter-btn-toggle.active {
          border-color: #6366f1;
          color: #6366f1;
          background: #f5f3ff;
        }

        .filter-badge {
          background: #6366f1;
          color: #fff;
          font-size: 10px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          margin-left: 4px;
        }

        .sort-dropdown-container {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          height: 48px;
          display: flex;
          align-items: center;
          overflow: hidden;
        }

        .bar-select {
          border: none;
          outline: none;
          padding: 0 16px;
          height: 100%;
          font-weight: 600;
          font-size: 14px;
          color: #1e293b;
          cursor: pointer;
          background: transparent;
        }

        .active-filters-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: -12px;
        }

        .active-chips {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .results-text {
          font-size: 14px;
          font-weight: 700;
          color: #1e293b;
          margin-right: 8px;
        }

        .filter-chip {
          background: #f5f3ff;
          color: #6366f1;
          padding: 6px 12px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #e0e7ff;
        }

        .filter-chip button {
          background: none; border: none; color: #6366f1; font-size: 16px; cursor: pointer; padding: 0;
        }

        .clear-all-btn {
          background: none; border: none; color: #6366f1; font-weight: 700; font-size: 13px;
          cursor: pointer; text-decoration: underline;
        }

        .quick-filters-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: -8px;
        }

        .quick-chip {
          background: #fff;
          border: 1px solid #e2e8f0;
          padding: 8px 16px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          color: #475569;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .quick-chip:hover, .quick-chip.active {
          border-color: #6366f1;
          background: #fbfaff;
          color: #6366f1;
        }

        .quick-chip .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .dot.yellow { background: #f59e0b; }
        .dot.red { background: #ef4444; }
        .dot.purple { background: #8b5cf6; }
        .dot.blue { background: #3b82f6; }
        .dot.green { background: #22c55e; }

        .filter-drawer {
          position: fixed;
          top: 0;
          right: 0;
          width: 380px;
          max-width: 100vw;
          height: 100%;
          background: #fff;
          box-shadow: -10px 0 30px rgba(0,0,0,0.05);
          z-index: 1000;
          transform: translateX(100%);
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          flex-direction: column;
        }

        .filter-drawer.open {
          transform: translateX(0);
        }

        .drawer-header {
          padding: 24px;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .drawer-header h2 {
          font-size: 18px;
          font-weight: 800;
          color: #1e293b;
          margin: 0;
        }

        .close-drawer {
          background: #f1f5f9;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          color: #64748b;
          cursor: pointer;
        }

        .drawer-content {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .filter-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .section-header h3 {
          font-size: 14px;
          font-weight: 700;
          color: #1e293b;
          margin: 0;
        }

        .filter-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .checkbox-label, .radio-label {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: #475569;
          cursor: pointer;
          font-weight: 500;
        }

        .checkbox-custom, .radio-custom {
          width: 18px;
          height: 18px;
          border: 2px solid #e2e8f0;
          border-radius: 5px;
          position: relative;
          transition: all 0.2s;
        }

        .radio-custom { border-radius: 50%; }

        input:checked + .checkbox-custom {
          background: #6366f1;
          border-color: #6366f1;
        }

        input:checked + .radio-custom {
          border-color: #6366f1;
        }

        input:checked + .radio-custom::after {
          content: '';
          position: absolute;
          width: 8px;
          height: 8px;
          background: #6366f1;
          border-radius: 50%;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        .drawer-select {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .drawer-footer {
          padding: 24px;
          border-top: 1px solid #f1f5f9;
          display: flex;
          gap: 12px;
        }

        .reset-btn {
          flex: 1;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: #fff;
          font-weight: 700;
          color: #64748b;
          cursor: pointer;
        }

        .apply-btn {
          flex: 2;
          padding: 12px;
          border-radius: 12px;
          border: none;
          background: #6366f1;
          color: #fff;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        }

        .drawer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(15, 23, 42, 0.1);
          backdrop-filter: blur(2px);
          z-index: 999;
        }

        .list-container {
          background: #fff;
          border-radius: 20px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.02);
          overflow-x: auto;
          border: 1px solid #f1f5f9;
        }

        .list-header {
          background: #f8fafc;
          padding: 16px 24px;
          display: flex;
          align-items: center;
          gap: 16px;
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #f1f5f9;
          text-transform: uppercase;
        }

        .col-id { flex: 1.2; }
        .col-customer { flex: 2.5; }
        .col-date { flex: 1.5; }
        .col-total { flex: 0.6; }
        .col-status { flex: 1.7; }
        .col-actions { flex: 1.8; text-align: right; }

        .order-row {
          padding: 16px 24px;
          display: flex;
          align-items: center;
          gap: 16px;
          border-bottom: 1px solid #f1f5f9;
          transition: background 0.2s;
        }

        .order-row:hover { background: #fbfaff; }

        .cust-info, .date-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .cust-info strong, .date-info strong {
          color: #1e293b;
          font-size: 14px;
        }

        .cust-info span, .date-info span {
          color: #94a3b8;
          font-size: 12px;
        }

        .status-pill {
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .action-btns {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 12px;
        }

        .row-btn.view {
          padding: 8px 16px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
          cursor: pointer;
          transition: all 0.2s;
          color: #1e293b;
        }

        .row-btn.view:hover { background: #f8fafc; border-color: #cbd5e1; }

        .menu-btn {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
        }

        .list-footer {
          padding: 20px 32px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .list-footer p { font-size: 13px; color: #64748b; }
        .footer-right { display: flex; align-items: center; gap: 8px; }

        .nav-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          cursor: pointer;
        }

        .num-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: none;
          background: transparent;
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
        }
        .num-btn.active { background: #6366f1; color: #fff; }



        /* Style for the title passed as prop */
        .modal-header-content {
          display: flex;
          align-items: center;
          gap: 12px;
          text-align: left;
        }

        :global(.modal-container) :global(h2) {
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
        }
        
        :global(.orders-page) + :global(.modal-overlay) :global(.modal-header) {
          padding: 16px 32px !important;
        }

        .modal-icon.detail-icon {
          width: 44px;
          height: 44px;
          background: #f5f3ff;
          color: #8b5cf6;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .title-with-badge {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .order-badge {
          background: #f5f3ff;
          color: #8b5cf6;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        .modal-title-box h2 {
          font-size: 18px;
          font-weight: 800;
          color: #1e293b;
          margin: 0;
        }

        .modal-title-box p {
          font-size: 13px;
          color: #64748b;
          margin: 2px 0 0 0;
        }

        .order-details-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 4px 0;
        }

        .info-bar {
          background: #f8fafc;
          border-radius: 16px;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border: 1px solid #f1f5f9;
          flex-wrap: wrap;
          gap: 16px;
        }

        .info-item {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .info-item.customer { flex: 1.5; }
        .info-item.date { flex: 1.2; }
        .info-item.payment { flex: 1; }
        .info-item.status { flex: 1; }

        .info-label {
          font-size: 10px;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }

        .info-val-box {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .val-icon {
          width: 32px;
          height: 32px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #8b5cf6;
        }

        .val-text {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .val-text strong { font-size: 14px; color: #1e293b; }
        .val-text span { font-size: 12px; color: #94a3b8; }

        .info-divider {
          width: 1px;
          height: 32px;
          background: #e2e8f0;
          margin: 0 16px;
        }

        @media (max-width: 1024px) {
          .info-divider { display: none; }
          .info-item { min-width: 200px; flex: 1; }
        }

        .val-select-wrapper {
          position: relative;
        }

        .val-select-wrapper select {
          width: 100%;
          padding: 8px 32px 8px 12px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          background: #fff;
          font-size: 13px;
          font-weight: 600;
          appearance: none;
          cursor: pointer;
        }

        .select-arrow {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          color: #64748b;
        }

        .section-title {
          font-size: 14px;
          font-weight: 800;
          color: #1e293b;
          margin-bottom: 10px;
        }

        .items-table {
          border: 1px solid #f1f5f9;
          border-radius: 12px;
          overflow: hidden;
        }

        .table-row {
          display: flex;
          align-items: center;
          padding: 10px 20px;
          border-bottom: 1px solid #f1f5f9;
        }

        .table-row.head {
          background: #f8fafc;
          font-size: 10px;
          font-weight: 800;
          color: #94a3b8;
          letter-spacing: 0.8px;
        }

        .col-prod { flex: 2.5; }
        .col-qty { flex: 0.8; text-align: center; }
        .col-price { flex: 1.2; text-align: center; }
        .col-total { flex: 1.2; text-align: right; }

        .prod-item-box {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .prod-img {
          width: 44px;
          height: 44px;
          background: #f1f5f9;
          border-radius: 8px;
          background-image: url('https://images.unsplash.com/photo-1581428982868-e410dd047a90?w=100&q=80');
          background-size: cover;
        }

        .prod-meta { display: flex; flex-direction: column; }
        .prod-meta strong { font-size: 13px; color: #1e293b; }
        .prod-meta span { font-size: 11px; color: #94a3b8; }

        .total-summary-box {
          background: #fbfaff;
          border: 1px solid #f5f3ff;
          border-radius: 16px;
          padding: 12px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 4px;
        }

        .total-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .wallet-icon {
          width: 32px;
          height: 32px;
          background: #f5f3ff;
          color: #8b5cf6;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .total-left strong { font-size: 15px; color: #1e293b; }
        .total-val { font-size: 20px; font-weight: 800; color: #6366f1; }

        .timeline {
          display: flex;
          flex-direction: column;
        }

        .timeline-item {
          display: flex;
          gap: 16px;
        }

        .time-line-track {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .time-dot {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #f0fdf4;
          color: #22c55e;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          z-index: 1;
        }

        .time-dot.blue { background: #eff6ff; color: #3b82f6; }

        .time-line-track .line {
          width: 2px;
          flex: 1;
          background: #f1f5f9;
          margin: 4px 0;
        }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Delivered': return { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' };
      case 'Shipped': return { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' };
      case 'Pending': return { bg: '#fffbeb', text: '#b45309', dot: '#f59e0b' };
      case 'Cancelled': return { bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444' };
      case 'Processing': return { bg: '#f5f3ff', text: '#6d28d9', dot: '#8b5cf6' };
      case 'Refunded': return { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' };
      default: return { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' };
    }
  };

        .time-content {
          flex: 1;
          display: flex;
          justify-content: space-between;
          padding-bottom: 16px;
        }

        .time-info { display: flex; flex-direction: column; gap: 2px; }
        .time-info strong { font-size: 14px; color: #1e293b; }
        .time-info span { font-size: 12px; color: #94a3b8; }
        .time-user { font-size: 12px; color: #94a3b8; font-weight: 700; }

        .modal-footer-btns {
          display: flex;
          justify-content: flex-end;
          width: 100%;
          padding-top: 12px;
        }

        .close-modal-btn {
          background: #fff;
          border: 1px solid #e2e8f0;
          padding: 8px 32px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          color: #1e293b;
          cursor: pointer;
          transition: all 0.2s;
        }

        .close-modal-btn:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        .primary-btn {
          background: #6366f1;
          color: #fff;
          border: none;
          padding: 8px 32px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        }

        .primary-btn:hover {
          background: #4f46e5;
          transform: translateY(-1px);
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
        }

        .mobile-card-wrapper {
          display: none;
        }
        .desktop-columns {
          display: contents;
        }

        @media (max-width: 768px) {
          .orders-page {
            gap: 16px !important;
          }

          .header-row {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 12px !important;
          }
          .export-btn {
            width: 100% !important;
            justify-content: center !important;
            margin-bottom: 8px !important;
          }

          .summary-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
          }
          .summary-grid .summary-card:last-child {
            grid-column: 1 / span 2 !important;
            justify-self: center !important;
            width: 100% !important;
          }
          .summary-card {
            padding: 12px !important;
          }
          .card-top {
            gap: 12px !important;
          }
          .icon-wrapper {
            width: 36px !important;
            height: 36px !important;
            border-radius: 8px !important;
          }
          .icon-wrapper svg {
            width: 16px !important;
            height: 16px !important;
          }
          .summary-card .value {
            font-size: 18px !important;
          }
          .summary-card .label {
            font-size: 11px !important;
          }
          .trend {
            font-size: 10px !important;
            margin-top: 6px !important;
          }

          .actions-bar {
            flex-direction: column !important;
            gap: 12px !important;
            margin-top: 4px !important;
          }
          .search-box {
            width: 100% !important;
            height: 52px !important;
            border-radius: 14px !important;
            padding: 0 18px !important;
          }
          .search-box svg {
            width: 22px !important;
            height: 22px !important;
          }
          .search-box input {
            font-size: 15px !important;
            height: 100% !important;
          }
          .action-right-group {
            display: flex !important;
            gap: 8px !important;
            width: 100% !important;
          }
          .filter-btn-toggle {
            flex: 4 !important;
            height: 44px !important;
            border-radius: 12px !important;
            justify-content: center !important;
            font-size: 13px !important;
          }
          .sort-dropdown-container {
            flex: 6 !important;
            height: 44px !important;
          }
          .bar-select {
            width: 100% !important;
            height: 100% !important;
            border-radius: 12px !important;
            padding: 0 12px !important;
            font-size: 13px !important;
          }

          .quick-filters-bar {
            display: flex !important;
            overflow-x: auto !important;
            white-space: nowrap !important;
            gap: 10px !important;
            padding: 4px 0 12px 0 !important;
            align-items: center !important;
            -webkit-overflow-scrolling: touch;
          }
          .quick-chip {
            flex-shrink: 0 !important;
            padding: 8px 16px !important;
            font-size: 13px !important;
            height: 38px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            border-radius: 10px !important;
          }

          /* Mobile list deck styling */
          .list-header {
            display: none !important;
          }
          .list-container {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          
          .desktop-columns {
            display: none !important;
          }

          .order-row {
            background: #ffffff !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 20px !important;
            padding: 14px !important;
            margin-bottom: 12px !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.02) !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 0 !important;
          }
          .order-row:hover {
            background: #ffffff !important;
          }

          .mobile-card-wrapper {
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
          }
          .mobile-card-top {
            display: flex !important;
            align-items: flex-start !important;
            justify-content: space-between !important;
            width: 100% !important;
            padding-bottom: 12px !important;
            gap: 16px !important;
          }
          .mobile-order-icon {
            width: 52px !important;
            height: 52px !important;
            border-radius: 12px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
            align-self: flex-start !important;
          }
          .mobile-order-icon svg {
            width: 24px !important;
            height: 24px !important;
          }
          .mobile-order-info {
            display: flex !important;
            flex-direction: column !important;
            gap: 4px !important;
            flex: 1 !important;
            min-width: 0 !important;
          }
          .mobile-date-row, .mobile-time-row {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            font-size: 13.5px !important;
            font-weight: 600 !important;
            color: #1e293b !important;
          }
          .mobile-date-row svg, .mobile-time-row svg {
            color: #6366f1 !important;
            flex-shrink: 0 !important;
          }
          .mobile-date-badge-row, .mobile-time-badge-row {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            width: 100% !important;
            gap: 8px !important;
          }
          .mobile-name-price-row {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 8px !important;
            width: 100% !important;
            margin-top: 4px !important;
          }
          .mobile-cust-name-lbl {
            font-size: 17px !important;
            font-weight: 800 !important;
            color: #1e293b !important;
            word-break: break-word !important;
          }
          .mobile-price-lbl {
            font-size: 17px !important;
            font-weight: 800 !important;
            color: #1e293b !important;
            white-space: nowrap !important;
          }
          .mobile-order-id-lbl {
            font-size: 12.5px !important;
            color: #64748b !important;
            margin-top: 1px !important;
            word-break: break-all !important;
          }
          .mobile-cust-email-row {
            display: flex !important;
            align-items: flex-start !important;
            gap: 6px !important;
            font-size: 12.5px !important;
            color: #64748b !important;
            margin-top: 2px !important;
            min-width: 0 !important;
          }
          .mobile-cust-email-row svg {
            color: #6366f1 !important;
            flex-shrink: 0 !important;
            margin-top: 2px !important;
          }
          .mobile-cust-email-row span {
            word-break: break-all !important;
          }

          .status-pill-mini {
            padding: 4px 10px !important;
            border-radius: 99px !important;
            font-size: 11.5px !important;
            font-weight: 700 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
          }
          .status-pill-mini .dot {
            width: 4px !important;
            height: 4px !important;
            border-radius: 50% !important;
            margin-right: 0 !important;
          }

          .mobile-card-footer {
            display: flex !important;
            gap: 8px !important;
            width: 100% !important;
            padding-top: 12px !important;
            border-top: 1px solid #f1f5f9 !important;
            align-items: center !important;
          }
          .mobile-details-btn {
            flex: 1 !important;
            height: 38px !important;
            border-radius: 10px !important;
            border: 1px solid #e2e8f0 !important;
            background: #ffffff !important;
            color: #475569 !important;
            font-size: 12.5px !important;
            font-weight: 700 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 6px !important;
            cursor: pointer !important;
            transition: all 0.2s;
          }
          .mobile-details-btn:hover {
            background: #f8fafc;
          }
          .mobile-dots-btn {
            width: 38px !important;
            height: 38px !important;
            border-radius: 10px !important;
            border: 1px solid #e2e8f0 !important;
            background: #ffffff !important;
            color: #64748b !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            transition: all 0.2s;
            flex-shrink: 0 !important;
          }
          .mobile-dots-btn:hover {
            background: #f8fafc;
            color: #1e293b;
          }
          
          /* Footer styling */
          .list-footer {
            flex-direction: column !important;
            gap: 12px !important;
            align-items: center !important;
            background: #ffffff !important;
            padding: 16px !important;
            border-radius: 16px !important;
            border: 1px solid #e2e8f0 !important;
            margin-top: 12px !important;
          }
          .footer-right {
            width: 100% !important;
            justify-content: center !important;
          }
        }
        .export-btn {
          background: #6366f1;
          color: #fff;
          border: none;
          padding: 10px 24px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.2);
        }

        .export-btn:hover {
          background: #4f46e5;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.3);
        }

        @media print {
          /* Hide all sibling elements of the modal overlay within .orders-page to prevent extra pages */
          .orders-page > :not(.overlay) {
            display: none !important;
          }
          
          /* Hide global dashboard chrome and action buttons */
          .sidebar, .top-bar, .modal-footer-btns, .close-modal-btn {
            display: none !important;
          }
          
          :global(.overlay) { 
            background: white !important; 
            position: absolute !important; 
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            z-index: 9999 !important;
          }
          
          :global(.modal) { 
            box-shadow: none !important; 
            border: none !important; 
            width: 100% !important; 
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            position: static !important;
            height: auto !important;
            max-height: none !important;
          }
          
          .orders-page { 
            padding: 0 !important; 
            margin: 0 !important; 
          }
        }
      `}</style>

      {/* Keep the detail modal logic */}
      <Modal
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title={selectedOrder && (
          <div className="modal-header-content">
            <div className="modal-icon detail-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </div>
            <div className="modal-title-box">
              <div className="title-with-badge">
                <h2>Order #{selectedOrder.id}</h2>
                <span className="order-badge">OFFICIAL RECEIPT</span>
              </div>
              <p>Review full order details and customer information.</p>
            </div>
          </div>
        )}
        footer={
          <div className="modal-footer-btns">
            <button className="close-modal-btn" onClick={() => setSelectedOrder(null)}>Close</button>
            <button className="primary-btn" onClick={() => window.print()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              Print Receipt
            </button>
          </div>
        }
      >
        <div className="order-details-content">
          <div className="info-bar">
            <div className="info-item customer">
              <span className="info-label">Customer</span>
              <div className="info-val-box">
                <div className="val-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>
                <div className="val-text">
                  <strong>{selectedOrder?.customer || 'Guest Customer'}</strong>
                  <span>{selectedOrder?.email || 'no-email@example.com'}</span>
                </div>
              </div>
            </div>
            <div className="info-divider"></div>
            <div className="info-item date">
              <span className="info-label">Order Date</span>
              <div className="info-val-box">
                <div className="val-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></div>
                <div className="val-text">
                  <strong>{selectedOrder ? new Date(selectedOrder.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</strong>
                  <span>{selectedOrder ? new Date(selectedOrder.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}</span>
                </div>
              </div>
            </div>
            <div className="info-divider"></div>
            <div className="info-item payment">
              <span className="info-label">Payment Status</span>
              <div className="info-val-box">
                <span className="status-pill" style={{ 
                  background: getPaymentStatusColor(selectedOrder?.payment).bg, 
                  color: getPaymentStatusColor(selectedOrder?.payment).text, 
                  padding: '6px 12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontWeight: '700',
                  borderRadius: '99px'
                }}>
                  <span className="dot" style={{ 
                    background: getPaymentStatusColor(selectedOrder?.payment).dot,
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    marginRight: '6px'
                  }}></span>
                  {selectedOrder?.payment}
                </span>
              </div>
            </div>
            <div className="info-divider"></div>
            <div className="info-item status">
              <span className="info-label">Update Status</span>
              {selectedOrder?.payment.toLowerCase() === 'paid' || selectedOrder?.payment_provider === 'COD' || selectedOrder?.payment === 'Pay on Delivery' ? (
                <div className="val-select-wrapper">
                  <select value={selectedOrder?.status} onChange={(e) => handleStatusChange(e.target.value)}>
                    <option value="Pending">Pending</option>
                    <option value="Shipped">Shipped</option>
                    <option value="Delivered">Delivered</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                  <div className="select-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg></div>
                </div>
              ) : (
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#ef4444', background: '#fef2f2', padding: '6px 12px', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                  Processing Disabled (Awaiting Payment)
                </div>
              )}
            </div>
          </div>

          <div className="shipping-address-box" style={{ background: '#f8fafc', borderRadius: '16px', padding: '16px 20px', border: '1px solid #f1f5f9', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span className="info-label" style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Shipping Address & Contact</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ fontSize: '14px', color: '#334155', flex: '1', minWidth: '200px' }}>
                <strong>Address:</strong> <span style={{ marginLeft: '4px' }}>{selectedOrder?.shipping_address || 'No shipping address provided'}</span>
              </div>
              <div style={{ fontSize: '14px', color: '#334155' }}>
                <strong>Phone:</strong> <span style={{ marginLeft: '4px' }}>{selectedOrder?.phone || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Shiprocket Delivery Details Panel */}
          {selectedOrder?.payment.toLowerCase() === 'paid' && (
            <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '16px 20px', border: '1px solid #f1f5f9', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="info-label" style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{selectedOrder?.shipping_provider || 'Delhivery'} Delivery Details</span>
                <span style={{ 
                  fontSize: '12px', 
                  fontWeight: 700, 
                  padding: '4px 10px', 
                  borderRadius: '99px', 
                  background: selectedOrder?.shipping_status === 'Delivered' ? '#ecfdf5' : '#eff6ff', 
                  color: selectedOrder?.shipping_status === 'Delivered' ? '#047857' : '#1d4ed8' 
                }}>
                  {selectedOrder?.shipping_status || 'Pending'}
                </span>
              </div>
              
              {selectedOrder?.awb_number ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#334155' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div><strong>Shipping Provider:</strong> {selectedOrder?.shipping_provider || 'Delhivery'}</div>
                    <div><strong>Courier Name:</strong> {selectedOrder?.courier_name || 'Standard Courier'}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div><strong>AWB / Tracking #:</strong> {selectedOrder?.awb_number}</div>
                    <div><strong>Shipment ID:</strong> {selectedOrder?.shipment_id || 'N/A'}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div><strong>Est. Delivery:</strong> {selectedOrder?.estimated_delivery || 'Not synced'}</div>
                    <div>&nbsp;</div>
                  </div>
                  {(selectedOrder?.shipped_at || selectedOrder?.delivered_at) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px', fontSize: '11px', color: '#64748b' }}>
                      {selectedOrder?.shipped_at && (
                        <div><strong>Shipped At:</strong> {new Date(selectedOrder.shipped_at).toLocaleString()}</div>
                      )}
                      {selectedOrder?.delivered_at && (
                        <div><strong>Delivered At:</strong> {new Date(selectedOrder.delivered_at).toLocaleString()}</div>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <a 
                      href={`/api/shipping/label?order_id=${selectedOrder.rawId}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{ fontSize: '12px', fontWeight: 700, padding: '8px 14px', background: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '8px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      🖨️ Print Shipping Label
                    </a>

                    <button 
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/shipping/pickup', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ orderId: selectedOrder.rawId })
                          });
                          const data = await res.json();
                          if (!res.ok || !data.success) {
                            throw new Error(data.message || 'Failed to schedule pickup');
                          }
                          alert(`Pickup scheduled successfully! Token: ${data.pickup_token_number || 'N/A'}`);
                          window.location.reload();
                        } catch (err) {
                          alert('Error scheduling pickup: ' + err.message);
                        }
                      }}
                      style={{ fontSize: '12px', fontWeight: 700, padding: '8px 14px', background: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      📦 Schedule Pickup
                    </button>

                    <a 
                      href={`/api/shipping/manifest?order_id=${selectedOrder.rawId}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{ fontSize: '12px', fontWeight: 700, padding: '8px 14px', background: '#ffffff', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: '8px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      📋 Print Manifest
                    </a>

                    {selectedOrder?.awb_number && (
                      <button 
                        onClick={() => setIsSellerTrackingModalOpen(true)}
                        style={{ fontSize: '12px', fontWeight: 700, padding: '8px 14px', background: '#0f172a', color: '#ffffff', border: '1px solid #0f172a', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        🚚 Track Shipment
                      </button>
                    )}
                    {selectedOrder?.shipping_status !== 'Cancelled' && selectedOrder?.shipping_status !== 'Delivered' && (
                      <button 
                        onClick={async () => {
                          if (confirm('Are you sure you want to cancel this shipment?')) {
                            try {
                              const res = await fetch('/api/shipping/cancel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ orderId: selectedOrder.rawId })
                              });
                              if (!res.ok) {
                                const text = await res.text().catch(() => '');
                                console.error('❌ [Frontend/Cancel] Failed response:', text);
                                let errMsg = 'Failed to cancel shipment.';
                                try {
                                  const data = JSON.parse(text);
                                  errMsg = data.message || data.error || errMsg;
                                } catch (e) {
                                  errMsg = text.includes('<!DOCTYPE html>') ? 'Internal server error (HTML returned)' : text || errMsg;
                                }
                                throw new Error(errMsg);
                              }
                              alert('Shipment cancelled successfully!');
                              window.location.reload();
                            } catch (err) {
                              alert('Error cancelling shipment: ' + err.message);
                            }
                          }
                        }}
                        style={{ fontSize: '12px', fontWeight: 700, padding: '8px 14px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '8px', cursor: 'pointer' }}
                      >
                        Cancel Shipment
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', background: '#fffbeb', borderRadius: '12px', border: '1px solid #fef3c7', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#78350f' }}>
                    <strong>Shipment not created yet.</strong> Generate AWB to register shipment in Shiprocket.
                  </div>
                  <button 
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/shipping/ship', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ orderId: selectedOrder.rawId })
                        });
                        if (!res.ok) {
                          const text = await res.text().catch(() => '');
                          console.error('❌ [Frontend/Ship] Failed response:', text);
                          let errMsg = 'Failed to generate shipment.';
                          try {
                            const data = JSON.parse(text);
                            errMsg = data.message || data.error || errMsg;
                          } catch (e) {
                            errMsg = text.includes('<!DOCTYPE html>') ? 'Internal server error (HTML returned)' : text || errMsg;
                          }
                          throw new Error(errMsg);
                        }
                        alert('Shipment created and AWB generated successfully!');
                        window.location.reload();
                      } catch (err) {
                        alert('Error generating shipment AWB: ' + err.message);
                      }
                    }}
                    style={{ fontSize: '12px', fontWeight: 700, padding: '8px 14px', background: '#d97706', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                  >
                    Generate AWB / Ship Order
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="items-section">
            <h3 className="section-title">Order Items</h3>
            <div className="items-table">
              <div className="table-row head">
                <div className="col-prod">PRODUCT</div>
                <div className="col-qty">QUANTITY</div>
                <div className="col-price">UNIT PRICE</div>
                <div className="col-total">TOTAL</div>
              </div>
              {loadingDetails ? (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>Loading order items...</div>
              ) : orderDetails?.items?.map((item) => (
                <div key={item.id} className="table-row">
                  <div className="col-prod">
                    <div className="prod-item-box">
                      <img 
                        src={item.productImage || 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=300'} 
                        alt="" 
                        style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', marginRight: '12px' }}
                      />
                      <div className="prod-meta">
                        <strong>{item.productName}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="col-qty">{item.quantity}</div>
                  <div className="col-price">₹{parseFloat(item.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <div className="col-total"><strong>₹{(parseFloat(item.price || 0) * parseInt(item.quantity || 1)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                </div>
              ))}
            </div>
          </div>

          <div className="total-summary-box">
            <div className="total-left">
              <div className="wallet-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M7 15h0M2 9.5h20"></path></svg>
              </div>
              <strong>Order Total</strong>
            </div>
            <div className="total-val">₹{selectedOrder?.total.toFixed(2)}</div>
          </div>

          <div className="timeline-section">
            <h3 className="section-title">Order Timeline</h3>
            <div className="timeline">
              {(() => {
                const getTimelineStepIndex = (status) => {
                  const s = String(status || 'Pending').toLowerCase();
                  if (s === 'pending') return 1;
                  if (s === 'shipment created' || s === 'manifested') return 2;
                  if (s === 'picked up' || s === 'dispatched') return 3;
                  if (s === 'in transit') return 4;
                  if (s === 'out for delivery') return 5;
                  if (s === 'delivered') return 6;
                  return (orderDetails?.awb_number || orderDetails?.tracking_number) ? 2 : 1;
                };

                const currentStatus = trackingData?.status || orderDetails?.shipping_status || 'Pending';
                const currentStepIdx = getTimelineStepIndex(currentStatus);

                const findEventTime = (keywords) => {
                  if (!trackingData?.events) return null;
                  const evt = trackingData.events.find(e => {
                    const statusText = String(e.status).toLowerCase();
                    return keywords.some(k => statusText.includes(k));
                  });
                  return evt ? new Date(evt.time).toLocaleString() : null;
                };

                const steps = [
                  { label: 'Order Placed', desc: orderDetails?.created_at ? new Date(orderDetails.created_at).toLocaleString() : 'Pending', user: orderDetails?.customer_name || 'Customer' },
                  { label: 'Payment Completed', desc: orderDetails?.paid_at ? new Date(orderDetails.paid_at).toLocaleString() : 'Pending Payment', user: 'System' },
                  { label: 'Shipment Created', desc: orderDetails?.shipped_at ? new Date(orderDetails.shipped_at).toLocaleString() : (orderDetails?.awb_number ? 'AWB Allocated' : 'Pending Shipment'), user: 'System' },
                  { label: 'Picked Up', desc: findEventTime(['picked', 'dispatch']) || 'Pending Pickup', user: 'Courier' },
                  { label: 'In Transit', desc: findEventTime(['transit', 'hub', 'in-transit']) || 'Pending Transit', user: 'Courier' },
                  { label: 'Out For Delivery', desc: findEventTime(['out for delivery', 'delivery']) || 'Pending Delivery', user: 'Courier' },
                  { label: 'Delivered', desc: orderDetails?.delivered_at ? new Date(orderDetails.delivered_at).toLocaleString() : (findEventTime(['delivered']) || 'Pending Delivery'), user: 'Courier' }
                ];

                return steps.map((step, idx) => {
                  const isCompleted = idx === 0 || (idx === 1 ? !!orderDetails?.paid_at : idx <= currentStepIdx);
                  const isActive = idx === currentStepIdx;

                  return (
                    <div key={idx} className="timeline-item">
                      <div className="time-line-track">
                        <div className={`time-dot ${isCompleted ? 'active' : ''} ${isActive ? 'blue' : ''}`}>
                          {isCompleted ? (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          ) : (
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#cbd5e1' }} />
                          )}
                        </div>
                        {idx < steps.length - 1 && <div className="line"></div>}
                      </div>
                      <div className="time-content">
                        <div className="time-info">
                          <strong style={{ color: isCompleted ? '#0f172a' : '#94a3b8' }}>{step.label}</strong>
                          <span style={{ color: isCompleted ? '#475569' : '#cbd5e1' }}>{step.desc}</span>
                        </div>
                        <span className="time-user" style={{ color: isCompleted ? '#64748b' : '#cbd5e1' }}>{step.user}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </Modal>

      {/* Seller Live Tracking Modal */}
      {isSellerTrackingModalOpen && (
        <Modal
          isOpen={isSellerTrackingModalOpen}
          onClose={() => setIsSellerTrackingModalOpen(false)}
          title="🚚 Live Shipment Tracking"
        >
          <div style={{ padding: '24px', fontFamily: 'inherit', color: '#0f172a', minWidth: '400px' }}>
            {loadingTracking ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b' }}>
                Loading tracking details...
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0', fontSize: '14px', color: '#334155' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div><strong>Courier:</strong> {orderDetails?.courier_name || 'Delhivery Express'}</div>
                    <div><strong>AWB Number:</strong> {selectedOrder?.awb_number}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                    <div><strong>Status:</strong> {trackingData?.status || orderDetails?.shipping_status || 'Pending'}</div>
                    <div><strong>Est. Delivery:</strong> {trackingData?.estimated_delivery || orderDetails?.estimated_delivery || 'Not synced'}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left', maxHeight: '300px', overflowY: 'auto' }}>
                  {trackingData?.events && trackingData.events.length > 0 ? (
                    trackingData.events.map((evt, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6', marginTop: '4px' }} />
                          {idx < trackingData.events.length - 1 && (
                            <div style={{ width: '2px', flex: 1, background: '#e2e8f0', margin: '4px 0' }} />
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{evt.status}</div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {new Date(evt.time).toLocaleString()} • {evt.location || 'Hub'}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
                      Shipment has been created successfully and is awaiting courier pickup.
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <button 
              onClick={() => setIsSellerTrackingModalOpen(false)}
              style={{
                marginTop: '24px',
                width: '100%',
                padding: '12px',
                background: '#0f172a',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
