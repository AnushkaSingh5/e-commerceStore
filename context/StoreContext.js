'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useAuth } from '@/context/AuthContext';
import { cartService } from '@/services/cartService';
import { supabaseClient } from '@/lib/supabase';

const StoreContext = createContext();

export function StoreProvider({ children }) {
  const { customer: customerUser, customerProfile, loading: customerAuthLoading } = useCustomerAuth();
  const { user: authUser, role: authRole } = useAuth();
  const [cart, setCart] = useState([]);
  const [dbCartId, setDbCartId] = useState(null);
  const [loadingDbCart, setLoadingDbCart] = useState(false);
  const [wishlist, setWishlist] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);

  const wishlistKey = customerProfile ? `luxe_wishlist_customer_${customerProfile.id}` : 'luxe_wishlist_guest';

  // 1. Manage customer database cart load, merge, and sync
  useEffect(() => {
    if (customerAuthLoading) return;

    if (customerProfile) {
      const loadAndSyncCart = async () => {
        setLoadingDbCart(true);
        try {
          const dbCart = await cartService.getOrCreateCart(customerProfile.id);
          
          if (!dbCart || !dbCart.id) {
            setDbCartId(null);
            setCart([]);
            return;
          }

          setDbCartId(dbCart.id);

          // Get guest cart items from sessionStorage or localStorage
          let guestCart = [];
          const savedGuestCart = sessionStorage.getItem('luxe_cart_guest') || localStorage.getItem('luxe_cart_guest');
          if (savedGuestCart) {
            try {
              guestCart = JSON.parse(savedGuestCart);
            } catch (e) {
              console.warn('Failed to parse guest cart', e);
            }
          }

          let finalItems = [];
          if (guestCart.length > 0) {
            console.log('🔄 [StoreContext]: Syncing guest cart to database cart:', guestCart);
            finalItems = await cartService.syncLocalCartToDb(dbCart.id, guestCart);
            sessionStorage.removeItem('luxe_cart_guest');
            localStorage.removeItem('luxe_cart_guest');
          } else {
            finalItems = await cartService.getCartItems(dbCart.id);
          }

          setCart(finalItems || []);
        } catch (err) {
          console.warn('⚠️ [StoreContext] Failed to load/sync database cart:', err);
          setCart([]);
        } finally {
          setLoadingDbCart(false);
        }
      };
      loadAndSyncCart();
    } else {
      setDbCartId(null);

      // Load from localStorage/sessionStorage for anyone who is not a customer (Guests, Creators, Admins)
      const savedGuestCart = sessionStorage.getItem('luxe_cart_guest') || localStorage.getItem('luxe_cart_guest');
      if (savedGuestCart) {
        try {
          const parsed = JSON.parse(savedGuestCart);
          setCart(parsed);
          
          // Verify with database in background
          if (supabaseClient && parsed.length > 0) {
            const productIds = parsed.map(item => item.id).filter(Boolean);
            if (productIds.length > 0) {
              supabaseClient
                .from('products')
                .select('id, price, stock, is_deleted')
                .in('id', productIds)
                .then(({ data: dbProducts, error }) => {
                  if (dbProducts && !error) {
                    const updatedParsed = parsed.map(item => {
                      const dbProduct = dbProducts.find(p => p.id === item.id);
                      if (!dbProduct || dbProduct.is_deleted) {
                        return { ...item, is_deleted: true };
                      }
                      return { 
                        ...item, 
                        is_deleted: false,
                        price: parseFloat(dbProduct.price) || item.price,
                        stock: dbProduct.stock !== undefined ? dbProduct.stock : item.stock
                      };
                    });
                    setCart(updatedParsed);
                    sessionStorage.setItem('luxe_cart_guest', JSON.stringify(updatedParsed));
                    localStorage.setItem('luxe_cart_guest', JSON.stringify(updatedParsed));
                  }
                }).catch(() => {});
            }
          }
        } catch (e) {
          setCart([]);
        }
      } else {
        setCart([]);
      }
    }
  }, [customerProfile, customerUser, customerAuthLoading, authRole]);

  // Load wishlist from localStorage
  useEffect(() => {
    const savedWishlist = localStorage.getItem(wishlistKey);
    if (savedWishlist) {
      try {
        setWishlist(JSON.parse(savedWishlist));
      } catch (e) {
        console.error('Failed to parse wishlist', e);
        setWishlist([]);
      }
    } else {
      setWishlist([]);
    }
  }, [wishlistKey]);

  // Save wishlist to localStorage
  useEffect(() => {
    localStorage.setItem(wishlistKey, JSON.stringify(wishlist));
  }, [wishlist, wishlistKey]);

  // Helper to persist cart changes to storage or DB
  const saveCartToStorage = async (updatedCart, changedProductId = null, newQty = null) => {
    if (customerProfile) {
      try {
        let activeCartId = dbCartId;
        if (!activeCartId) {
          const dbCart = await cartService.getOrCreateCart(customerProfile.id);
          activeCartId = dbCart?.id;
          if (activeCartId) {
            setDbCartId(activeCartId);
          }
        }
        if (!activeCartId) return;

        if (changedProductId) {
          if (newQty === 0) {
            await cartService.removeCartItem(activeCartId, changedProductId);
          } else {
            await cartService.addOrUpdateCartItem(activeCartId, changedProductId, newQty);
          }
        } else if (updatedCart.length === 0) {
          await cartService.clearCart(activeCartId);
        }
      } catch (err) {
        console.warn('Failed to update DB cart:', err);
      }
    } else {
      // Guest / Creator / Admin acting as visitor
      sessionStorage.setItem('luxe_cart_guest', JSON.stringify(updatedCart));
      localStorage.setItem('luxe_cart_guest', JSON.stringify(updatedCart));
    }
  };

  const addToCart = async (product, quantity = 1) => {
    if (!product) return;

    let newQty = quantity;
    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      newQty = existing.quantity + quantity;
    }

    if (product.stock !== undefined && product.stock === 0) {
      alert('This product is out of stock.');
      return;
    }

    if (product.stock !== undefined && newQty > product.stock) {
      alert(`Only ${product.stock} items available.`);
      return;
    }

    // Auto-detect store slug from URL if missing on product object
    let itemStoreSlug = product.store_slug || product.store?.slug || '';
    if (!itemStoreSlug && typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/');
      if ((parts[1] === 'store' || parts[1] === 'demo-store') && parts[2]) {
        itemStoreSlug = parts[2];
      }
    }

    let updatedCart = [];
    if (existing) {
      updatedCart = cart.map((item) =>
        item.id === product.id ? { ...item, quantity: newQty } : item
      );
    } else {
      const newItem = {
        id: product.id,
        name: product.name,
        price: parseFloat(product.price) || 0,
        image: product.image || product.image_url || 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800',
        category: product.category || 'Uncategorized',
        store_id: product.store_id,
        store_slug: itemStoreSlug,
        stock: product.stock !== undefined ? product.stock : 999,
        quantity
      };
      updatedCart = [...cart, newItem];
    }

    setCart(updatedCart);
    await saveCartToStorage(updatedCart, product.id, newQty);
    setIsCartOpen(true);
  };

  const removeFromCart = async (productId) => {
    const updatedCart = cart.filter((item) => item.id !== productId);
    setCart(updatedCart);
    await saveCartToStorage(updatedCart, productId, 0);
  };

  const updateQuantity = async (productId, delta) => {
    const item = cart.find((item) => item.id === productId);
    if (!item) return;

    const newQty = item.quantity + delta;
    if (newQty < 1) return;

    if (item.stock !== undefined && newQty > item.stock) {
      alert(`Only ${item.stock} items available.`);
      return;
    }

    const updatedCart = cart.map((item) =>
      item.id === productId ? { ...item, quantity: newQty } : item
    );
    setCart(updatedCart);
    await saveCartToStorage(updatedCart, productId, newQty);
  };

  const clearCart = async (storeIdOrSlug = null) => {
    const isExplicitSlug = typeof storeIdOrSlug === 'string' && storeIdOrSlug.trim() !== '';
    if (isExplicitSlug) {
      const updatedCart = cart.filter(
        (item) => item.store_id !== storeIdOrSlug && item.store_slug !== storeIdOrSlug
      );
      setCart(updatedCart);
      if (customerProfile) {
        try {
          let activeCartId = dbCartId;
          if (!activeCartId) {
            const dbCart = await cartService.getOrCreateCart(customerProfile.id);
            activeCartId = dbCart?.id;
            if (activeCartId) setDbCartId(activeCartId);
          }
          if (activeCartId) {
            const itemsToRemove = cart.filter(
              (item) => item.store_id === storeIdOrSlug || item.store_slug === storeIdOrSlug
            );
            for (const item of itemsToRemove) {
              await cartService.removeCartItem(activeCartId, item.id);
            }
          }
        } catch (err) {
          console.warn('Failed to clear store cart in DB:', err);
        }
      } else {
        sessionStorage.setItem('luxe_cart_guest', JSON.stringify(updatedCart));
        localStorage.setItem('luxe_cart_guest', JSON.stringify(updatedCart));
      }
    } else {
      setCart([]);
      if (customerProfile) {
        try {
          let activeCartId = dbCartId;
          if (!activeCartId) {
            const dbCart = await cartService.getOrCreateCart(customerProfile.id);
            activeCartId = dbCart?.id;
            if (activeCartId) setDbCartId(activeCartId);
          }
          if (activeCartId) {
            await cartService.clearCart(activeCartId);
          }
        } catch (err) {
          console.warn('Failed to clear full DB cart:', err);
        }
      }
      sessionStorage.removeItem('luxe_cart_guest');
      localStorage.removeItem('luxe_cart_guest');
    }
  };

  const removeCartItems = async (productIds) => {
    const updatedCart = cart.filter((item) => !productIds.includes(item.id));
    setCart(updatedCart);
    if (customerProfile) {
      try {
        let activeCartId = dbCartId;
        if (!activeCartId) {
          const dbCart = await cartService.getOrCreateCart(customerProfile.id);
          activeCartId = dbCart.id;
          setDbCartId(activeCartId);
        }
        for (const pid of productIds) {
          await cartService.removeCartItem(activeCartId, pid);
        }
      } catch (err) {
        console.warn('Failed to remove selected items in DB:', err);
      }
    } else {
      sessionStorage.setItem('luxe_cart_guest', JSON.stringify(updatedCart));
      localStorage.setItem('luxe_cart_guest', JSON.stringify(updatedCart));
    }
  };

  const toggleWishlist = (product) => {
    setWishlist((prev) => {
      const exists = prev.find(item => item.id === product.id);
      if (exists) {
        return prev.filter(item => item.id !== product.id);
      }
      return [...prev, product];
    });
  };

  const isInWishlist = (productId) => wishlist.some(item => item.id === productId);

  const cartTotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const cartCount = cart.reduce((count, item) => count + item.quantity, 0);

  const value = {
    cart,
    setCart,
    cartCount,
    cartTotal,
    wishlist,
    toggleWishlist,
    isInWishlist,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    removeCartItems,
    isCartOpen,
    setIsCartOpen,
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    console.warn('[StoreContext] useStore was called outside of StoreProvider. Returning fallback.');
    return {
      cart: [],
      wishlist: [],
      selectedCategory: 'All',
      setSelectedCategory: () => {},
      searchQuery: '',
      setSearchQuery: () => {},
      addToCart: () => {},
      removeFromCart: () => {},
      updateQuantity: () => {},
      clearCart: () => {},
      removeCartItems: () => {},
      isCartOpen: false,
      setIsCartOpen: () => {},
    };
  }
  return context;
}
