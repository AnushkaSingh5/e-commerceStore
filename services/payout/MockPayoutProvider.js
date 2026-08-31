import { PayoutProvider } from './PayoutProvider';

/**
 * Mock Payout Provider for Development and Testing
 */
export class MockPayoutProvider extends PayoutProvider {
  constructor() {
    super('MOCK');
  }

  async createTransfer(params) {
    const { withdrawalNumber, amount, bankAccount } = params;
    
    // Simulate deterministic processing
    const refId = `MOCK_TXN_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    return {
      success: true,
      providerRefId: refId,
      status: 'PROCESSING', // Payout initialized, ready for settlement
      message: `Mock payout of ₹${amount} initiated to ${bankAccount?.bank_name || 'Bank'} (${bankAccount?.account_number_masked || '••••'})`,
      rawResponse: {
        mock_id: refId,
        withdrawal_number: withdrawalNumber,
        transferred_at: new Date().toISOString()
      }
    };
  }

  async getTransferStatus(providerRefId) {
    return {
      success: true,
      status: 'SUCCESS',
      providerRefId,
      rawResponse: {
        status: 'SUCCESS',
        settled_at: new Date().toISOString()
      }
    };
  }
}
