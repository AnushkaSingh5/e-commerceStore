'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { storeService } from '@/services/storeService';
import StoreUnderReview from '@/components/StoreUnderReview';
import PageLoader from '@/components/PageLoader';
import { demoStores } from '@/lib/demoData';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function CustomerPortalLayout({ children }) {
  const { customer, customerProfile, loading, logout } = useCustomerAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [backToStoreSlug, setBackToStoreSlug] = useState(null);

  useEffect(() => {
    // 1. Try to get store from URL search params
    const params = new URLSearchParams(window.location.search);
    let slug = params.get('store');

    // 2. Try to get store from referrer if it contains /store/
    if (!slug && typeof document !== 'undefined') {
      const referrer = document.referrer;
      if (referrer && referrer.includes('/store/')) {
        const parts = referrer.split('/store/');
        if (parts[1]) {
          const extracted = parts[1].split('/')[0].split('?')[0];
          if (extracted) {
            slug = extracted;
          }
        }
      }
    }

    // 3. Fallback to localStorage
    if (!slug) {
      slug = localStorage.getItem('last_visited_store');
    }

    // 4. Save and update state if found
    if (slug) {
      localStorage.setItem('last_visited_store', slug);
      setBackToStoreSlug(slug);
    }
  }, [pathname]);

  const isPublicRoute = pathname === '/customer/login' || pathname === '/customer/signup';

  useEffect(() => {
    if (isPublicRoute) return;
    if (!loading && !customer) {
      console.log("Navigation triggered");
      router.push('/customer/login?redirect=' + encodeURIComponent(pathname));
    }
  }, [customer, loading, router, pathname]);


  const [storeDetails, setStoreDetails] = useState(null);
  const [checkingStore, setCheckingStore] = useState(false);

  useEffect(() => {
    if (backToStoreSlug) {
      setCheckingStore(true);
      storeService.getStoreBySlug(backToStoreSlug)
        .then(data => setStoreDetails(data))
        .catch(err => console.error('Failed to load store details in customer layout:', err))
        .finally(() => setCheckingStore(false));
    }
  }, [backToStoreSlug]);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (loading || checkingStore || !customer || !customerProfile) {
    return <PageLoader />;
  }

  if (storeDetails && storeDetails.status !== 'approved') {
    return (
      <StoreUnderReview
        storeName={storeDetails.name}
        status={storeDetails.status}
        statusReason={storeDetails.status_reason}
      />
    );
  }

  const navItems = [
    { name: 'Personal Details', path: '/customer/profile', icon: '👤' },
    { name: 'My Orders', path: '/customer/orders', icon: '📦' },
    { name: 'Address Book', path: '/customer/addresses', icon: '📍' },
  ];

  return (
    <div className="profile-dashboard">
      <Navbar storeName={storeDetails?.name} logoUrl={storeDetails?.logo_url || storeDetails?.logo} />

      <div className="profile-container container">
        <aside className="profile-sidebar dashboard-card">
          <div className="sidebar-profile-header">
            <div className="profile-avatar-circle">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b21a8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
            <div className="profile-meta">
              <div className="profile-meta-name">{customerProfile.full_name || 'Customer'}</div>
              <div className="profile-meta-email">{customer.email}</div>
            </div>
          </div>
          
          <nav className="sidebar-nav">
            <Link 
              href={backToStoreSlug ? `/customer/profile?store=${backToStoreSlug}` : '/customer/profile'}
              className={`profile-list-item ${pathname === '/customer/profile' ? 'active' : ''}`}
            >
              <div className="item-icon-box settings-box">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              <span className="item-title">Personal Details</span>
            </Link>

            <Link 
              href={backToStoreSlug ? `/customer/orders?store=${backToStoreSlug}` : '/customer/orders'}
              className={`profile-list-item ${pathname === '/customer/orders' ? 'active' : ''}`}
            >
              <div className="item-icon-box orders-box">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
              </div>
              <span className="item-title">My Orders</span>
            </Link>

            <Link 
              href={backToStoreSlug ? `/customer/addresses?store=${backToStoreSlug}` : '/customer/addresses'}
              className={`profile-list-item ${pathname === '/customer/addresses' ? 'active' : ''}`}
            >
              <div className="item-icon-box addresses-box">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              </div>
              <span className="item-title">Address Book</span>
            </Link>
            
            <div className="nav-divider"></div>
            
            {(() => {
              const isDemoStore = backToStoreSlug && !!demoStores[backToStoreSlug];
              return (
                <Link href={backToStoreSlug ? `/${isDemoStore ? 'demo-store' : 'store'}/${backToStoreSlug}` : "/"} className="profile-list-item home-link">
                  <div className="item-icon-box shopping-box">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                  </div>
                  <span className="item-title">Back to Shopping</span>
                </Link>
              );
            })()}
            
            <button onClick={logout} className="profile-logout-item">
              <div className="item-icon-box logout-box">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              </div>
              <span className="item-title logout-title">Sign Out</span>
            </button>
          </nav>
        </aside>

        <main className="profile-content">
          {children}
        </main>
      </div>

      <Footer storeName={storeDetails?.name} />

      <style jsx>{`
        .profile-dashboard {
          min-height: 100vh;
          background: var(--bg-main, #f8f9fb);
          padding-top: 100px;
          padding-bottom: 80px;
          font-family: 'Outfit', sans-serif;
        }

        .profile-container {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 40px;
          align-items: start;
          margin-top: 40px;
        }

        .profile-sidebar {
          background: var(--white, #ffffff);
          border-radius: var(--radius-lg, 24px);
          padding: 30px 24px;
          border: 1px solid rgba(0, 0, 0, 0.04);
          position: sticky;
          top: 100px;
        }

        :global(.sidebar-profile-header) {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          margin-bottom: 20px;
        }

        :global(.profile-avatar-circle) {
          width: 44px;
          height: 44px;
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
          min-width: 0;
        }

        :global(.profile-meta-name) {
          font-size: 14px;
          font-weight: 700;
          color: #1d1d1f;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 170px;
        }

        :global(.profile-meta-email) {
          font-size: 11px;
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 170px;
        }

        :global(.sidebar-nav) {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        :global(.profile-list-item) {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          gap: 12px !important;
          padding: 8px 12px !important;
          border-radius: 12px !important;
          text-decoration: none !important;
          transition: background 0.2s !important;
          color: #64748b !important;
          width: 100% !important;
        }

        :global(.profile-list-item:hover) {
          background: #f8fafc !important;
          color: #1d1d1f !important;
        }

        :global(.profile-list-item.active) {
          background: rgba(99, 102, 241, 0.08) !important;
          color: #6366f1 !important;
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

        :global(.shopping-box) {
          background: #ecfeff;
        }

        :global(.logout-box) {
          background: #fee2e2;
        }

        :global(.item-title) {
          font-size: 13px;
          font-weight: 600;
          flex: 1;
        }

        :global(.profile-list-item.active .item-title) {
          color: #6366f1 !important;
        }

        :global(.nav-divider) {
          height: 1px;
          background: rgba(0, 0, 0, 0.05);
          margin: 10px 0;
        }

        :global(.profile-logout-item) {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          gap: 12px !important;
          padding: 8px 12px !important;
          border-radius: 12px !important;
          width: 100% !important;
          border: none !important;
          background: transparent !important;
          text-align: left !important;
          cursor: pointer !important;
          transition: background 0.2s !important;
          color: #dc2626 !important;
        }

        :global(.profile-logout-item:hover) {
          background: #fee2e2 !important;
        }

        :global(.logout-title) {
          color: #dc2626 !important;
        }

        .profile-content {
          min-width: 0;
        }

        @media (max-width: 991px) {
          .profile-dashboard {
            padding-top: 72px !important;
            padding-bottom: 40px !important;
          }
          .profile-container {
            grid-template-columns: 1fr;
            gap: 20px;
            margin-top: 0 !important;
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
          .profile-sidebar {
            position: relative;
            top: 0;
          }
        }
      `}</style>
    </div>
  );
}
