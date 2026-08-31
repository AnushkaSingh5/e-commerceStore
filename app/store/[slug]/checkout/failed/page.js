'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { storeService } from '@/services/storeService';
import { orderService } from '@/services/orderService';
import { paymentFactory } from '@/services/payment/PaymentFactory';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function CheckoutFailedPage({ params }) {
  const { slug } = use(params);
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const router = useRouter();

  const [storeDetails, setStoreDetails] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [showMockModal, setShowMockModal] = useState(false);
  const [mockPaymentData, setMockPaymentData] = useState(null);

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
      } catch (err) {
        console.error('⚠️ [FailedPage] Error loading order details:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug, orderId, router]);

  const handleRetryPayment = async () => {
    if (!orderDetails || !storeDetails) return;
    setRetrying(true);
    try {
      const activeProviderName = process.env.NEXT_PUBLIC_ACTIVE_PAYMENT_PROVIDER || 'Razorpay';
      const provider = paymentFactory.getProvider(activeProviderName);
      
      // Append a unique suffix to ensure Cashfree receives a unique order ID for each retry
      const retryOrderId = `${orderDetails.id}-${Date.now().toString().slice(-4)}`;
      
      const paymentOrder = await provider.createPaymentOrder(
        retryOrderId,
        orderDetails.total_amount,
        {
          name: orderDetails.customer_name,
          email: orderDetails.customer_email,
          phone: orderDetails.customer_phone
        }
      );

      if (paymentOrder.mock) {
        setMockPaymentData({
          orderId: orderDetails.id,
          totalAmount: orderDetails.total_amount,
          paymentOrderId: paymentOrder.payment_session_id || paymentOrder.id,
          provider
        });
        setShowMockModal(true);
        setRetrying(false);
        return;
      }

      const scriptLoaded = await provider.loadScript();
      if (!scriptLoaded) {
        alert('Failed to load payment script. Please try again.');
        setRetrying(false);
        return;
      }

      if (activeProviderName === 'Cashfree') {
        // Trigger Cashfree SDK Web Checkout retry redirect
        const checkoutMode = paymentOrder.environment || (process.env.NEXT_PUBLIC_CASHFREE_ENV === 'PRODUCTION' ? 'production' : 'sandbox');
        console.log(`🔄 [Retry]: Initializing Cashfree SDK in mode: "${checkoutMode}" for retry...`);
        const cashfree = window.Cashfree({
          mode: checkoutMode
        });
        console.log('🔄 [Retry]: Redirecting to Cashfree checkout retry...');
        cashfree.checkout({
          paymentSessionId: paymentOrder.payment_session_id
        });
        return;
      }

      const options = {
        key: provider.keyId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        name: storeDetails.name,
        description: `Retry Order #${orderDetails.id.slice(0, 8).toUpperCase()}`,
        order_id: paymentOrder.id,
        handler: async function (paymentRes) {
          setRetrying(true);
          try {
            const verified = await provider.verifyPaymentSignature(paymentRes);
            if (verified) {
              await orderService.updateOrderPayment(orderDetails.id, {
                paymentStatus: 'paid',
                paymentProvider: 'Razorpay',
                paymentId: paymentRes.razorpay_payment_id,
                paymentOrderId: paymentRes.razorpay_order_id,
                status: 'confirmed'
              });
              router.push(`/store/${slug}/checkout/success?orderId=${orderDetails.id}`);
            } else {
              alert('Signature verification failed.');
              setRetrying(false);
            }
          } catch (verErr) {
            console.error('Error in retry signature check:', verErr);
            router.push(`/store/${slug}/checkout/failed?orderId=${orderDetails.id}&error=${encodeURIComponent(verErr.message)}`);
            setRetrying(false);
          }
        },
        prefill: {
          name: orderDetails.customer_name,
          email: orderDetails.customer_email,
          contact: orderDetails.customer_phone
        },
        theme: {
          color: '#e11d48'
        },
        modal: {
          ondismiss: function () {
            console.log('Retry checkout closed.');
            setRetrying(false);
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error('Retry payment error:', err);
      alert('Failed to initialize payment gateway: ' + err.message);
      setRetrying(false);
    }
  };

  const handleMockSuccess = async (provider) => {
    setRetrying(true);
    setShowMockModal(false);
    try {
      const mockDetails = {
        payment_order_id: mockPaymentData.paymentOrderId,
        payment_id: `cf_pay_mock_${Date.now()}`,
        // Keep Razorpay fields for legacy compatibility
        razorpay_order_id: mockPaymentData.paymentOrderId,
        razorpay_payment_id: `pay_mock_${Date.now()}`,
        razorpay_signature: `sig_mock_${Date.now()}`
      };
      const verified = await provider.verifyPaymentSignature(mockDetails);
      if (verified) {
        await orderService.updateOrderPayment(mockPaymentData.orderId, {
          paymentStatus: 'paid',
          paymentProvider: provider.name,
          paymentId: provider.name === 'Cashfree' ? mockDetails.payment_id : mockDetails.razorpay_payment_id,
          paymentOrderId: provider.name === 'Cashfree' ? mockDetails.payment_order_id : mockDetails.razorpay_order_id,
          status: 'confirmed'
        });
        router.push(`/store/${slug}/checkout/success?orderId=${mockPaymentData.orderId}`);
      } else {
        alert('Mock signature verification failed.');
        setRetrying(false);
      }
    } catch (err) {
      console.error('Mock retry payment error:', err);
      router.push(`/store/${slug}/checkout/failed?orderId=${mockPaymentData.orderId}&error=${encodeURIComponent(err.message)}`);
      setRetrying(false);
    }
  };

  const handleMockFailure = async () => {
    setShowMockModal(false);
    setRetrying(false);
    try {
      const provider = mockPaymentData?.provider;
      if (provider) {
        await orderService.updateOrderPayment(mockPaymentData.orderId, {
          paymentStatus: 'failed',
          paymentProvider: provider.name,
          status: 'awaiting_payment'
        });
      }
    } catch (err) {
      console.error('Mock retry failure error:', err);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading Order Details...</p>
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
            border-left-color: #ef4444;
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

  return (
    <div className="failed-page">
      <Navbar storeName={storeDetails?.name} logoUrl={storeDetails?.logo_url || storeDetails?.logo} />

      <main className="container failed-container fade-in">
        <div className="failed-card dashboard-card">
          <div className="failed-icon-wrapper">
            <span className="failed-icon">❌</span>
          </div>
          <h1>Payment Failed</h1>
          <p className="failed-lead">
            {searchParams.get('error') ? (
              searchParams.get('error')
            ) : (
              <>
                We couldn't process your payment for order <strong>#{orderNum}</strong>. Your bank or card issuer might have declined the transaction.
              </>
            )}
          </p>

          <div className="orders-summary-box">
            <h3>Transaction Details</h3>
            <div className="order-summary-item">
              <span className="order-lbl">Order ID</span>
              <span className="order-val">#{orderNum}</span>
            </div>
            <div className="order-summary-item">
              <span className="order-lbl">Amount Due</span>
              <span className="order-val highlight">₹{totalAmount}</span>
            </div>
            <div className="order-summary-item">
              <span className="order-lbl">Status</span>
              <span className="status-badge failed">Failed / Unpaid</span>
            </div>
          </div>

          <div className="action-row">
            <button 
              onClick={handleRetryPayment} 
              className="primary-btn retry-btn"
              disabled={retrying}
            >
              {retrying ? 'Loading Gateway...' : 'Retry Payment Now'}
            </button>
            <Link href={`/store/${slug}/cart`} className="secondary-btn">Cancel</Link>
          </div>
        </div>
      </main>

      <Footer storeName={storeDetails?.name} />

      {showMockModal && mockPaymentData && (
        <div className="mock-modal-overlay">
          <div className="mock-modal-card">
            <div className="mock-modal-header">
              <span className="mock-chip">SANDBOX MODE</span>
              <h2>Mock Payment Gateway (Retry)</h2>
              <p className="mock-order-ref">Order ID: #{mockPaymentData.orderId.slice(0, 8).toUpperCase()}</p>
            </div>
            
            <div className="mock-modal-body">
              <div className="mock-amount-box">
                <span className="mock-amount-label">Total Amount to Pay</span>
                <span className="mock-amount-val">₹{parseFloat(mockPaymentData.totalAmount || 0).toFixed(2)}</span>
              </div>
              <p className="mock-warning-note">
                Simulate the payment completion for your order.
              </p>
            </div>
            
            <div className="mock-modal-footer">
              <button 
                onClick={() => handleMockSuccess(mockPaymentData.provider)} 
                className="mock-btn-success"
              >
                Simulate Successful Payment
              </button>
              <button 
                onClick={handleMockFailure} 
                className="mock-btn-failed"
              >
                Cancel Sim
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .failed-page {
          background: var(--bg-main, #f8fafc);
          min-height: 100vh;
          font-family: 'Outfit', sans-serif;
        }
        .failed-container {
          padding-top: 140px;
          padding-bottom: 80px;
          display: flex;
          justify-content: center;
        }
        .failed-card {
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
        .failed-icon-wrapper {
          width: 80px;
          height: 80px;
          background: rgba(239, 68, 68, 0.1);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
        }
        .failed-icon {
          font-size: 36px;
        }
        h1 {
          font-size: 28px;
          font-weight: 800;
          color: var(--text-main, #0f172a);
          letter-spacing: -0.5px;
          margin: 0;
        }
        .failed-lead {
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
          align-items: center;
          font-size: 14px;
        }
        .order-lbl {
          font-weight: 600;
          color: var(--text-sub, #64748b);
        }
        .order-val {
          font-weight: 700;
          color: var(--text-main, #0f172a);
        }
        .order-val.highlight {
          color: #ef4444;
          font-size: 16px;
        }
        .status-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 99px;
          text-transform: uppercase;
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
        .primary-btn, .secondary-btn {
          flex: 1;
          padding: 14px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 14px;
          text-align: center;
          transition: all 0.2s;
          text-decoration: none;
          border: none;
          cursor: pointer;
        }
        .primary-btn {
          background: #e11d48;
          color: #fff;
        }
        .primary-btn:hover:not(:disabled) {
          background: #be123c;
          transform: translateY(-1px);
        }
        .primary-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .secondary-btn {
          background: transparent;
          color: var(--text-main, #0f172a);
          border: 1px solid var(--secondary, #e2e8f0);
        }
        .secondary-btn:hover {
          background: var(--secondary, #e2e8f0);
          transform: translateY(-1px);
        }

        /* Mock Modal Styling */
        .mock-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          font-family: 'Outfit', sans-serif;
          padding: 20px;
        }
        .mock-modal-card {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 36px;
          max-width: 460px;
          width: 100%;
          color: #fff;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          gap: 24px;
          animation: modalAppear 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes modalAppear {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .mock-chip {
          background: #fbbf24;
          color: #78350f;
          font-size: 10px;
          font-weight: 800;
          padding: 4px 10px;
          border-radius: 99px;
          letter-spacing: 0.5px;
          display: inline-block;
          margin-bottom: 12px;
        }
        .mock-modal-header h2 {
          font-size: 22px;
          font-weight: 800;
          margin: 0 0 6px 0;
        }
        .mock-order-ref {
          color: #94a3b8;
          font-size: 13px;
          margin: 0;
        }
        .mock-amount-box {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 20px;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .mock-amount-label {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 600;
          text-transform: uppercase;
        }
        .mock-amount-val {
          font-size: 32px;
          font-weight: 800;
          color: #38bdf8;
        }
        .mock-warning-note {
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.6;
          margin: 16px 0 0 0;
          text-align: center;
        }
        .mock-modal-footer {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .mock-btn-success, .mock-btn-failed {
          padding: 14px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          width: 100%;
        }
        .mock-btn-success {
          background: #10b981;
          color: #fff;
        }
        .mock-btn-success:hover {
          background: #059669;
          transform: translateY(-1px);
        }
        .mock-btn-failed {
          background: transparent;
          color: #f43f5e;
          border: 1.5px solid #f43f5e;
        }
        .mock-btn-failed:hover {
          background: rgba(244, 63, 94, 0.05);
          transform: translateY(-1px);
        }
        @media (max-width: 576px) {
          .action-row {
            flex-direction: column;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}
