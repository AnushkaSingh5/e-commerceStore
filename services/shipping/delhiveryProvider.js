// services/shipping/delhiveryProvider.js

export class DelhiveryProvider {
  constructor() {
    this.token = process.env.DELHIVERY_API_TOKEN || '';
    this.env = process.env.DELHIVERY_ENV || 'sandbox';
    
    // Check if credentials are mock/placeholder
    this.isMock = !this.token || 
                  this.token === 'mock' || 
                  this.token.startsWith('your_') || 
                  this.token.includes('placeholder') ||
                  this.token.includes('mock_');
    
    this.apiBase = this.env === 'production' 
      ? 'https://track.delhivery.com' 
      : 'https://staging-express.delhivery.com';
  }

  /**
   * Register a pickup location (warehouse) in Delhivery (Steps 1 & 2)
   */
  async addPickupLocation(settings) {
    if (this.isMock) {
      console.log('ℹ️ [DelhiveryProvider]: Mock Mode. Registering mock pickup location...');
      return { 
        lat: 12.9716, 
        lon: 77.5946, 
        registered: true,
        pickup_location_name: (settings.warehouse_name || '').trim() || 'Mock Warehouse',
        pickup_location_id: `dl_pk_${Math.floor(100000 + Math.random() * 900000)}`,
        warehouse_status: 'registered',
        last_synced: new Date().toISOString()
      };
    }

    try {
      // Trim all input string fields
      const trimmedWarehouseName = (settings.warehouse_name || '').trim();
      const trimmedPincode = (settings.pincode || '').trim();
      const trimmedCity = (settings.city || '').trim();
      const trimmedState = (settings.state || '').trim();
      const trimmedCountry = (settings.country || 'India').trim();
      const trimmedAddress = (settings.address || '').trim();
      const trimmedPhone = (settings.phone || '').trim();
      const trimmedEmail = (settings.email || '').trim();
      const trimmedContactPerson = (settings.contact_person || '').trim();
      const trimmedAddressLine2 = (settings.pickup_address_line2 || '').trim();
      const trimmedBusinessName = (settings.business_name || '').trim();
      const trimmedLandmark = (settings.landmark || '').trim();

      // Validate mandatory fields
      const missingFields = [];
      if (!trimmedWarehouseName) missingFields.push('Warehouse Name');
      if (!trimmedPincode || trimmedPincode.length !== 6) missingFields.push('Pincode (6-digit)');
      if (!trimmedCity) missingFields.push('City');
      if (!trimmedState) missingFields.push('State');
      if (!trimmedAddress) missingFields.push('Address Line 1');
      if (!trimmedPhone || trimmedPhone.length !== 10) missingFields.push('Phone (10-digit)');

      if (missingFields.length > 0) {
        throw new Error(`Delhivery warehouse creation validation failed. Missing fields: ${missingFields.join(', ')}`);
      }

      // Combine business name, address lines, and landmark into street address for Delhivery
      let fullAddress = trimmedAddress;
      if (trimmedAddressLine2) {
        fullAddress += `, ${trimmedAddressLine2}`;
      }
      if (trimmedLandmark) {
        fullAddress += `, Landmark: ${trimmedLandmark}`;
      }

      // Match the exact request body expected by Delhivery's ClientWarehouse API (Step 2)
      const warehousePayload = {
        name: trimmedWarehouseName,
        registered_name: trimmedBusinessName || trimmedWarehouseName,
        contact_person: trimmedContactPerson || 'Warehouse Contact',
        phone: trimmedPhone,
        email: trimmedEmail,
        address: fullAddress,
        city: trimmedCity,
        state: trimmedState,
        country: trimmedCountry,
        pin: trimmedPincode,
        return_address: fullAddress,
        return_city: trimmedCity,
        return_state: trimmedState,
        return_pin: trimmedPincode,
        return_phone: trimmedPhone
      };

      const url = `${this.apiBase}/api/backend/clientwarehouse/create/`;

      // Multi-encoding request retry flow to support any environment or account type configuration
      let result = await this._makeRequest(url, 'POST', {
        'Authorization': `Token ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }, JSON.stringify(warehousePayload), warehousePayload.name);

      if (result.success) return result.data;

      const directParams = new URLSearchParams();
      for (const [key, val] of Object.entries(warehousePayload)) {
        directParams.append(key, val);
      }
      result = await this._makeRequest(url, 'POST', {
        'Authorization': `Token ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }, directParams.toString(), warehousePayload.name);

      if (result.success) return result.data;

      const wrappedParams = new URLSearchParams();
      wrappedParams.append('format', 'json');
      wrappedParams.append('data', JSON.stringify(warehousePayload));
      result = await this._makeRequest(url, 'POST', {
        'Authorization': `Token ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }, wrappedParams.toString(), warehousePayload.name);

      if (result.success) return result.data;

      throw new Error(result.error);
    } catch (e) {
      console.error('❌ [DelhiveryProvider.addPickupLocation] Failed:', e.message);
      throw e;
    }
  }

  async _makeRequest(url, method, headers, rawBody, warehouseName) {
    try {
      // Step 10: Log request details in development
      if (process.env.NODE_ENV !== 'production') {
        console.log('--- Outgoing Delhivery Warehouse Registration Request ---');
        console.log(`URL: ${url}`);
        console.log(`Method: ${method}`);
        console.log(`Headers:`, JSON.stringify(headers, null, 2));
        console.log(`Body: ${rawBody}`);
        console.log('---------------------------------------------------------');
      }

      const response = await fetch(url, { method, headers, body: rawBody });
      const responseStatus = response.status;
      const responseStatusText = response.statusText;
      const responseBodyText = await response.text();

      // Step 10: Log response details in development
      if (process.env.NODE_ENV !== 'production') {
        console.log('--- Delhivery Warehouse Registration Response ---');
        console.log(`Status: ${responseStatus} ${responseStatusText}`);
        console.log(`Body (raw): ${responseBodyText}`);
        console.log('-------------------------------------------------');
      }

      if (!response.ok) {
        // If the error message indicates it already exists, treat it as a success!
        if (responseBodyText.toLowerCase().includes('already exists') || responseBodyText.toLowerCase().includes('already registered')) {
          console.log(`ℹ️ [DelhiveryProvider]: Warehouse "${warehouseName}" already exists on Delhivery. Treating as registered.`);
          return {
            success: true,
            data: {
              lat: 12.9716,
              lon: 77.5946,
              registered: true,
              pickup_location_name: warehouseName,
              pickup_location_id: `dl_pk_existing`,
              warehouse_status: 'registered',
              last_synced: new Date().toISOString()
            }
          };
        }
        return { success: false, error: `HTTP ${responseStatus} ${responseStatusText}: ${responseBodyText}` };
      }

      let data;
      try {
        data = JSON.parse(responseBodyText);
      } catch (err) {
        return { success: false, error: `Invalid JSON response: ${responseBodyText}` };
      }

      const success = data.success || data.status === 'Success' || (data.name && data.pin) || data.id;
      if (!success) {
        const detailStr = JSON.stringify(data);
        if (detailStr.toLowerCase().includes('already exists') || detailStr.toLowerCase().includes('already registered')) {
          console.log(`ℹ️ [DelhiveryProvider]: Warehouse "${warehouseName}" already exists on Delhivery. Treating as registered.`);
          return {
            success: true,
            data: {
              lat: 12.9716,
              lon: 77.5946,
              registered: true,
              pickup_location_name: warehouseName,
              pickup_location_id: `dl_pk_existing`,
              warehouse_status: 'registered',
              last_synced: new Date().toISOString()
            }
          };
        }
        return { success: false, error: detailStr };
      }

      const pickupLocationId = data.id || data.warehouse_id || `dl_pk_${Math.floor(100000 + Math.random() * 900000)}`;

      return {
        success: true,
        data: {
          lat: parseFloat(data.lat) || 12.9716,
          lon: parseFloat(data.lon) || 77.5946,
          registered: true,
          pickup_location_name: data.name || warehouseName,
          pickup_location_id: String(pickupLocationId),
          warehouse_status: 'registered',
          last_synced: new Date().toISOString()
        }
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Schedule pickup request using Delhivery Pickup Request API (Step 7)
   */
  async schedulePickup(warehouseName) {
    if (this.isMock) {
      console.log(`[DelhiveryProvider]: Mock pickup request scheduled for: ${warehouseName}`);
      return { success: true, pickup_id: `dl_pk_req_${Math.floor(100000 + Math.random() * 900000)}` };
    }

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const pickupDate = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

      const pickupPayload = {
        pickup_time: "14:00",
        pickup_date: pickupDate,
        pickup_location: warehouseName,
        expected_package_count: 1
      };

      const url = `${this.apiBase}/fm/request/new/`;
      const method = 'POST';

      // Multi-encoding request retry flow for pickup request
      let result = await this._makePickupRequest(url, method, {
        'Authorization': `Token ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }, JSON.stringify(pickupPayload));

      if (result.success) return result;

      const urlencodedParams = new URLSearchParams();
      for (const [key, val] of Object.entries(pickupPayload)) {
        urlencodedParams.append(key, String(val));
      }
      result = await this._makePickupRequest(url, method, {
        'Authorization': `Token ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }, urlencodedParams.toString());

      if (result.success) return result;

      const wrappedParams = new URLSearchParams();
      wrappedParams.append('format', 'json');
      wrappedParams.append('data', JSON.stringify(pickupPayload));
      result = await this._makePickupRequest(url, method, {
        'Authorization': `Token ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }, wrappedParams.toString());

      return result;
    } catch (e) {
      console.error('❌ [DelhiveryProvider.schedulePickup] Error:', e.message);
      return { success: false, error: e.message };
    }
  }

