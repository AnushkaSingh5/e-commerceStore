/**
 * Base Payout Provider Interface
 */
export class PayoutProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Request a payout transfer to a seller's bank account
   * @param {Object} params
   * @param {string} params.withdrawalId
   * @param {string} params.withdrawalNumber
   * @param {number} params.amount
   * @param {Object} params.bankAccount
   * @param {string} params.sellerEmail
   * @param {string} params.sellerPhone
   * @returns {Promise<{success: boolean, providerRefId?: string, status: string, error?: string, rawResponse?: any}>}
   */
  async createTransfer(params) {
    throw new Error('createTransfer() must be implemented by subclass.');
  }

  /**
   * Check transfer status from payout provider
   * @param {string} providerRefId
   * @returns {Promise<{success: boolean, status: string, error?: string, rawResponse?: any}>}
   */
  async getTransferStatus(providerRefId) {
    throw new Error('getTransferStatus() must be implemented by subclass.');
  }
}
