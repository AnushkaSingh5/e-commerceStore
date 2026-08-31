import { orderService } from './orderService';
import { supabaseClient } from '@/lib/supabase';
import { shippingService } from './shipping/shippingService';

export const checkoutService = {
  /**
   * Validate checkout input fields
   */
  validateCheckoutForm: (form) => {
    const errors = {};
    
    if (!form.name || !form.name.trim()) {
      errors.name = 'Full Name is required.';
    }
    
    if (!form.email || !form.email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      errors.email = 'Please provide a valid email address.';
    }
    
    if (!form.phone || !form.phone.trim()) {
      errors.phone = 'Phone number is required.';
    } else if (!/^\+?[0-9\s\-()]{7,15}$/.test(form.phone)) {
      errors.phone = 'Please provide a valid phone number.';
    }
    
    if (!form.address || !form.address.trim()) {
      errors.address = 'Shipping address is required.';
    }
    
    if (!form.city || !form.city.trim()) {
      errors.city = 'City is required.';
    }
    
    if (!form.state || !form.state.trim()) {
      errors.state = 'State is required.';
    }
    
    if (!form.pincode || !form.pincode.trim()) {
      errors.pincode = 'Pincode is required.';
    } else if (!/^[0-9a-zA-Z\s\-]{3,10}$/.test(form.pincode)) {
      errors.pincode = 'Please provide a valid pincode.';
    }

    if (form.country !== undefined && (!form.country || !form.country.trim())) {
      errors.country = 'Country is required.';
    }
    
    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  },

  /**
   * Group cart items by their store_id, place distinct orders per merchant, and combine results.
   */
  processCheckout: async (cartItems, customerInfo, couponData = null) => {
    if (!cartItems || cartItems.length === 0) {
      throw new Error('Cannot checkout with an empty cart.');
    }

    // Live Database Stock Check
    if (supabaseClient) {
      const productIds = cartItems.map(item => item.id);
      const { data: dbProducts, error: dbError } = await supabaseClient
        .from('products')
        .select('id, stock, name')
        .in('id', productIds);

      if (!dbError && dbProducts) {
        for (const item of cartItems) {
          const dbProd = dbProducts.find(p => p.id === item.id);
          if (!dbProd) {
            throw new Error(`Product ${item.name} not found.`);
          }
          if (dbProd.stock < item.quantity) {
            throw new Error('Some products are no longer available in requested quantity.');
          }
        }
      }
    }

    // Group items by store_id
    const storeGroups = {};
    cartItems.forEach(item => {
      const storeId = item.store_id || 'unknown';
      if (!storeGroups[storeId]) {
        storeGroups[storeId] = [];
      }
      storeGroups[storeId].push(item);
    });

    const results = [];
    const addressLine2Suffix = customerInfo.address_line_2 ? `, ${customerInfo.address_line_2}` : '';
    const countrySuffix = (customerInfo.country || 'India') ? `, ${customerInfo.country || 'India'}` : ', India';
    const shippingAddressFormatted = `${customerInfo.address}${addressLine2Suffix}, ${customerInfo.city}, ${customerInfo.state} - ${customerInfo.pincode}${countrySuffix}`;

    // Place separate database orders per store group
    for (const storeId of Object.keys(storeGroups)) {
      const items = storeGroups[storeId];
      const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const tax = 0;
      const discount = couponData ? parseFloat(couponData.discount_amount) || 0 : 0;
      
      let shippingCost = 0;
      let selectedShippingProvider = 'Shiprocket';

      if (supabaseClient && storeId !== 'unknown') {
        const { data: storeData } = await supabaseClient
          .from('stores')
          .select('theme_settings')
          .eq('id', storeId)
          .maybeSingle();

        if (storeData) {
          const themeSettings = storeData.theme_settings || {};
          const shippingType = themeSettings.shippingType ?? 'flat';
          const flatFee = parseFloat(themeSettings.flatFee) ?? 15;
          if (shippingType === 'flat') {
            shippingCost = flatFee;
            selectedShippingProvider = 'Shiprocket';
          } else if (shippingType === 'calculated') {
            try {
              const res = await shippingService.calculateShippingCost({
                storeId,
                destinationPincode: customerInfo.pincode,
                paymentMode: customerInfo.payment_provider === 'COD' ? 'COD' : 'Prepaid',
                cartItems: items
              });
              if (res && res.success && res.serviceable) {
                shippingCost = res.total_amount;
                selectedShippingProvider = res.shipments?.[0]?.provider || 'Shiprocket';
              } else {
                throw new Error(res.message || 'Pincode is not serviceable by shipping providers.');
              }
            } catch (err) {
              console.error('❌ [checkoutService] Calculated shipping failed:', err.message);
              throw new Error(`Shipping calculation error: ${err.message}`);
            }
          } else {
            shippingCost = 0;
            selectedShippingProvider = 'Shiprocket';
          }
        }
      }

      const totalAmount = Math.max(0, subtotal + tax - discount + shippingCost);

      const orderData = {
        store_id: storeId === 'unknown' ? null : storeId,
        customer_id: customerInfo.id || null,
        customer_name: customerInfo.name,
        customer_email: customerInfo.email,
        customer_phone: customerInfo.phone,
        shipping_address: shippingAddressFormatted,
        shipping_address_line1: customerInfo.address,
        shipping_address_line2: customerInfo.address_line_2 || null,
        shipping_address_city: customerInfo.city,
        shipping_address_state: customerInfo.state,
        shipping_address_pincode: customerInfo.pincode,
        shipping_address_country: customerInfo.country || 'India',
        
        // Permanent snapshot columns:
        shipping_city: customerInfo.city,
        shipping_state: customerInfo.state,
        shipping_country: customerInfo.country || 'India',
        shipping_pincode: customerInfo.pincode,

        total_amount: totalAmount,
        shipping_cost: shippingCost,
        shipping_provider: selectedShippingProvider,
        payment_provider: customerInfo.payment_provider || 'Razorpay',
        items,
        coupon_id: couponData?.coupon_id || null,
        coupon_code: couponData?.coupon_code || null,
        discount_amount: discount
      };

      const result = await orderService.createOrder(orderData);
      results.push(result);
    }

    return {
      success: true,
      orders: results
    };
  }
};