  async _makePickupRequest(url, method, headers, rawBody) {
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.log('--- Outgoing Delhivery Pickup Request ---');
        console.log(`URL: ${url}`);
        console.log(`Method: ${method}`);
        console.log(`Headers:`, JSON.stringify(headers, null, 2));
        console.log(`Body: ${rawBody}`);
        console.log('----------------------------------------');
      }

      const response = await fetch(url, { method, headers, body: rawBody });
      const responseStatus = response.status;
      const responseStatusText = response.statusText;
      const responseBodyText = await response.text();

      if (process.env.NODE_ENV !== 'production') {
        console.log('--- Delhivery Pickup Request Response ---');
        console.log(`Status: ${responseStatus} ${responseStatusText}`);
        console.log(`Body (raw): ${responseBodyText}`);
        console.log('-----------------------------------------');
      }

      if (!response.ok) {
        return { success: false, error: `HTTP ${responseStatus} ${responseStatusText}: ${responseBodyText}` };
      }

      let data;
      try {
        data = JSON.parse(responseBodyText);
      } catch (err) {
        return { success: false, error: `Invalid JSON response: ${responseBodyText}` };
      }

      const success = data.success || data.status === 'Success' || data.pickup_id || data.request_id;
      if (!success) {
        return { success: false, error: JSON.stringify(data) };
      }

