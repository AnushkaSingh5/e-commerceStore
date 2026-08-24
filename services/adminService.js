import { supabaseClient } from '@/lib/supabase';

const getAdminEmail = () => {
  try {
    if (typeof window !== 'undefined') {
      const session = sessionStorage.getItem('admin_session');
      if (session) {
        return JSON.parse(session).email;
      }
    }
  } catch (e) {
    console.error('Error getting admin email:', e);
  }
  return 'admin@kreatorstore.com'; // Safe seeded fallback
};

const toLocalDateString = (isoString) => {
  if (!isoString) return 'N/A';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'N/A';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const adminService = {
  /**
   * Fetch all platform stores with owner profile details
   */
  getStores: async () => {
    if (!supabaseClient) return [];
    try {
      const email = getAdminEmail();
      
      // 1. Try secure admin RPC first
      try {
        const { data: storesData, error: storesError } = await supabaseClient
          .rpc('admin_get_stores', { p_admin_email: email });

        if (!storesError && storesData) {
          // Fetch products, orders, and categories in parallel
          const [prodRes, ordRes, catRes, selRes] = await Promise.all([
            supabaseClient.rpc('admin_get_products', { p_admin_email: email }),
            supabaseClient.rpc('admin_get_orders', { p_admin_email: email }),
            supabaseClient.from('categories').select('id, store_id'),
            supabaseClient.from('sellers').select('id, verification_status')
          ]);

          const productsList = prodRes.data || [];
          const ordersList = ordRes.data || [];
          const categoriesList = catRes.data || [];
          const sellersList = selRes.data || [];

          return storesData.map(store => {
            const storeProds = productsList.filter(p => p.store_id === store.id);
            const storeOrds = ordersList.filter(o => o.store_id === store.id);
            const storeCats = categoriesList.filter(c => c.store_id === store.id);
            const seller = sellersList.find(s => s.id === store.creator_id);
            const totalRevenue = storeOrds.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);

            let uiStatus = 'Pending';
            if (store.status === 'approved') uiStatus = 'Active';
            else if (store.status === 'rejected') uiStatus = 'Rejected';
            else if (store.status === 'disabled') uiStatus = 'Disabled';

            return {
              id: store.id,
              creatorId: store.creator_id,
              name: store.name,
              slug: store.slug,
              description: store.description,
              logoUrl: store.logo_url,
              bannerUrl: store.banner_url,
              statusReason: store.status_reason,
              ownerName: store.creator_name || 'Unknown Creator',
              email: store.creator_email || 'N/A',
              status: uiStatus,
              createdDate: toLocalDateString(store.created_at),
              productsCount: storeProds.length,
              categoriesCount: storeCats.length,
              ordersCount: storeOrds.length,
              revenue: totalRevenue,
              growth: 0,
              ownerVerificationStatus: seller ? seller.verification_status : 'Not Submitted'
            };
          });
        }
      } catch (rpcErr) {
        console.warn('⚠️ [Kreatorstore - AdminService]: admin_get_stores RPC failed, trying select fallback:', rpcErr.message);
      }

      // 2. Direct fallback (original direct query for local testing/bootstrap)
      const { data: storesData, error: storesError } = await supabaseClient
        .from('stores')
        .select('*, creator:creator_id(email, sellers(name, verification_status))')
        .order('created_at', { ascending: false });

      if (storesError) throw storesError;

      const [prodRes, ordRes, catRes] = await Promise.all([
        supabaseClient.from('products').select('id, store_id'),
        supabaseClient.from('orders').select('id, store_id, total_amount'),
        supabaseClient.from('categories').select('id, store_id')
      ]);

      const productsList = prodRes.data || [];
      const ordersList = ordRes.data || [];
      const categoriesList = catRes.data || [];

      return (storesData || []).map(store => {
        const storeProds = productsList.filter(p => p.store_id === store.id);
        const storeOrds = ordersList.filter(o => o.store_id === store.id);
        const storeCats = categoriesList.filter(c => c.store_id === store.id);
        const totalRevenue = storeOrds.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);

        let uiStatus = 'Pending';
        if (store.status === 'approved') uiStatus = 'Active';
        else if (store.status === 'rejected') uiStatus = 'Rejected';
        else if (store.status === 'disabled') uiStatus = 'Disabled';

        return {
          id: store.id,
          creatorId: store.creator_id,
          name: store.name,
          slug: store.slug,
          description: store.description,
          logoUrl: store.logo_url,
          bannerUrl: store.banner_url,
          statusReason: store.status_reason,
          ownerName: store.creator?.sellers?.name || 'Unknown Creator',
          email: store.creator?.email || 'N/A',
          status: uiStatus,
          createdDate: toLocalDateString(store.created_at),
          productsCount: storeProds.length,
          categoriesCount: storeCats.length,
          ordersCount: storeOrds.length,
          revenue: totalRevenue,
          growth: 0,
          ownerVerificationStatus: store.creator?.sellers?.verification_status || 'Not Submitted'
        };
      });
    } catch (e) {
      console.error('[Kreatorstore - AdminService] Error fetching stores:', e);
      return [];
    }
  },
  
  /**
   * Approve a store (change status to 'approved')
   */
  approveStore: async (id) => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');
    try {
      // 1. Fetch store creator details
      const { data: store, error: storeErr } = await supabaseClient
        .from('stores')
        .select('creator_id')
        .eq('id', id)
        .single();
      if (storeErr || !store) throw new Error('Store not found.');
      
      const creatorId = store.creator_id;
      
      // 2. Fetch creator profile verification status and email
      const { data: profile, error: profileErr } = await supabaseClient
        .from('profiles')
        .select('verification_status, email')
        .eq('id', creatorId)
        .single();
      if (profileErr || !profile) throw new Error('Creator profile not found.');

      if (profile.verification_status !== 'Verified') {
        return { 
          success: false, 
          isUnverifiedCreator: true,
          creatorId: creatorId,
          creatorEmail: profile.email,
          error: 'The creator profile must be verified before their store can be approved. Redirecting you to verify their credentials first...' 
        };
      }

      const email = getAdminEmail();

      // 1. Try secure admin RPC first
      try {
        const { data, error: rpcError } = await supabaseClient
          .rpc('admin_approve_store', { p_admin_email: email, p_store_id: id });

        if (!rpcError) {
          return { success: true };
        }
      } catch (rpcErr) {
        console.warn('⚠️ [Kreatorstore - AdminService]: admin_approve_store RPC failed, trying update fallback:', rpcErr.message);
      }

      // 2. Direct fallback
      const { data: storeData } = await supabaseClient
        .from('stores')
        .select('status')
        .eq('id', id)
        .single();
      const prevStatus = storeData?.status || 'pending';

      const { error } = await supabaseClient
        .from('stores')
        .update({ status: 'approved', status_reason: null })
        .eq('id', id);

      if (error) throw error;

      try {
        await supabaseClient
          .from('store_status_audit_logs')
          .insert([{
            store_id: id,
            previous_status: prevStatus,
            new_status: 'approved',
            reason: null
          }]);
      } catch (logErr) {
        console.warn('Failed to insert audit log in fallback:', logErr);
      }

      return { success: true };
    } catch (e) {
      console.error('[Kreatorstore - AdminService] Error approving store:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * Reject a store (change status to 'rejected')
   */
  rejectStore: async (id, reason) => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');
    try {
      const email = getAdminEmail();
      const activeReason = reason || 'Incomplete store information';

      // 1. Try secure admin RPC first
      try {
        const { data, error: rpcError } = await supabaseClient
          .rpc('admin_reject_store', { p_admin_email: email, p_store_id: id, p_reason: activeReason });

        if (!rpcError) {
          return { success: true };
        }
      } catch (rpcErr) {
        console.warn('⚠️ [Kreatorstore - AdminService]: admin_reject_store RPC failed, trying update fallback:', rpcErr.message);
      }

      // 2. Direct fallback
      const { data: storeData } = await supabaseClient
        .from('stores')
        .select('status')
        .eq('id', id)
        .single();
      const prevStatus = storeData?.status || 'pending';

      const { error } = await supabaseClient
        .from('stores')
        .update({ status: 'rejected', status_reason: activeReason })
        .eq('id', id);

      if (error) throw error;

      try {
        await supabaseClient
          .from('store_status_audit_logs')
          .insert([{
            store_id: id,
            previous_status: prevStatus,
            new_status: 'rejected',
            reason: activeReason
          }]);
      } catch (logErr) {
        console.warn('Failed to insert audit log in fallback:', logErr);
      }

      return { success: true };
    } catch (e) {
      console.error('[Kreatorstore - AdminService] Error rejecting store:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * Disable a store (change status to 'disabled')
   */
  disableStore: async (id, reason) => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');
    try {
      const email = getAdminEmail();
      const activeReason = reason || 'Violation of platform policies';

      // 1. Try secure admin RPC first
      try {
        const { data, error: rpcError } = await supabaseClient
          .rpc('admin_disable_store', { p_admin_email: email, p_store_id: id, p_reason: activeReason });

        if (!rpcError) {
          return { success: true };
        }
      } catch (rpcErr) {
        console.warn('⚠️ [Kreatorstore - AdminService]: admin_disable_store RPC failed, trying update fallback:', rpcErr.message);
      }

      // 2. Direct fallback
      const { data: storeData } = await supabaseClient
        .from('stores')
        .select('status')
        .eq('id', id)
        .single();
      const prevStatus = storeData?.status || 'approved';

      const { error } = await supabaseClient
        .from('stores')
        .update({ status: 'disabled', status_reason: activeReason })
        .eq('id', id);

      if (error) throw error;

      try {
        await supabaseClient
          .from('store_status_audit_logs')
          .insert([{
            store_id: id,
            previous_status: prevStatus,
            new_status: 'disabled',
            reason: activeReason
          }]);
      } catch (logErr) {
        console.warn('Failed to insert audit log in fallback:', logErr);
      }

      return { success: true };
    } catch (e) {
      console.error('[Kreatorstore - AdminService] Error disabling store:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * Fetch all platform products with their store and category details
   */
  getProducts: async () => {
    if (!supabaseClient) return [];
    try {
      const email = getAdminEmail();

      // 1. Try secure admin RPC first
      try {
        const { data, error: rpcError } = await supabaseClient
          .rpc('admin_get_products', { p_admin_email: email });

        if (!rpcError && data) {
          return data.map(p => ({
            id: p.id,
            name: p.name,
            store: p.store_name || 'Unknown Store',
            category: p.category_name || 'Uncategorized',
            price: parseFloat(p.price || 0),
            status: p.status || 'Published',
            stock: parseInt(p.stock) || 0,
            image: p.image_url || 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800'
          }));
        }
      } catch (rpcErr) {
        console.warn('⚠️ [Kreatorstore - AdminService]: admin_get_products RPC failed, trying select fallback:', rpcErr.message);
      }

      // 2. Direct fallback
      const { data, error } = await supabaseClient
        .from('products')
        .select('*, store:store_id(name), category:category_id(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(p => ({
        id: p.id,
        name: p.name,
        store: p.store?.name || 'Unknown Store',
        category: p.category?.name || 'Uncategorized',
        price: parseFloat(p.price || 0),
        status: p.status || 'Published',
        stock: parseInt(p.stock) || 0,
        image: p.image_url || 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800'
      }));
    } catch (e) {
      console.error('[Kreatorstore - AdminService] Error fetching products:', e);
      return [];
    }
  },

  /**
   * Remove/Delete a product from the platform
   */
  removeProduct: async (id) => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');
    try {
      const email = getAdminEmail();

      // 1. Try secure admin RPC first
      try {
        const { data, error: rpcError } = await supabaseClient
          .rpc('admin_remove_product', { p_admin_email: email, p_product_id: id });

        if (!rpcError) {
          return { success: true };
        }
      } catch (rpcErr) {
        console.warn('⚠️ [Kreatorstore - AdminService]: admin_remove_product RPC failed, trying delete fallback:', rpcErr.message);
      }

      // 2. Direct fallback
      const { error } = await supabaseClient
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error('[Kreatorstore - AdminService] Error removing product:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * Fetch all platform orders with store details
   */
  getOrders: async () => {
    if (!supabaseClient) return [];
    try {
      const email = getAdminEmail();

      // 1. Try secure admin RPC first
      try {
        const { data, error: rpcError } = await supabaseClient
          .rpc('admin_get_orders', { p_admin_email: email });

        if (!rpcError && data) {
          return data.map(o => ({
            id: o.id,
            customer: o.customer_name,
            email: o.customer_email,
            store: o.store_name || 'Unknown Store',
            total: parseFloat(o.total_amount || 0),
            paymentMethod: o.payment_provider || 'Razorpay',
            paymentStatus: o.payment_status || 'Pending',
            status: o.status || 'Pending',
            date: toLocalDateString(o.created_at),
            time: o.created_at ? new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A',
            address: o.shipping_address || 'Standard Shipping'
          }));
        }
      } catch (rpcErr) {
        console.warn('⚠️ [Kreatorstore - AdminService]: admin_get_orders RPC failed, trying select fallback:', rpcErr.message);
      }

      // 2. Direct fallback
      const { data, error } = await supabaseClient
        .from('orders')
        .select('*, store:store_id(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(o => ({
        id: o.id,
        customer: o.customer_name,
        email: o.customer_email,
        store: o.store?.name || 'Unknown Store',
        total: parseFloat(o.total_amount || 0),
        paymentMethod: o.payment_provider || 'Razorpay',
        paymentStatus: o.payment_status || 'Pending',
        status: o.status || 'Pending',
        date: toLocalDateString(o.created_at),
        time: o.created_at ? new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A',
        address: o.shipping_address || 'Standard Shipping'
      }));
    } catch (e) {
      console.error('[Kreatorstore - AdminService] Error fetching orders:', e);
      return [];
    }
  },

  /**
   * Derive and fetch all platform customers from sales transactions
   */
  getCustomers: async () => {
    if (!supabaseClient) return [];
    try {
      const email = getAdminEmail();
      let ordersData = [];

      // 1. Try secure admin RPC first
      try {
        const { data, error: rpcError } = await supabaseClient
          .rpc('admin_get_orders', { p_admin_email: email });

        if (!rpcError && data) {
          ordersData = data;
        }
      } catch (rpcErr) {
        console.warn('⚠️ [Kreatorstore - AdminService]: admin_get_orders RPC failed inside getCustomers, trying select fallback:', rpcErr.message);
      }

      // 2. Direct fallback
      if (ordersData.length === 0) {
        const { data: selectData, error: ordersError } = await supabaseClient
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });

        if (!ordersError && selectData) {
          ordersData = selectData;
        }
      }

      const customerMap = {};
      ordersData.forEach(o => {
        if (!o.customer_email) return;
        const cEmail = o.customer_email;
        if (!customerMap[cEmail]) {
          customerMap[cEmail] = {
            id: `cust-${cEmail}`,
            name: o.customer_name || 'Anonymous',
            email: cEmail,
            phone: o.customer_phone || 'N/A',
            totalOrders: 0,
            totalSpent: 0,
            joinedDate: o.created_at ? o.created_at.split('T')[0] : '2026'
          };
        }
        customerMap[cEmail].totalOrders += 1;
        customerMap[cEmail].totalSpent += parseFloat(o.total_amount || 0);
      });

      return Object.values(customerMap);
    } catch (e) {
      console.error('[Kreatorstore - AdminService] Error generating customer list:', e);
      return [];
    }
  }
};

export default adminService;
