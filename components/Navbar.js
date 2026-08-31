'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useStore } from '@/context/StoreContext';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { demoStores } from '@/lib/demoData';

export default function Navbar({ storeName, logoUrl, storeSlug: propStoreSlug }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const { cart, wishlist, searchQuery, setSearchQuery } = useStore();
  const { customer, customerProfile, logout, loginWithProvider } = useCustomerAuth();
  const user = customer;
  const profile = customerProfile;
  const signOut = logout;
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const [clientStoreSlug, setClientStoreSlug] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const qStore = params.get('store');
      const stored = localStorage.getItem('last_visited_store');
      if (qStore) {
        setClientStoreSlug(qStore);
      } else if (stored) {
        setClientStoreSlug(stored);
      }
    }
  }, [pathname]);

  const pathParts = pathname ? pathname.split('/') : [];
  const isDemo = pathParts[1] === 'demo-store';
  const isStorePage = (pathParts[1] === 'store' || isDemo) && pathParts[2];

  const storeSlug = propStoreSlug || (isStorePage ? pathParts[2] : (clientStoreSlug || null));
  const isDemoStore = isDemo || (storeSlug && !!demoStores[storeSlug]);
  const storePrefix = isDemoStore ? 'demo-store' : 'store';
  const storeLogo = logoUrl || (isDemoStore && storeSlug ? demoStores[storeSlug]?.logo : null);
  const storeHomeUrl = storeSlug ? `/${storePrefix}/${storeSlug}` : "/";

  const currentStoreCart = storeSlug 
    ? (cart || []).filter(item => item.store_slug === storeSlug)
    : (cart || []);
  const storeCartCount = currentStoreCart.reduce((count, item) => count + item.quantity, 0);

  const currentStoreWishlist = storeSlug
    ? (wishlist || []).filter(item => item.store_slug === storeSlug)
    : (wishlist || []);
  const storeWishlistCount = currentStoreWishlist.length;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (storeSlug) {
      localStorage.setItem('last_visited_store', storeSlug);
    }
  }, [storeSlug]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isDropdownOpen && !event.target.closest('.user-dropdown-container')) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isDropdownOpen]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    // If user starts typing and is not on home page or products catalog page, redirect to home
    if (value.trim() !== '') {
      const homePath = storeSlug ? `/${pathParts[1]}/${storeSlug}` : '/';
      const productsPath = storeSlug ? `/${pathParts[1]}/${storeSlug}/products` : '/products';
      if (pathname !== homePath && pathname !== productsPath) {
        router.push(homePath);
      }
    }
  };

  const handleMenuClick = (targetId) => {
    if (pathname !== (storeSlug ? `/${pathParts[1]}/${storeSlug}` : '/')) {
      router.push(storeSlug ? `/${pathParts[1]}/${storeSlug}#${targetId}` : `/#${targetId}`);
      return;
    }
    
    if (targetId === 'shop') {
      setSearchQuery('');
      setSelectedCategory('All');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <header className={`navbar-wrapper ${isScrolled ? 'scrolled' : ''}`}>
      <nav className="container nav-container">
        <div className="nav-main">
          {isMobileSearchActive ? (
            <div className="mobile-search-active-wrapper" style={{ marginLeft: 0 }}>
              <button className="search-close-btn" onClick={() => setIsMobileSearchActive(false)} aria-label="Close search">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              </button>
              <form className="mobile-search-active-form" onSubmit={(e) => e.preventDefault()}>
                <input 
                  type="text" 
                  placeholder="Search products..." 
                  className="mobile-search-active-input"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  autoFocus
                />
                {searchQuery && (
                  <button className="search-clear-btn" type="button" onClick={() => setSearchQuery('')} aria-label="Clear search query">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                )}
              </form>
            </div>
          ) : (
            <>
              {/* Logo / Brand Name */}
              <Link href={storeHomeUrl} className="logo">
                {storeLogo ? (
                  <img 
                    src={storeLogo} 
                    alt={`${storeName} Logo`} 
                    className="logo-img" 
                    onError={(e) => { e.target.style.display = 'none'; }} 
                  />
                ) : (
                  <div className="logo-placeholder-dot"></div>
                )}
                <span>{storeName || 'AestheticStore'}</span>
              </Link>

              {/* Centered Desktop Search Bar */}
              <form className="search-container desktop-search" onSubmit={(e) => e.preventDefault()}>
                <input 
                  type="text" 
                  placeholder="Search products..." 
                  className="search-input"
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
                <button className="search-submit-btn" type="button" aria-label="Search">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </button>
              </form>

              {/* Right Action Area */}
              <div className="nav-actions-area">
                <div className="nav-icons">
                  {/* Mobile Search Button (only visible on mobile, placed BEFORE user profile dropdown) */}
                  <button 
                    className="action-btn mobile-search-btn"
                    onClick={() => setIsMobileSearchActive(true)}
                    aria-label="Search products"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  </button>

                  {(isStorePage || Boolean(storeSlug)) && (
                    <div className="user-dropdown-container">
                      <button 
                        className="action-btn user-btn"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        aria-label="User profile menu"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                      </button>
                      {isDropdownOpen && (
                        <div className="dropdown-menu">
                          {user ? (
                            <>
                              <div className="dropdown-profile-header">
                                <div className="profile-header-left">
                                  <div className="profile-avatar-circle">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b21a8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                  </div>
                                  <div className="profile-meta">
                                    <div className="profile-meta-name">{profile?.full_name || 'Customer'}</div>
                                    <div className="profile-meta-email">{user.email}</div>
                                  </div>
                                </div>
                              </div>

                              <div className="dropdown-items-list">
                                <Link href={storeSlug ? `/customer/profile?store=${storeSlug}` : "/customer/profile"} className="profile-list-item" onClick={() => setIsDropdownOpen(false)}>
                                  <div className="item-icon-box settings-box">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                  </div>
                                  <span className="item-title">Account Settings</span>
                                </Link>

                                <Link href={storeSlug ? `/customer/orders?store=${storeSlug}` : "/customer/orders"} className="profile-list-item" onClick={() => setIsDropdownOpen(false)}>
                                  <div className="item-icon-box orders-box">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                                  </div>
                                  <span className="item-title">My Orders</span>
                                </Link>

                                <Link href={storeSlug ? `/customer/addresses?store=${storeSlug}` : "/customer/addresses"} className="profile-list-item" onClick={() => setIsDropdownOpen(false)}>
                                  <div className="item-icon-box addresses-box">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                  </div>
                                  <span className="item-title">Saved Addresses</span>
                                </Link>
                              </div>

                              <div className="profile-logout-footer">
                                <button 
                                  className="profile-logout-item" 
                                  onClick={() => {
                                    signOut();
                                    setIsDropdownOpen(false);
                                  }}
                                >
                                  <div className="item-icon-box logout-box">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                                  </div>
                                  <span className="item-title logout-title">Sign Out</span>
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="logged-out-menu">
                              <div className="dropdown-header-welcome">
                                <div className="dropdown-welcome-title">Welcome to {storeName || 'AestheticStore'}</div>
                                <div className="dropdown-welcome-subtitle">Access your account, track orders, and shop securely.</div>
                              </div>
                              
                              <div className="dropdown-actions">
                                <Link 
                                  href={storeSlug && pathname ? `/customer/login?redirect=${encodeURIComponent(pathname)}` : "/customer/login"} 
                                  className="dropdown-primary-btn" 
                                  onClick={() => setIsDropdownOpen(false)}
                                >
                                  Sign In
                                </Link>
                                <Link 
                                  href={storeSlug && pathname ? `/customer/signup?redirect=${encodeURIComponent(pathname)}` : "/customer/signup"} 
                                  className="dropdown-secondary-btn" 
                                  onClick={() => setIsDropdownOpen(false)}
                                >
                                  Create Account
                                </Link>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <Link href={storeSlug ? `/${storePrefix}/${storeSlug}/wishlist` : "/wishlist"} className="action-btn wishlist-btn" aria-label="My Wishlist">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    {storeWishlistCount > 0 && <span className="badge">{storeWishlistCount}</span>}
                  </Link>
                  <Link href={storeSlug ? `/${storePrefix}/${storeSlug}/cart` : "/cart"} className="action-btn cart-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                    {storeCartCount > 0 && <span className="badge">{storeCartCount}</span>}
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </nav>

      <style jsx>{`
        .navbar-wrapper {
          position: fixed;
          top: ${pathname?.includes('/demo-store') ? '48px' : '0px'};
          left: 0;
          width: 100%;
          z-index: 1000;
          padding: 24px 0;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          background: transparent;
        }

        .navbar-wrapper.scrolled {
          padding: 16px 0;
          background: rgba(248, 250, 252, 0.95);
          backdrop-filter: blur(12px);
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.02);
          border-bottom: 1px solid rgba(0, 0, 0, 0.03);
        }

        @media (max-width: 900px) {
          .navbar-wrapper {
            top: ${pathname?.includes('/demo-store') ? '76px' : '0px'};
          }
        }

        .nav-container {
          margin: 0 auto;
          width: 100%;
        }

        .nav-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          gap: 20px;
        }

        :global(.logo) {
          font-size: 22px !important;
          font-weight: 700 !important;
          letter-spacing: -0.5px;
          color: #121212 !important;
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          gap: 10px !important;
          font-family: 'Outfit', sans-serif !important;
          text-decoration: none !important;
        }

        :global(.logo-img) {
          width: 36px !important;
          height: 36px !important;
          border-radius: 50% !important;
          object-fit: cover !important;
          border: 1px solid rgba(0, 0, 0, 0.06) !important;
          flex-shrink: 0 !important;
        }

        :global(.logo span) {
          font-weight: 700 !important;
        }

        :global(.logo-placeholder-dot) {
          width: 10px !important;
          height: 10px !important;
          background: #706f6c !important;
          border-radius: 50% !important;
        }

        /* Middle Links */
        .nav-links {
          display: flex;
          align-items: center;
          gap: 32px;
        }

        .nav-link-btn {
          font-size: 14px;
          font-weight: 500;
          color: #555350;
          transition: all 0.2s ease;
          position: relative;
          padding: 8px 0;
        }

        .nav-link-btn:hover {
          color: #121212;
        }

        .nav-link-btn::after {
          content: '';
          position: absolute;
          bottom: 2px;
          left: 0;
          width: 100%;
          height: 1.5px;
          background: #121212;
          transform: scaleX(0);
          transform-origin: right;
          transition: transform 0.25s ease;
        }

        .nav-link-btn:hover::after {
          transform: scaleX(1);
          transform-origin: left;
        }

        /* Right Actions */
        .nav-actions-area {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .search-container {
          position: relative;
          width: 550px;
          transition: width 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .search-container:focus-within {
          width: 760px;
        }

        .search-input {
          width: 100%;
          padding: 10px 44px 10px 20px;
          border-radius: 40px;
          border: 1px solid rgba(0, 0, 0, 0.04);
          background: #EFECE6;
          font-size: 13px;
          color: #121212;
          transition: all 0.25s ease;
        }

        .search-input:focus {
          outline: none;
          background: #f8fafc;
          border-color: #121212;
          box-shadow: 0 0 0 3px rgba(18, 18, 18, 0.05);
        }

        .search-submit-btn {
          position: absolute;
          right: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #706f6c;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .search-submit-btn:hover {
          color: #121212;
        }

        .nav-icons {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        :global(.action-btn) {
          width: 40px !important;
          height: 40px !important;
          border-radius: 50% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          color: #121212 !important;
          position: relative !important;
          transition: all 0.2s ease !important;
        }

        :global(.action-btn:hover) {
          background: rgba(0, 0, 0, 0.03) !important;
          transform: scale(1.05) !important;
        }

        :global(.badge) {
          position: absolute !important;
          top: 4px !important;
          right: 4px !important;
          background: #2563eb !important;
          color: #ffffff !important;
          font-size: 9px !important;
          font-weight: 700 !important;
          min-width: 16px !important;
          height: 16px !important;
          border-radius: 50% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: 1.5px solid #ffffff !important;
          z-index: 10 !important;
        }

        /* User Dropdown */
        .user-dropdown-container {
          position: relative;
        }

        :global(.dropdown-menu) {
          position: absolute;
          top: calc(100% + 12px);
          right: 0;
          width: 280px;
          border-radius: 20px;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.05);
          box-shadow: 0 15px 40px rgba(0, 0, 0, 0.06);
          padding: 16px;
          display: flex;
          flex-direction: column;
          z-index: 1100;
          animation: dropdownFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        :global(.dropdown-icon) {
          margin-right: 8px;
          font-size: 14px;
          display: inline-flex;
          align-items: center;
        }

        /* Logged Out Dropdown Styling */
        :global(.logged-out-menu) {
          display: flex;
          flex-direction: column;
          padding: 4px;
        }

        :global(.dropdown-header-welcome) {
          padding: 4px 0 16px 0;
          text-align: center;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          margin-bottom: 16px;
        }

        :global(.dropdown-welcome-title) {
          font-size: 15px;
          font-weight: 700;
          color: #121212;
          margin-bottom: 6px;
        }

        :global(.dropdown-welcome-subtitle) {
          font-size: 12px;
          color: #706f6c;
          line-height: 1.4;
          max-width: 220px;
          margin: 0 auto;
        }

        :global(.dropdown-actions) {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }

        :global(.dropdown-primary-btn) {
          display: block;
          width: 100%;
          text-align: center;
          padding: 12px;
          background: #121212;
          color: #FAF8F5;
          font-weight: 600;
          font-size: 13px;
          border-radius: 12px;
          transition: all 0.25s ease;
          text-decoration: none;
          border: none;
        }

        :global(.dropdown-primary-btn:hover) {
          background: #3e3d3a;
          transform: translateY(-0.5px);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
        }

        :global(.dropdown-secondary-btn) {
          display: block;
          width: 100%;
          text-align: center;
          padding: 12px;
          background: transparent;
          color: #121212;
          border: 1.5px solid #121212;
          font-weight: 600;
          font-size: 13px;
          border-radius: 12px;
          transition: all 0.25s ease;
          text-decoration: none;
        }

        :global(.dropdown-secondary-btn:hover) {
          background: rgba(18, 18, 18, 0.04);
        }

        :global(.dropdown-divider-text) {
          display: flex;
          align-items: center;
          text-align: center;
          color: #8c8985;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 8px 0 16px;
        }

        :global(.dropdown-divider-text::before), :global(.dropdown-divider-text::after) {
          content: '';
          flex: 1;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }

        :global(.dropdown-divider-text:not(:empty)::before) {
          margin-right: .75em;
        }

        :global(.dropdown-divider-text:not(:empty)::after) {
          margin-left: .75em;
        }

        :global(.social-quick-grid) {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        :global(.dropdown-social-btn) {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #ffffff;
          color: #555350;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          text-decoration: none;
        }

        :global(.dropdown-social-btn:hover) {
          border-color: #121212;
          color: #121212;
          background: #ffffff;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.02);
          transform: translateY(-0.5px);
        }

        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        :global(.dropdown-profile-header) {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid #f1f5f9;
        }

        :global(.profile-header-left) {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        :global(.profile-avatar-circle) {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #f3e8ff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        :global(.profile-meta) {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        :global(.profile-meta-name) {
          font-size: 13px;
          font-weight: 700;
          color: #1e293b;
        }

        :global(.profile-meta-email) {
          font-size: 10px;
          color: #64748b;
        }

        :global(.dropdown-items-list) {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 8px 0;
        }

        :global(.profile-list-item) {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          gap: 12px !important;
          padding: 8px !important;
          border-radius: 10px !important;
          text-decoration: none !important;
          transition: background 0.2s !important;
          width: 100% !important;
        }

        :global(.profile-list-item:hover) {
          background: #f8fafc !important;
        }

        :global(.item-icon-box) {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        :global(.settings-box) {
          background: #e0e7ff;
        }

        :global(.orders-box) {
          background: #fef3c7;
        }

        :global(.addresses-box) {
          background: #dcfce7;
        }

        :global(.logout-box) {
          background: #fee2e2;
        }

        :global(.item-title) {
          font-size: 13px !important;
          font-weight: 600 !important;
          color: #1e293b !important;
          margin: 0 !important;
          padding: 0 !important;
          display: inline-block !important;
        }

        :global(.profile-logout-footer) {
          border-top: 1px solid #f1f5f9;
          padding-top: 10px;
        }

        :global(.profile-logout-item) {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          gap: 12px !important;
          padding: 8px !important;
          border-radius: 10px !important;
          width: 100% !important;
          border: none !important;
          background: transparent !important;
          text-align: left !important;
          cursor: pointer !important;
          transition: background 0.2s !important;
        }

        :global(.profile-logout-item:hover) {
          background: #fee2e2 !important;
        }

        :global(.logout-title) {
          color: #dc2626 !important;
        }

        /* Mobile Layout */
        .mobile-search-btn {
          display: none !important;
        }

        .mobile-search-active-wrapper {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-left: 20px;
          animation: dropdownFadeIn 0.2s ease;
        }

        .mobile-search-active-form {
          flex: 1;
          position: relative;
        }

        .mobile-search-active-input {
          width: 100%;
          padding: 8px 36px 8px 16px;
          border-radius: 40px;
          border: 1px solid rgba(0, 0, 0, 0.04);
          background: #EFECE6;
          font-size: 13px;
          color: #121212;
          transition: all 0.25s ease;
        }

        .mobile-search-active-input:focus {
          outline: none;
          background: #f8fafc;
          border-color: #121212;
          box-shadow: 0 0 0 3px rgba(18, 18, 18, 0.05);
        }

        .search-clear-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #706f6c;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .search-close-btn {
          color: #121212;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .search-close-btn:hover {
          background: rgba(0, 0, 0, 0.03);
        }

        @media (max-width: 900px) {
          .nav-links {
            display: none;
          }
          .search-container.desktop-search {
            display: none;
          }
          .mobile-search-btn {
            display: flex !important;
          }
        }

        @media (max-width: 768px) {
          .navbar-wrapper {
            padding: 12px 10px !important;
          }
          :global(.logo) {
            font-size: 16px !important;
            gap: 6px !important;
          }
          :global(.logo-img) {
            width: 28px !important;
            height: 28px !important;
          }
          :global(.logo span) {
            max-width: 90px !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }
          .nav-icons {
            gap: 4px !important;
          }
          :global(.action-btn) {
            width: 32px !important;
            height: 32px !important;
          }
          :global(.action-btn svg) {
            width: 18px !important;
            height: 18px !important;
          }
          :global(.badge) {
            top: 2px !important;
            right: 2px !important;
            min-width: 14px !important;
            height: 14px !important;
            font-size: 8px !important;
          }
          .user-dropdown-container {
            position: static !important;
          }
          :global(.dropdown-menu) {
            right: 10px !important;
            left: auto !important;
            width: 280px !important;
            top: 54px !important;
          }
        }
      `}</style>
    </header>
  );
}
