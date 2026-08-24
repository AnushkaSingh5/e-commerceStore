'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { storeService } from '@/services/storeService';
import StoreUnderReview from '@/components/StoreUnderReview';
import { checkoutService } from '@/services/checkoutService';
import { customerService } from '@/services/customerService';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { paymentFactory } from '@/services/payment/PaymentFactory';
import { orderService } from '@/services/orderService';
import { couponService } from '@/services/couponService';

export default function StoreCheckoutPage({ params }) {
  const { slug } = use(params);
  const { cart: globalCart, setCart, clearCart, removeCartItems } = useStore();
  const { customer: user, customerProfile: profile, loading: authLoading } = useCustomerAuth();
  const { user: creatorUser, loading: creatorAuthLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const itemsParam = searchParams.get('items');
  const selectedItemIds = itemsParam ? itemsParam.split(',') : [];

  const [storeDetails, setStoreDetails] = useState(null);
  const cart = (globalCart || []).filter(
    item => (item.store_id === storeDetails?.id || item.store_slug === slug) &&
            (selectedItemIds.length === 0 || selectedItemIds.includes(item.id))
  );
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    address_line_2: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India'
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [placedOrder, setPlacedOrder] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [showMockModal, setShowMockModal] = useState(false);
  const [mockPaymentData, setMockPaymentData] = useState(null);

  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('online');

  // Coupon States
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [availableCoupons, setAvailableCoupons] = useState([]);

  // Authenticate customer role and pre-fill details
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      const currentUrl = window.location.pathname + window.location.search;
      router.push(`/store/${slug}/login?redirect=${encodeURIComponent(currentUrl)}`);
      return;
    }

    setForm(prev => ({
      ...prev,
      name: prev.name || profile?.full_name || '',
      email: prev.email || user.email || '',
      phone: prev.phone || profile?.phone || '',
    }));

    const loadCustomerAddresses = async () => {
      try {
        if (profile?.id) {
          const addresses = await customerService.getAddresses(profile.id);
          setSavedAddresses(addresses);
          
          const defaultAddr = addresses.find(a => a.is_default);
          if (defaultAddr) {
            setSelectedAddressId(defaultAddr.id);
            setForm(prev => ({
              ...prev,
              name: defaultAddr.full_name || prev.name || '',
              phone: defaultAddr.phone || prev.phone || '',
              address: defaultAddr.address_line_1 || '',
              address_line_2: defaultAddr.address_line_2 || '',
              city: defaultAddr.city || '',
              state: defaultAddr.state || '',
              pincode: defaultAddr.postal_code || '',
              country: defaultAddr.country || 'India'
            }));
          } else if (addresses.length > 0) {
            setSelectedAddressId(addresses[0].id);
            setForm(prev => ({
              ...prev,
              name: addresses[0].full_name || prev.name || '',
              phone: addresses[0].phone || prev.phone || '',
              address: addresses[0].address_line_1 || '',
              address_line_2: addresses[0].address_line_2 || '',
              city: addresses[0].city || '',
              state: addresses[0].state || '',
              pincode: addresses[0].postal_code || '',
              country: addresses[0].country || 'India'
            }));
          } else {
            setSelectedAddressId('new');
          }
        }
      } catch (err) {
        console.warn('⚠️ [Checkout] Failed to load shipping addresses:', err);
      }
    };

    loadCustomerAddresses();
  }, [user, profile, authLoading, slug, router]);

  // Redirect back to cart if any items are deleted/unavailable
  useEffect(() => {
    if (!authLoading && cart && cart.length > 0) {
      const hasDeleted = cart.some(item => item.is_deleted);
      if (hasDeleted) {
        router.push(`/store/${slug}/cart`);
      }
    }
  }, [cart, authLoading, slug, router]);



  const handleSelectSavedAddress = (addr) => {
    setSelectedAddressId(addr.id);
    setForm(prev => ({
      ...prev,
      name: addr.full_name || '',
      phone: addr.phone || '',
      address: addr.address_line_1 || '',
      address_line_2: addr.address_line_2 || '',
      city: addr.city || '',
      state: addr.state || '',
      pincode: addr.postal_code || '',
      country: addr.country || 'India'
    }));
    setErrors({});
  };

  const handleSelectNewAddress = () => {
    setSelectedAddressId('new');
    setForm(prev => ({
      ...prev,
      name: profile?.full_name || '',
      phone: profile?.phone || '',
      address: '',
      address_line_2: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India'
    }));
    setErrors({});
  };

  useEffect(() => {
    const fetchStore = async () => {
      setLoadingDetails(true);
      try {
        const data = await storeService.getStoreBySlug(slug);
        setStoreDetails(data);
      } catch (e) {
        console.warn('⚠️ [Checkout] Failed to fetch store details in checkout:', e);
      } finally {
        setLoadingDetails(false);
      }
    };
    fetchStore();
  }, [slug]);

  // Fetch available store coupons
  useEffect(() => {
    if (!storeDetails?.id) return;
    const fetchCoupons = async () => {
      try {
        const allCoupons = await couponService.getCouponsByStore(storeDetails.id);
        const active = (allCoupons || []).filter(c => {
          const isNotExpired = !c.expiry_date || new Date(c.expiry_date) >= new Date();
          const hasUsesRemaining = !c.max_uses || (c.current_uses || 0) < c.max_uses;
          return c.is_active && isNotExpired && hasUsesRemaining;
        });
        setAvailableCoupons(active);
      } catch (err) {
        console.error('Error fetching available store coupons:', err);
      }
    };
    fetchCoupons();
  }, [storeDetails?.id]);

  const handleSelectCoupon = (cop) => {
    setAppliedCoupon(cop);
    const calculatedDiscount = cop.discount_type === 'percentage'
      ? parseFloat((cartTotal * (cop.discount_value / 100)).toFixed(2))
      : parseFloat(cop.discount_value);
    setDiscountAmount(calculatedDiscount);
    setCouponError('');
  };

  console.log(`🛒 [Checkout] Render state: slug=${slug} loadingDetails=${loadingDetails} authLoading=${authLoading} user=${user ? user.email : 'null'} profile=${profile ? profile.full_name : 'null'}`);

  if (loadingDetails || authLoading || creatorAuthLoading) {
    return (
      <div className="store-loading-screen">
        <div className="spinner"></div>
        <p>Loading Checkout...</p>
        <style jsx>{`
          .store-loading-screen {
            height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #0f172a;
            color: #fff;
            gap: 16px;
            font-family: 'Outfit', sans-serif;
          }
          .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid rgba(255, 255, 255, 0.1);
            border-left-color: #8b5cf6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!storeDetails) {
    return (
      <div className="store-not-found-screen">
        <div className="glass-card">
          <h2>Store Not Found 🔍</h2>
          <p>We couldn't find an active store with the link <strong>/store/{slug}</strong>. Please check the spelling or contact the owner.</p>
          <Link href="/" className="back-link">Return to Home</Link>
        </div>
        <style jsx>{`
          .store-not-found-screen {
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
            padding: 20px;
            font-family: 'Outfit', sans-serif;
          }
          .glass-card {
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 24px;
            padding: 40px;
            max-width: 480px;
            text-align: center;
            color: #fff;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
          }
          .glass-card h2 {
            font-size: 24px;
            font-weight: 800;
            margin-bottom: 16px;
            background: linear-gradient(135deg, #f43f5e, #fb7185);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .glass-card p {
            font-size: 14px;
            color: #94a3b8;
            line-height: 1.6;
            margin-bottom: 28px;
          }
          .back-link {
            display: inline-block;
            padding: 12px 24px;
            background: #e11d48;
            color: #fff;
            border-radius: 12px;
            font-weight: 700;
            text-decoration: none;
            transition: all 0.2s;
            border: none;
            cursor: pointer;
          }
          .back-link:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(225, 29, 72, 0.3);
          }
        `}</style>
      </div>
    );
  }

  const currentUserId = creatorUser?.id;
  const isCreator = currentUserId && currentUserId === storeDetails?.creator_id;

  let isAdmin = false;
  if (typeof window !== 'undefined') {
    isAdmin = !!sessionStorage.getItem('admin_session');
  }

  if (storeDetails && storeDetails.status !== 'approved' && !isCreator && !isAdmin) {
    return (
      <StoreUnderReview 
        storeName={storeDetails.name} 
        status={storeDetails.status} 
        statusReason={storeDetails.status_reason} 
      />
    );
  }

  // Filter global cart items to only purchase items belonging to this specific store

  
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = cartTotal * 0.08;
  
  const shippingType = storeDetails?.theme_settings?.shippingType ?? 'flat';
  const parsedFlatFee = parseFloat(storeDetails?.theme_settings?.flatFee);
  const flatFee = isNaN(parsedFlatFee) ? 15 : parsedFlatFee;
  
  let shippingCost = 0;
  if (cart.length > 0) {
    if (shippingType === 'flat') {
      shippingCost = flatFee;
    } else if (shippingType === 'calculated') {
      const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
      shippingCost = 40 + (totalItems * 10);
    } else {
      shippingCost = 0;
    }
  }

  const isCouponValidForTotal = !appliedCoupon || (
    (!appliedCoupon.minimum_order_amount || cartTotal >= appliedCoupon.minimum_order_amount)
  );
  
  const discount = (appliedCoupon && isCouponValidForTotal) ? (
    appliedCoupon.discount_type === 'percentage'
      ? parseFloat((cartTotal * (appliedCoupon.discount_value / 100)).toFixed(2))
      : parseFloat(appliedCoupon.discount_value)
  ) : 0;
  
  const total = Math.max(0, cartTotal + tax - discount + shippingCost);

  const handleApplyCoupon = async (e) => {
    if (e) e.preventDefault();
    setCouponError('');
    
    if (!couponCodeInput.trim()) {
      setCouponError('Please enter a coupon code.');
      return;
    }

    if (!storeDetails?.id) {
      setCouponError('Store details are not loaded yet.');
      return;
    }

    try {
      const res = await couponService.validateCoupon({
        storeId: storeDetails.id,
        code: couponCodeInput,
        subtotal: cartTotal
      });

      if (!res.isValid) {
        setCouponError(res.message || 'Invalid coupon.');
        setAppliedCoupon(null);
        setDiscountAmount(0);
      } else {
        const coupon = res.coupon;
        setAppliedCoupon(coupon);
        const calculatedDiscount = coupon.discount_type === 'percentage'
          ? parseFloat((cartTotal * (coupon.discount_value / 100)).toFixed(2))
          : parseFloat(coupon.discount_value);
        setDiscountAmount(calculatedDiscount);
        setCouponError('');
      }
    } catch (err) {
      setCouponError('Error validating coupon. Please try again.');
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setDiscountAmount(0);
    setCouponCodeInput('');
    setCouponError('');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
    if (['name', 'phone', 'address', 'city', 'state', 'pincode'].includes(name) && selectedAddressId !== 'new') {
      setSelectedAddressId('new');
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    const validation = checkoutService.validateCheckoutForm(form);
    if (!validation.isValid) {
      setErrors(validation.errors);
      setLoading(false);
      return;
    }

    try {
      const couponData = appliedCoupon && isCouponValidForTotal ? {
        coupon_id: appliedCoupon.id,
        coupon_code: appliedCoupon.code,
        discount_amount: discount
      } : null;
      const response = await checkoutService.processCheckout(cart, {
        ...form,
        id: profile?.id,
        payment_provider: paymentMethod === 'cod' ? 'COD' : (process.env.NEXT_PUBLIC_ACTIVE_PAYMENT_PROVIDER || 'Razorpay')
      }, couponData);
      if (response.success && response.orders?.length > 0) {
        setPlacedOrder(response.orders[0]);

        // Auto-save the address to the customer's address book if it is new
        try {
          if (profile?.id) {
            const existingAddresses = await customerService.getAddresses(profile.id);
            const addressExists = existingAddresses.some(addr => 
              (addr.full_name || '').toLowerCase().trim() === (form.name || '').toLowerCase().trim() &&
              (addr.phone || '').trim() === (form.phone || '').trim() &&
              (addr.address_line_1 || '').toLowerCase().trim() === (form.address || '').toLowerCase().trim() &&
              (addr.address_line_2 || '').toLowerCase().trim() === (form.address_line_2 || '').toLowerCase().trim() &&
              (addr.city || '').toLowerCase().trim() === (form.city || '').toLowerCase().trim() &&
              (addr.state || '').toLowerCase().trim() === (form.state || '').toLowerCase().trim() &&
              (addr.postal_code || '').trim() === (form.pincode || '').trim() &&
              (addr.country || '').toLowerCase().trim() === (form.country || 'India').toLowerCase().trim()
            );

            if (!addressExists) {
              console.log('🔄 [Checkout]: Address not in address book. Auto-saving to database...');
              await customerService.createAddress({
                customer_id: profile.id,
                name: existingAddresses.length === 0 ? 'Home (Default)' : `Saved Address ${existingAddresses.length + 1}`,
                full_name: form.name,
                phone: form.phone,
                address_line_1: form.address,
                address_line_2: form.address_line_2 || null,
                city: form.city,
                state: form.state,
                country: form.country || 'India',
                postal_code: form.pincode,
                is_default: existingAddresses.length === 0
              });
              console.log('✅ [Checkout]: Auto-save complete.');
            }
          }
        } catch (addrErr) {
          console.warn('⚠️ [Checkout] Failed to auto-save address to address book:', addrErr?.message || addrErr);
        }

        if (paymentMethod === 'cod') {
          await removeCartItems(cart.map(item => item.id));
          router.push(`/store/${slug}/checkout/success?orderId=${response.orders[0].id}`);
          return;
        }

        // Trigger payment flow
        const activeProviderName = process.env.NEXT_PUBLIC_ACTIVE_PAYMENT_PROVIDER || 'Razorpay';
        const provider = paymentFactory.getProvider(activeProviderName);
        const paymentOrder = await provider.createPaymentOrder(
          response.orders[0].id,
          response.orders[0].total_amount,
          {
            name: form.name,
            email: form.email,
            phone: form.phone
          }
        );

        if (paymentOrder.mock) {
          setMockPaymentData({
            orderId: response.orders[0].id,
            totalAmount: response.orders[0].total_amount,
            paymentOrderId: paymentOrder.payment_session_id || paymentOrder.id,
            provider
          });
          setShowMockModal(true);
          setLoading(false);
          return;
        }

        const scriptLoaded = await provider.loadScript();
        if (!scriptLoaded) {
          alert('Failed to load payment gateway script. Please try again or check your connection.');
          setLoading(false);
          return;
        }

        if (activeProviderName === 'Cashfree') {
          // Trigger Cashfree SDK Web Checkout redirect
          const cashfree = window.Cashfree({
            mode: process.env.NEXT_PUBLIC_CASHFREE_ENV === 'PRODUCTION' ? 'production' : 'sandbox'
          });
          console.log('🔄 [Checkout]: Redirecting to Cashfree checkout...');
          cashfree.checkout({
            paymentSessionId: paymentOrder.payment_session_id
          });
          return;
        }

        // Razorpay Payment Gateway options
        const options = {
          key: provider.keyId,
          amount: paymentOrder.amount,
          currency: paymentOrder.currency,
          name: storeDetails.name,
          description: `Order #${response.orders[0].id.slice(0, 8).toUpperCase()}`,
          order_id: paymentOrder.id,
          handler: async function (paymentRes) {
            setLoading(true);
            try {
              const verified = await provider.verifyPaymentSignature(paymentRes);
              if (verified) {
                await orderService.updateOrderPayment(response.orders[0].id, {
                  paymentStatus: 'paid',
                  paymentProvider: 'Razorpay',
                  paymentId: paymentRes.razorpay_payment_id,
                  paymentOrderId: paymentRes.razorpay_order_id,
                  status: 'confirmed'
                });
                await removeCartItems(cart.map(item => item.id));
                router.push(`/store/${slug}/checkout/success?orderId=${response.orders[0].id}`);
              } else {
                alert('Signature verification failed. Payment was not authenticated.');
                router.push(`/store/${slug}/checkout/failed?orderId=${response.orders[0].id}`);
              }
            } catch (verErr) {
              console.error('Error during signature verification:', verErr);
              router.push(`/store/${slug}/checkout/failed?orderId=${response.orders[0].id}&error=${encodeURIComponent(verErr.message)}`);
            } finally {
              setLoading(false);
            }
          },
          prefill: {
            name: form.name,
            email: form.email,
            contact: form.phone
          },
          theme: {
            color: '#8b5cf6'
          },
          modal: {
            ondismiss: function () {
              console.log('Payment window closed by user.');
              router.push(`/store/${slug}/checkout/failed?orderId=${response.orders[0].id}`);
            }
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
      }
    } catch (err) {
      console.warn('⚠️ [Checkout] Failed to process checkout:', err);
      alert('Failed to place order: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMockSuccess = async (provider) => {
    setLoading(true);
    setShowMockModal(false);
    try {
      const mockDetails = {
        payment_order_id: mockPaymentData.paymentOrderId,
        payment_id: `cf_pay_mock_${Date.now()}`,
        // Keep Razorpay fields for legacy compatibility
        razorpay_order_id: mockPaymentData.paymentOrderId,
        razorpay_payment_id: `pay_mock_${Date.now()}`,
        razorpay_signature: `sig_mock_${Date.now()}`
      };
      const verified = await provider.verifyPaymentSignature(mockDetails);
      if (verified) {
        await orderService.updateOrderPayment(mockPaymentData.orderId, {
          paymentStatus: 'paid',
          paymentProvider: provider.name,
          paymentId: provider.name === 'Cashfree' ? mockDetails.payment_id : mockDetails.razorpay_payment_id,
          paymentOrderId: provider.name === 'Cashfree' ? mockDetails.payment_order_id : mockDetails.razorpay_order_id,
          status: 'confirmed'
        });
        await removeCartItems(cart.map(item => item.id));
        router.push(`/store/${slug}/checkout/success?orderId=${mockPaymentData.orderId}`);
      } else {
        router.push(`/store/${slug}/checkout/failed?orderId=${mockPaymentData.orderId}`);
      }
    } catch (err) {
      console.error('Mock payment error:', err);
      router.push(`/store/${slug}/checkout/failed?orderId=${mockPaymentData.orderId}&error=${encodeURIComponent(err.message)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMockFailure = async (provider) => {
    setLoading(true);
    setShowMockModal(false);
    try {
      await orderService.updateOrderPayment(mockPaymentData.orderId, {
        paymentStatus: 'failed',
        paymentProvider: provider.name,
        status: 'awaiting_payment'
      });
      router.push(`/store/${slug}/checkout/failed?orderId=${mockPaymentData.orderId}`);
    } catch (err) {
      console.error('Mock failure error:', err);
      router.push(`/store/${slug}/checkout/failed?orderId=${mockPaymentData.orderId}`);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="checkout-page">
        <Navbar storeName={storeDetails?.name} logoUrl={storeDetails?.logo_url || storeDetails?.logo} />
        <main className="container success-container fade-in">
          <div className="success-card dashboard-card">
            <div className="success-icon">🎉</div>
            <h1>Purchase Completed!</h1>
            <p className="success-lead">Thank you for ordering from <strong>{storeDetails?.name}</strong>! Your order is registered and is being processed by the creator.</p>
            
            <div className="orders-summary-box">
              <h3>Order Details</h3>
              <div className="order-summary-item">
                <span className="order-num">Order ID</span>
                <span className="order-val">#{String(placedOrder?.id || '').slice(0, 8).toUpperCase()}</span>
              </div>
              <div className="order-summary-item">
                <span className="order-num">Total Charged</span>
                <span className="order-val">₹{parseFloat(placedOrder?.total_amount || 0).toFixed(2)}</span>
              </div>
              <div className="order-summary-item">
                <span className="order-num">Status</span>
                <span className="order-status-badge">Pending</span>
              </div>
            </div>

            <div className="action-row">
              <Link href={`/store/${slug}`} className="primary-btn">Back to Shop</Link>
              <Link href={slug ? `/customer/orders?store=${slug}` : "/customer/orders"} className="secondary-btn">Track Order History</Link>
            </div>
          </div>
        </main>
        <Footer storeName={storeDetails?.name} />
        <style jsx>{`
          .success-container {
            padding-top: 140px;
            padding-bottom: 80px;
            display: flex;
            justify-content: center;
          }
          .success-card {
            max-width: 640px;
            width: 100%;
            background: var(--white);
            text-align: center;
            padding: 50px 40px;
            border-radius: 24px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.02);
            border: 1px solid var(--secondary);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
          }
          .success-icon {
            font-size: 64px;
          }
          h1 {
            font-size: 32px;
            font-weight: 800;
            color: var(--text-main);
          }
          .success-lead {
            color: var(--text-sub);
            line-height: 1.6;
            font-size: 15px;
          }
          .orders-summary-box {
            width: 100%;
            background: var(--bg-main);
            border-radius: 16px;
            padding: 20px;
            margin: 10px 0;
            text-align: left;
          }
          .orders-summary-box h3 {
            font-size: 15px;
            font-weight: 700;
            margin-bottom: 12px;
            color: var(--text-main);
            border-bottom: 1px solid var(--secondary);
            padding-bottom: 8px;
          }
          .order-summary-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            font-size: 14px;
          }
          .order-num {
            font-weight: 600;
            color: var(--text-sub);
          }
          .order-val {
            font-weight: 700;
            color: var(--text-main);
          }
          .order-status-badge {
            font-size: 11px;
            background: #fffbeb;
            color: #b45309;
            padding: 2px 8px;
            border-radius: 99px;
            font-weight: 700;
          }
          .action-row {
            display: flex;
            gap: 16px;
            margin-top: 10px;
            width: 100%;
          }
          .primary-btn, .secondary-btn {
            flex: 1;
            padding: 14px;
            border-radius: 12px;
            font-weight: 700;
            text-align: center;
            transition: var(--transition-smooth);
            text-decoration: none;
            font-size: 14px;
          }
          .primary-btn {
            background: var(--primary);
            color: var(--white);
          }
          .primary-btn:hover {
            background: var(--accent);
            transform: translateY(-1px);
          }
          .secondary-btn {
            background: var(--bg-main);
            color: var(--text-main);
            border: 1px solid var(--secondary);
          }
          .secondary-btn:hover {
            background: var(--secondary);
            transform: translateY(-1px);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <Navbar storeName={storeDetails?.name} logoUrl={storeDetails?.logo_url || storeDetails?.logo} />

      <main className="container main-content">
        <h1 className="page-title">Secure Checkout</h1>

        {cart.length === 0 ? (
          <div className="empty-cart dashboard-card fade-in">
            <div className="empty-icon">🛍️</div>
            <h2>Nothing to checkout</h2>
            <p>Your cart is currently empty for this store. Explore our collection to add items before proceeding.</p>
            <Link href={`/store/${slug}`} className="shop-btn">Continue Shopping</Link>
          </div>
        ) : (
          <div className="checkout-layout">
            <form onSubmit={handleFormSubmit} className="checkout-form dashboard-card fade-in">
              <h2 className="section-title">Shipping & Contact Details</h2>

              {savedAddresses.length > 0 && (
                <div className="address-selector">
                  <h3 className="address-selector-title">Select Shipping Address</h3>
                  <div className="address-cards-grid">
                    {savedAddresses.map(addr => (
                      <div 
                        key={addr.id} 
                        className={`address-card-option ${selectedAddressId === addr.id ? 'selected' : ''}`}
                        onClick={() => handleSelectSavedAddress(addr)}
                      >
                        <div className="address-card-header">
                          <span className="address-badge">{addr.name || 'Address'}</span>
                          {addr.is_default && <span className="default-indicator-dot"></span>}
                        </div>
                        <div className="address-card-body">
                          <h4>{addr.full_name}</h4>
                          <p>{addr.address_line_1}</p>
                          {addr.address_line_2 && <p>{addr.address_line_2}</p>}
                          <p>{addr.city}, {addr.state} - {addr.postal_code}</p>
                          <p className="addr-phone-text">📞 {addr.phone}</p>
                        </div>
                      </div>
                    ))}
                    
                    <div 
                      className={`address-card-option new-address-card-option ${selectedAddressId === 'new' ? 'selected' : ''}`}
                      onClick={handleSelectNewAddress}
                    >
                      <span className="plus-icon">+</span>
                      <p>Use New Address</p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="form-group">
                <label>Full Name</label>
                <input 
                  type="text" 
                  name="name" 
                  value={form.name} 
                  onChange={handleInputChange} 
                  placeholder="e.g. John Doe"
                  className={errors.name ? 'error-input' : ''}
                />
                {errors.name && <span className="error-text">{errors.name}</span>}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Email Address</label>
                  <input 
                    type="email" 
                    name="email" 
                    value={form.email} 
                    onChange={handleInputChange} 
                    placeholder="john@example.com"
                    className={errors.email ? 'error-input' : ''}
                  />
                  {errors.email && <span className="error-text">{errors.email}</span>}
                </div>
                
                <div className="form-group">
                  <label>Phone Number</label>
                  <input 
                    type="tel" 
                    name="phone" 
                    value={form.phone} 
                    onChange={handleInputChange} 
                    placeholder="+1 234 567 8900"
                    className={errors.phone ? 'error-input' : ''}
                  />
                  {errors.phone && <span className="error-text">{errors.phone}</span>}
                </div>
              </div>

              <div className="form-group">
                <label>Shipping Address (Line 1)</label>
                <textarea 
                  name="address" 
                  value={form.address} 
                  onChange={handleInputChange} 
                  placeholder="Street name, apartment, building no..."
                  rows="2"
                  className={errors.address ? 'error-input' : ''}
                />
                {errors.address && <span className="error-text">{errors.address}</span>}
              </div>


              <div className="form-grid">
                <div className="form-group">
                  <label>City</label>
                  <input 
                    type="text" 
                    name="city" 
                    value={form.city} 
                    onChange={handleInputChange} 
                    placeholder="e.g. San Francisco"
                    className={errors.city ? 'error-input' : ''}
                  />
                  {errors.city && <span className="error-text">{errors.city}</span>}
                </div>

                <div className="form-group">
                  <label>State</label>
                  <input 
                    type="text" 
                    name="state" 
                    value={form.state} 
                    onChange={handleInputChange} 
                    placeholder="e.g. California"
                    className={errors.state ? 'error-input' : ''}
                  />
                  {errors.state && <span className="error-text">{errors.state}</span>}
                </div>

                <div className="form-group">
                  <label>Pincode / Zipcode</label>
                  <input 
                    type="text" 
                    name="pincode" 
                    value={form.pincode} 
                    onChange={handleInputChange} 
                    placeholder="e.g. 94103"
                    className={errors.pincode ? 'error-input' : ''}
                  />
                  {errors.pincode && <span className="error-text">{errors.pincode}</span>}
                </div>

                <div className="form-group">
                  <label>Country</label>
                  <input 
                    type="text" 
                    name="country" 
                    value={form.country} 
                    onChange={handleInputChange} 
                    placeholder="e.g. India"
                    className={errors.country ? 'error-input' : ''}
                  />
                  {errors.country && <span className="error-text">{errors.country}</span>}
                </div>
              </div>

              {/* Payment Method Selector */}
              {storeDetails?.theme_settings?.enableCOD !== false && (
                <div className="payment-method-section" style={{ marginTop: '24px', marginBottom: '24px' }}>
                  <h3 className="address-selector-title" style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', marginBottom: '12px' }}>Choose Payment Method</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div 
                      onClick={() => setPaymentMethod('online')}
                      style={{
                        border: paymentMethod === 'online' ? '2px solid #8b5cf6' : '1px solid #e2e8f0',
                        background: paymentMethod === 'online' ? '#f5f3ff' : '#fff',
                        padding: '16px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <input 
                        type="radio" 
                        name="paymentMethodRadio" 
                        checked={paymentMethod === 'online'}
                        onChange={() => setPaymentMethod('online')}
                        style={{ accentColor: '#8b5cf6', width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <div>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>Online Payment</h4>
                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>UPI, Cards, Wallets, NetBanking</p>
                      </div>
                    </div>

                    <div 
                      onClick={() => setPaymentMethod('cod')}
                      style={{
                        border: paymentMethod === 'cod' ? '2px solid #8b5cf6' : '1px solid #e2e8f0',
                        background: paymentMethod === 'cod' ? '#f5f3ff' : '#fff',
                        padding: '16px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <input 
                        type="radio" 
                        name="paymentMethodRadio" 
                        checked={paymentMethod === 'cod'}
                        onChange={() => setPaymentMethod('cod')}
                        style={{ accentColor: '#8b5cf6', width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <div>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>Cash on Delivery (COD)</h4>
                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>Pay in cash/UPI upon delivery</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <button type="submit" className="submit-order-btn" disabled={loading}>
                {loading ? 'Processing Your Purchase...' : 'Complete Order'}
              </button>
            </form>

            <div className="summary-section dashboard-card fade-in">
              <h2 className="summary-title">Order Summary</h2>

              <div className="cart-items-preview">
                {cart.map((item) => (
                  <div key={item.id} className="preview-item">
                    <img src={item.image} alt={item.name} />
                    <div className="preview-details">
                      <h3>{item.name}</h3>
                      <span className="qty-price">{item.quantity} × ₹{item.price.toLocaleString()}</span>
                    </div>
                    <span className="preview-total">₹{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {/* Coupon Form & Available Coupons */}
              <div className="coupon-section">
                {!appliedCoupon ? (
                  <>
                    <form onSubmit={handleApplyCoupon} className="coupon-form">
                      <input
                        type="text"
                        placeholder="Promo Code"
                        value={couponCodeInput}
                        onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                        className="coupon-input"
                      />
                      <button type="submit" className="coupon-apply-btn">Apply</button>
                    </form>
                    
                    {availableCoupons.length > 0 && (
                      <div className="available-coupons-container">
                        <span className="available-title">Available Offers:</span>
                        <div className="coupons-grid">
                          {availableCoupons.map((cop) => {
                            const isEligible = cartTotal >= (cop.minimum_order_amount || 0);
                            const minDiff = cop.minimum_order_amount - cartTotal;
                            
                            return (
                              <div 
                                key={cop.id} 
                                className={`coupon-offer-card ${isEligible ? 'eligible' : 'locked'}`}
                                onClick={() => {
                                  if (isEligible) {
                                    setCouponCodeInput(cop.code);
                                    handleSelectCoupon(cop);
                                  }
                                }}
                              >
                                <div className="offer-header">
                                  <span className="offer-code">{cop.code}</span>
                                  <span className="offer-val">
                                    {cop.discount_type === 'percentage' ? `${cop.discount_value}% OFF` : `₹${cop.discount_value} OFF`}
                                  </span>
                                </div>
                                <div className="offer-footer">
                                  {cop.minimum_order_amount > 0 ? (
                                    isEligible ? (
                                      <span className="offer-terms">Min order ₹{cop.minimum_order_amount} met!</span>
                                    ) : (
                                      <span className="offer-terms-locked">Add ₹{Math.ceil(minDiff)} more to unlock</span>
                                    )
                                  ) : (
                                    <span className="offer-terms">No minimum order required</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="applied-coupon-badge">
                    <span className="coupon-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2zM12 7v10M9 12h6"></path></svg>
                    </span>
                    <span className="coupon-text">{appliedCoupon.code} applied</span>
                    <button type="button" onClick={handleRemoveCoupon} className="remove-coupon-btn">&times;</button>
                  </div>
                )}
                {couponError && <p className="coupon-error-msg">{couponError}</p>}
              </div>

              <div className="summary-totals">
                <div className="sum-row">
                  <span>Subtotal</span>
                  <span>₹{cartTotal.toLocaleString()}</span>
                </div>
                {appliedCoupon && isCouponValidForTotal && (
                  <div className="sum-row discount">
                    <span>Discount ({appliedCoupon.discount_type === 'percentage' ? `${appliedCoupon.discount_value}%` : 'Flat'})</span>
                    <span className="discount-amount">-₹{discount.toLocaleString()}</span>
                  </div>
                )}
                <div className="sum-row">
                  <span>Tax (8%)</span>
                  <span>₹{tax.toLocaleString()}</span>
                </div>
                <div className="sum-row">
                  <span>Shipping</span>
                  <span className={shippingCost === 0 ? "free" : ""}>
                    {shippingCost === 0 ? "FREE" : `₹${shippingCost.toLocaleString()}`}
                  </span>
                </div>
                <div className="sum-row grand-total">
                  <span>Total</span>
                  <span>₹{total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer storeName={storeDetails?.name} />

      <style jsx>{`
        /* Address Selector Styling */
        .address-selector {
          margin-bottom: 20px;
          border-bottom: 1px solid var(--secondary);
          padding-bottom: 24px;
        }
        .address-selector-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-main);
          margin-bottom: 14px;
          letter-spacing: -0.2px;
        }
        .address-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }
        .address-card-option {
          border: 1.5px solid var(--secondary);
          border-radius: 14px;
          padding: 16px;
          background: var(--bg-main);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          flex-direction: column;
          gap: 10px;
          position: relative;
          min-height: 140px;
        }
        .address-card-option:hover {
          border-color: var(--text-sub);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
        }
        .address-card-option.selected {
          border-color: var(--primary);
          background: var(--white);
          box-shadow: 0 0 0 1px var(--primary), 0 8px 20px rgba(139, 92, 246, 0.05);
        }
        .address-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .address-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          background: rgba(0, 0, 0, 0.04);
          color: var(--text-sub);
          padding: 3px 8px;
          border-radius: 6px;
        }
        .address-card-option.selected .address-badge {
          background: var(--primary);
          color: var(--white);
        }
        .default-indicator-dot {
          width: 8px;
          height: 8px;
          background: #10b981;
          border-radius: 50%;
          box-shadow: 0 0 8px #10b981;
        }
        .address-card-body {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .address-card-body h4 {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-main);
          margin-bottom: 2px;
        }
        .address-card-body p {
          font-size: 12px;
          color: var(--text-sub);
          line-height: 1.4;
          margin: 0;
        }
        .addr-phone-text {
          margin-top: 4px !important;
          font-weight: 600;
          color: var(--text-main) !important;
        }
        .new-address-card-option {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          border: 1.5px dashed var(--text-sub);
          background: transparent;
        }
        .new-address-card-option .plus-icon {
          font-size: 24px;
          color: var(--text-sub);
          font-weight: 300;
        }
        .new-address-card-option p {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-main);
          margin: 0;
        }
        .new-address-card-option.selected {
          border-style: solid;
          background: var(--white);
        }

        .checkout-page {
          background: var(--bg-main);
          min-height: 100vh;
        }
        .main-content {
          padding-top: 140px;
          padding-bottom: 80px;
        }
        .page-title {
          font-size: 36px;
          font-weight: 700;
          margin-bottom: 40px;
          letter-spacing: -1px;
        }
        .empty-cart {
          text-align: center;
          padding: 100px 40px;
          background: var(--white);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }
        .empty-icon {
          font-size: 64px;
        }
        .empty-cart h2 {
          font-size: 28px;
          font-weight: 700;
        }
        .empty-cart p {
          color: var(--text-sub);
          max-width: 400px;
          line-height: 1.6;
        }
        .shop-btn {
          margin-top: 20px;
          padding: 14px 40px;
          background: var(--primary);
          color: var(--white);
          border-radius: 12px;
          font-weight: 700;
          transition: var(--transition-smooth);
        }
        .shop-btn:hover {
          background: var(--accent);
          transform: translateY(-2px);
        }
        .checkout-layout {
          display: grid;
          grid-template-columns: 1fr 400px;
          gap: 40px;
          align-items: start;
        }
        .checkout-form {
          background: var(--white);
          padding: 40px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .section-title {
          font-size: 22px;
          font-weight: 800;
          margin-bottom: 10px;
          color: var(--text-main);
        }
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 120px;
          gap: 20px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .form-group label {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-main);
        }
        .form-group input, .form-group textarea {
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid var(--secondary);
          background: var(--bg-main);
          font-size: 14px;
          outline: none;
          transition: var(--transition-smooth);
        }
        .form-group input:focus, .form-group textarea:focus {
          border-color: var(--primary);
          background: var(--white);
          box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.08);
        }
        .error-input {
          border-color: #ef4444 !important;
          background: #fef2f2 !important;
        }
        .error-text {
          font-size: 11px;
          color: #ef4444;
          font-weight: 600;
        }
        .submit-order-btn {
          margin-top: 10px;
          padding: 16px;
          background: var(--primary);
          color: var(--white);
          border-radius: 12px;
          font-weight: 700;
          font-size: 15px;
          transition: var(--transition-smooth);
          border: none;
          cursor: pointer;
        }
        .submit-order-btn:hover {
          background: var(--accent);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2);
        }
        .submit-order-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .summary-section {
          background: var(--white);
          padding: 40px;
        }
        .summary-title {
          font-size: 22px;
          font-weight: 800;
          margin-bottom: 24px;
          border-bottom: 1px solid var(--secondary);
          padding-bottom: 12px;
        }
        .cart-items-preview {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-bottom: 30px;
        }
        .preview-item {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .preview-item img {
          width: 60px;
          height: 60px;
          border-radius: 8px;
          object-fit: cover;
          background: var(--bg-main);
        }
        .preview-details {
          flex: 1;
        }
        .preview-details h3 {
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 4px;
        }
        .qty-price {
          font-size: 12px;
          color: var(--text-sub);
        }
        .preview-total {
          font-weight: 700;
          font-size: 14px;
        }
        .summary-totals {
          display: flex;
          flex-direction: column;
          gap: 16px;
          border-top: 1px solid var(--secondary);
          padding-top: 24px;
        }
        .sum-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          color: var(--text-sub);
        }
        .sum-row.grand-total {
          border-top: 1.5px dashed var(--secondary);
          padding-top: 16px;
          font-size: 20px;
          font-weight: 800;
          color: var(--text-main);
        }
        .free {
          color: #10b981;
          font-weight: 700;
        }
        @media (max-width: 991px) {
          .checkout-layout {
            grid-template-columns: 1fr;
            gap: 24px;
          }
        }
        @media (max-width: 768px) {
          .main-content {
            padding-top: 80px !important;
            padding-bottom: 40px !important;
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
          .page-title {
            font-size: 24px !important;
            margin-bottom: 20px !important;
          }
          .checkout-form, .summary-section {
            padding: 16px !important;
            border-radius: 16px !important;
          }
          .summary-section {
            border: 1px solid rgba(0, 0, 0, 0.06) !important;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02) !important;
          }
          .form-row, .form-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .address-cards-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .coupons-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
          }
          .coupon-offer-card {
            padding: 8px 10px !important;
          }
        }

        /* Mock Modal Styling */
        .mock-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          font-family: 'Outfit', sans-serif;
          padding: 20px;
        }
        .mock-modal-card {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 36px;
          max-width: 460px;
          width: 100%;
          color: #fff;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          gap: 24px;
          animation: modalAppear 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes modalAppear {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .mock-chip {
          background: #fbbf24;
          color: #78350f;
          font-size: 10px;
          font-weight: 800;
          padding: 4px 10px;
          border-radius: 99px;
          letter-spacing: 0.5px;
          display: inline-block;
          margin-bottom: 12px;
        }
        .mock-modal-header h2 {
          font-size: 22px;
          font-weight: 800;
          margin: 0 0 6px 0;
        }
        .mock-order-ref {
          color: #94a3b8;
          font-size: 13px;
          margin: 0;
        }
        .mock-amount-box {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 20px;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .mock-amount-label {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 600;
          text-transform: uppercase;
        }
        .mock-amount-val {
          font-size: 32px;
          font-weight: 800;
          color: #38bdf8;
        }
        .mock-warning-note {
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.6;
          margin: 16px 0 0 0;
          text-align: center;
        }
        .mock-modal-footer {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .mock-btn-success, .mock-btn-failed {
          padding: 14px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          width: 100%;
        }
        .mock-btn-success {
          background: #10b981;
          color: #fff;
        }
        .mock-btn-success:hover {
          background: #059669;
          transform: translateY(-1px);
        }
        .mock-btn-failed {
          background: transparent;
          color: #f43f5e;
          border: 1.5px solid #f43f5e;
        }
        .mock-btn-failed:hover {
          background: rgba(244, 63, 94, 0.05);
          transform: translateY(-1px);
        }
        
        /* Coupon Section Styles */
        .coupon-section {
          margin-top: 20px;
          margin-bottom: 20px;
          border-top: 1px solid var(--secondary);
          padding-top: 20px;
        }
        .coupon-form {
          display: flex;
          gap: 10px;
        }
        .coupon-input {
          flex: 1;
          height: 42px;
          border: 1.5px solid var(--secondary);
          border-radius: 10px;
          padding: 0 14px;
          font-size: 14px;
          font-family: monospace;
          font-weight: 700;
          text-transform: uppercase;
          background: var(--bg-main);
          color: var(--text-main);
          outline: none;
          transition: all 0.2s;
        }
        .coupon-input:focus {
          border-color: var(--primary);
          background: var(--white);
        }
        .coupon-apply-btn {
          height: 42px;
          padding: 0 18px;
          background: var(--primary);
          color: var(--white);
          border: none;
          border-radius: 10px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .coupon-apply-btn:hover {
          opacity: 0.9;
        }
        .applied-coupon-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f5f3ff;
          border: 1px solid #e0e7ff;
          padding: 8px 14px;
          border-radius: 10px;
          color: #6366f1;
        }
        .coupon-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .coupon-text {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: -0.1px;
          flex: 1;
        }
        .remove-coupon-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s;
        }
        .remove-coupon-btn:hover {
          color: #ef4444;
        }
        .coupon-error-msg {
          font-size: 12px;
          color: #ef4444;
          font-weight: 600;
          margin: 6px 0 0 0;
        }
        .discount-amount {
          color: #10b981;
          font-weight: 700;
        }
        
        /* Available Coupons Styling */
        .available-coupons-container {
          margin-top: 14px;
        }
        .available-title {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-sub);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: block;
          margin-bottom: 8px;
        }
        .coupons-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 10px;
        }
        .coupon-offer-card {
          border: 1.5px dashed var(--secondary);
          border-radius: 12px;
          padding: 10px 12px;
          background: var(--bg-main);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .coupon-offer-card.eligible {
          border-color: #8b5cf6;
          background: rgba(139, 92, 246, 0.02);
          cursor: pointer;
        }
        .coupon-offer-card.eligible:hover {
          border-style: solid;
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(139, 92, 246, 0.1);
          background: rgba(139, 92, 246, 0.05);
        }
        .coupon-offer-card.locked {
          opacity: 0.65;
          cursor: not-allowed;
          background: #f8fafc;
        }
        .offer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .offer-code {
          font-family: monospace;
          font-weight: 700;
          color: #6366f1;
          font-size: 13px;
        }
        .coupon-offer-card.locked .offer-code {
          color: #94a3b8;
        }
        .offer-val {
          font-size: 11px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 6px;
          background: #ecfdf5;
          color: #10b981;
        }
        .coupon-offer-card.locked .offer-val {
          background: #e2e8f0;
          color: #64748b;
        }
        .offer-footer {
          font-size: 10px;
          font-weight: 600;
        }
        .offer-terms {
          color: #64748b;
        }
        .coupon-offer-card.eligible .offer-terms {
          color: #10b981;
        }
        .offer-terms-locked {
          color: #f43f5e;
        }
      `}</style>

      {showMockModal && mockPaymentData && (
        <div className="mock-modal-overlay">
          <div className="mock-modal-card">
            <div className="mock-modal-header">
              <span className="mock-chip">SANDBOX MODE</span>
              <h2>Mock Payment Gateway</h2>
              <p className="mock-order-ref">Order ID: #{mockPaymentData.orderId.slice(0, 8).toUpperCase()}</p>
            </div>
            
            <div className="mock-modal-body">
              <div className="mock-amount-box">
                <span className="mock-amount-label">Total Amount to Pay</span>
                <span className="mock-amount-val">₹{parseFloat(mockPaymentData.totalAmount || 0).toFixed(2)}</span>
              </div>
              <p className="mock-warning-note">
                This is a simulated checkout. Real credentials are not configured. You can simulate either a successful or failed payment authorization.
              </p>
            </div>
            
            <div className="mock-modal-footer">
              <button 
                onClick={() => handleMockSuccess(mockPaymentData.provider)} 
                className="mock-btn-success"
                disabled={loading}
              >
                Simulate Successful Payment
              </button>
              <button 
                onClick={() => handleMockFailure(mockPaymentData.provider)} 
                className="mock-btn-failed"
                disabled={loading}
              >
                Simulate Failed Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
