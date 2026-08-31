import { MockPayoutProvider } from './MockPayoutProvider';
import { CashfreePayoutProvider } from './CashfreePayoutProvider';

export class PayoutFactory {
  static getProvider() {
    // If Cashfree Payout specific credentials are provided, use Cashfree Payout
    if (process.env.CASHFREE_PAYOUT_CLIENT_ID && process.env.CASHFREE_PAYOUT_CLIENT_SECRET) {
      return new CashfreePayoutProvider();
    }
    // Otherwise fallback to Mock provider for safe development/testing
    return new MockPayoutProvider();
  }
}
