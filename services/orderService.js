import { supabaseClient } from '@/lib/supabase';
import { couponService } from './couponService';
import { payoutService } from './payoutService';

// Memory cache for offline mock orders
let mockOrders = [];

export const orderService = {
  /**
   * Place an order: inserts order record, inserts linked items, and gracefully adjusts product stock levels.
   */
  createOrder: async ({
    store_id,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    shipping_address,
    shipping_address_line1,
    shipping_address_line2,
    shipping_address_city,
    shipping_address_state,
    shipping_address_pincode,
    shipping_address_country,
    total_amount,
    shipping_cost = 0,
    shipping_provider = null,
    items,
    payment_provider = 'Razorpay',
    coupon_id = null,
    coupon_code = null,
    discount_amount = 0
  }) => {
    if (!supabaseClient) {
      console.warn('[orderService]: Offline mode. Mocking order placement success.');
      const mockOrder = {
        id: `ORD-MOCK-${Date.now().toString().slice(-6)}`,
        store_id,
        customer_id,
        customer_name,
        customer_email,
        customer_phone,
        shipping_address,
        shipping_address_line1,
        shipping_address_line2,
        shipping_address_city,
        shipping_address_state,
        shipping_address_pincode,
        shipping_address_country,
        shipping_city: shipping_address_city,
        shipping_state: shipping_address_state,
        shipping_country: shipping_address_country || 'India',
        shipping_pincode: shipping_address_pincode,
        total_amount: parseFloat(total_amount) || 0,
        shipping_cost: parseFloat(shipping_cost) || 0,
        shipping_provider: shipping_provider || 'Shiprocket',
        status: payment_provider === 'COD' ? 'confirmed' : 'pending_payment',
        payment_status: 'pending',
        payment_provider,
        coupon_id: coupon_id || null,
        coupon_code: coupon_code || null,
        discount_amount: parseFloat(discount_amount) || 0,
        created_at: new Date().toISOString(),
        items: (items || []).map(item => ({
          ...item,
          productName: item.name || 'Mock Product',
          productImage: item.image_url || ''
        }))
      };
      mockOrders.push(mockOrder);
      return { ...mockOrder, success: true };
    }

    try {
      // Verify store is approved
      const { data: storeDetails, error: storeError } = await supabaseClient
        .from('stores')
        .select('status, creator_id')
        .eq('id', store_id)
        .single();
      if (storeError) throw storeError;
      if (storeDetails?.status !== 'approved') {
        const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));
        const isOwner = user?.id && user.id === storeDetails.creator_id;
        if (!isOwner) {
          throw new Error('This store is currently under admin review and is not available for orders.');
        }
      }

      // 1. Insert Order matching real Supabase schema
      const payload = {
        store_id,
        customer_id: customer_id || null,
        customer_name,
        customer_email,
        customer_phone,
        shipping_address: shipping_address || [
          shipping_address_line1,
          shipping_address_line2,
          `${shipping_address_city}, ${shipping_address_state} - ${shipping_address_pincode}`,
          shipping_address_country || 'India'
        ].filter(Boolean).join('\n'),
        shipping_address_line1: shipping_address_line1 || null,
        shipping_address_line2: shipping_address_line2 || null,
        shipping_address_city: shipping_address_city || null,
        shipping_address_state: shipping_address_state || null,
        shipping_address_pincode: shipping_address_pincode || null,
        shipping_address_country: shipping_address_country || 'India',
        total_amount: parseFloat(total_amount) || 0,
        shipping_provider: shipping_provider || null,
        status: payment_provider === 'COD' ? 'confirmed' : 'pending_payment',
        payment_status: 'pending',
        payment_provider: payment_provider || 'Cashfree',
        coupon_id: coupon_id || null,
        coupon_code: coupon_code || null,
        discount_amount: parseFloat(discount_amount) || 0
      };

      console.log(`🔄 [orderService.createOrder] Inserting order into Supabase for store ${store_id}...`);
      const { data: order, error: orderErr } = await supabaseClient
        .from('orders')
        .insert([payload])
        .select()
        .single();

      if (orderErr) {
        console.error('❌ [orderService.createOrder] Database insertion error:', orderErr.message);
        throw orderErr;
      }

      // 2. Insert Order Items matching real Supabase schema
      const orderItemsInput = items.map(item => ({
        order_id: order.id,
        product_id: item.id || item.product_id,
        quantity: parseInt(item.quantity) || 1,
        price: parseFloat(item.price) || 0,
        snap_product_name: item.name || item.productName || item.snap_product_name || 'Unknown Product',
        snap_product_image: item.image || item.image_url || item.snap_product_image || null
      }));

      const { error: itemsErr } = await supabaseClient
        .from('order_items')
        .insert(orderItemsInput);

      if (itemsErr) {
        console.error('❌ [orderService.createOrder]: Failed to insert order items, rolling back order:', itemsErr.message);
        // Clean up orphan order row
        await supabaseClient.from('orders').delete().eq('id', order.id).catch(() => {});
        throw itemsErr;
      }

      console.log(`✅ [orderService.createOrder] Order created successfully in database: ${order.id}`);
      return { ...order, success: true };
    } catch (e) {
      console.error('[orderService.createOrder]: Place order exception:', e.message);
      throw e;
    }
  },

  /**
   * Update order payment information safely, checking for database columns presence.
   */
  updateOrderPayment: async (rawOrderId, { paymentStatus, paymentProvider, paymentId, paymentOrderId, status }) => {
    const orderId = rawOrderId && rawOrderId.length >= 36 ? rawOrderId.slice(0, 36) : rawOrderId;
    if (!supabaseClient) {
      const order = mockOrders.find(o => o.id === orderId);
      if (order) {
        const oldPaymentStatus = order.payment_status;
        const oldStatus = order.status;

        if (paymentStatus) order.payment_status = paymentStatus;
        if (paymentProvider) order.payment_provider = paymentProvider;
        if (paymentId) order.payment_id = paymentId;
        if (paymentOrderId) order.payment_order_id = paymentOrderId;
        if (status) order.status = status;

        if ((paymentStatus === 'paid' || paymentStatus === 'Paid') && oldPaymentStatus !== 'paid' && oldPaymentStatus !== 'Paid') {
          order.paid_at = new Date().toISOString();
          if (order.coupon_id) {
            await couponService.incrementCouponUsage(order.coupon_id);
          }
          
          // Generate mock creator earnings
          const mockEarnings = payoutService._getMockEarnings();
          const alreadyExists = mockEarnings.some(e => e.order_id === order.id);
          if (!alreadyExists) {
            mockEarnings.push({
              id: `earn-mock-${Date.now().toString().slice(-6)}`,
              creator_id: order.creator_id || 'mock-creator-uid',
              store_id: order.store_id || 'mock-store-id',
              order_id: order.id,
              order_amount: order.total_amount,
              platform_fee: 0.00,
              creator_amount: order.total_amount,
              status: 'completed',
              created_at: new Date().toISOString()
            });
          }

          // Auto-trigger shipment creation for mock mode
          try {
            const { shippingService } = await import('@/services/shipping/shippingService');
            console.log(`🔄 [orderService.updateOrderPayment] Auto-triggering shipment creation for Order ${orderId} (mock mode)...`);
            await shippingService.createShipment(orderId);
          } catch (shipErr) {
            console.error(`⚠️ [orderService.updateOrderPayment] Auto-trigger shipment mock mode failed:`, shipErr.message);
          }
        }

        if (status && (status === 'Cancelled' || status === 'refunded') && oldStatus !== 'Cancelled' && oldStatus !== 'refunded') {
          // Reverse mock creator earnings if cancelled/refunded
          const mockEarnings = payoutService._getMockEarnings();
          const idx = mockEarnings.findIndex(e => e.order_id === orderId && e.status !== 'paid');
          if (idx !== -1) {
            mockEarnings.splice(idx, 1);
          }
        }
      }
      return { success: true };
    }
    try {
      const updateData = {};
      if (paymentStatus) updateData.payment_status = paymentStatus;
      if (paymentProvider) updateData.payment_provider = paymentProvider;
      if (paymentId) updateData.payment_id = paymentId;
      if (paymentOrderId) updateData.payment_order_id = paymentOrderId;
      if (status) updateData.status = status;
      if (paymentStatus === 'paid' || paymentStatus === 'Paid') {
        updateData.paid_at = new Date().toISOString();
      }

      console.log(`🔄 [orderService.updateOrderPayment] Sending update to order ${orderId}:`, updateData);

      const { data, error } = await supabaseClient
        .from('orders')
        .update(updateData)
        .eq('id', orderId)
        .select()
        .single();

      if (error) {
        console.error('❌ [orderService.updateOrderPayment] Supabase update query error:', JSON.stringify(error, null, 2));

        const isCheckConstraintError = error.code === '23514';
        const isColumnMissingError = error.code === '42703' || error.message?.includes('payment_status');
        const isCreatorEarningsError = error.message?.includes('creator_earnings') || error.details?.includes('creator_earnings');

        // Check if the check constraint violation is due to stock exhaustion trigger
        if (isCheckConstraintError && !isCreatorEarningsError && (status === 'confirmed' || status === 'Confirmed' || error.message?.includes('stock') || error.details?.includes('stock'))) {
          throw new Error('Some products are no longer available in requested quantity.');
        }

        if (isColumnMissingError || isCheckConstraintError) {
          console.warn('🔄 [orderService]: Falling back to legacy status updates...');
          
          const statusUpdate = {};
          if (status) {
            // Map new statuses to old ones if constraint is violated
            if (status === 'confirmed') statusUpdate.status = 'Completed';
            else if (status === 'awaiting_payment') statusUpdate.status = 'Pending';
            else statusUpdate.status = status;
          }

          if (Object.keys(statusUpdate).length > 0) {
            console.log(`🔄 [orderService.updateOrderPayment] Triggering fallback status update:`, statusUpdate);
            const { data: fallbackData, error: fallbackError } = await supabaseClient
              .from('orders')
              .update(statusUpdate)
              .eq('id', orderId)
              .select()
              .single();

            if (fallbackError) {
              console.error('❌ [orderService.updateOrderPayment] Fallback status update failed. Full response:', JSON.stringify(fallbackError, null, 2));
              throw fallbackError;
            }
            
            // Check if coupon increment is needed for fallback update
            if (paymentStatus === 'paid' || paymentStatus === 'Paid') {
              if (fallbackData && fallbackData.coupon_id) {
                await couponService.incrementCouponUsage(fallbackData.coupon_id);
              }
              
              // Auto-trigger shipment creation in background or async
              try {
                const { shippingService } = await import('@/services/shipping/shippingService');
                console.log(`🔄 [orderService.updateOrderPayment] Auto-triggering shipment creation for Order ${orderId} (fallback path)...`);
                await shippingService.createShipment(orderId);
              } catch (shipErr) {
                console.error(`⚠️ [orderService.updateOrderPayment] Auto-trigger shipment fallback path failed:`, shipErr.message);
              }
            }
            return { ...fallbackData, success: true, columnsMissing: true };
          }
          return { success: true, columnsMissing: true };
        }
        throw error;
      }

      // Check if coupon increment is needed for normal update
      if (paymentStatus === 'paid' || paymentStatus === 'Paid') {
        if (data && data.coupon_id) {
          await couponService.incrementCouponUsage(data.coupon_id);
        }
        
        // Auto-trigger shipment creation in background or async
        try {
          const { shippingService } = await import('@/services/shipping/shippingService');
          console.log(`🔄 [orderService.updateOrderPayment] Auto-triggering shipment creation for Order ${orderId}...`);
          await shippingService.createShipment(orderId);
        } catch (shipErr) {
          console.error(`⚠️ [orderService.updateOrderPayment] Auto-trigger shipment failed:`, shipErr.message);
        }
      }

      return { ...data, success: true };
    } catch (e) {
      console.error('❌ [orderService]: Error updating order payment:', e);
      throw e;
    }
  },

  /**
   * Fetch all orders belonging to a creator's store
   */
  getCreatorOrders: async (storeId) => {
    if (!supabaseClient) {
      return mockOrders.filter(o => o.store_id === storeId);
    }
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('[orderService]: Error fetching creator orders:', e);
      return [];
    }
  },

  /**
   * Fetch full details for a single order, including all purchased items
   */
  getOrderDetails: async (orderId) => {
    if (!supabaseClient) {
      const mockOrder = mockOrders.find(o => o.id === orderId);
      return mockOrder || null;
    }
    try {
      const { data: order, error: orderErr } = await supabaseClient
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderErr) throw orderErr;

      // Fetch items joined with product basic details
      const { data: items, error: itemsErr } = await supabaseClient
        .from('order_items')
        .select('*, product:product_id(name, image_url)')
        .eq('order_id', orderId);

      if (itemsErr) throw itemsErr;

      return {
        ...order,
        items: (items || []).map(item => ({
          ...item,
          productName: item.snap_product_name || item.product?.name || 'Deleted Product',
          productImage: item.snap_product_image || item.product?.image_url || ''
        }))
      };
    } catch (e) {
      console.error('[orderService]: Error fetching order details:', e);
      return null;
    }
  },

  /**
   * Update the status of an existing order
   */
  updateOrderStatus: async (orderId, newStatus) => {
    if (!supabaseClient) {
      const order = mockOrders.find(o => o.id === orderId);
      if (order) {
        const oldStatus = order.status;
        order.status = newStatus;

        if ((newStatus === 'Cancelled' || newStatus === 'refunded') && oldStatus !== 'Cancelled' && oldStatus !== 'refunded') {
          // Reverse mock creator earnings if cancelled/refunded
          const mockEarnings = payoutService._getMockEarnings();
          const idx = mockEarnings.findIndex(e => e.order_id === orderId && e.status !== 'paid');
          if (idx !== -1) {
            mockEarnings.splice(idx, 1);
          }
        }
      }
      return order || true;
    }
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;

      // Handle stock restoration is now handled automatically by the database trigger
      return data;
    } catch (e) {
      console.error('[orderService]: Error updating order status:', e);
      throw e;
    }
  },

  /**
   * Fetch all historical purchases made by a customer's email
   */
  getCustomerOrders: async (customerEmail, customerId = null) => {
    if (!supabaseClient) {
      return mockOrders.filter(o => o.customer_email === customerEmail);
    }
    try {
      let query = supabaseClient
        .from('orders')
        .select('*, store:store_id(name, slug)');
      
      if (customerId) {
        query = query.eq('customer_id', customerId);
      } else {
        query = query.eq('customer_email', customerEmail);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('[orderService]: Error fetching customer orders:', e);
      return [];
    }
  }
};

export default orderService;
