// services/shipping/shippingService.js
import { supabaseClient } from '@/lib/supabase';
import { orderService } from '../orderService';
import { shippingFactory } from './shippingFactory';

// Defensive DB helper to update orders table, handles missing columns
async function safeOrderUpdate(supabase, orderId, payload) {
  try {
    const { data, error } = await supabase
      .from('orders')
      .update(payload)
      .eq('id', orderId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    const isMissingColumnError = 
      err.code === '42703' || 
      err.code === 'PGRST200' || 
      err.code === 'PGRST204' || 
      err.status === 400 ||
      (err.message && (
        err.message.includes('schema cache') || 
        err.message.includes('Could not find the') || 
        err.message.includes('column')
      ));

    if (isMissingColumnError) {
      console.warn('⚠️ [safeOrderUpdate] Some columns do not exist in database orders table. Retrying with basic columns...', err.message);
      const strippedPayload = { ...payload };
      delete strippedPayload.pickup_location_name;
      delete strippedPayload.pickup_location_id;
      delete strippedPayload.pickup_id;
      delete strippedPayload.customer_phone;
      delete strippedPayload.shipping_address_2;
      delete strippedPayload.shipping_city;
      delete strippedPayload.shipping_state;
      delete strippedPayload.shipping_country;
      delete strippedPayload.shipping_pincode;
      
      const { data, error } = await supabase
        .from('orders')
        .update(strippedPayload)
        .eq('id', orderId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    throw err;
  }
}

// Defensive DB helper to upsert store_shipping_settings table, handles missing columns
async function safeSettingsUpsert(supabase, payload) {
  try {
    const { data, error } = await supabase
      .from('store_shipping_settings')
      .upsert(payload, { onConflict: 'store_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    const isMissingColumnError = 
      err.code === '42703' || 
      err.code === 'PGRST200' || 
      err.code === 'PGRST204' || 
      err.status === 400 ||
      (err.message && (
        err.message.includes('schema cache') || 
        err.message.includes('Could not find the') || 
        err.message.includes('column')
      ));

    if (isMissingColumnError) {
      console.warn('⚠️ [safeSettingsUpsert] Some columns do not exist in database store_shipping_settings table. Retrying with basic columns...', err.message);
      const strippedPayload = { ...payload };
      delete strippedPayload.pickup_location_name;
      delete strippedPayload.pickup_location_id;
      delete strippedPayload.pickup_contact;
      delete strippedPayload.pickup_phone;
      delete strippedPayload.pickup_email;
      delete strippedPayload.pickup_address;
      delete strippedPayload.pickup_city;
      delete strippedPayload.pickup_state;
      delete strippedPayload.pickup_country;
      delete strippedPayload.pickup_pincode;
      delete strippedPayload.pickup_address_line2;
      delete strippedPayload.business_name;
      delete strippedPayload.landmark;
      delete strippedPayload.warehouse_status;
      delete strippedPayload.last_synced;
      
      const { data, error } = await supabase
        .from('store_shipping_settings')
        .upsert(strippedPayload, { onConflict: 'store_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    throw err;
  }
}

// In-memory fallback for shipping settings during mock/offline testing
let mockStoreShippingSettings = {};

export const shippingService = {
  /**
   * Fetch shipping pickup address settings for a specific store
   */
  getShippingSettings: async (storeId) => {
    if (!storeId) return null;
    
    if (!supabaseClient) {
      console.log(`[shippingService]: Offline mode. Fetching mock shipping settings for store: ${storeId}`);
      return mockStoreShippingSettings[storeId] || {
        warehouse_name: 'Primary Warehouse',
        contact_person: 'Jane Doe',
        email: 'merchant@store.com',
        phone: '9999999999',
        address: '123 Maker Lane, Innovation District',
        pincode: '560001',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        gstin: '29AAAAA0000A1Z5'
      };
    }

    try {
      const { data, error } = await supabaseClient
        .from('store_shipping_settings')
        .select('*')
        .eq('store_id', storeId)
        .maybeSingle();

      if (error) {
        console.error('❌ [shippingService.getShippingSettings] Error:', error.message);
        return null;
      }
      return data;
    } catch (e) {
      console.error('❌ [shippingService.getShippingSettings] Exception:', e);
      return null;
    }
  },

  /**
   * Save (upsert) shipping pickup settings for a store
   */
  saveShippingSettings: async (storeId, settings) => {
    if (!storeId) throw new Error('Store ID is required to save settings.');

    // 1. Resolve active shipping provider and register/verify pickup location
    const providerName = process.env.NEXT_PUBLIC_ACTIVE_SHIPPING_PROVIDER || 'Shiprocket';
    const provider = shippingFactory.getProvider(providerName);
    
    let regResult = { lat: null, lon: null, registered: false, pickup_location_name: null, pickup_location_id: null, warehouse_status: 'pending_registration' };
    if (provider && typeof provider.addPickupLocation === 'function') {
      try {
        regResult = await provider.addPickupLocation({ ...settings, store_id: storeId });
      } catch (regErr) {
        console.error('⚠️ [shippingService.saveShippingSettings]: Provider pickup location registration failed:', regErr.message);
        throw new Error(`Shipping provider registration failed: ${regErr.message}`);
      }
    }

    const payload = {
      store_id: storeId,
      warehouse_name: settings.warehouse_name,
      contact_person: settings.contact_person,
      email: settings.email,
      phone: settings.phone,
      address: settings.address,
      pincode: settings.pincode,
      city: settings.city,
      state: settings.state,
      country: settings.country || 'India',
      gstin: settings.gstin || null,
      lat: regResult.lat,
      lon: regResult.lon,
      shiprocket_registered: regResult.registered,
      pickup_location_name: regResult.pickup_location_name || null,
      pickup_location_id: regResult.pickup_location_id || null,
      pickup_address_line2: settings.pickup_address_line2 || null,
      business_name: settings.business_name || null,
      landmark: settings.landmark || null,
      warehouse_status: regResult.warehouse_status || 'registered',
      last_synced: regResult.last_synced || new Date().toISOString()
    };

    if (!supabaseClient) {
      console.log(`[shippingService]: Offline mode. Saving mock shipping settings for store: ${storeId}`);
      mockStoreShippingSettings[storeId] = payload;
      return { ...payload, success: true };
    }

    try {
      const data = await safeSettingsUpsert(supabaseClient, payload);
      return data;
    } catch (e) {
      console.error('❌ [shippingService.saveShippingSettings] Exception:', e);
      throw e;
    }
  },

  /**
   * Create shipment on the selected shipping provider for an order with duplicate prevention
   */
  createShipment: async (orderId) => {
    if (!orderId) throw new Error('Order ID is required to create a shipment.');

    try {
      console.log(`🔄 [shippingService.createShipment]: Initializing shipment for Order: ${orderId}...`);
      
      // 1. Fetch order details
      const orderDetails = await orderService.getOrderDetails(orderId);
      if (!orderDetails) {
        throw new Error(`Order ${orderId} details could not be found.`);
      }

      // DUPLICATE PREVENTION: Check if shipment already exists with a valid AWB
      if (orderDetails.awb_number && orderDetails.awb_number.toString().trim() !== '') {
        console.log(`ℹ️ [shippingService.createShipment]: Order ${orderId} already has a created shipment (AWB: ${orderDetails.awb_number}, Shipment ID: ${orderDetails.shipment_id}, Provider: ${orderDetails.shipping_provider}). Skipping duplicate creation.`);
        return {
          success: true,
          shipment_id: orderDetails.shipment_id,
          awb_number: orderDetails.awb_number,
          courier_name: orderDetails.courier_name,
          tracking_number: orderDetails.tracking_number,
          tracking_url: orderDetails.tracking_url,
          status: orderDetails.shipping_status || 'Shipment Created',
          estimated_delivery: orderDetails.estimated_delivery
        };
      }

      // Pre-Validation: address, pincode, phone, products
      const address = (orderDetails.shipping_address || '').trim();
      let pincode = (orderDetails.shipping_address_pincode || orderDetails.shipping_pincode || '').trim();
      if (!pincode || pincode.replace(/\D/g, '').length !== 6) {
        const pinMatch = (orderDetails.shipping_address || '').match(/\b\d{6}\b/);
        if (pinMatch) {
          pincode = pinMatch[0];
        }
      }
      const phone = (orderDetails.customer_phone || '').trim();
      
      if (!address || address.length < 10) {
        throw new Error('Customer shipping address is too short. Shipping requires at least 10 characters to generate shipment.');
      }
      if (!pincode || pincode.replace(/\D/g, '').length !== 6) {
        throw new Error('Customer shipping pincode must be exactly 6 digits.');
      }
      if (!phone || phone.replace(/\D/g, '').length < 10) {
        throw new Error('Customer phone number must be at least 10 digits.');
      }

      // Check if order already has an active shipment and AWB
      if (orderDetails.shipment_id && orderDetails.awb_number) {
        console.log(`ℹ️ [shippingService.createShipment]: Order ${orderId} already has AWB (${orderDetails.awb_number}) and Shipment (${orderDetails.shipment_id}). Preserving existing shipment.`);
        
        let labelUrl = orderDetails.shipping_label_url;
        if (!labelUrl) {
          try {
            const provider = shippingFactory.getProvider(orderDetails.shipping_provider || 'Shiprocket');
            labelUrl = await provider.getLabelUrl(orderDetails.shipment_id);
            if (labelUrl && supabaseClient) {
              await safeOrderUpdate(supabaseClient, orderId, { 
                shipping_label_url: labelUrl,
                shipping_status: orderDetails.shipping_status === 'Shipment Created' || orderDetails.shipping_status === 'Pending' ? 'Label Generated' : orderDetails.shipping_status
              });
            }
          } catch (lblErr) {
            console.warn('⚠️ [Shipping]: Auto-fetch label notice:', lblErr.message);
          }
        }

        return {
          success: true,
          shipment_id: orderDetails.shipment_id,
          awb_number: orderDetails.awb_number,
          courier_name: orderDetails.courier_name,
          tracking_number: orderDetails.tracking_number || orderDetails.awb_number,
          tracking_url: orderDetails.tracking_url,
          status: orderDetails.shipping_status || 'AWB Assigned',
          shipping_label_url: labelUrl || null,
          shipping_manifest_url: orderDetails.shipping_manifest_url || null,
          pickup_token_number: orderDetails.pickup_token_number || null,
          pickup_scheduled_date: orderDetails.pickup_scheduled_date || null
        };
      }

      // 2. Fetch shipping settings for the store
      const pickupSettings = await shippingService.getShippingSettings(orderDetails.store_id);
      if (!pickupSettings) {
        throw new Error(`Warehouse settings (pickup address) are missing for store ${orderDetails.store_id}. Please configure shipping settings in the Creator dashboard.`);
      }

      const shiprocketProvider = shippingFactory.getProvider('Shiprocket');
      const delhiveryProvider = shippingFactory.getProvider('Delhivery');

      let result = null;
      let actualProviderUsed = null;
      let shiprocketError = null;

      // ============================================================
      // STEP 1: Attempt Primary Provider (Shiprocket)
      // ============================================================
      console.log(`[Shipping] Attempting Shiprocket for Order: ${orderId}`);
      console.log(`[Shipping] Shiprocket request started`);

      try {
        result = await shiprocketProvider.createShipment(orderId, orderDetails, pickupSettings);
        // Shiprocket is ONLY considered SUCCESS if BOTH shipment_id AND awb_number are present
        if (result && result.success && result.shipment_id && result.awb_number && result.awb_number.toString().trim() !== '') {
          actualProviderUsed = 'Shiprocket';
          console.log(`[Shipping] Shiprocket success: shipmentId=${result.shipment_id}, awb=${result.awb_number}`);
        } else {
          const reason = result?.error || 'Shiprocket did not return a valid AWB code.';
          console.warn(`[Shipping] Shiprocket shipment considered FAILED: ${reason}`);
          throw new Error(reason);
        }
      } catch (srErr) {
        shiprocketError = srErr.message || 'Unknown Shiprocket error';
        console.warn(`[Shipping] Shiprocket failed: ${shiprocketError}`);
      }

      // ============================================================
      // STEP 2: Fallback to Delhivery (if Shiprocket failed)
      // ============================================================
      if (!result || !result.success || !result.awb_number || result.awb_number.toString().trim() === '') {
        console.log(`[Shipping] Falling back to Delhivery for Order: ${orderId}`);
        console.log(`[Shipping] Delhivery request started`);

        try {
          result = await delhiveryProvider.createShipment(orderId, orderDetails, pickupSettings);
          if (result && result.success && (result.shipment_id || result.awb_number)) {
            actualProviderUsed = 'Delhivery';
            console.log(`[Shipping] Delhivery shipment created successfully: shipmentId=${result.shipment_id || 'N/A'}, awb=${result.awb_number || 'N/A'}`);
          } else {
            throw new Error(result?.error || 'Delhivery did not return a valid shipment ID or AWB.');
          }
        } catch (dlErr) {
          const delhiveryError = dlErr.message || 'Unknown Delhivery error';
          console.error(`[Shipping] Delhivery failed: ${delhiveryError}`);

          // Record failure status in database without generating any fake shipment/AWB
          if (supabaseClient) {
            await safeOrderUpdate(supabaseClient, orderId, {
              shipping_status: 'Shipment Failed',
              shipping_provider: null,
              shipment_id: null,
              awb_number: null
            }).catch(() => {});
          }

          throw new Error(`Shipment creation failed on all providers. Shiprocket: "${shiprocketError}" | Delhivery: "${delhiveryError}"`);
        }
      }

      // ============================================================
      // STEP 3: Auto-generate Shipping Label immediately after AWB
      // ============================================================
      let labelUrl = null;
      try {
        const activeProvider = shippingFactory.getProvider(actualProviderUsed);
        labelUrl = await activeProvider.getLabelUrl(result.shipment_id);
        console.log(`✅ [Shipping] Auto-generated shipping label URL: ${labelUrl}`);
      } catch (lblErr) {
        console.warn('⚠️ [Shipping] Label generation pending or will be generated on demand:', lblErr.message);
      }

      const finalStatus = labelUrl ? 'Label Generated' : 'AWB Assigned';

      // ============================================================
      // STEP 4: Record Successful Shipment in Database
      // ============================================================
      if (supabaseClient) {
        await safeOrderUpdate(supabaseClient, orderId, {
          shipping_provider: actualProviderUsed,
          shipment_id: result.shipment_id || null,
          awb_number: result.awb_number || null,
          courier_name: result.courier_name || null,
          tracking_number: result.tracking_number || result.awb_number || null,
          tracking_url: result.tracking_url || null,
          shipping_status: finalStatus,
          shipping_label_url: labelUrl || null,
          estimated_delivery: result.estimated_delivery || null,
          shipped_at: null,
          delivered_at: null,
          pickup_location_name: result.pickup_location_name || null,
          pickup_location_id: result.pickup_location_id || null,
          pickup_id: result.pickup_id || null
        });
      }

      console.log(`✅ [Shipping] Shipment created successfully via ${actualProviderUsed} for Order: ${orderId}. AWB: ${result.awb_number}, Status: ${finalStatus}`);
      return {
        ...result,
        shipping_status: finalStatus,
        shipping_label_url: labelUrl || null
      };
    } catch (e) {
      console.error(`❌ [Shipping] Failed for Order ${orderId}:`, e.message);
      throw e;
    }
  },

  /**
   * Cancel shipment
   */
  cancelShipment: async (orderId) => {
    if (!orderId) throw new Error('Order ID is required to cancel shipment.');

    try {
      const orderDetails = await orderService.getOrderDetails(orderId);
      if (!orderDetails) throw new Error('Order details not found.');
      if (!orderDetails.shipment_id) throw new Error('No shipment has been created for this order.');

      const provider = shippingFactory.getProvider(orderDetails.shipping_provider);
      await provider.cancelShipment(orderId, orderDetails.shipment_id);

      if (supabaseClient) {
        const { error } = await supabaseClient
          .from('orders')
          .update({ 
            status: 'Cancelled',
            shipping_status: 'Cancelled' 
          })
          .eq('id', orderId);

        if (error) throw error;
      } else {
        // Fallback update order in memory
        console.log(`✅ [shippingService.cancelShipment]: Offline mock database sync complete.`);
        // Find in mock data and update status
        const { orderService } = await import('@/services/orderService');
        await orderService.updateOrderPayment(orderId, { status: 'Cancelled' });
        
        // Manual stock restore for offline mock mode
        const { products } = await import('@/data/mockData');
        if (products && orderDetails.items) {
          for (const item of orderDetails.items) {
            const mockProduct = products.find(p => p.id === item.product_id || p.id === parseInt(item.product_id));
            if (mockProduct) {
              mockProduct.stock = (mockProduct.stock || 0) + (item.quantity || 1);
              console.log(`[Offline Mock]: Restored stock for product ${mockProduct.name} (+${item.quantity}). New stock: ${mockProduct.stock}`);
            }
          }
        }
      }
      
      console.log(`✅ [shippingService.cancelShipment]: Cancelled shipment and restored stock for Order: ${orderId}`);
      return { success: true };
    } catch (e) {
      console.error(`❌ [shippingService.cancelShipment] Failed for Order ${orderId}:`, e.message);
      throw e;
    }
  },

  /**
   * Retrieve tracking updates from the provider and update order status
   */
  syncTrackingStatus: async (orderId) => {
    if (!orderId) throw new Error('Order ID is required to sync tracking.');

    try {
      const orderDetails = await orderService.getOrderDetails(orderId);
      if (!orderDetails) throw new Error('Order details not found.');
      if (!orderDetails.tracking_number) {
        throw new Error('This order has no active AWB or tracking number assigned.');
      }

      const provider = shippingFactory.getProvider(orderDetails.shipping_provider);
      const trackingInfo = await provider.getTrackingStatus(orderDetails.tracking_number);

      if (supabaseClient) {
        const updatePayload = { 
          shipping_status: trackingInfo.status,
          estimated_delivery: trackingInfo.estimated_delivery || null
        };
        
        if (trackingInfo.status === 'Picked Up' || trackingInfo.status === 'In Transit' || trackingInfo.status === 'Out For Delivery') {
          updatePayload.shipped_at = new Date().toISOString();
        }
        
        if (trackingInfo.status === 'Delivered') {
          updatePayload.delivered_at = new Date().toISOString();
        }

        await safeOrderUpdate(supabaseClient, orderId, updatePayload);
      }

      console.log(`🔄 [shippingService.syncTracking]: Synced status for Order ${orderId} as "${trackingInfo.status}"`);
      return trackingInfo;
    } catch (e) {
      console.error(`❌ [shippingService.syncTracking] Failed for Order ${orderId}:`, e.message);
      throw e;
    }
  },

  /**
   * Schedule Courier Pickup for Shipment
   */
  requestPickup: async (orderId, pickupDate = null) => {
    if (!orderId) throw new Error('Order ID is required to schedule pickup.');

    const orderDetails = await orderService.getOrderDetails(orderId);
    if (!orderDetails) throw new Error('Order details not found.');
    if (!orderDetails.shipment_id) throw new Error('No shipment exists for this order. Please ship the order first.');

    const providerName = orderDetails.shipping_provider || 'Shiprocket';
    const provider = shippingFactory.getProvider(providerName);

    if (!provider.requestPickup || typeof provider.requestPickup !== 'function') {
      throw new Error(`Provider ${providerName} does not support pickup requests.`);
    }

    console.log(`🔄 [shippingService.requestPickup]: Scheduling pickup for Order ${orderId} (Shipment: ${orderDetails.shipment_id})...`);
    const pickupRes = await provider.requestPickup(orderDetails.shipment_id, pickupDate);

    if (supabaseClient) {
      await safeOrderUpdate(supabaseClient, orderId, {
        shipping_status: 'Pickup Scheduled',
        pickup_scheduled_date: pickupRes.pickup_scheduled_date || null,
        pickup_token_number: pickupRes.pickup_token_number || null,
        pickup_status: 'Scheduled'
      });
    }

    console.log(`✅ [shippingService.requestPickup]: Pickup scheduled for Order ${orderId}. Token: ${pickupRes.pickup_token_number}`);
    return pickupRes;
  },

  /**
   * Generate Shipping Manifest PDF URL for Pickup Handover
   */
  generateManifest: async (orderId) => {
    if (!orderId) throw new Error('Order ID is required to generate manifest.');

    const orderDetails = await orderService.getOrderDetails(orderId);
    if (!orderDetails) throw new Error('Order details not found.');
    if (!orderDetails.shipment_id) throw new Error('No shipment exists for this order.');

    const providerName = orderDetails.shipping_provider || 'Shiprocket';
    const provider = shippingFactory.getProvider(providerName);

    if (!provider.generateManifest || typeof provider.generateManifest !== 'function') {
      throw new Error(`Provider ${providerName} does not support manifest generation.`);
    }

    console.log(`🔄 [shippingService.generateManifest]: Generating manifest for Order ${orderId} (Shipment: ${orderDetails.shipment_id})...`);
    const manifestUrl = await provider.generateManifest(orderDetails.shipment_id);

    if (supabaseClient && manifestUrl) {
      await safeOrderUpdate(supabaseClient, orderId, {
        shipping_manifest_url: manifestUrl
      });
    }

    console.log(`✅ [shippingService.generateManifest]: Manifest generated: ${manifestUrl}`);
    return { success: true, manifest_url: manifestUrl };
  },

  /**
   * Securely fetch Shipping Label PDF URL
   */
  getLabelUrl: async (orderId) => {
    if (!orderId) throw new Error('Order ID is required to fetch label.');

    try {
      const orderDetails = await orderService.getOrderDetails(orderId);
      if (!orderDetails) throw new Error('Order details not found.');
      if (!orderDetails.shipment_id) throw new Error('No shipment exists for this order.');

      const provider = shippingFactory.getProvider(orderDetails.shipping_provider);
      return await provider.getLabelUrl(orderDetails.shipment_id, orderDetails.awb_number);
    } catch (e) {
      console.error(`❌ [shippingService.getLabelUrl] Failed for Order ${orderId}:`, e.message);
      throw e;
    }
  },

  /**
   * Securely fetch the Shipping Label PDF binary buffer
   */
  fetchLabelPdf: async (orderId) => {
    if (!orderId) throw new Error('Order ID is required to fetch label.');

    const orderDetails = await orderService.getOrderDetails(orderId);
    if (!orderDetails) throw new Error('Order details not found.');
    if (!orderDetails.shipment_id) throw new Error('No shipment exists for this order.');

    const providerName = orderDetails.shipping_provider || 'Shiprocket';
    const provider = shippingFactory.getProvider(providerName);
    
    if (providerName === 'Delhivery' && process.env.NEXT_PUBLIC_ACTIVE_SHIPPING_PROVIDER === 'Delhivery' && process.env.DELHIVERY_API_TOKEN) {
      const trackingNo = orderDetails.awb_number || orderDetails.shipment_id;
      if (provider.isMock) {
        console.log(`[shippingService.fetchLabelPdf]: Mock mode. Downloading sample PDF...`);
        const pdfResponse = await fetch('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf');
        const pdfBuffer = await pdfResponse.arrayBuffer();
        return Buffer.from(pdfBuffer);
      }
      
      const labelDataUrl = `${provider.apiBase}/api/p/packing_slip?wbns=${trackingNo}&pdf=true`;
      console.log(`🔄 [shippingService.fetchLabelPdf]: Querying Delhivery packing slip download link from ${labelDataUrl}...`);
      
      const response = await fetch(labelDataUrl, {
        headers: {
          'Authorization': `Token ${provider.token}`
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to query Delhivery packing slip link: ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      const downloadUrl = data.packages?.[0]?.pdf_download_link;
      if (!downloadUrl) {
        throw new Error(`No pdf_download_link found in Delhivery response: ${JSON.stringify(data)}`);
      }
      
      console.log(`🔄 [shippingService.fetchLabelPdf]: Downloading label PDF binary from ${downloadUrl}...`);
      const pdfResponse = await fetch(downloadUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to download Delhivery label PDF from S3: ${pdfResponse.statusText}`);
      }
      
      const pdfBuffer = await pdfResponse.arrayBuffer();
      return Buffer.from(pdfBuffer);
    } else {
      const labelUrl = await provider.getLabelUrl(orderDetails.shipment_id, orderDetails.awb_number);
      console.log(`🔄 [shippingService.fetchLabelPdf]: Fetching label PDF from ${labelUrl}...`);
      
      const pdfResponse = await fetch(labelUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to download label PDF: ${pdfResponse.statusText}`);
      }
      
      const pdfBuffer = await pdfResponse.arrayBuffer();
      return Buffer.from(pdfBuffer);
    }
  },

  /**
   * Calculate multi-seller shipping with Shiprocket as Primary and Delhivery as Fallback.
   * Supports grouping items by store_id and calculating shipping per seller shipment independently.
   */
  calculateShippingCost: async ({ storeId, destinationPincode, paymentMode = 'Prepaid', cartItems = [] }) => {
    const cleanDest = (destinationPincode || '').toString().trim().replace(/\D/g, '');
    if (!cleanDest || cleanDest.length !== 6) {
      return {
        success: false,
        serviceable: false,
        message: 'Destination pincode must be exactly 6 digits.',
        total_amount: 0,
        shipments: []
      };
    }

    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return {
        success: false,
        serviceable: false,
        message: 'Cart is empty.',
        total_amount: 0,
        shipments: []
      };
    }

    // Group items by store_id (if item.store_id is missing, fallback to passed storeId)
    const storeGroups = {};
    for (const item of cartItems) {
      const sId = item.store_id || storeId || 'unknown';
      if (!storeGroups[sId]) {
        storeGroups[sId] = [];
      }
      storeGroups[sId].push(item);
    }

    const shiprocketProvider = shippingFactory.getProvider('Shiprocket');
    const delhiveryProvider = shippingFactory.getProvider('Delhivery');

    let totalShippingCost = 0;
    const shipments = [];
    let allServiceable = true;
    const unserviceableReasons = [];

    for (const [currentStoreId, items] of Object.entries(storeGroups)) {
      if (currentStoreId === 'unknown') {
        allServiceable = false;
        unserviceableReasons.push('Missing store/seller identifier for some products.');
        continue;
      }

      // 1. Fetch store's pickup settings
      const pickupSettings = await shippingService.getShippingSettings(currentStoreId);
      const originPincode = (pickupSettings?.pincode || '').toString().trim().replace(/\D/g, '');

      if (!originPincode || originPincode.length !== 6) {
        allServiceable = false;
        const msg = `Store (ID: ${currentStoreId}) has not configured a valid 6-digit pickup pincode.`;
        unserviceableReasons.push(msg);
        shipments.push({
          sellerId: currentStoreId,
          storeId: currentStoreId,
          serviceable: false,
          reason: msg,
          shippingCost: 0
        });
        continue;
      }

      // 2. Calculate shipment weight and package dimensions
      let shipmentWeightInGrams = 0;
      let orderValue = 0;
      let missingWeightCount = 0;

      for (const it of items) {
        const qty = parseInt(it.quantity) || 1;
        const price = parseFloat(it.price) || 0;
        orderValue += qty * price;

        const rawWeight = it.weight !== undefined && it.weight !== null ? it.weight : it.product_weight;
        if (rawWeight !== undefined && rawWeight !== null && !isNaN(parseFloat(rawWeight)) && parseFloat(rawWeight) > 0) {
          shipmentWeightInGrams += qty * parseFloat(rawWeight);
        } else {
          missingWeightCount += qty;
          shipmentWeightInGrams += qty * 500; // Documented default fallback of 500g per unit
        }
      }

      if (missingWeightCount > 0) {
        console.warn(`ℹ️ [shippingService.calculateShippingCost]: ${missingWeightCount} item(s) for store ${currentStoreId} missing explicit weight, using 500g/unit fallback.`);
      }

      const dimensions = {
        length: 15,
        breadth: 15,
        height: 15
      };

      // Diagnostic logging (WITHOUT API credentials or sensitive tokens)
      console.log(`\n================== SHIPPING ATTEMPT ==================`);
      console.log(`Seller / Store ID   : ${currentStoreId}`);
      console.log(`Pickup Pincode      : ${originPincode}`);
      console.log(`Delivery Pincode    : ${cleanDest}`);
      console.log(`Shipment Weight     : ${shipmentWeightInGrams}g`);
      console.log(`Payment Mode        : ${paymentMode}`);
      console.log(`Order Value         : ₹${orderValue}`);
      console.log(`Provider Attempt 1  : Shiprocket (Primary)`);

      let selectedShipment = null;

      // ATTEMPT 1: Primary -> Shiprocket
      try {
        const srResult = await shiprocketProvider.calculateShippingCost(
          originPincode,
          cleanDest,
          shipmentWeightInGrams,
          paymentMode,
          dimensions,
          orderValue
        );

        console.log(`Shiprocket Result   : Serviceable=${srResult?.serviceable} | Amount=₹${srResult?.total_amount || 0} | Reason=${srResult?.reason || 'OK'}`);

        if (srResult && srResult.success && srResult.serviceable && srResult.total_amount > 0) {
          selectedShipment = {
            sellerId: currentStoreId,
            storeId: currentStoreId,
            provider: 'Shiprocket',
            pickupPincode: originPincode,
            deliveryPincode: cleanDest,
            destinationPincode: cleanDest,
            shippingCost: srResult.total_amount,
            estimatedDelivery: srResult.estimated_delivery || null,
            courierName: srResult.courier_name || 'Shiprocket Courier',
            serviceable: true
          };
          console.log(`Selected Provider   : Shiprocket (Primary succeeded)`);
        }
      } catch (srErr) {
        console.warn(`⚠️ [shippingService]: Shiprocket attempt exception:`, srErr.message);
      }

      // ATTEMPT 2: Fallback -> Delhivery (if Shiprocket was not serviceable / failed)
      if (!selectedShipment) {
        console.log(`Provider Attempt 2  : Delhivery (Fallback triggered)`);
        try {
          const dlResult = await delhiveryProvider.calculateShippingCost(
            originPincode,
            cleanDest,
            shipmentWeightInGrams,
            paymentMode
          );

          console.log(`Delhivery Result    : Serviceable=${dlResult?.serviceable} | Amount=₹${dlResult?.total_amount || 0} | Reason=${dlResult?.reason || 'OK'}`);

          if (dlResult && dlResult.success && dlResult.serviceable && dlResult.total_amount > 0) {
            selectedShipment = {
              sellerId: currentStoreId,
              storeId: currentStoreId,
              provider: 'Delhivery',
              pickupPincode: originPincode,
              deliveryPincode: cleanDest,
              destinationPincode: cleanDest,
              shippingCost: dlResult.total_amount,
              estimatedDelivery: dlResult.estimated_delivery || null,
              courierName: 'Delhivery Express',
              serviceable: true
            };
            console.log(`Selected Provider   : Delhivery (Fallback succeeded)`);
          } else {
            console.warn(`⚠️ [shippingService]: Delhivery fallback was also unserviceable:`, dlResult?.reason || 'Unserviceable');
          }
        } catch (dlErr) {
          console.warn(`⚠️ [shippingService]: Delhivery fallback exception:`, dlErr.message);
        }
      }

      console.log(`======================================================\n`);

      if (selectedShipment && selectedShipment.serviceable) {
        totalShippingCost += selectedShipment.shippingCost;
        shipments.push(selectedShipment);
      } else {
        allServiceable = false;
        const failReason = `Route ${originPincode} → ${cleanDest} is not serviceable by Shiprocket or Delhivery.`;
        unserviceableReasons.push(failReason);
        shipments.push({
          sellerId: currentStoreId,
          storeId: currentStoreId,
          provider: 'None',
          pickupPincode: originPincode,
          deliveryPincode: cleanDest,
          destinationPincode: cleanDest,
          shippingCost: 0,
          serviceable: false,
          reason: failReason
        });
      }
    }

    if (!allServiceable) {
      return {
        success: false,
        serviceable: false,
        message: unserviceableReasons.join('; ') || 'Some seller shipments are not serviceable.',
        total_amount: 0,
        shipments
      };
    }

    return {
      success: true,
      serviceable: true,
      total_amount: parseFloat(totalShippingCost.toFixed(2)),
      shipments
    };
  }
};

export default shippingService;
