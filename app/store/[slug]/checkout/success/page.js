'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { storeService } from '@/services/storeService';
import { orderService } from '@/services/orderService';
import { useStore } from '@/context/StoreContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function CheckoutSuccessPage({ params }) {
  const { slug } = use(params);
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const router = useRouter();
  const { removeCartItems } = useStore();

  const [storeDetails, setStoreDetails] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trackingInfo, setTrackingInfo] = useState(null);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!orderId) {
        router.push(`/store/${slug}`);
        return;
      }
      try {
        const [store, order] = await Promise.all([
          storeService.getStoreBySlug(slug),
          orderService.getOrderDetails(orderId)
        ]);
        setStoreDetails(store);
        setOrderDetails(order);

        // Remove successfully purchased items from the cart
        if (order && order.items && order.items.length > 0) {
          const productIds = order.items.map(item => item.product_id);
          removeCartItems(productIds).catch(err => {
            console.warn('[SuccessPage] Failed to remove items from cart:', err);
          });
        }

        // Auto-sync tracking status if tracking number is present
        const awb = order?.awb_number || order?.tracking_number;
        if (awb) {
          try {
            setLoadingTracking(true);
            console.log(`[SuccessPage] Fetching live tracking for waybill: ${awb}`);
            const trackRes = await fetch(`/api/shipping/track?waybill=${awb}`);
            if (trackRes.ok) {
              const trackData = await trackRes.json();
              if (trackData.success) {
                setTrackingInfo(trackData.tracking);
              }
            }
            
            // Also sync in database
            fetch(`/api/shipping/sync?order_id=${orderId}`).catch(() => {});
          } catch (syncErr) {
            console.warn('[SuccessPage] Failed to load live tracking:', syncErr);
          } finally {
            setLoadingTracking(false);
          }
        }
      } catch (err) {
        console.error('⚠️ [SuccessPage] Error loading checkout details:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug, orderId, router]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Confirming Order Details...</p>
        <style jsx>{`
          .loading-screen {
            height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #0f172a;
            color: #fff;
            gap: 16px;
            font-family: 'Outfit', sans-serif;
          }
          .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid rgba(255, 255, 255, 0.1);
            border-left-color: #10b981;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  const orderNum = orderId ? String(orderId).slice(0, 8).toUpperCase() : '';
  const totalAmount = orderDetails ? parseFloat(orderDetails.total_amount || 0).toFixed(2) : '0.00';
  const isCOD = orderDetails?.payment_provider === 'COD';
  const displayPaymentStatus = isCOD && orderDetails?.payment_status === 'pending' ? 'Pay on Delivery' : (orderDetails?.payment_status || 'Paid');

  return (
    <div className="success-page">
      <Navbar storeName={storeDetails?.name} logoUrl={storeDetails?.logo_url || storeDetails?.logo} />
      
      <main className="container success-container fade-in">
        <div className="success-card dashboard-card">
          <div className="success-icon-wrapper">
            <span className="success-icon">🎉</span>
          </div>
          <h1>Order Placed Successfully!</h1>
          <p className="success-lead">
            {isCOD ? (
              <>Thank you for shopping at <strong>{storeDetails?.name}</strong>! Your order is confirmed and will be paid after delivery.</>
            ) : (
              <>Thank you for shopping at <strong>{storeDetails?.name}</strong>! Your payment has been processed and your order is confirmed.</>
            )}
          </p>
          
          <div className="orders-summary-box">
            <h3>Payment & Order Summary</h3>
            <div className="order-summary-item">
              <span className="order-lbl">Order ID</span>
              <span className="order-val">#{orderNum}</span>
            </div>
            <div className="order-summary-item">
              <span className="order-lbl">{isCOD ? 'Total Amount' : 'Total Paid'}</span>
              <span className="order-val highlight">₹{totalAmount}</span>
            </div>
            <div className="order-summary-item">
              <span className="order-lbl">Payment Status</span>
              <span className={`status-badge ${displayPaymentStatus.replace(/\s+/g, '-').toLowerCase()}`}>
                {displayPaymentStatus}
              </span>
            </div>
            {orderDetails?.payment_id && (
              <div className="order-summary-item">
                <span className="order-lbl">Transaction ID</span>
                <span className="order-val txn-id">{orderDetails.payment_id}</span>
              </div>
            )}
            <div className="order-summary-item">
              <span className="order-lbl">Deliver To</span>
              <span className="order-val address-val">{orderDetails?.shipping_address}</span>
            </div>
          </div>

          {/* Live Delivery Tracking Timeline */}
          {orderDetails && (orderDetails.payment_status === 'paid' || orderDetails.status === 'confirmed') && (
            <div className="shipping-tracking-section" style={{
              marginTop: '32px',
              padding: '24px',
              background: '#f8fafc',
              borderRadius: '20px',
              border: '1px solid #e2e8f0',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>🚚 Shipment Tracking</h3>
                <span style={{ 
                  fontSize: '12px', 
                  fontWeight: 700, 
                  padding: '4px 10px', 
                  borderRadius: '99px', 
                  background: (trackingInfo?.status || orderDetails.shipping_status) === 'Delivered' ? '#ecfdf5' : '#eff6ff', 
                  color: (trackingInfo?.status || orderDetails.shipping_status) === 'Delivered' ? '#047857' : '#1d4ed8' 
                }}>
                  {trackingInfo?.status || orderDetails.shipping_status || 'Pending'}
                </span>
              </div>
              
              <div style={{ fontSize: '13px', color: '#475569', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                <div><strong>Courier Partner:</strong> {orderDetails.courier_name || 'Delhivery Express'}</div>
                <div><strong>AWB Number:</strong> {orderDetails.awb_number || 'Pending assignment'}</div>
                {(trackingInfo?.estimated_delivery || orderDetails.estimated_delivery) ? (
                  <div style={{ gridColumn: 'span 2', marginTop: '4px' }}>
                    <strong>Estimated Delivery:</strong> {trackingInfo?.estimated_delivery || orderDetails.estimated_delivery}
                  </div>
                ) : (
                  <div style={{ gridColumn: 'span 2', marginTop: '4px', color: '#64748b', fontSize: '12px' }}>
                    * Delivery estimates will be available once the order is shipped.
                  </div>
                )}
              </div>

              {(() => {
                const getStepIndex = (status) => {
                  const s = String(status || 'Pending').toLowerCase();
                  if (s === 'pending' || s === 'awaiting_payment' || s === 'order confirmed') return 0;
                  if (s === 'shipment created' || s === 'manifested' || s === 'awb assigned' || s === 'label generated' || s === 'pickup scheduled' || s === 'pickup rescheduled') return 1;
                  if (s === 'picked up' || s === 'dispatched' || s === 'collected') return 2;
                  if (s === 'in transit' || s === 'reached hub') return 3;
                  if (s === 'out for delivery') return 4;
                  if (s === 'delivered') return 5;
                  if (s === 'cancelled') return -1;
                  if (s === 'returned' || s === 'rto') return -2;
                  return (orderDetails.awb_number || orderDetails.tracking_number) ? 1 : 0;
                };

                const currentStatus = trackingInfo?.status || orderDetails.shipping_status || 'Pending';
                const currentStepIdx = getStepIndex(currentStatus);

                if (currentStepIdx >= 0) {
                  const steps = [
                    { label: 'Order Confirmed', desc: 'Your order has been verified.' },
                    { label: 'Shipment Created', desc: 'AWB allocated, package printing.' },
                    { label: 'Picked Up', desc: 'Handed over to courier partner.' },
                    { label: 'In Transit', desc: 'Package traveling between hubs.' },
                    { label: 'Out For Delivery', desc: 'Package is arriving today.' },
                    { label: 'Delivered', desc: 'Package safely delivered.' }
                  ];

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
                      {steps.map((step, idx) => {
                        const isCompleted = idx <= currentStepIdx;
                        const isActive = idx === currentStepIdx;
                        
                        return (
                          <div key={idx} style={{ display: 'flex', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: isCompleted ? '#10b981' : '#e2e8f0',
                                border: isActive ? '4px solid #d1fae5' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                zIndex: 1
                              }}>
                                {isCompleted ? '✓' : idx + 1}
                              </div>
                              {idx < 5 && (
                                <div style={{
                                  width: '2px',
                                  flex: 1,
                                  background: idx < currentStepIdx ? '#10b981' : '#e2e8f0',
                                  margin: '4px 0',
                                  minHeight: '20px'
                                }}></div>
                              )}
                            </div>
                            <div style={{ paddingBottom: idx < 5 ? '12px' : 0 }}>
                              <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: isCompleted ? '#1e293b' : '#94a3b8' }}>{step.label}</h4>
                              <p style={{ margin: '2px 0 0', fontSize: '11px', color: isCompleted ? '#64748b' : '#cbd5e1' }}>{step.desc}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                } else {
                  return (
                    <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '12px', color: '#b91c1c', fontSize: '13px', fontWeight: 600 }}>
                      {currentStatus === 'Cancelled' 
                        ? '❌ This shipment has been cancelled.' 
                        : '🔄 This shipment has been returned to sender.'}
                    </div>
                  );
                }
              })()}

              {(!trackingInfo?.events || trackingInfo.events.length === 0) && orderDetails.awb_number && (
                <div style={{
                  marginTop: '20px',
                  padding: '12px 16px',
                  background: '#f1f5f9',
                  borderRadius: '12px',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 500,
                  borderLeft: '4px solid #94a3b8'
                }}>
                  ℹ️ Shipment has been created successfully and is awaiting courier pickup.
                </div>
              )}

              {orderDetails.awb_number && (
                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => setIsTrackingModalOpen(true)}
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      padding: '10px 16px',
                      background: '#0f172a',
                      color: '#fff',
                      borderRadius: '10px',
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.15)'
                    }}
                  >
                    Track Shipment ↗
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="action-row">
            <Link href={`/store/${slug}`} className="primary-btn">Continue Shopping</Link>
            <Link href={`/customer/orders?store=${slug}`} className="secondary-btn">View My Orders</Link>
          </div>
        </div>

        {/* Live Tracking Modal Overlay */}
        {isTrackingModalOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}>
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '24px',
              padding: '32px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              fontFamily: 'inherit',
              color: '#0f172a'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>📦 Live Tracking History</h3>
                <button 
                  onClick={() => setIsTrackingModalOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: '#64748b'
                  }}
                >&times;</button>
              </div>
              
              {loadingTracking ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>Loading tracking details...</div>
              ) : (
                <div>
                  <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
                    <div><strong>Current Status:</strong> {trackingInfo?.status || orderDetails?.shipping_status || 'Pending'}</div>
                    {(trackingInfo?.estimated_delivery || orderDetails?.estimated_delivery) && (
                      <div style={{ marginTop: '4px' }}>
                        <strong>Est. Delivery:</strong> {trackingInfo?.estimated_delivery || orderDetails?.estimated_delivery}
                      </div>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
                    {trackingInfo?.events && trackingInfo.events.length > 0 ? (
                      trackingInfo.events.map((evt, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6', marginTop: '4px' }} />
                            {idx < trackingInfo.events.length - 1 && (
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
                onClick={() => setIsTrackingModalOpen(false)}
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
          </div>
        )}
      </main>

      <Footer storeName={storeDetails?.name} />

      <style jsx>{`
        .success-page {
          background: var(--bg-main, #f8fafc);
          min-height: 100vh;
          font-family: 'Outfit', sans-serif;
        }
        .success-container {
          padding-top: 140px;
          padding-bottom: 80px;
          display: flex;
          justify-content: center;
        }
        .success-card {
          max-width: 600px;
          width: 100%;
          background: #fff;
          border: 1px solid var(--secondary, #e2e8f0);
          border-radius: 24px;
          padding: 48px 36px;
          text-align: center;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.02);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }
        .success-icon-wrapper {
          width: 80px;
          height: 80px;
          background: rgba(16, 185, 129, 0.1);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
        }
        .success-icon {
          font-size: 44px;
        }
        h1 {
          font-size: 28px;
          font-weight: 800;
          color: var(--text-main, #0f172a);
          letter-spacing: -0.5px;
          margin: 0;
        }
        .success-lead {
          color: var(--text-sub, #64748b);
          font-size: 15px;
          line-height: 1.6;
          margin: 0;
        }
        .orders-summary-box {
          width: 100%;
          background: var(--bg-main, #f8fafc);
          border-radius: 16px;
          border: 1px solid var(--secondary, #e2e8f0);
          padding: 24px;
          margin: 10px 0;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .orders-summary-box h3 {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-main, #0f172a);
          margin: 0 0 4px 0;
          border-bottom: 1px solid var(--secondary, #e2e8f0);
          padding-bottom: 8px;
        }
        .order-summary-item {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          font-size: 14px;
          gap: 16px;
        }
        .order-lbl {
          font-weight: 600;
          color: var(--text-sub, #64748b);
          min-width: 110px;
        }
        .order-val {
          font-weight: 700;
          color: var(--text-main, #0f172a);
          text-align: right;
        }
        .order-val.highlight {
          color: #10b981;
          font-size: 16px;
        }
        .txn-id {
          font-family: monospace;
          font-size: 12px;
          color: #475569;
          word-break: break-all;
          max-width: 300px;
        }
        .address-val {
          font-weight: 500;
          color: #475569;
          font-size: 13px;
          line-height: 1.4;
          max-width: 300px;
        }
        .status-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 99px;
          text-transform: uppercase;
        }
        .status-badge.paid {
          background: #d1fae5;
          color: #065f46;
        }
        .status-badge.pending {
          background: #fef3c7;
          color: #92400e;
        }
        .status-badge.pay-on-delivery {
          background: #fffbeb;
          color: #b45309;
        }
        .status-badge.failed {
          background: #fee2e2;
          color: #991b1b;
        }
        .action-row {
          display: flex;
          gap: 16px;
          width: 100%;
          margin-top: 10px;
        }
        :global(.primary-btn), :global(.secondary-btn) {
          flex: 1;
          padding: 14px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 14px;
          text-align: center;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-block;
        }
        :global(.primary-btn) {
          background: #0f172a !important;
          color: #fff !important;
        }
        :global(.primary-btn:hover) {
          background: #1e293b !important;
          transform: translateY(-1px);
        }
        :global(.secondary-btn) {
          background: transparent !important;
          color: #0f172a !important;
          border: 1.5px solid #0f172a !important;
        }
        :global(.secondary-btn:hover) {
          background: rgba(15, 23, 42, 0.04) !important;
          transform: translateY(-1px);
        }
        @media (max-width: 768px) {
          .success-container {
            padding-top: 80px !important;
            padding-bottom: 40px !important;
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
          .success-card {
            padding: 24px 16px !important;
            border-radius: 16px !important;
            gap: 16px !important;
          }
          .success-icon-wrapper {
            width: 64px !important;
            height: 64px !important;
          }
          .success-icon {
            font-size: 32px !important;
          }
          h1 {
            font-size: 22px !important;
          }
          .success-lead {
            font-size: 14px !important;
          }
          .orders-summary-box {
            padding: 16px !important;
          }
          .order-summary-item {
            flex-direction: column;
            align-items: stretch;
            gap: 4px;
          }
          .order-val {
            text-align: left !important;
          }
          .action-row {
            flex-direction: column;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}
