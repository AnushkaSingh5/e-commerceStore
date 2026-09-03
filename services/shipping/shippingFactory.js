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
    
    // If explicitly running direct Delhivery with direct token configured
    if (nameLower.includes('delhivery') && process.env.NEXT_PUBLIC_ACTIVE_SHIPPING_PROVIDER === 'Delhivery' && process.env.DELHIVERY_API_TOKEN && !process.env.DELHIVERY_API_TOKEN.includes('mock')) {
      return this.providers['Delhivery'];
    }
    
    // KreatorStore operates centrally on Shiprocket (multi-courier aggregator)
    // All shipments, pickup requests, manifests, and tracking route via Shiprocket
    return this.providers['Shiprocket'];
  }
}

export const shippingFactory = new ShippingFactory();
export default shippingFactory;
