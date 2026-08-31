import { PaymentProvider } from './PaymentProvider';

export class CashfreeProvider extends PaymentProvider {
  constructor() {
    super('Cashfree');
  }

  /**
   * Helper to dynamically load the Cashfree Web SDK v3 script
   */
  loadScript() {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        resolve(false);
        return;
      }
      if (window.Cashfree) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  /**
   * Create a Cashfree payment session by calling our backend API
   */
  async createPaymentOrder(orderId, amount, customerInfo) {
    // Find the slug from path if available to pass to redirect url builder
    let slug = '';
    if (typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/');
      const idx = parts.indexOf('store');
      if (idx !== -1 && parts[idx + 1]) {
        slug = parts[idx + 1];
      } else {
        const demoIdx = parts.indexOf('demo-store');
        if (demoIdx !== -1 && parts[demoIdx + 1]) {
          slug = parts[demoIdx + 1];
        }
      }
    }

    const response = await fetch('/api/payment/cashfree/create-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        orderId,
        amount,
        customerInfo,
        slug
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errMsg = errorData.error || errorData.message || `Failed to create payment session on server (HTTP ${response.status}).`;
      throw new Error(errMsg);
    }

    const data = await response.json();
    if (!data.payment_session_id && !data.mock) {
      throw new Error(data.error || 'No payment_session_id returned by payment server.');
    }
    return data; // Expected keys: { id, payment_session_id, environment, mock }
  }

  /**
   * Verify the payment signature.
   * Since Cashfree verifies via redirect API or webhook, client-side signature check
   * is mostly a placeholder, but we return true for mock check.
   */
  async verifyPaymentSignature(paymentDetails) {
    const paymentId = paymentDetails.razorpay_payment_id || paymentDetails.payment_id || '';
    if (paymentId.startsWith('pay_mock_') || paymentId.startsWith('cf_pay_mock_')) {
      return true;
    }
    return false;
  }

  /**
   * Normalize payment failure details
   */
  async handlePaymentFailure(errorDetails) {
    return {
      success: false,
      error: errorDetails?.description || errorDetails?.reason || 'Payment failed or cancelled by user.',
      code: errorDetails?.code || 'PAYMENT_FAILED',
      metadata: errorDetails
    };
  }
}

export default CashfreeProvider;