      return {
        success: true,
        pickup_id: String(data.pickup_id || data.request_id || `dl_pk_req_${Math.floor(100000 + Math.random() * 900000)}`)
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Create shipment / order in Delhivery (Steps 4 & 5)
   */
  async createShipment(orderId, orderDetails, pickupSettings) {
    if (this.isMock) {
      console.log('ℹ️ [DelhiveryProvider]: Mock Mode. Generating mock shipment and AWB...');
      const shipmentId = `dl_ship_${Math.floor(100000 + Math.random() * 900000)}`;
      const awbNumber = `9876543210${Math.floor(10 + Math.random() * 90)}`;
      const courierName = 'Delhivery Express';
      
      return {
        success: true,
        shipment_id: shipmentId,
        awb_number: awbNumber,
        courier_name: courierName,
        tracking_number: awbNumber,
        tracking_url: `/api/shipping/track?waybill=${awbNumber}`,
        status: 'Shipment Created',
        estimated_delivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB'),
        pickup_id: `dl_pk_req_mock`,
        pickup_location_name: pickupSettings?.warehouse_name || 'Mock Warehouse',
        pickup_location_id: pickupSettings?.pickup_location_id || 'Mock Warehouse ID'
      };
    }

    try {
      // 1. Clean & trim data fields
      const pincode = (orderDetails.shipping_pincode || orderDetails.shipping_address_pincode || '').trim();
      const state = (orderDetails.shipping_state || orderDetails.shipping_address_state || '').trim();
      const city = (orderDetails.shipping_city || orderDetails.shipping_address_city || '').trim();
      const addressLine = (orderDetails.shipping_address_line1 || orderDetails.shipping_address || '').trim();
      const addressLine2 = (orderDetails.shipping_address_line2 || '').trim();
      const country = (orderDetails.shipping_country || orderDetails.shipping_address_country || 'India').trim();
      const phone = String(orderDetails.customer_phone || '').replace(/\D/g, '').slice(-10);
      const name = (orderDetails.customer_name || 'Customer').trim();

      // Check whether creator already has a registered warehouse (Step 4)
      const pickupLocationName = (pickupSettings?.pickup_location_name || '').trim();
      const pickupLocationId = (pickupSettings?.pickup_location_id || '').trim();
      
      const isRegisteredInDelhivery = pickupLocationId && 
                                      !pickupLocationId.startsWith('sr_pk_') && 
                                      pickupLocationId !== 'dl_pk_cached';

      let activeLocationName = pickupLocationName;
      let activeLocationId = pickupLocationId;

      if (!isRegisteredInDelhivery) {
        console.log(`⚠️ [DelhiveryProvider]: Warehouse not registered in Delhivery. Attempting automatic registration on the fly...`);
        try {
          const regResult = await this.addPickupLocation(pickupSettings);
          activeLocationName = regResult.pickup_location_name;
          activeLocationId = regResult.pickup_location_id;
          
          // Store registered warehouse details in database (Step 3)
          const { supabaseClient } = await import('@/lib/supabase');
          if (supabaseClient && regResult.registered) {
            console.log('📝 [DelhiveryProvider]: Storing registered warehouse details in database...');
            await supabaseClient
              .from('store_shipping_settings')
              .update({
                pickup_location_name: regResult.pickup_location_name,
                pickup_location_id: regResult.pickup_location_id,
                warehouse_status: 'registered',
                last_synced: new Date().toISOString()
              })
              .eq('store_id', orderDetails.store_id);
          }
        } catch (regErr) {
          console.error('❌ [DelhiveryProvider] Automatic warehouse registration failed:', regErr.message);
          throw new Error(`Delhivery shipment creation failed: The warehouse was not registered, and on-the-fly registration failed: ${regErr.message}`);
        }
      } else {
        console.log(`✅ [DelhiveryProvider]: Using existing registered warehouse: ${activeLocationName}`);
      }

      // Validate mandatory fields
      const missingFields = [];
      if (!name) missingFields.push('Customer Name');
      if (!addressLine) missingFields.push('Address Line 1');
      if (!city) missingFields.push('City');
      if (!state) missingFields.push('State');
      if (!pincode || pincode.length !== 6) missingFields.push('Pincode (6-digit)');
      if (!phone || phone.length !== 10) missingFields.push('Phone (10-digit)');

      if (missingFields.length > 0) {
        throw new Error(`Delhivery shipment pre-validation failed. Missing fields: ${missingFields.join(', ')}`);
      }

      // 2. Resolve items
      let itemsList = orderDetails.items || [];
      if (itemsList.length === 0) {
        const { supabaseClient } = await import('@/lib/supabase');
        if (supabaseClient) {
          const { data: dbItems } = await supabaseClient
            .from('order_items')
            .select('*, product:product_id(name, image_url)')
            .eq('order_id', orderId);
          if (dbItems && dbItems.length > 0) {
            itemsList = dbItems.map(item => ({
              ...item,
              productName: (item.snap_product_name || item.product?.name || 'Store Product').trim(),
              productImage: (item.snap_product_image || item.product?.image_url || '').trim()
            }));
          }
        }
      }

      if (itemsList.length === 0) {
        throw new Error(`Failed to create Delhivery shipment: No items found for order ${orderId}`);
      }

      const totalQuantity = itemsList.reduce((sum, item) => sum + (parseInt(item.quantity) || 1), 0);
      const computedWeight = Math.max(0.1, totalQuantity * 0.5); // 0.5 kg per item, min 0.1 kg
      
      const subtotal = itemsList.reduce((sum, item) => sum + (parseFloat(item.price) * (parseInt(item.quantity) || 1)), 0);

      // Construct Delhivery shipment payload (pickup_location.name is creator's registered warehouse)
      const shipmentData = {
        shipments: [
          {
            order: orderId,
            name: name,
            add: `${addressLine} ${addressLine2}`.trim(),
            city: city,
            state: state,
            country: country,
            pin: pincode,
            phone: phone,
            payment_mode: orderDetails.payment_status === 'paid' ? 'Prepaid' : 'COD',
            cod_amount: orderDetails.payment_status === 'paid' ? 0.00 : parseFloat(subtotal.toFixed(2)),
            weight: parseFloat(computedWeight.toFixed(2)),
            length: 15,
            breadth: 15,
            height: 15,
            package_desc: itemsList.map(item => (item.productName || 'Product').trim()).join(', '),
            item_description: itemsList.map(item => (item.productName || 'Product').trim()).join(', '),
            declared_value: parseFloat(subtotal.toFixed(2))
          }
        ],
        pickup_location: {
          name: activeLocationName
        }
      };

      const body = new URLSearchParams();
      body.append('format', 'json');
      body.append('data', JSON.stringify(shipmentData));

      const url = `${this.apiBase}/api/cmu/create.json`;
      const method = 'POST';
      const headers = {
        'Authorization': `Token ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      };
      const rawBody = body.toString();

      // Step 10: Log request details in development
      if (process.env.NODE_ENV !== 'production') {
        console.log('--- Outgoing Delhivery Shipment Creation Request ---');
        console.log(`URL: ${url}`);
        console.log(`Method: ${method}`);
        console.log(`Headers:`, JSON.stringify(headers, null, 2));
        console.log(`Content-Type: application/x-www-form-urlencoded`);
        console.log(`Body (raw): ${rawBody}`);
        console.log('----------------------------------------------------');
      }

      const response = await fetch(url, {
        method,
        headers,
        body: rawBody
      });

      // Log raw HTTP response
      const responseStatus = response.status;
      const responseStatusText = response.statusText;
      let responseBodyText = await response.text();

      if (process.env.NODE_ENV !== 'production') {
        console.log('--- Delhivery Shipment Creation Response ---');
        console.log(`Status: ${responseStatus} ${responseStatusText}`);
        console.log(`Body (raw): ${responseBodyText}`);
        console.log('---------------------------------------------');
      }

      if (!response.ok) {
        let parsedErr;
        try {
          parsedErr = JSON.parse(responseBodyText);
        } catch (_) {}
        const detail = parsedErr ? (parsedErr.message || JSON.stringify(parsedErr)) : responseBodyText;
        throw new Error(`Delhivery order creation failed: ${response.statusText} - ${detail}`);
      }

      let data;
      try {
        data = JSON.parse(responseBodyText);
      } catch (err) {
        throw new Error(`Delhivery returned invalid JSON during shipment creation: ${responseBodyText}`);
      }

      let pkg = data.packages && data.packages[0];
      let isSuccess = data.success || (pkg && pkg.status === 'Success');

      // Auto-register warehouse retry logic if client warehouse matching query does not exist
      const isWarehouseMissing = !isSuccess && (
        (data.rmk && data.rmk.includes('ClientWarehouse matching query does not exist')) ||
        (pkg && pkg.remarks && pkg.remarks.includes('ClientWarehouse matching query does not exist'))
      );

      if (isWarehouseMissing) {
        console.log('⚠️ [DelhiveryProvider]: Warehouse not registered in Delhivery (ClientWarehouse matching query does not exist). Attempting on-the-fly registration...');
        try {
          const regResult = await this.addPickupLocation(pickupSettings);
          activeLocationName = regResult.pickup_location_name;
          activeLocationId = regResult.pickup_location_id;

          // Store registered warehouse details in database (Step 3)
          const { supabaseClient } = await import('@/lib/supabase');
          if (supabaseClient && regResult.registered) {
            console.log('📝 [DelhiveryProvider]: Storing registered warehouse details in database...');
            await supabaseClient
              .from('store_shipping_settings')
              .update({
                pickup_location_name: regResult.pickup_location_name,
                pickup_location_id: regResult.pickup_location_id,
                warehouse_status: 'registered',
                last_synced: new Date().toISOString()
              })
              .eq('store_id', orderDetails.store_id);
          }

          // Re-construct payload with correct location name
          shipmentData.pickup_location.name = activeLocationName;
          const retryBody = new URLSearchParams();
          retryBody.append('format', 'json');
          retryBody.append('data', JSON.stringify(shipmentData));
          const retryRawBody = retryBody.toString();

          console.log('🔄 [DelhiveryProvider]: Retrying shipment creation after on-the-fly registration...');
          if (process.env.NODE_ENV !== 'production') {
            console.log('--- Outgoing Delhivery Shipment Creation Request (Retry) ---');
            console.log(`URL: ${url}`);
            console.log(`Method: ${method}`);
            console.log(`Headers:`, JSON.stringify(headers, null, 2));
            console.log(`Content-Type: application/x-www-form-urlencoded`);
            console.log(`Body (raw): ${retryRawBody}`);
            console.log('------------------------------------------------------------');
          }

          const retryResponse = await fetch(url, {
            method,
            headers,
            body: retryRawBody
          });

          const retryStatus = retryResponse.status;
          const retryStatusText = retryResponse.statusText;
          const retryResponseBodyText = await retryResponse.text();

          if (process.env.NODE_ENV !== 'production') {
            console.log('--- Delhivery Shipment Creation Response (Retry) ---');
            console.log(`Status: ${retryStatus} ${retryStatusText}`);
            console.log(`Body (raw): ${retryResponseBodyText}`);
            console.log('-----------------------------------------------------');
          }

          if (retryResponse.ok) {
            const retryData = JSON.parse(retryResponseBodyText);
            const retryPkg = retryData.packages && retryData.packages[0];
            const retrySuccess = retryData.success || (retryPkg && retryPkg.status === 'Success');
            if (retrySuccess) {
              pkg = retryPkg;
              isSuccess = true;
              data = retryData;
              responseBodyText = retryResponseBodyText;
            }
          }
        } catch (regErr) {
          console.error('❌ [DelhiveryProvider] Automatic warehouse registration/retry failed:', regErr.message);
        }
      }

      if (!isSuccess) {
        const errors = [];
        if (data.rmk) errors.push(data.rmk);
        if (pkg && pkg.remarks) errors.push(pkg.remarks);
        if (pkg && pkg.error) {
          if (Array.isArray(pkg.error)) errors.push(...pkg.error);
          else errors.push(pkg.error);
        }
        if (data.packages) {
          data.packages.forEach(p => {
            if (p.error) {
              if (Array.isArray(p.error)) errors.push(...p.error);
              else errors.push(p.error);
            }
          });
        }
        const errMsg = errors.filter(Boolean).join('; ') || responseBodyText;
        const err = new Error(`Delhivery returned an error: ${errMsg}`);
        if (errMsg.toLowerCase().includes('insufficient balance')) {
          err.code = 'INSUFFICIENT_BALANCE';
        }
        throw err;
      }

      const awbNumber = pkg.waybill;
      if (!awbNumber) {
        throw new Error('Delhivery response did not return a waybill number.');
      }

      const shipmentId = data.upload_wbn || `dl_ship_${Math.floor(100000 + Math.random() * 900000)}`;

      // Automatically schedule pickup (Step 7)
      let pickupId = null;
      try {
        console.log(`🔄 [DelhiveryProvider] Automatically scheduling pickup request for warehouse: ${activeLocationName}...`);
        const pickupResult = await this.schedulePickup(activeLocationName);
        if (pickupResult.success) {
          pickupId = pickupResult.pickup_id;
          console.log(`✅ [DelhiveryProvider] Pickup scheduled successfully. Pickup ID: ${pickupId}`);
        } else {
          console.warn(`⚠️ [DelhiveryProvider] Pickup scheduling failed: ${pickupResult.error}`);
        }
      } catch (pickupErr) {
        console.error(`⚠️ [DelhiveryProvider] Pickup scheduling exception:`, pickupErr.message);
      }

      return {
        success: true,
        shipment_id: shipmentId,
        awb_number: awbNumber,
        courier_name: 'Delhivery Express',
        tracking_number: awbNumber,
        tracking_url: `/api/shipping/track?waybill=${awbNumber}`,
        status: 'Shipment Created',
        estimated_delivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB'),
        pickup_id: pickupId,
        pickup_location_name: activeLocationName,
        pickup_location_id: activeLocationId
      };
    } catch (e) {
      console.error('❌ [DelhiveryProvider.createShipment] Failed:', e.message);
      throw e;
    }
  }

  /**
   * Cancel shipment / waybill in Delhivery
   */
  async cancelShipment(orderId, shipmentId, awbNumber) {
    const trackingNo = awbNumber || shipmentId;
    if (this.isMock) {
      console.log(`ℹ️ [DelhiveryProvider]: Mock Mode. Cancelling waybill ${trackingNo}...`);
      return { success: true };
    }

    try {
      const cancelPayload = {
        waybill: trackingNo,
        cancellation: 'true'
      };

      const response = await fetch(`${this.apiBase}/api/p/edit`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(cancelPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let parsedErr;
        try {
          parsedErr = JSON.parse(errorText);
        } catch (_) {}
        const detail = parsedErr ? (parsedErr.message || JSON.stringify(parsedErr)) : errorText;
        throw new Error(`Delhivery cancel failed: ${response.statusText} - ${detail}`);
      }

      const data = await response.json();
      console.log('✅ [DelhiveryProvider] Cancel response:', data);

      const isSuccess = data.success || data.status === 'Success' || data.cancellation === 'true';
      if (!isSuccess) {
        throw new Error(data.message || JSON.stringify(data));
      }

      return { success: true };
    } catch (e) {
      console.error('❌ [DelhiveryProvider.cancelShipment] Failed:', e.message);
      throw e;
    }
  }

  /**
   * Retrieve label PDF URL (if supported)
   */
  async getLabelUrl(shipmentId, awbNumber) {
    const trackingNo = awbNumber || shipmentId;
    if (this.isMock) {
      console.log(`[DelhiveryProvider]: Mock Label requested for shipment: ${shipmentId || awbNumber}`);
      return 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    }
    return `${this.apiBase}/api/p/packing_slip?wbns=${trackingNo}&pdf=true`;
  }

  /**
   * Retrieve tracking updates for a waybill (Step 8)
   */
  async getTrackingStatus(awbNumber) {
    if (this.isMock) {
      console.log(`ℹ️ [DelhiveryProvider]: Mock Mode. Fetching tracking details for AWB: ${awbNumber}...`);
      return {
        status: 'In Transit',
        estimated_delivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB'),
        events: [
          { status: 'Manifested', time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), location: 'Primary Warehouse' },
          { status: 'Picked Up', time: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), location: 'Delhivery Hub' },
          { status: 'In Transit', time: new Date().toISOString(), location: 'Sorting Facility' }
        ]
      };
    }

    try {
      const response = await fetch(`${this.apiBase}/api/v1/packages/json/?waybill=${awbNumber}`, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${this.token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Delhivery tracking failed: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ [DelhiveryProvider] Tracking details:', data);

      const scans = data.ScanData || data.scans || [];
      let currentStatus = 'Shipment Created';
      let estimatedDelivery = '';

      if (scans.length > 0) {
        const latestScan = scans[scans.length - 1];
        currentStatus = latestScan.Status || latestScan.Scan || currentStatus;
      }

      if (currentStatus.toLowerCase().includes('pending') || currentStatus.toLowerCase().includes('schedule')) {
        currentStatus = 'Pending';
      } else if (currentStatus.toLowerCase().includes('manifest') || currentStatus.toLowerCase().includes('picked')) {
        currentStatus = 'Picked Up';
      } else if (currentStatus.toLowerCase().includes('transit') || currentStatus.toLowerCase().includes('shipment forwarded')) {
        currentStatus = 'In Transit';
      } else if (currentStatus.toLowerCase().includes('out for delivery') || currentStatus.toLowerCase().includes('pending delivery')) {
        currentStatus = 'Out For Delivery';
      } else if (currentStatus.toLowerCase().includes('del') || currentStatus.toLowerCase().includes('delivered')) {
        currentStatus = 'Delivered';
      } else if (currentStatus.toLowerCase().includes('cancel') || currentStatus.toLowerCase().includes('rto')) {
        currentStatus = 'Cancelled';
      }

      const events = scans.map(s => ({
        status: s.Status || s.Scan || 'Updated',
        time: s.DateTime || s.ScanDateTime || new Date().toISOString(),
        location: s.Location || s.ScannedLocation || ''
      }));

      return {
        status: currentStatus,
        estimated_delivery: estimatedDelivery || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB'),
        events: events.length > 0 ? events : [{ status: 'Shipment Manifested', time: new Date().toISOString(), location: 'Warehouse' }]
      };
    } catch (e) {
      console.error('❌ [DelhiveryProvider.getTrackingStatus] Failed:', e.message);
      throw e;
    }
  }

  /**
   * Calculate shipping cost using Delhivery charges API
   */
  async calculateShippingCost(originPincode, destinationPincode, weightInGrams, paymentMode = 'Prepaid') {
    const cleanOrigin = (originPincode || '').toString().trim();
    const cleanDest = (destinationPincode || '').toString().trim();
    const weight = parseInt(weightInGrams) || 500; // Default weight to 500g if missing

    if (!cleanOrigin || cleanOrigin.length !== 6) {
      throw new Error('Invalid or missing origin pincode. Pincode must be exactly 6 digits.');
    }
    if (!cleanDest || cleanDest.length !== 6) {
      throw new Error('Invalid or missing destination pincode. Pincode must be exactly 6 digits.');
    }

    if (this.isMock) {
      console.log(`ℹ️ [DelhiveryProvider]: Mock Mode. Calculating shipping from ${cleanOrigin} to ${cleanDest} for weight ${weight}g (${paymentMode})...`);
      
      // Simulate unserviceable pincode for testing
      if (cleanDest === '999999' || cleanDest.startsWith('999')) {
        throw new Error('Pincode not serviceable by Delhivery.');
      }

      // Simulated calculation: base ₹60 + ₹15 per 500g + ₹40 COD surcharge if applicable
      const baseFee = 60;
      const weightSurcharge = Math.ceil(weight / 500) * 15;
      const codFee = paymentMode.toUpperCase() === 'COD' ? 40 : 0;
      const mockTotal = baseFee + weightSurcharge + codFee;

      return {
        success: true,
        total_amount: mockTotal,
        gross_amount: mockTotal - codFee,
        tax_amount: 0,
        serviceable: true
      };
    }

    try {
      // Build API query parameters
      const queryParams = new URLSearchParams({
        md: 'E', // E for Express, S for Surface
        ss: 'Delivered', // Shipment status
        o_pin: cleanOrigin,
        d_pin: cleanDest,
        cgm: weight.toString()
      });

      const url = `${this.apiBase}/api/kinko/v1/invoice/charges/.json?${queryParams.toString()}`;
      console.log(`🔄 [DelhiveryProvider]: Querying charges from: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${this.token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [DelhiveryProvider.calculateShippingCost] API error: ${response.status} - ${errorText}`);
        if (response.status === 400 || response.status === 404) {
          throw new Error('Pincode not serviceable by Delhivery.');
        }
        throw new Error(`Delhivery cost calculation failed: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ [DelhiveryProvider] Cost calculation API response:', data);

      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error('Pincode not serviceable by Delhivery.');
      }

      let chargeInfo = null;
      if (Array.isArray(data)) {
        chargeInfo = data[0];
      } else if (typeof data === 'object') {
        chargeInfo = data;
      }

      if (!chargeInfo) {
        throw new Error('Pincode not serviceable by Delhivery.');
      }

      // Parse the charge fields returned by Delhivery
      const totalAmount = parseFloat(chargeInfo.total_amount || chargeInfo.gross_amount || chargeInfo.charges);
      if (isNaN(totalAmount)) {
        throw new Error('Failed to retrieve valid shipping charges from Delhivery response.');
      }

      // Add COD surcharge if COD is selected (often not included in base rate API)
      let finalTotal = totalAmount;
      if (paymentMode.toUpperCase() === 'COD') {
        finalTotal += 40; // Default standard COD collection charge if applicable
      }

      return {
        success: true,
        total_amount: finalTotal,
        gross_amount: totalAmount,
        serviceable: true
      };
    } catch (err) {
      console.error('❌ [DelhiveryProvider.calculateShippingCost] Failed:', err.message);
      throw err;
    }
  }
}

