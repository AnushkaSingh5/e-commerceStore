// services/shipping/shippingFactory.js
import { ShiprocketProvider } from './shiprocketProvider';
import { DelhiveryProvider } from './delhiveryProvider';

class ShippingFactory {
  constructor() {
    this.providers = {
      Shiprocket: new ShiprocketProvider(),
      Delhivery: new DelhiveryProvider()
    };
  }

  /**
   * Get the configured active shipping provider instance
   */
  getProvider(providerName) {
    const rawName = providerName || process.env.NEXT_PUBLIC_ACTIVE_SHIPPING_PROVIDER || 'Shiprocket';
    const nameLower = rawName.toLowerCase();
    
    if (nameLower.includes('shiprocket')) {
      return this.providers['Shiprocket'];
    }
    if (nameLower.includes('delhivery')) {
      return this.providers['Delhivery'];
    }
    
    console.warn(`⚠️ [ShippingFactory]: Provider "${rawName}" not recognized. Defaulting to Shiprocket.`);
    return this.providers['Shiprocket'];
  }
}

export const shippingFactory = new ShippingFactory();
export default shippingFactory;
