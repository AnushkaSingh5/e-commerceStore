'use client';

import Link from 'next/link';
import { useStore } from '@/context/StoreContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function CartPage() {
  const { cart, cartTotal, updateQuantity, removeFromCart, clearCart } = useStore();

  // Cart displays pure product subtotal. Shipping is calculated only at checkout.
  const total = cartTotal;
  const hasInventoryErrors = cart.some(item => item.is_deleted);

  return (
    <div className="cart-page">
      <Navbar />

      <main className="container main-content">
        <h1 className="page-title">Shopping Cart</h1>
        
        {cart.length === 0 ? (
          <div className="empty-cart dashboard-card fade-in">
            <div className="empty-icon">🛍️</div>
            <h2>Your cart is empty</h2>
            <p>Looks like you haven&apos;t added anything yet. Explore our collection to find something you love.</p>
            <Link href="/" className="shop-btn">Continue Shopping</Link>
          </div>
        ) : (
          <div className="cart-layout">
            <div className="cart-items dashboard-card fade-in">
              <div className="items-header">
                <span>Product</span>
                <span>Quantity</span>
                <span>Total</span>
                <span></span>
              </div>
              
              {cart.map((item) => (
                <div key={item.id} className={`cart-item ${item.is_deleted ? 'unavailable' : ''}`} style={{ position: 'relative' }}>
                  {item.is_deleted && (
                    <div className="product-unavailable-overlay">
                      <span>Product is not available</span>
                    </div>
                  )}

                  <div className="item-info">
                    <div className="item-image">
                      <img src={item.image} alt={item.name} />
                      <button className="mobile-remove-btn" onClick={() => removeFromCart(item.id)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                      </button>
                    </div>
                    <div className="item-details">
                      <h3>{item.name}</h3>
                      <p className="category">{item.category}</p>
                      <p className="price">₹{item.price.toLocaleString()}</p>
                      {item.is_deleted && (
                        <p className="stock-warning out-of-stock" style={{ color: '#ef4444', fontWeight: 600, fontSize: '12px', marginTop: '4px' }}>Unavailable</p>
                      )}
                    </div>
                  </div>

                  <div className="item-quantity">
                    <div className="quantity-selector">
                      <button onClick={() => updateQuantity(item.id, -1)} disabled={item.is_deleted}>-</button>
                      <span>{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} disabled={item.is_deleted}>+</button>
                    </div>
                  </div>

                  <div className="item-total">
                    ₹{(item.price * item.quantity).toLocaleString()}
                  </div>

                  <button className="remove-btn" onClick={() => removeFromCart(item.id)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                  </button>
                </div>
              ))}

              <div className="cart-footer">
                <button className="clear-btn" onClick={clearCart}>Clear Cart</button>
                <Link href="/" className="back-link">← Continue Shopping</Link>
              </div>
            </div>

            <div className="cart-summary dashboard-card fade-in">
              <h2 className="summary-title">Order Summary</h2>
              
              <div className="summary-row">
                <span>Subtotal</span>
                <span>₹{cartTotal.toLocaleString()}</span>
              </div>
              
              <div className="summary-total">
                <span>Total</span>
                <span>₹{total.toLocaleString()}</span>
              </div>

              <p style={{ fontSize: '12px', color: 'var(--text-sub)', margin: '8px 0 16px', textAlign: 'center' }}>
                Taxes & shipping calculated at checkout
              </p>

              {hasInventoryErrors ? (
                <button className="checkout-btn disabled-btn" disabled style={{ width: '100%', border: 'none', cursor: 'not-allowed' }}>
                  Proceed to Checkout
                </button>
              ) : (
                <Link href="/checkout" className="checkout-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                  Proceed to Checkout
                </Link>
              )}
              
              <div className="payment-icons">
                <span>Secure payments via</span>
                <div className="icons" style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '10px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-sub)' }} title="Credit Card"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-sub)' }} title="Net Banking"><path d="M3 22h18"></path><path d="M6 18v-7"></path><path d="M10 18v-7"></path><path d="M14 18v-7"></path><path d="M18 18v-7"></path><path d="M12 2L2 7h20L12 2z"></path></svg>
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-sub)' }} title="Cash on Delivery"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />

      <style jsx>{`
        .cart-page {
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

        .cart-layout {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 40px;
          align-items: start;
        }

        .cart-items {
          background: var(--white);
          padding: 0;
        }

        .items-header {
          display: grid;
          grid-template-columns: 1fr 140px 100px 60px;
          gap: 40px;
          padding: 24px 40px;
          border-bottom: 1px solid var(--secondary);
          font-size: 13px;
          font-weight: 700;
          color: var(--text-sub);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .cart-item {
          display: grid;
          grid-template-columns: 1fr 140px 100px 60px;
          gap: 40px;
          align-items: center;
          padding: 30px 40px;
          border-bottom: 1px solid var(--secondary);
        }

        .cart-item.unavailable .item-info,
        .cart-item.unavailable .item-quantity,
        .cart-item.unavailable .item-total {
          filter: grayscale(1) opacity(0.55);
        }

        .cart-item.unavailable .item-quantity,
        .cart-item.unavailable .item-total {
          pointer-events: none;
        }

        .product-unavailable-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          pointer-events: none;
          z-index: 10;
        }

        .product-unavailable-overlay span {
          color: #dc2626;
          font-weight: 800;
          font-size: 14px;
          background: #fee2e2;
          padding: 8px 16px;
          border-radius: 30px;
          border: 1px solid #fecaca;
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.1);
        }

        .cart-item:hover .product-unavailable-overlay {
          opacity: 1;
        }

        .item-info {
          display: flex;
          gap: 24px;
          align-items: center;
        }

        .item-image {
          width: 100px;
          height: 100px;
          border-radius: 12px;
          overflow: hidden;
          background: var(--bg-main);
          flex-shrink: 0;
        }

        .item-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .item-details {
          flex: 1;
        }

        .item-details h3 {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .item-details .category {
          font-size: 13px;
          color: var(--text-sub);
          margin-bottom: 8px;
        }

        .item-details .price {
          font-weight: 700;
          color: var(--accent);
        }

        .quantity-selector {
          display: flex;
          align-items: center;
          background: var(--bg-main);
          border-radius: 10px;
          padding: 4px;
          width: 120px;
          justify-content: space-between;
          margin: 0 auto;
        }

        .quantity-selector button {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
        }

        .quantity-selector span {
          width: 40px;
          text-align: center;
          font-size: 14px;
          font-weight: 700;
        }

        .item-total {
          font-weight: 700;
          font-size: 18px;
        }

        .remove-btn {
          color: #ef4444;
          opacity: 0.6;
          transition: var(--transition-fast);
        }

        .remove-btn:hover {
          opacity: 1;
          transform: scale(1.1);
        }

        .mobile-remove-btn {
          display: none;
        }

        .cart-footer {
          padding: 30px 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .clear-btn {
          font-size: 14px;
          font-weight: 600;
          color: #ef4444;
        }

        .back-link {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-main);
        }

        .cart-summary {
          background: var(--white);
          padding: 40px;
          position: sticky;
          top: 120px;
        }

        .summary-title {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 30px;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 16px;
          font-size: 15px;
          color: var(--text-sub);
        }

        .summary-row .free {
          color: #22c55e;
          font-weight: 700;
        }

        .summary-total {
          display: flex;
          justify-content: space-between;
          margin-top: 24px;
          padding-top: 24px;
          border-top: 2px solid var(--secondary);
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 40px;
        }

        .checkout-btn {
          width: 100%;
          padding: 16px;
          background: var(--primary);
          color: white;
          border-radius: 12px;
          font-weight: 700;
          font-size: 16px;
          margin-bottom: 24px;
          transition: var(--transition-smooth);
        }

        .checkout-btn:hover {
          background: var(--accent);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .payment-icons {
          text-align: center;
          font-size: 13px;
          color: var(--text-sub);
        }

        .payment-icons .icons {
          font-size: 24px;
          margin-top: 8px;
        }

        @media (max-width: 1200px) {
          .cart-layout {
            grid-template-columns: 1fr;
          }
          .cart-summary {
            position: static;
          }
        }

        @media (max-width: 768px) {
          .items-header {
            display: none;
          }
          .cart-item {
            grid-template-columns: 1fr;
            gap: 20px;
            padding: 24px;
            position: relative;
          }
          .item-info {
            flex-direction: column;
            text-align: center;
          }
          .item-image {
            width: 100%;
            max-width: 120px;
            height: auto;
            aspect-ratio: 1/1;
            margin: 0 auto;
            position: relative;
          }
          .mobile-remove-btn {
            display: flex;
            position: absolute;
            top: 8px;
            right: 8px;
            color: #ef4444;
            background: rgba(255, 255, 255, 0.9);
            border-radius: 50%;
            padding: 6px;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: var(--transition-fast);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .item-image:hover .mobile-remove-btn {
            opacity: 1;
          }
          .item-quantity, .item-total {
            justify-self: center;
          }
          .remove-btn {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
