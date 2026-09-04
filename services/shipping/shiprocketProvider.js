// services/shipping/shiprocketProvider.js

let cachedToken = null;
let tokenExpiry = null;

export class ShiprocketProvider {
  constructor() {
    this.apiBase = 'https://apiv2.shiprocket.in/v1/external';
    this._refreshCredentials();
  }

  _refreshCredentials() {
    const rawEmail = process.env.SHIPROCKET_EMAIL || '';
    const rawPassword = process.env.SHIPROCKET_PASSWORD || '';
    this.email = rawEmail.trim().replace(/^["']|["']$/g, '');
    this.password = rawPassword.trim().replace(/^["']|["']$/g, '');
    this.isMock = !this.email || !this.password || this.email === '' || this.password === '';
  }

  /**
   * Securely retrieve or refresh JWT Auth Token
   */
  async _getToken() {
    this._refreshCredentials();
    if (this.isMock) return 'mock_token_123';

    // Return cached token if valid (tokens are valid for 10 days, we refresh after 9 days)
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
      return cachedToken;
    }

    try {
      console.log('🔄 [ShiprocketProvider]: Authenticating with Shiprocket API...');
      const response = await fetch(`${this.apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.email, password: this.password })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.message || `Auth failed with status ${response.status}`;
        throw new Error(`Shiprocket auth failed (HTTP ${response.status}): ${errMsg}`);
      }

      const data = await response.json();
      if (!data.token) {
        throw new Error('No token returned from Shiprocket authentication.');
      }

      cachedToken = data.token;
      // Expire in 9 days (10 days is default)
      tokenExpiry = Date.now() + 9 * 24 * 60 * 60 * 1000;
      console.log('✅ [ShiprocketProvider]: Authentication successful, token cached.');
      return cachedToken;
    } catch (error) {
      console.error('❌ [ShiprocketProvider]: Authentication error:', error.message);
      throw error;
    }
  }

  /**
   * Fetch registered pickup locations (warehouses) from Shiprocket account
   */
  async _getPickupLocations(token) {
    try {
      console.log('🔄 [ShiprocketProvider]: Fetching registered pickup locations from Shiprocket...');
      const response = await fetch(`${this.apiBase}/settings/company/pickup`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch pickup locations: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data?.shipping_address || [];
    } catch (error) {
      console.warn('⚠️ [ShiprocketProvider]: Could not fetch pickup locations:', error.message);
      return [];
    }
  }

  /**
   * Register a new pickup location (warehouse) with Shiprocket
   */
  /**
   * Register or verify a seller's specific pickup location (warehouse) in Shiprocket
   */
  async addPickupLocation(settings) {
    if (this.isMock) {
      console.log('ℹ️ [ShiprocketProvider]: Mock Mode. Registering mock pickup location...');
      return { 
        lat: 12.9716, 
        lon: 77.5946, 
        registered: true,
        pickup_location_name: settings.warehouse_name || 'Mock Warehouse',
        pickup_location_id: `sr_pk_${Math.floor(100000 + Math.random() * 900000)}`,
        warehouse_status: 'registered_active'
      };
    }

    try {
      const token = await this._getToken();
      
      const storeId = settings.store_id || '';
      const shortStore = storeId ? storeId.replace(/-/g, '').slice(0, 8) : '';
      const rawName = (settings.warehouse_name || 'Warehouse').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanPincode = String(settings.pincode || '').replace(/\D/g, '');

      // Form deterministic unique Shiprocket nickname (max 36 chars)
      const nickname = shortStore && !rawName.includes(shortStore)
        ? `${rawName.slice(0, 24)}_${shortStore}`.slice(0, 36)
        : rawName.slice(0, 36);

      // 1. Fetch existing registered pickup locations to avoid duplicates
      const registeredPickups = await this._getPickupLocations(token);
      
      // Match if already registered in Shiprocket with same nickname OR same stored ID
      const isLegacyId = (id) => !id || String(id).startsWith('dl_pk_') || String(id).startsWith('mock_') || isNaN(Number(id));
      const storedId = isLegacyId(settings.pickup_location_id) ? null : String(settings.pickup_location_id);

      const existing = registeredPickups.find(p => 
        (storedId && String(p.id) === storedId) ||
        (p.pickup_location.toLowerCase() === nickname.toLowerCase() && String(p.pin_code).trim() === cleanPincode) ||
        (p.pickup_location.toLowerCase() === (settings.warehouse_name || '').trim().toLowerCase() && String(p.pin_code).trim() === cleanPincode)
      );

      if (existing) {
        console.log(`ℹ️ [ShiprocketProvider]: Pickup location "${existing.pickup_location}" (ID: ${existing.id}) already registered in Shiprocket.`);
        return {
          lat: parseFloat(existing.lat) || 12.9716,
          lon: parseFloat(existing.long) || 77.5946,
          registered: true,
          pickup_location_name: existing.pickup_location,
          pickup_location_id: String(existing.id),
          warehouse_status: existing.status === 1 ? 'registered_active' : 'pending_verification'
        };
      }

      // 2. Lookup address coordinates using OpenStreetMap Nominatim geocoding API
      let lat = 12.9716;
      let lon = 77.5946;
      try {
        const queryStr = encodeURIComponent(`${settings.address}, ${settings.city}, ${settings.state}, ${cleanPincode}, ${settings.country || 'India'}`);
        console.log(`Refgeocoding [ShiprocketProvider]: Looking up geocoding coordinates for: "${queryStr}"`);
        const geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?q=${queryStr}&format=json&limit=1`, {
          headers: { 'User-Agent': 'Kreatorstore E-commerce Platform' }
        });
        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          if (geoData && geoData.length > 0) {
            lat = parseFloat(geoData[0].lat);
            lon = parseFloat(geoData[0].lon);
            console.log(`✅ [ShiprocketProvider]: Geocoding succeeded. Latitude: ${lat}, Longitude: ${lon}`);
          }
        }
      } catch (geoError) {
        console.warn('⚠️ [ShiprocketProvider]: Geocoding API request failed:', geoError.message);
      }

      // 3. Construct payload and call Shiprocket Add Pickup Location API
      const cleanPhone = String(settings.phone || '').replace(/\D/g, '').slice(-10);
      if (cleanPhone.length !== 10) {
        throw new Error(`Valid 10-digit phone number is required for pickup location registration (got "${settings.phone}").`);
      }
      if (cleanPincode.length !== 6) {
        throw new Error(`Valid 6-digit postal code is required for pickup location registration (got "${settings.pincode}").`);
      }

      const payload = {
        pickup_location: nickname,
        name: (settings.contact_person || 'Warehouse Manager').trim(),
        email: (settings.email || 'warehouse@kreatorstore.com').trim(),
        phone: cleanPhone,
        address: (settings.address || '').trim(),
        address_2: (settings.pickup_address_line2 || settings.landmark || '').trim(),
        city: (settings.city || '').trim(),
        state: (settings.state || '').trim(),
        country: settings.country || 'India',
        pin_code: cleanPincode,
        lat: lat,
        long: lon
      };

      console.log(`🔄 [ShiprocketProvider]: Calling Shiprocket Add Pickup Location API for "${nickname}"...`);
      const response = await fetch(`${this.apiBase}/settings/company/addpickup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('❌ [ShiprocketProvider] Add Pickup Location API error response:', JSON.stringify(data, null, 2));
        throw new Error(data.message || `Shiprocket Add Pickup Location failed with HTTP ${response.status}`);
      }

      console.log('✅ [ShiprocketProvider]: Pickup location registered successfully in Shiprocket:', data);
      
      const resAddr = data.address || data.response?.data || data;
      const pickupLocationName = resAddr.pickup_code || resAddr.pickup_location || nickname;
      const pickupLocationId = data.pickup_id || resAddr.id || null;

      if (!pickupLocationId) {
        throw new Error('Shiprocket response did not return a valid pickup_id.');
      }

      const isVerified = resAddr.status === 1;
      const warehouseStatus = isVerified ? 'registered_active' : 'pending_verification';

      return { 
        lat, 
        lon, 
        registered: true,
        pickup_location_name: pickupLocationName,
        pickup_location_id: String(pickupLocationId),
        warehouse_status: warehouseStatus
      };
    } catch (error) {
      console.error('❌ [ShiprocketProvider]: Add Pickup Location failed:', error.message);
      throw error;
    }
  }

  /**
   * Create forward shipment order strictly using the seller's verified pickup location
   */
  async createShipment(orderId, orderDetails, pickupSettings) {
    if (this.isMock) {
      console.log(`ℹ️ [ShiprocketProvider]: Mock Mode. Generating simulated shipment for Order: ${orderId}`);
      
      const shipmentId = `sr_ship_${Math.floor(100000 + Math.random() * 900000)}`;
      const awbNumber = `AWB${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      const courierName = 'Delhivery Express';
      
      return {
        success: true,
        shipment_id: shipmentId,
        awb_number: awbNumber,
        courier_name: courierName,
        tracking_number: awbNumber,
        tracking_url: `https://track.shiprocket.in/tracking/${awbNumber}`,
        status: 'Shipment Created',
        estimated_delivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB')
      };
    }

    try {
      const token = await this._getToken();

      // STRICT VALIDATION: Store must have complete shipping settings
      if (!pickupSettings) {
        throw new Error('❌ [ShiprocketProvider]: Seller shipping settings (warehouse address) are missing for this store. Please configure them in Dashboard Settings.');
      }

      const storePin = String(pickupSettings.pincode || '').replace(/\D/g, '');
      if (storePin.length !== 6) {
        throw new Error(`❌ [ShiprocketProvider]: Seller warehouse pincode is invalid ("${pickupSettings.pincode || ''}"). A valid 6-digit postal code is required.`);
      }

      const storePhone = String(pickupSettings.phone || '').replace(/\D/g, '');
      if (storePhone.length < 10) {
        throw new Error(`❌ [ShiprocketProvider]: Seller warehouse contact phone number is invalid. A valid 10-digit mobile number is required.`);
      }

      if (!pickupSettings.address || pickupSettings.address.trim().length < 5) {
        throw new Error(`❌ [ShiprocketProvider]: Seller warehouse street address is incomplete. Please enter a full street address in Dashboard Settings.`);
      }

      // Fetch registered pickup locations from Shiprocket
      const registeredPickups = await this._getPickupLocations(token);

      let selectedPickupLocation = '';
      let selectedPickupLocationId = '';

      // Check if stored pickup_location_id is a valid Shiprocket ID (not legacy dl_pk_*)
      const isLegacyId = (id) => !id || String(id).startsWith('dl_pk_') || String(id).startsWith('mock_') || isNaN(Number(id));
      const storedPickupId = isLegacyId(pickupSettings.pickup_location_id) ? null : String(pickupSettings.pickup_location_id);

      let matchedLocation = null;

      // Hierarchy 1: Match deterministically by real stored Shiprocket ID first
      if (storedPickupId) {
        matchedLocation = registeredPickups.find(p => String(p.id) === storedPickupId);
      }

      // Hierarchy 2: Match by exact registered nickname AND matching pincode
      if (!matchedLocation && pickupSettings.pickup_location_name) {
        matchedLocation = registeredPickups.find(p => 
          p.pickup_location.toLowerCase() === pickupSettings.pickup_location_name.trim().toLowerCase() &&
          String(p.pin_code || '').trim() === storePin
        );
      }

      // Hierarchy 3: Match by warehouse_name AND matching pincode
      if (!matchedLocation && pickupSettings.warehouse_name) {
        matchedLocation = registeredPickups.find(p => 
          p.pickup_location.toLowerCase() === pickupSettings.warehouse_name.trim().toLowerCase() &&
          String(p.pin_code || '').trim() === storePin
        );
      }

      // Hierarchy 4: Auto-register seller's dedicated warehouse address in Shiprocket if not yet matched
      if (!matchedLocation) {
        console.log(`🔄 [ShiprocketProvider]: Store pickup location "${pickupSettings.warehouse_name}" (${storePin}) is not yet registered in Shiprocket. Auto-registering seller warehouse now...`);
        try {
          const regResult = await this.addPickupLocation({
            ...pickupSettings,
            store_id: orderDetails.store_id || pickupSettings.store_id
          });

          selectedPickupLocation = regResult.pickup_location_name;
          selectedPickupLocationId = String(regResult.pickup_location_id);

          // Update Supabase with the verified Shiprocket ID
          const { supabaseClient } = await import('@/lib/supabase');
          if (supabaseClient && (orderDetails.store_id || pickupSettings.store_id)) {
            await supabaseClient
              .from('store_shipping_settings')
              .update({
                pickup_location_name: selectedPickupLocation,
                pickup_location_id: selectedPickupLocationId,
                lat: regResult.lat,
                lon: regResult.lon,
                shiprocket_registered: true,
                warehouse_status: regResult.warehouse_status || 'registered_active',
                last_synced: new Date().toISOString()
              })
              .eq('store_id', orderDetails.store_id || pickupSettings.store_id);
          }
        } catch (regErr) {
          console.error('❌ [ShiprocketProvider]: Auto pickup registration failed:', regErr.message);
          // STRICT: Do NOT fall back to Primary! Fail safely.
          throw new Error(`Seller pickup location is not registered/verified with Shiprocket (${regErr.message}). Never using generic fallback. Please verify your pickup address in Settings.`);
        }
      } else {
        selectedPickupLocation = matchedLocation.pickup_location;
        selectedPickupLocationId = String(matchedLocation.id);
        console.log(`✅ [ShiprocketProvider]: Matched verified seller pickup location: "${selectedPickupLocation}" (ID: ${selectedPickupLocationId}, PIN: ${matchedLocation.pin_code})`);

        // If store had a legacy ID or missing ID in database, persist the real Shiprocket ID now
        if (storedPickupId !== selectedPickupLocationId && (orderDetails.store_id || pickupSettings.store_id)) {
          try {
            const { supabaseClient } = await import('@/lib/supabase');
            if (supabaseClient) {
              await supabaseClient
                .from('store_shipping_settings')
                .update({
                  pickup_location_name: selectedPickupLocation,
                  pickup_location_id: selectedPickupLocationId,
                  shiprocket_registered: true,
                  warehouse_status: matchedLocation.status === 1 ? 'registered_active' : 'pending_verification',
                  last_synced: new Date().toISOString()
                })
                .eq('store_id', orderDetails.store_id || pickupSettings.store_id);
            }
          } catch (syncErr) {
            console.warn('⚠️ [ShiprocketProvider]: Syncing pickup ID notice:', syncErr.message);
          }
        }
      }

      if (!selectedPickupLocation) {
        throw new Error('❌ [ShiprocketProvider]: Seller pickup location is not registered/verified with Shiprocket. Shipment creation halted.');
      }

      // Retrieve structured address fields from database
      let pincode = (orderDetails.shipping_address_pincode || '').trim();
      let state = (orderDetails.shipping_address_state || '').trim();
      let city = (orderDetails.shipping_address_city || '').trim();
      let addressLine = (orderDetails.shipping_address_line1 || '').trim();
      let addressLine2 = (orderDetails.shipping_address_line2 || '').trim();
      let country = (orderDetails.shipping_address_country || '').trim();

      // If structured address fields are missing, try parsing the legacy shipping_address string from the database
      if (!addressLine) {
        const shippingAddress = (orderDetails.shipping_address || '').trim();
        if (!shippingAddress) {
          throw new Error('❌ [ShiprocketProvider]: Order does not contain any customer shipping address details. Please configure a valid shipping address for this order.');
        }

        const addressParts = shippingAddress.split(',').map(p => p.trim()).filter(Boolean);
        if (addressParts.length > 0) {
          // Extract country suffix if present
          const lastPart = addressParts[addressParts.length - 1];
          if (['india', 'us', 'usa', 'united states'].includes(lastPart.toLowerCase())) {
            country = addressParts.pop();
          } else {
            country = 'India';
          }
          
          if (addressParts.length > 0) {
            const stateZipPart = addressParts.pop() || '';
            if (stateZipPart.includes('-')) {
              const zipParts = stateZipPart.split('-');
              pincode = zipParts[zipParts.length - 1].trim();
              state = zipParts[0].trim();
            } else {
              const pinMatch = stateZipPart.match(/\d{6}/);
              if (pinMatch) {
                pincode = pinMatch[0];
                state = stateZipPart.replace(pincode, '').replace(/[^a-zA-Z]/g, '').trim();
              } else {
                state = stateZipPart.trim();
              }
            }
          }

          if (addressParts.length > 0) {
            city = addressParts.pop() || '';
          }

          if (addressParts.length > 0) {
            addressLine = addressParts.join(', ');
          } else {
            addressLine = city;
          }
        }
      }

      if (!country) {
        country = 'India';
      }

      // Check for missing mandatory shipping details (No silent New Delhi / 110001 fallback)
      const missingAddressFields = [];
      if (!addressLine) missingAddressFields.push('Address Line 1');
      if (!city) missingAddressFields.push('City');
      if (!state) missingAddressFields.push('State');
      if (!pincode) missingAddressFields.push('Pincode / Postal Code');

      if (missingAddressFields.length > 0) {
        throw new Error(`❌ [ShiprocketProvider]: Customer shipping address is incomplete in the database. Missing required fields: ${missingAddressFields.join(', ')}.`);
      }

      // Clean phone number (exactly 10 digits without prefixes)
      let cleanPhone = String(orderDetails.customer_phone || '').replace(/\D/g, '');
      if (cleanPhone.length > 10) {
        cleanPhone = cleanPhone.slice(-10);
      }
      if (cleanPhone.length !== 10) {
        throw new Error(`❌ [ShiprocketProvider]: Invalid customer phone number "${orderDetails.customer_phone || ''}". It must contain exactly 10 digits.`);
      }

      // Clean pincode (exactly 6 digits for Shiprocket domestic APIs)
      let cleanPincode = String(pincode || '').replace(/\D/g, '');
      if (cleanPincode.length !== 6) {
        throw new Error(`❌ [ShiprocketProvider]: Invalid customer shipping pincode "${pincode || ''}". Shiprocket domestic shipping requires exactly 6 numeric digits.`);
      }

      // Retrieve customer first and last names (Split by spaces, no empty last name fallback)
      const nameParts = (orderDetails.customer_name || 'Customer Name').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Customer';
      const lastName = nameParts.slice(1).join(' ') || 'Name';

      // Gather order items dynamically from order details, fallback to Supabase query if empty
      let itemsList = orderDetails.items || [];
      if (itemsList.length === 0) {
        try {
          const { supabaseClient } = await import('@/lib/supabase');
          if (supabaseClient) {
            console.log(`🔄 [ShiprocketProvider]: Order items list is empty. Querying database directly for Order ID: ${orderId}...`);
            const { data: dbItems } = await supabaseClient
              .from('order_items')
              .select('*, product:product_id(name, image_url)')
              .eq('order_id', orderId);
            
            if (dbItems && dbItems.length > 0) {
              itemsList = dbItems.map(item => ({
                ...item,
                productName: item.snap_product_name || item.product?.name || 'Store Product',
                productImage: item.snap_product_image || item.product?.image_url || ''
              }));
              console.log(`✅ [ShiprocketProvider]: Successfully retrieved ${itemsList.length} items from database.`);
            }
          }
        } catch (dbErr) {
          console.warn('⚠️ [ShiprocketProvider]: Direct database query for items failed:', dbErr.message);
        }
      }

      // Throws error if orderItems list is still empty (No fake default placeholder items)
      if (itemsList.length === 0) {
        throw new Error(`❌ [ShiprocketProvider]: Failed to construct order payload. No purchased items were found for Order ID: ${orderId} in the database.`);
      }

      // Build order items payload
      let computedSubtotal = 0;
      const orderItems = itemsList.map((item, index) => {
        const qty = parseInt(item.quantity) || 1;
        const price = parseFloat(item.price || 0);
        computedSubtotal += qty * price;

        return {
          name: item.productName || item.name || `Product Item ${index + 1}`,
          sku: item.sku || `SKU-${item.product_id || index}`,
          units: qty,
          selling_price: price.toFixed(2),
          discount: '0.00',
          tax: '0.00',
          hsn: ''
        };
      });

      // Calculate weight dynamically based on total quantity of products
      const totalUnits = orderItems.reduce((sum, item) => sum + item.units, 0);
      const computedWeight = Math.max(0.1, totalUnits * 0.5); // 0.5 kg per unit, min 0.1 kg
      const length = 15;
      const breadth = 15;
      const height = 15;

      const payload = {
        order_id: orderId,
        order_date: new Date(orderDetails.created_at || Date.now()).toISOString().slice(0, 16).replace('T', ' '),
        pickup_location: selectedPickupLocation,
        billing_customer_name: firstName,
        billing_last_name: lastName,
        billing_address: addressLine,
        billing_address_2: addressLine2,
        billing_city: city,
        billing_pincode: cleanPincode,
        billing_state: state,
        billing_country: country,
        billing_email: orderDetails.customer_email || 'customer@gmail.com',
        billing_phone: cleanPhone,
        shipping_is_billing: true,
        shipping_customer_name: firstName,
        shipping_last_name: lastName,
        shipping_address: addressLine,
        shipping_address_2: addressLine2,
        shipping_city: city,
        shipping_pincode: cleanPincode,
        shipping_state: state,
        shipping_country: country,
        shipping_email: orderDetails.customer_email || 'customer@gmail.com',
        shipping_phone: cleanPhone,
        order_items: orderItems,
        payment_method: orderDetails.payment_status === 'paid' ? 'Prepaid' : 'COD',
        sub_total: computedSubtotal.toFixed(2),
        length: length,
        breadth: breadth,
        height: height,
        weight: computedWeight
      };

      // Validate all required Shiprocket payload fields before initiating the API call
      const validationErrors = [];
      if (!orderId) validationErrors.push('Missing order_id');
      if (!selectedPickupLocation) validationErrors.push('Missing pickup_location (warehouse nickname)');
      if (!payload.billing_customer_name) validationErrors.push('Missing billing_customer_name');
      if (!payload.billing_address || payload.billing_address.length < 6) {
        validationErrors.push(`Invalid billing_address (must be at least 6 characters, got: "${payload.billing_address}")`);
      }
      if (!payload.billing_city || payload.billing_city.length < 2) {
        validationErrors.push(`Invalid billing_city (must be at least 2 characters, got: "${payload.billing_city}")`);
      }
      if (!payload.billing_state || payload.billing_state.length < 2) {
        validationErrors.push(`Invalid billing_state (must be at least 2 characters, got: "${payload.billing_state}")`);
      }
      if (!payload.billing_pincode || payload.billing_pincode.length !== 6) {
        validationErrors.push(`Invalid billing_pincode (must be exactly 6 digits, got: "${payload.billing_pincode}")`);
      }
      if (!payload.billing_phone || payload.billing_phone.length !== 10) {
        validationErrors.push(`Invalid billing_phone (must be exactly 10 digits, got: "${payload.billing_phone}")`);
      }
      if (!payload.billing_email || !payload.billing_email.includes('@')) {
        validationErrors.push(`Invalid billing_email (got: "${payload.billing_email}")`);
      }
      if (!payload.order_items || payload.order_items.length === 0) {
        validationErrors.push('Missing order_items (must contain at least 1 item)');
      }
      if (parseFloat(payload.sub_total) <= 0) validationErrors.push('sub_total must be greater than 0');

      if (validationErrors.length > 0) {
        console.error('❌ [ShiprocketProvider] Pre-validation failed:');
        validationErrors.forEach(err => console.error(`   - ${err}`));
        throw new Error(`Shiprocket payload pre-validation failed: ${validationErrors.join(', ')}`);
      }

      console.log(`🔄 [ShiprocketProvider]: Creating order in Shiprocket for ID: ${orderId}...`);
      console.log('📦 [ShiprocketProvider] Payload being sent:', JSON.stringify(payload, null, 2));

      const response = await fetch(`${this.apiBase}/orders/create/adhoc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorResponseJson = await response.json().catch(() => ({}));
        console.error('❌ [ShiprocketProvider] API returned error response body:', JSON.stringify(errorResponseJson, null, 2));
        
        let validationDetails = '';
        if (errorResponseJson.errors) {
          validationDetails = ': ' + Object.entries(errorResponseJson.errors)
            .map(([field, errs]) => `${field} (${Array.isArray(errs) ? errs.join(', ') : errs})`)
            .join('; ');
        }
        
        throw new Error(errorResponseJson.message || `Shiprocket order creation failed (${response.statusText})${validationDetails}`);
      }

      const data = await response.json();
      console.log('✅ [ShiprocketProvider]: Shiprocket order created successfully:', data);

      const shipmentId = data.shipment_id;
      if (!shipmentId) {
        throw new Error('Shiprocket response did not return a shipment_id.');
      }
      console.log(`[Shipping] Shiprocket order created: shipmentId=${shipmentId}`);

      // Step 2: Query Courier Serviceability to fetch recommended courier
      let selectedCourierId = null;
      let selectedCourierName = 'Standard Shipping';
      
      try {
        const pickupPostcode = pickupSettings?.pincode || '560103';
        console.log(`🔄 [ShiprocketProvider]: Fetching available couriers for pickup pincode "${pickupPostcode}" and delivery pincode "${cleanPincode}"...`);
        const codStatus = payload.payment_method === 'Prepaid' ? 0 : 1;
        const serviceabilityUrl = `${this.apiBase}/courier/serviceability?pickup_postcode=${pickupPostcode}&delivery_postcode=${cleanPincode}&weight=${computedWeight}&cod=${codStatus}`;
        const serviceResponse = await fetch(serviceabilityUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (serviceResponse.ok) {
          const serviceData = await serviceResponse.json();
          const courierList = serviceData.data?.available_courier_companies || [];
          if (courierList.length > 0) {
            // Pick the first recommended courier
            const recommended = courierList[0];
            selectedCourierId = recommended.courier_company_id;
            selectedCourierName = recommended.courier_name || recommended.courier_company_name || 'Standard Shipping';
            console.log(`✅ [ShiprocketProvider]: Found ${courierList.length} serviceability couriers. Recommended: ${selectedCourierName} (ID: ${selectedCourierId})`);
          } else {
            console.warn('⚠️ [ShiprocketProvider]: No couriers found in serviceability list.');
          }
        } else {
          console.warn(`⚠️ [ShiprocketProvider]: Courier serviceability check returned status ${serviceResponse.status}`);
        }
      } catch (serviceErr) {
        console.warn('⚠️ [ShiprocketProvider]: Failed to fetch courier serviceability:', serviceErr.message);
      }

      // Step 3: Assign AWB automatically using Recommended courier
      console.log(`[Shipping] Shiprocket AWB allocation started for shipmentId: ${shipmentId}`);
      console.log(`🔄 [ShiprocketProvider]: Requesting courier/AWB for Shipment: ${shipmentId} (Courier ID: ${selectedCourierId || 'Auto'})...`);
      const awbBody = { shipment_id: shipmentId };
      if (selectedCourierId) {
        awbBody.courier_id = selectedCourierId;
      }

      const awbResponse = await fetch(`${this.apiBase}/courier/assign/awb`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(awbBody)
      });

      let awbNumber = null;
      let courierName = selectedCourierName;

      if (!awbResponse.ok) {
        const awbErrBody = await awbResponse.json().catch(() => ({}));
        const awbErrMsg = awbErrBody.message || `AWB allocation failed with HTTP status ${awbResponse.status}`;
        console.warn(`[Shipping] Shiprocket AWB allocation failed: ${awbErrMsg}`);
        console.warn(`[Shipping] Shiprocket shipment considered FAILED: ${awbErrMsg}`);
        throw new Error(`Shiprocket AWB allocation failed: ${awbErrMsg}`);
      }

      const awbData = await awbResponse.json();
      const awbDetails = awbData.response?.data;
      awbNumber = awbDetails?.awb_code;

      if (!awbNumber || awbNumber.toString().trim() === '') {
        const awbErrMsg = awbData.message || 'Shiprocket AWB code is missing or empty in API response.';
        console.warn(`[Shipping] Shiprocket AWB allocation failed: ${awbErrMsg}`);
        console.warn(`[Shipping] Shiprocket shipment considered FAILED: ${awbErrMsg}`);
        throw new Error(`Shiprocket AWB allocation failed: ${awbErrMsg}`);
      }

      courierName = awbDetails.courier_name || selectedCourierName || 'Standard Courier';
      console.log(`✅ [ShiprocketProvider]: AWB Assigned: ${awbNumber} via ${courierName}`);

      return {
        success: true,
        shipment_id: shipmentId.toString(),
        awb_number: awbNumber,
        courier_name: courierName,
        tracking_number: awbNumber,
        tracking_url: `https://track.shiprocket.in/tracking/${awbNumber}`,
        status: 'Shipment Created',
        estimated_delivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB'),
        pickup_location_name: selectedPickupLocation,
        pickup_location_id: selectedPickupLocationId
      };

    } catch (error) {
      console.error('❌ [ShiprocketProvider]: Create shipment failed:', error.message);
      throw error;
    }
  }

  /**
   * Cancel shipment
   */
  async cancelShipment(orderId, shipmentId) {
    if (this.isMock) {
      console.log(`[ShiprocketProvider]: Mock Cancelled shipment: ${shipmentId}`);
      return { success: true };
    }

    try {
      const token = await this._getToken();
      console.log(`🔄 [ShiprocketProvider]: Cancelling order ${orderId} in Shiprocket...`);
      const response = await fetch(`${this.apiBase}/orders/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ids: [orderId] })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Shiprocket cancellation failed`);
      }

      console.log('✅ [ShiprocketProvider]: Shiprocket cancellation confirmed.');
      return { success: true };
    } catch (error) {
      console.error('❌ [ShiprocketProvider]: Cancel shipment failed:', error.message);
      throw error;
    }
  }

  /**
   * Request / Schedule Pickup from Shiprocket
   */
  async requestPickup(shipmentId, pickupDate = null) {
    if (!shipmentId) {
      throw new Error('Valid Shipment ID is required to schedule pickup.');
    }

    if (typeof shipmentId === 'string' && (shipmentId.startsWith('UPL') || shipmentId.startsWith('dl_pk_') || shipmentId.startsWith('mock_'))) {
      throw new Error(`This order was created under the legacy direct Delhivery system (Shipment ID: ${shipmentId}) and does not exist in Shiprocket. Please test pickup on an order created with Shiprocket (e.g. Order 4e665825 or any newly placed order).`);
    }

    if (this.isMock) {
      console.log(`[ShiprocketProvider]: Mock Pickup requested for shipment: ${shipmentId}`);
      const scheduledDate = pickupDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      return {
        success: true,
        pickup_status: 1,
        pickup_token_number: `SR_PK_${Math.floor(100000 + Math.random() * 900000)}`,
        pickup_scheduled_date: scheduledDate,
        status: 'Pickup Scheduled'
      };
    }

    try {
      const token = await this._getToken();
      const dateStr = pickupDate || new Date().toISOString().split('T')[0];
      console.log(`🔄 [ShiprocketProvider]: Requesting pickup for Shipment ID: ${shipmentId} on ${dateStr}...`);

      const response = await fetch(`${this.apiBase}/courier/generate/pickup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          shipment_id: [shipmentId],
          pickup_date: [dateStr]
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || `Pickup scheduling failed with HTTP ${response.status}`);
      }

      console.log('✅ [ShiprocketProvider]: Pickup scheduled successfully:', data);
      const resObj = data.response || data;
      return {
        success: true,
        pickup_status: data.pickup_status || 1,
        pickup_token_number: resObj.pickup_token_number || resObj.token || null,
        pickup_scheduled_date: resObj.pickup_scheduled_date || dateStr,
        status: 'Pickup Scheduled'
      };
    } catch (error) {
      console.error('❌ [ShiprocketProvider]: Request pickup failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate and download Shipping Label PDF URL
   */
  async getLabelUrl(shipmentId) {
    if (this.isMock) {
      console.log(`[ShiprocketProvider]: Mock Label requested for shipment: ${shipmentId}`);
      return 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    }

    try {
      const token = await this._getToken();
      console.log(`🔄 [ShiprocketProvider]: Generating label for Shipment ID: ${shipmentId}`);
      
      // Primary: /courier/generate/label
      let response = await fetch(`${this.apiBase}/courier/generate/label`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ shipment_id: [shipmentId] })
      });

      // Fallback: /shipping/label
      if (!response.ok) {
        response = await fetch(`${this.apiBase}/shipping/label`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ shipment_id: [shipmentId] })
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to generate label: HTTP ${response.status}`);
      }

      const data = await response.json();
      const labelUrl = data.label_url || data.response?.label_url;
      if (labelUrl) {
        console.log('✅ [ShiprocketProvider]: Label URL successfully generated:', labelUrl);
        return labelUrl;
      } else {
        throw new Error('Label not created yet. AWB might not be assigned.');
      }
    } catch (error) {
      console.error('❌ [ShiprocketProvider]: Get label URL failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate Manifest for Pickup Handover
   */
  async generateManifest(shipmentId) {
    if (this.isMock) {
      console.log(`[ShiprocketProvider]: Mock Manifest requested for shipment: ${shipmentId}`);
      return 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    }

    try {
      const token = await this._getToken();
      console.log(`🔄 [ShiprocketProvider]: Generating manifest for Shipment ID: ${shipmentId}`);

      const response = await fetch(`${this.apiBase}/manifests/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ shipment_id: [shipmentId] })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Failed to generate manifest: HTTP ${response.status}`);
      }

      const data = await response.json();
      const manifestUrl = data.manifest_url || data.response?.manifest_url;
      if (manifestUrl) {
        console.log('✅ [ShiprocketProvider]: Manifest URL generated successfully:', manifestUrl);
        return manifestUrl;
      } else {
        throw new Error('Manifest could not be generated. Ensure pickup is requested first.');
      }
    } catch (error) {
      console.error('❌ [ShiprocketProvider]: Generate manifest failed:', error.message);
      throw error;
    }
  }

  /**
   * Get Tracking Status update with Strict Lifecycle Mapping
   */
  async getTrackingStatus(awbNumber) {
    if (this.isMock) {
      const statuses = ['Pickup Scheduled', 'Picked Up', 'In Transit', 'Out For Delivery', 'Delivered'];
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
      console.log(`[ShiprocketProvider]: Mock Tracking status for AWB ${awbNumber} is "${randomStatus}"`);
      return {
        awb: awbNumber,
        status: randomStatus,
        estimated_delivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB'),
        activities: [
          { date: new Date().toISOString(), activity: `Shipment status updated to: ${randomStatus}`, location: 'Hub Depot' }
        ]
      };
    }

    try {
      const token = await this._getToken();
      console.log(`🔄 [ShiprocketProvider]: Fetching tracking status for AWB: ${awbNumber}`);
      const response = await fetch(`${this.apiBase}/courier/track/awb/${awbNumber}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch tracking details: ${response.statusText}`);
      }

      const data = await response.json();
      const trackingData = data.tracking_data;
      
      if (!trackingData || !trackingData.track_status || trackingData.error) {
        throw new Error(trackingData?.error_message || 'No tracking information available.');
      }

      const currentStatus = trackingData.shipment_track_activities?.[0]?.status || trackingData.current_status || 'In Transit';
      const srStatusLower = (currentStatus || '').toLowerCase();
      
      // Strict Phase 6 Lifecycle Status Mapping:
      // We NEVER mark "Picked Up" merely because generate/pickup was called.
      // It must be confirmed by courier scan activity.
      let mappedStatus = 'Pickup Scheduled';
      
      if (srStatusLower.includes('delivered') || srStatusLower === 'dl') {
        mappedStatus = 'Delivered';
      } else if (srStatusLower.includes('out for delivery') || srStatusLower.includes('outfordelivery')) {
        mappedStatus = 'Out For Delivery';
      } else if (srStatusLower.includes('in transit') || srStatusLower.includes('intransit') || srStatusLower.includes('reached')) {
        mappedStatus = 'In Transit';
      } else if (srStatusLower.includes('picked up') || srStatusLower.includes('pickup done') || srStatusLower === 'pu') {
        mappedStatus = 'Picked Up';
      } else if (srStatusLower.includes('pickup scheduled') || srStatusLower.includes('pickup booked')) {
        mappedStatus = 'Pickup Scheduled';
      } else if (srStatusLower.includes('pickup reschedule')) {
        mappedStatus = 'Pickup Rescheduled';
      } else if (srStatusLower.includes('pickup exception') || srStatusLower.includes('pickup error')) {
        mappedStatus = 'Pickup Exception';
      } else if (srStatusLower.includes('pickup fail')) {
        mappedStatus = 'Pickup Failed';
      } else if (srStatusLower.includes('undelivered') || srStatusLower.includes('delivery fail')) {
        mappedStatus = 'Delivery Failed';
      } else if (srStatusLower.includes('rto') || srStatusLower.includes('return')) {
        mappedStatus = 'RTO';
      } else if (srStatusLower.includes('cancel')) {
        mappedStatus = 'Cancelled';
      }

      const activities = (trackingData.shipment_track_activities || []).map(act => ({
        date: act.date,
        activity: act.activity,
        location: act.location
      }));

      return {
        awb: awbNumber,
        status: mappedStatus,
        estimated_delivery: trackingData.edd || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB'),
        activities
      };
    } catch (error) {
      console.error('❌ [ShiprocketProvider]: Get tracking status failed:', error.message);
      throw error;
    }
  }

  /**
   * Calculate shipping cost and check serviceability using Shiprocket API
   */
  async calculateShippingCost(originPincode, destinationPincode, weightInGrams, paymentMode = 'Prepaid', dimensions = {}, declaredValue = 0) {
    const cleanOrigin = (originPincode || '').toString().trim();
    const cleanDest = (destinationPincode || '').toString().trim();
    const weightGrams = Math.max(1, parseInt(weightInGrams) || 500);
    const weightKg = parseFloat((weightGrams / 1000).toFixed(3)); // Shiprocket takes kg
    const isCod = paymentMode.toUpperCase() === 'COD' ? 1 : 0;
    const length = dimensions.length || 15;
    const breadth = dimensions.breadth || 15;
    const height = dimensions.height || 15;

    if (!cleanOrigin || cleanOrigin.length !== 6) {
      return { success: false, serviceable: false, provider: 'Shiprocket', reason: 'Invalid or missing origin pincode.' };
    }
    if (!cleanDest || cleanDest.length !== 6) {
      return { success: false, serviceable: false, provider: 'Shiprocket', reason: 'Invalid or missing destination pincode.' };
    }

    if (this.isMock) {
      console.log(`ℹ️ [ShiprocketProvider]: Mock Mode. Calculating shipping from ${cleanOrigin} to ${cleanDest} for weight ${weightGrams}g (${paymentMode})...`);
      
      // Simulate unserviceable route for testing
      if (cleanDest === '999999' || cleanDest.startsWith('999')) {
        return { success: false, serviceable: false, provider: 'Shiprocket', reason: 'Route not serviceable by Shiprocket couriers.' };
      }

      // Simulated calculation: base ₹70 + ₹20 per 500g + ₹30 COD surcharge if applicable
      const baseFee = 70;
      const weightSurcharge = Math.ceil(weightGrams / 500) * 20;
      const codFee = isCod ? 30 : 0;
      const mockTotal = baseFee + weightSurcharge + codFee;

      return {
        success: true,
        serviceable: true,
        provider: 'Shiprocket',
        total_amount: mockTotal,
        gross_amount: mockTotal - codFee,
        courier_name: 'Shiprocket Express',
        courier_company_id: 1,
        estimated_delivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB')
      };
    }

    try {
      const token = await this._getToken();
      const queryParams = new URLSearchParams({
        pickup_postcode: cleanOrigin,
        delivery_postcode: cleanDest,
        weight: weightKg.toString(),
        cod: isCod.toString(),
        length: length.toString(),
        breadth: breadth.toString(),
        height: height.toString()
      });
      if (declaredValue > 0) {
        queryParams.append('declared_value', declaredValue.toString());
      }

      const serviceabilityUrl = `${this.apiBase}/courier/serviceability?${queryParams.toString()}`;
      console.log(`🔄 [ShiprocketProvider]: Querying serviceability from: ${this.apiBase}/courier/serviceability?pickup_postcode=${cleanOrigin}&delivery_postcode=${cleanDest}&weight=${weightKg}&cod=${isCod}`);

      // Use AbortController for 8 second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(serviceabilityUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.warn(`⚠️ [ShiprocketProvider.calculateShippingCost]: HTTP ${response.status} - ${errorText}`);
        return {
          success: false,
          serviceable: false,
          provider: 'Shiprocket',
          reason: `Shiprocket API error: HTTP ${response.status}`
        };
      }

      const data = await response.json();
      const courierList = data.data?.available_courier_companies || [];
      if (!courierList || courierList.length === 0) {
        return {
          success: false,
          serviceable: false,
          provider: 'Shiprocket',
          reason: 'No serviceable courier available on this route.'
        };
      }

      // Sort by rate to pick the most economical available courier
      courierList.sort((a, b) => (parseFloat(a.rate) || 999999) - (parseFloat(b.rate) || 999999));
      const selectedCourier = courierList[0];
      const rate = parseFloat(selectedCourier.rate || selectedCourier.freight_charge);

      if (isNaN(rate) || rate <= 0) {
        return {
          success: false,
          serviceable: false,
          provider: 'Shiprocket',
          reason: 'Invalid rate returned by Shiprocket.'
        };
      }

      return {
        success: true,
        serviceable: true,
        provider: 'Shiprocket',
        total_amount: rate,
        gross_amount: rate,
        courier_name: selectedCourier.courier_name || selectedCourier.courier_company_name || 'Standard Courier',
        courier_company_id: selectedCourier.courier_company_id,
        estimated_delivery: selectedCourier.etd || new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB')
      };
    } catch (err) {
      const isTimeout = err.name === 'AbortError' || err.message?.toLowerCase().includes('aborted') || err.message?.toLowerCase().includes('timeout');
      const reason = isTimeout ? 'Shiprocket API request timed out.' : (err.message || 'Shiprocket serviceability query failed.');
      console.warn(`⚠️ [ShiprocketProvider.calculateShippingCost]: ${reason}`);
      return {
        success: false,
        serviceable: false,
        provider: 'Shiprocket',
        reason
      };
    }
  }
}
