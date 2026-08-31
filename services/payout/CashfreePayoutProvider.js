import { PayoutProvider } from './PayoutProvider';

/**
 * Cashfree Payouts API Provider (Outbound Seller Disbursements)
 * Reference: https://docs.cashfree.com/docs/payouts
 * 
 * IMPORTANT: Outbound payouts require Cashfree Payout Client ID & Secret
 * which are distinct from Cashfree PG (inbound customer payment) credentials.
 */
export class CashfreePayoutProvider extends PayoutProvider {
  constructor() {
    super('CASHFREE_PAYOUT');
    this.clientId = process.env.CASHFREE_PAYOUT_CLIENT_ID;
    this.clientSecret = process.env.CASHFREE_PAYOUT_CLIENT_SECRET;
    this.env = (process.env.CASHFREE_ENV || 'SANDBOX').toUpperCase();
    this.baseUrl = this.env === 'PRODUCTION'
      ? 'https://payout-api.cashfree.com/payout/v1'
      : 'https://payout-gamma.cashfree.com/payout/v1';
  }

  async getAuthToken() {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Cashfree Payout credentials missing (CASHFREE_PAYOUT_CLIENT_ID / CASHFREE_PAYOUT_CLIENT_SECRET).');
    }

    const response = await fetch(`${this.baseUrl}/authorize`, {
      method: 'POST',
      headers: {
        'X-Client-Id': this.clientId,
        'X-Client-Secret': this.clientSecret,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    if (data.status !== 'SUCCESS' || !data.data?.token) {
      throw new Error(data.message || 'Failed to authorize Cashfree Payout API.');
    }
    return data.data.token;
  }

  async createTransfer(params) {
    const { withdrawalNumber, amount, bankAccount, sellerEmail, sellerPhone } = params;

    try {
      const token = await this.getAuthToken();

      const transferPayload = {
        transferId: withdrawalNumber,
        amount: String(amount.toFixed(2)),
        transferMode: 'banktransfer',
        beneficiaryDetails: {
          beneId: `BENE_${params.withdrawalId.replace(/-/g, '').slice(0, 15)}`,
          name: bankAccount.account_holder_name,
          email: sellerEmail || 'seller@kreatorstore.in',
          phone: sellerPhone || '9999999999',
          bankAccount: bankAccount.account_number_encrypted, // Decrypted at runtime if encrypted
          ifsc: bankAccount.ifsc_code
        },
        remarks: `Seller payout for ${withdrawalNumber}`
      };

      const response = await fetch(`${this.baseUrl}/requestTransfer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(transferPayload)
      });

      const result = await response.json();

      if (result.status === 'SUCCESS') {
        return {
          success: true,
          providerRefId: result.data?.referenceId || result.data?.utr || withdrawalNumber,
          status: result.data?.transferStatus || 'PROCESSING',
          rawResponse: result
        };
      } else {
        return {
          success: false,
          error: result.message || 'Cashfree Payout transfer rejected.',
          rawResponse: result
        };
      }
    } catch (err) {
      return {
        success: false,
        error: err.message,
        rawResponse: null
      };
    }
  }

  async getTransferStatus(providerRefId) {
    try {
      const token = await this.getAuthToken();
      const response = await fetch(`${this.baseUrl}/getTransferStatus?referenceId=${encodeURIComponent(providerRefId)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const result = await response.json();
      return {
        success: result.status === 'SUCCESS',
        status: result.data?.transferStatus || 'PENDING',
        providerRefId,
        rawResponse: result
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }
}
