// app/api/admin/shipping/diagnostic/route.js
import { NextResponse } from 'next/server';
import { supabaseClient } from '@/lib/supabase';
import { shippingFactory } from '@/services/shipping/shippingFactory';

export async function GET(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    };

    // 1. Fetch stores
    const storesRes = await fetch(`${supabaseUrl}/rest/v1/stores?select=id,name,slug,creator_id`, { headers });
    const stores = await storesRes.json();

    // 2. Fetch sellers
    const sellersRes = await fetch(`${supabaseUrl}/rest/v1/sellers?select=id,name,email,phone`, { headers });
    const sellers = await sellersRes.json().catch(() => []);
    const sellersMap = {};
    (sellers || []).forEach(s => { sellersMap[s.id] = s; });

    // 3. Fetch store_shipping_settings
    const settingsRes = await fetch(`${supabaseUrl}/rest/v1/store_shipping_settings?select=*`, { headers });
    const settings = await settingsRes.json().catch(() => []);
    const settingsMap = {};
    (settings || []).forEach(st => { settingsMap[st.store_id] = st; });

    // 4. Fetch live Shiprocket pickup locations
    let srPickups = [];
    let srError = null;
    try {
      const provider = shippingFactory.getProvider('Shiprocket');
      const token = await provider._getToken();
      srPickups = await provider._getPickupLocations(token);
    } catch (e) {
      srError = e.message;
      console.warn('⚠️ [diagnostic]: Could not fetch live Shiprocket pickups:', e.message);
    }

    // 5. Evaluate each store
    const isLegacyId = (id) => !id || String(id).startsWith('dl_pk_') || String(id).startsWith('mock_') || isNaN(Number(id));

    const report = (stores || []).map(store => {
      const seller = sellersMap[store.creator_id] || null;
      const st = settingsMap[store.id] || null;

      const hasSettings = Boolean(st);
      const isComplete = hasSettings && Boolean(st.warehouse_name && st.address && st.pincode && st.phone && st.city && st.state);
      const cleanPin = String(st?.pincode || '').replace(/\D/g, '');
      const storedId = st?.pickup_location_id || null;
      const legacyId = isLegacyId(storedId);

      // Find matching in live Shiprocket
      let matchedLocation = null;
      if (st) {
        if (!legacyId && storedId) {
          matchedLocation = srPickups.find(p => String(p.id) === String(storedId));
        }
        if (!matchedLocation && st.pickup_location_name) {
          matchedLocation = srPickups.find(p => 
            p.pickup_location.toLowerCase() === st.pickup_location_name.toLowerCase() &&
            String(p.pin_code || '').trim() === cleanPin
          );
        }
        if (!matchedLocation && st.warehouse_name) {
          matchedLocation = srPickups.find(p => 
            p.pickup_location.toLowerCase() === st.warehouse_name.toLowerCase() &&
            String(p.pin_code || '').trim() === cleanPin
          );
        }
      }

      let verificationStatus = 'MISSING_SETTINGS';
      let problemReason = 'No warehouse or pickup address has been entered for this store yet.';

      if (!hasSettings) {
        verificationStatus = 'MISSING_SETTINGS';
        problemReason = 'Store has no store_shipping_settings record. Seller must configure warehouse address in /dashboard/shipping.';
      } else if (!isComplete) {
        verificationStatus = 'INCOMPLETE_SETTINGS';
        problemReason = 'Warehouse address is missing required fields (street address, 6-digit pincode, or 10-digit phone).';
      } else if (legacyId) {
        verificationStatus = 'LEGACY_UNVERIFIED_ID';
        problemReason = `Stored ID (${storedId}) is a legacy Delhivery mock ID. Needs registration in Shiprocket.`;
      } else if (!matchedLocation) {
        verificationStatus = 'NOT_REGISTERED_IN_SHIPROCKET';
        problemReason = `Pickup address is not registered under this company's Shiprocket account.`;
      } else if (matchedLocation.status === 1) {
        verificationStatus = 'VERIFIED_ACTIVE';
        problemReason = 'Fully verified and active for automated courier pickups.';
      } else {
        verificationStatus = 'PENDING_VERIFICATION';
        problemReason = `Registered in Shiprocket (ID: ${matchedLocation.id}), but phone/address verification is pending (Status: ${matchedLocation.status}).`;
      }

      return {
        storeId: store.id,
        storeName: store.name,
        storeSlug: store.slug,
        sellerId: store.creator_id,
        sellerName: seller?.name || 'Seller',
        sellerEmail: seller?.email || 'N/A',
        warehouseName: st?.warehouse_name || 'Not Configured',
        pincode: cleanPin || 'N/A',
        address: st?.address || 'N/A',
        city: st?.city || 'N/A',
        state: st?.state || 'N/A',
        localSettingsStatus: !hasSettings ? 'Missing' : (isComplete ? 'Configured' : 'Incomplete'),
        storedPickupId: storedId,
        isLegacyId: legacyId,
        shiprocketRegistered: Boolean(st?.shiprocket_registered),
        shiprocketMatchingLocation: matchedLocation ? {
          id: matchedLocation.id,
          nickname: matchedLocation.pickup_location,
          pin: matchedLocation.pin_code,
          status: matchedLocation.status,
          isPrimary: matchedLocation.is_primary_location
        } : null,
        verificationStatus,
        problemReason
      };
    });

    const summary = {
      totalStores: report.length,
      verifiedActive: report.filter(r => r.verificationStatus === 'VERIFIED_ACTIVE').length,
      pendingVerification: report.filter(r => r.verificationStatus === 'PENDING_VERIFICATION').length,
      legacyIds: report.filter(r => r.verificationStatus === 'LEGACY_UNVERIFIED_ID').length,
      missingSettings: report.filter(r => r.verificationStatus === 'MISSING_SETTINGS').length,
      incompleteSettings: report.filter(r => r.verificationStatus === 'INCOMPLETE_SETTINGS').length
    };

    return NextResponse.json({
      success: true,
      summary,
      shiprocketLocationsCount: srPickups.length,
      shiprocketLocations: srPickups.map(p => ({
        id: p.id,
        nickname: p.pickup_location,
        name: p.name,
        phone: p.phone,
        city: p.city,
        state: p.state,
        pin: p.pin_code,
        status: p.status,
        isPrimary: p.is_primary_location
      })),
      srError,
      stores: report
    });
  } catch (error) {
    console.error('❌ [api/admin/shipping/diagnostic] Error:', error.message);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
