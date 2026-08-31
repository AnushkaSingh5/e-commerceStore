import { supabaseClient } from '@/lib/supabase';

export const cartService = {
  /**
   * Fetch a customer's cart, or create it if it doesn't exist.
   * An absent cart is a normal valid state, never throws PGRST116.
   */
  getOrCreateCart: async (customerId) => {
    if (!supabaseClient || !customerId) return null;
    
    try {
      // 1. Check if cart exists using maybeSingle (0 rows = null, no PGRST116)
      const { data: cart, error: fetchError } = await supabaseClient
        .from('customer_carts')
        .select('*')
        .eq('customer_id', customerId)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.warn('⚠️ [cartService.getOrCreateCart] Fetch notice:', fetchError.message);
      }
      if (cart) return cart;

      // 2. Create a new cart if not found
      const { data: newCart, error: createError } = await supabaseClient
        .from('customer_carts')
        .insert([{ customer_id: customerId }])
        .select()
        .maybeSingle();

      if (createError) {
        // If unique constraint violation because another concurrent request created it, query it
        if (createError.code === '23505') {
          const { data: existingCart } = await supabaseClient
            .from('customer_carts')
            .select('*')
            .eq('customer_id', customerId)
            .maybeSingle();
          if (existingCart) return existingCart;
        }
        if (createError.code !== 'PGRST116') {
          console.warn('⚠️ [cartService.getOrCreateCart] Cart create notice:', createError.message);
        }
        return null;
      }
      return newCart || null;
    } catch (err) {
      if (err.code === 'PGRST116') return null;
      console.warn('⚠️ [cartService.getOrCreateCart] Exception:', err.message);
      return null;
    }
  },

  /**
   * Fetch a customer's cart by customerId. Returns null if absent (valid state).
   */
  getCart: async (customerId) => {
    if (!supabaseClient || !customerId) return null;
    try {
      const { data: cart, error } = await supabaseClient
        .from('customer_carts')
        .select('*')
        .eq('customer_id', customerId)
        .maybeSingle();

      if (error) {
        if (error.code === 'PGRST116') return null;
        console.warn('⚠️ [cartService.getCart] Error:', error.message);
        return null;
      }
      return cart || null;
    } catch (err) {
      if (err.code === 'PGRST116') return null;
      return null;
    }
  },

  /**
   * Fetch all items in a cart, joining with product and store details.
   * If cartId is absent or has no items, returns [] cleanly.
   */
  getCartItems: async (cartId) => {
    if (!supabaseClient || !cartId) return [];

    try {
      const { data, error } = await supabaseClient
        .from('cart_items')
        .select(`
          id,
          quantity,
          product_id,
          products:product_id (
            id,
            name,
            price,
            image_url,
            stock,
            store_id,
            is_deleted,
            store:store_id (
              slug
            ),
            category:category_id (
              name
            )
          )
        `)
        .eq('cart_id', cartId);

      if (error) {
        if (error.code === 'PGRST116') return [];
        console.warn('⚠️ [cartService.getCartItems] Fetch notice:', error.message);
        return [];
      }
      
      // Map items to the format expected by the frontend CartContext state
      return (data || []).map(item => {
        const p = item.products;
        if (!p) {
          return {
            id: item.product_id,
            name: 'Deleted Product',
            price: 0,
            image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800',
            category: 'Uncategorized',
            store_id: null,
            store_slug: '',
            stock: 0,
            quantity: item.quantity,
            is_deleted: true
          };
        }
        return {
          id: p.id,
          name: p.name,
          price: parseFloat(p.price) || 0,
          image: p.image_url || 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800',
          category: p.category?.name || 'Uncategorized',
          store_id: p.store_id,
          store_slug: p.store?.slug || '',
          stock: p.stock !== undefined ? p.stock : 999,
          quantity: item.quantity,
          is_deleted: p.is_deleted || false
        };
      });
    } catch (err) {
      if (err.code === 'PGRST116') return [];
      console.warn('⚠️ [cartService.getCartItems] Exception:', err.message);
      return [];
    }
  },

  /**
   * Add or update an item in the database cart.
   */
  addOrUpdateCartItem: async (cartId, productId, quantity) => {
    if (!supabaseClient || !cartId || !productId) return null;

    try {
      // Verify product's store is approved
      const { data: product, error: prodError } = await supabaseClient
        .from('products')
        .select('store:store_id(status, creator_id)')
        .eq('id', productId)
        .maybeSingle();
      
      if (prodError && prodError.code !== 'PGRST116') {
        console.warn('⚠️ [cartService.addOrUpdateCartItem] Product check notice:', prodError.message);
      }
      
      if (product?.store && product?.store?.status !== 'approved') {
        const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));
        const isOwner = user?.id && user.id === product.store.creator_id;
        if (!isOwner) {
          throw new Error('This store is currently under admin review and is not available to customers.');
        }
      }

      // Check if the item already exists in the cart using maybeSingle
      const { data: existing, error: fetchError } = await supabaseClient
        .from('cart_items')
        .select('*')
        .eq('cart_id', cartId)
        .eq('product_id', productId)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.warn('⚠️ [cartService.addOrUpdateCartItem] Existing item fetch notice:', fetchError.message);
      }

      if (existing) {
        // Update quantity
        const { data, error } = await supabaseClient
          .from('cart_items')
          .update({ quantity })
          .eq('id', existing.id)
          .select()
          .maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
      } else {
        // Insert new item
        const { data, error } = await supabaseClient
          .from('cart_items')
          .insert([{
            cart_id: cartId,
            product_id: productId,
            quantity
          }])
          .select()
          .maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
      }
    } catch (err) {
      if (err.code === 'PGRST116') return null;
      throw err;
    }
  },

  /**
   * Remove a single item from the database cart.
   */
  removeCartItem: async (cartId, productId) => {
    if (!supabaseClient || !cartId || !productId) return;
    try {
      const { error } = await supabaseClient
        .from('cart_items')
        .delete()
        .eq('cart_id', cartId)
        .eq('product_id', productId);
      if (error && error.code !== 'PGRST116') throw error;
    } catch (err) {
      if (err.code === 'PGRST116') return;
      console.warn('⚠️ [cartService.removeCartItem] Exception:', err.message);
    }
  },

  /**
   * Empty all items in a database cart.
   */
  clearCart: async (cartId) => {
    if (!supabaseClient || !cartId) return;
    try {
      const { error } = await supabaseClient
        .from('cart_items')
        .delete()
        .eq('cart_id', cartId);
      if (error && error.code !== 'PGRST116') throw error;
    } catch (err) {
      if (err.code === 'PGRST116') return;
      console.warn('⚠️ [cartService.clearCart] Exception:', err.message);
    }
  },

  /**
   * Sync/merge local cart items into database cart upon customer login.
   */
  syncLocalCartToDb: async (cartId, localCartItems) => {
    if (!supabaseClient || !cartId || !Array.isArray(localCartItems) || localCartItems.length === 0) {
      return cartId ? await cartService.getCartItems(cartId) : [];
    }
    
    try {
      // 1. Fetch current database items
      const dbItems = await cartService.getCartItems(cartId);

      // 2. Merge local items into database
      for (const localItem of localCartItems) {
        if (!localItem || !localItem.id) continue;
        const dbItem = dbItems.find(item => item.id === localItem.id);
        const newQty = dbItem ? dbItem.quantity + (localItem.quantity || 1) : (localItem.quantity || 1);
        await cartService.addOrUpdateCartItem(cartId, localItem.id, newQty);
      }

      // 3. Return the refreshed items list from database
      return await cartService.getCartItems(cartId);
    } catch (err) {
      if (err.code === 'PGRST116') return [];
      console.warn('⚠️ [cartService.syncLocalCartToDb] Exception:', err.message);
      return [];
    }
  }
};
