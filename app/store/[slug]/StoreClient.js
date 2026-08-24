'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import StoreUnderReview from '@/components/StoreUnderReview';
import Hero from '@/components/Hero';
import CategoryCard from '@/components/CategoryCard';
import ProductCard from '@/components/ProductCard';
import Footer from '@/components/Footer';
import { useStore } from '@/context/StoreContext';
import { useLoading } from '@/components/TopLoader';
import PageLoader from '@/components/PageLoader';
import { useAuth } from '@/context/AuthContext';
import { productService } from '@/services/productService';
import { categoryService } from '@/services/categoryService';
import { getDefaultStoreData } from '@/lib/defaultStoreData';

export default function StoreClient({ slug, initialStoreDetails, initialProducts, initialCategories }) {
  console.log(`[AUTH DEBUG] [K] customer store page started rendering: ${performance.now()} ms`);

  useEffect(() => {
    console.log(`[AUTH DEBUG] [L] customer store page finished loading/mount: ${performance.now()} ms`);
  }, []);

  const { selectedCategory, setSelectedCategory, searchQuery, setSearchQuery } = useStore();
  const { startLoading, completeLoading } = useLoading();
  const [products, setProducts] = useState(initialProducts || []);
  const [categories, setCategories] = useState(initialCategories || []);
  const [storeDetails, setStoreDetails] = useState(initialStoreDetails);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState(() => {
    const savedSort = initialStoreDetails?.theme_settings?.defaultSort;
    if (savedSort === 'price_asc') return 'price-asc';
    if (savedSort === 'price_desc') return 'price-desc';
    return 'default';
  });
  const { user, loading: authLoading } = useAuth();
  
  const categoriesRef = useRef(null);

  const scrollCategories = (direction) => {
    if (categoriesRef.current) {
      const scrollAmount = 300;
      categoriesRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const currentUserId = user?.id;
  const isCreator = currentUserId && currentUserId === storeDetails?.creator_id;

  useEffect(() => {
    setStoreDetails(initialStoreDetails);
    setProducts(initialProducts || []);
    setCategories(initialCategories || []);
  }, [initialStoreDetails, initialProducts, initialCategories]);

  // Dynamically load products/categories on the client side if the store is not approved and the creator is previewing it
  useEffect(() => {
    if (storeDetails && storeDetails.status !== 'approved' && isCreator && products.length === 0) {
      const loadPreviewData = async () => {
        try {
          const [prodData, catData] = await Promise.all([
            productService.getProductsByStore(storeDetails.id, false),
            categoryService.getCategoriesByStore(storeDetails.id)
          ]);
          const safeCatData = catData || [];
          const mappedProducts = (prodData || []).map(p => {
            const categoryObj = safeCatData.find(c => c.id === p.category_id);
            return {
              ...p,
              category: categoryObj ? (categoryObj.name || categoryObj.title) : 'Uncategorized'
            };
          });
          setProducts(mappedProducts);
          setCategories([
            { id: 'all', title: 'All', image: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&q=80&w=800' },
            ...safeCatData
          ]);
        } catch (e) {
          console.error('[Kreatorstore - StoreClient] Failed to load preview data:', e);
        }
      };
      loadPreviewData();
    }
  }, [storeDetails, isCreator, products.length]);

  if (authLoading) {
    return <PageLoader />;
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
            background: linear-gradient(135deg, #FAF8F5 0%, #EFECE6 100%);
            padding: 20px;
            font-family: 'Outfit', sans-serif;
          }
          .glass-card {
            background: #ffffff;
            border: 1px solid rgba(0,0,0,0.06);
            border-radius: 24px;
            padding: 40px;
            max-width: 480px;
            text-align: center;
            color: #121212;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
          }
          .glass-card h2 {
            font-size: 24px;
            font-weight: 750;
            margin-bottom: 16px;
            color: #ef4444;
            font-family: 'Outfit', sans-serif;
          }
          .glass-card p {
            font-size: 14px;
            color: #706f6c;
            line-height: 1.6;
            margin-bottom: 28px;
          }
          .back-link {
            display: inline-block;
            padding: 12px 24px;
            background: #121212;
            color: #FAF8F5;
            border-radius: 12px;
            font-weight: 700;
            text-decoration: none;
            transition: all 0.2s;
            cursor: pointer;
          }
          .back-link:hover {
            transform: translateY(-2px);
            background: #232724;
          }
        `}</style>
      </div>
    );
  }

  // For visitors, block access to non-approved stores (allow creators and admins)
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

  // DynamicFallback classification matching logic
  const fallbackData = getDefaultStoreData(storeDetails?.name, storeDetails?.description);
  const finalProducts = products;
  const finalCategories = categories;

  const categoryTitle = fallbackData.categoryTitle || 'Shop By Category';
  const categorySubtitle = fallbackData.categorySubtitle || 'Find the perfect items for your collection.';
  const arrivalsTitle = fallbackData.arrivalsTitle || 'Fresh Additions';
  const arrivalsSubtitle = fallbackData.arrivalsSubtitle || 'Explore our latest additions, thoughtfully curated for you.';

  // Pre-calculate category product counts
  const categoriesWithCount = finalCategories.map(cat => {
    if (cat.id === 'all' || cat.title === 'All') {
      return { ...cat, productCount: finalProducts.length, displayTitle: 'All Products' };
    }
    const count = finalProducts.filter(p => p.category === cat.title || p.category_id === cat.id).length;
    return { ...cat, productCount: count, displayTitle: cat.title || cat.name };
  });

  // Main filter
  const filteredProducts = finalProducts.filter((product) => {
    const q = (searchQuery || '').toLowerCase().trim();
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
    const matchesSearch = !q ||
      product.name.toLowerCase().includes(q) ||
      (product.category && product.category.toLowerCase().includes(q));
    return matchesCategory && matchesSearch;
  });

  // Sort filtered products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'price-asc') {
      return parseFloat(a.price) - parseFloat(b.price);
    }
    if (sortBy === 'price-desc') {
      return parseFloat(b.price) - parseFloat(a.price);
    }
    if (sortBy === 'name-asc') {
      return a.name.localeCompare(b.name);
    }
    const defaultSort = storeDetails?.theme_settings?.defaultSort || 'newest';
    if (defaultSort === 'price_asc') {
      return parseFloat(a.price) - parseFloat(b.price);
    }
    if (defaultSort === 'price_desc') {
      return parseFloat(b.price) - parseFloat(a.price);
    }
    if (defaultSort === 'newest') {
      const dateA = new Date(a.created_at || a.id);
      const dateB = new Date(b.created_at || b.id);
      return dateB - dateA;
    }
    return 0;
  });

  // Determine if active filtering is happening
  const isFilteringActive = searchQuery !== '';

  return (
    <main className="dashboard-store">
      {storeDetails && storeDetails.status !== 'approved' && isCreator && (
        <div className={`preview-warning-banner ${storeDetails.status}`}>
          <div className="banner-content">
            <span className="banner-badge">Preview Mode</span>
            <span className="banner-message">
              {storeDetails.status === 'pending' && "⏳ Your store is pending admin review. Public visitors see a 'Store is under review' screen."}
              {storeDetails.status === 'rejected' && `❌ Your store request was rejected. Reason: ${storeDetails.status_reason || 'N/A'}.`}
              {storeDetails.status === 'disabled' && `🚫 Your store is disabled. Reason: ${storeDetails.status_reason || 'N/A'}.`}
            </span>
          </div>
          {(storeDetails.status === 'rejected' || storeDetails.status === 'disabled') && (
            <Link href="/dashboard" className="banner-action-link">Resubmit / Manage in Dashboard &rarr;</Link>
          )}
        </div>
      )}
      
      <Navbar storeName={storeDetails?.name} logoUrl={storeDetails?.logo_url || storeDetails?.logo} />
      
      {!isFilteringActive && (
        <Hero 
          bannerUrl={storeDetails?.banner_url || storeDetails?.banner}
          storeName={storeDetails?.name}
          description={storeDetails?.description}
        />
      )}
      
      <div className={`container main-content ${isFilteringActive ? 'search-active-content' : ''}`}>
        <div className="catalog-container-layout">
        {/* Replicated Products Catalog Page Layout */}
        <section className="catalog-header-section">
          <div className="catalog-header-main-row">
            <div className="header-title-col">
              <h1 className="catalog-title">Products Catalog</h1>
              <p className="catalog-subtitle">Discover our premium selection of curated products.</p>
            </div>
            
            <div className="header-actions-col">
              <div className="search-status-text">
                Showing <strong>{sortedProducts.length}</strong> {sortedProducts.length === 1 ? 'product' : 'products'} total
              </div>
              <div className="sort-by-selector">
                <span className="sort-label">Sort by:</span>
                <div className="sort-select-wrapper">
                  <select 
                    id="sort-select" 
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="default">Default | Recommended</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                    <option value="name-asc">Alphabetical: A to Z</option>
                  </select>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Category Filter Pills */}
        <section className="categories-pill-section">
          <div className="categories-pill-list">
            <button 
              className={`category-pill ${selectedCategory === 'All' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('All')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
              All Products ({products.length})
            </button>
            
            {categoriesWithCount.filter(c => c.id !== 'all' && c.title !== 'All').map(cat => (
              <button 
                key={cat.id}
                className={`category-pill ${selectedCategory === (cat.title || cat.name) ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.title || cat.name)}
              >
                {cat.displayTitle} ({cat.productCount})
              </button>
            ))}

            <button 
              className="category-pill clear-filters-pill"
              onClick={() => {
                setSelectedCategory('All');
                setSearchQuery('');
                setSortBy('default');
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
              Clear Filters
            </button>
          </div>
        </section>

        {/* Products Grid */}
        <section className="products-grid-section">
          {sortedProducts.length > 0 ? (
            <div className="products-grid">
              {sortedProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="catalog-empty-state">
              <div className="empty-icon">🔍</div>
              <h3>No matching products found</h3>
              <p>We couldn't find any products in this collection matching your criteria. Try resetting filters.</p>
              <button className="reset-filters-btn" onClick={() => { setSelectedCategory('All'); setSearchQuery(''); setSortBy('default'); }}>Reset All Filters</button>
            </div>
          )}
        </section>
      </div>

        {/* Commented out original sections below */}
        {/*
        {isFilteringActive ? (
          <section className="catalog-search-section">
            <div className="section-header">
              <h2 className="section-title">
                {selectedCategory === 'All' ? 'Discover All Products' : `${selectedCategory} Collection`}
                {searchQuery && ` - Results for "${searchQuery}"`}
              </h2>
              <p className="section-subtitle">
                {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'items'} found
              </p>
            </div>
            
            {filteredProducts.length > 0 ? (
              <div className="products-grid">
                {filteredProducts.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <h3>No products found</h3>
                <p>Try adjusting your search or category filters.</p>
                <button className="reset-btn" onClick={() => setSelectedCategory('All')}>Reset Filters</button>
              </div>
            )}
          </section>
        ) : finalProducts.length === 0 ? (
          <div className="empty-store-state">
            <div className="empty-icon">✨</div>
            <h3>Our Collection is Growing</h3>
            <p>We are currently curating and uploading our premium products. Please visit us again soon!</p>
            {isCreator && (
              <Link href="/dashboard/products" className="dashboard-link">
                Go to Dashboard to Add Products &rarr;
              </Link>
            )}
          </div>
        ) : (
          <>
            {(!storeDetails?.theme_settings || storeDetails.theme_settings.showCategories !== false) && (
              <section className="categories-section" id="categories-section">
                <div className="section-header">
                  <div className="header-meta">
                    <h2 className="section-title">{categoryTitle}</h2>
                    <span className="accent-underline"></span>
                  </div>
                  <p className="section-subtitle">{categorySubtitle}</p>
                </div>
                
                <div className="carousel-wrapper">
                  <button 
                    className="carousel-nav-btn left" 
                    onClick={() => scrollCategories('left')}
                    aria-label="Scroll categories left"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                  </button>

                  <div className="categories-carousel-track" ref={categoriesRef}>
                    {categoriesWithCount.filter(c => c.id !== 'all').map(category => (
                      <div key={category.id} className="carousel-item-card">
                        <CategoryCard 
                          category={category} 
                          productCount={category.productCount} 
                        />
                      </div>
                    ))}
                  </div>

                  <button 
                    className="carousel-nav-btn right" 
                    onClick={() => scrollCategories('right')}
                    aria-label="Scroll categories right"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </button>
                </div>
              </section>
            )}

            <section className="new-arrivals-banner-section" id="new-arrivals-section">
              <div className={`new-arrivals-grid ${freshFindsProducts.length === 0 ? 'no-products' : ''}`}>
                <div className="arrivals-info-pane">
                  <span className="pane-tag">New Arrivals</span>
                  <h2 className="pane-title">{arrivalsTitle}</h2>
                  <p className="pane-desc">{arrivalsSubtitle}</p>
                  <button onClick={() => {
                    const el = document.getElementById('trending-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }} className="pane-discover-btn">
                    Discover Now <span className="arrow">→</span>
                  </button>
                </div>
                
                <div className="arrivals-products-pane">
                  {freshFindsProducts.map(product => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </div>
            </section>

            <div className="value-props-bar">
              <div className="value-item">
                <div className="value-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                </div>
                <div className="value-text">
                  <span className="value-title">Premium Quality</span>
                  <span className="value-desc">Carefully selected</span>
                </div>
              </div>
              <div className="value-item">
                <div className="value-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                </div>
                <div className="value-text">
                  <span className="value-title">Free Shipping</span>
                  <span className="value-desc">On all orders</span>
                </div>
              </div>
              <div className="value-item">
                <div className="value-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
                </div>
                <div className="value-text">
                  <span className="value-title">Easy Returns</span>
                  <span className="value-desc">30-day returns</span>
                </div>
              </div>
              <div className="value-item">
                <div className="value-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </div>
                <div className="value-text">
                  <span className="value-title">Secure Payments</span>
                  <span className="value-desc">100% protected</span>
                </div>
              </div>
              <div className="value-item">
                <div className="value-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
                <div className="value-text">
                  <span className="value-title">Dedicated Support</span>
                  <span className="value-desc">We're here to help</span>
                </div>
              </div>
            </div>

            <section className="trending-section" id="trending-section">
              <div className="section-header">
                <div className="header-meta">
                  <h2 className="section-title">Trending Now</h2>
                  <span className="accent-underline"></span>
                </div>
                <p className="section-subtitle">Most-loved pieces by our customers.</p>
                <Link href={`/store/${slug}/products`} className="section-action-link">
                  View All Products <span className="link-arrow">→</span>
                </Link>
              </div>

              <div className="products-grid-4">
                {trendingProducts.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          </>
        )}
        */}
      </div>

      <Footer storeName={storeDetails?.name} description={storeDetails?.description} />

      <style jsx>{`
        .dashboard-store {
          background: #f8fafc; /* Clean dashboard off-white background */
          min-height: 100vh;
          font-family: 'Outfit', sans-serif;
        }

        .main-content {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding-bottom: 80px;
          margin-top: -24px; /* Pull closer to hero banner */
        }

        .search-active-content {
          padding-top: 140px;
        }

        .catalog-container-layout {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* Products Catalog CSS Integration */
        .catalog-header-section {
          text-align: left;
          margin-bottom: 0px;
        }
        .catalog-header-main-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 24px;
          margin-top: 16px;
        }
        .catalog-title {
          font-size: 32px;
          font-weight: 700;
          color: #121212;
          margin: 0 0 6px 0;
          font-family: 'Outfit', sans-serif;
        }
        .catalog-subtitle {
          font-size: 14px;
          color: #706f6c;
          margin: 0;
          line-height: 1.5;
        }
        .header-actions-col {
          display: flex;
          align-items: center;
          gap: 24px;
          background: #f0f2f5;
          padding: 10px 20px;
          border-radius: 12px;
        }
        .search-status-text {
          font-size: 13px;
          color: #555350;
        }
        .sort-by-selector {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .sort-label {
          font-size: 13px;
          font-weight: 700;
          color: #706f6c;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .sort-select-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .sort-select-wrapper select {
          appearance: none;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 8px;
          padding: 6px 28px 6px 12px;
          font-size: 13px;
          font-weight: 600;
          color: #121212;
          outline: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        .sort-select-wrapper select:focus {
          border-color: #121212;
        }
        .sort-select-wrapper svg {
          position: absolute;
          right: 10px;
          pointer-events: none;
          color: #706f6c;
        }

        /* Category pills list */
        .categories-pill-section {
          overflow-x: auto;
          scrollbar-width: none;
          padding-bottom: 4px;
          margin-bottom: 0px;
        }
        .categories-pill-section::-webkit-scrollbar {
          display: none;
        }
        .categories-pill-list {
          display: flex;
          gap: 12px;
          white-space: nowrap;
        }
        .category-pill {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(0, 0, 0, 0.05);
          border-radius: 40px;
          padding: 8px 18px;
          font-size: 13px;
          font-weight: 600;
          color: #555350;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
        }
        .category-pill:hover {
          background: #ffffff;
          color: #121212;
          border-color: rgba(0, 0, 0, 0.1);
        }
        .category-pill.active {
          background: #121212;
          color: #FAF8F5;
          border-color: #121212;
        }

        /* Products Grid */
        .products-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 32px 24px;
        }

        /* Empty State */
        .catalog-empty-state {
          text-align: center;
          padding: 80px 24px;
          background: #ffffff;
          border-radius: 24px;
          border: 1px solid rgba(0, 0, 0, 0.04);
          max-width: 500px;
          margin: 40px auto;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .catalog-empty-state h3 {
          font-size: 20px;
          font-weight: 700;
          color: #121212;
          margin: 0 0 8px 0;
        }
        .catalog-empty-state p {
          font-size: 14px;
          color: #706f6c;
          line-height: 1.6;
          margin: 0 0 24px 0;
        }
        .reset-filters-btn {
          display: inline-block;
          padding: 12px 24px;
          background: #121212;
          color: #FAF8F5;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
          cursor: pointer;
        }
        .reset-filters-btn:hover {
          background: #232724;
          transform: translateY(-1px);
        }

        .empty-store-state {
          text-align: center;
          padding: 80px 24px;
          background: #ffffff;
          border-radius: 24px;
          border: 1px solid rgba(0, 0, 0, 0.04);
          box-shadow: 0 10px 35px rgba(0, 0, 0, 0.01);
          margin: 40px auto;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .empty-icon {
          font-size: 48px;
          margin-bottom: 20px;
        }
        .empty-store-state h3 {
          font-family: 'Outfit', sans-serif;
          font-size: 22px;
          font-weight: 700;
          color: #121212;
          margin-bottom: 12px;
        }
        .empty-store-state p {
          font-size: 14px;
          color: #706f6c;
          line-height: 1.6;
          margin-bottom: 24px;
          max-width: 440px;
        }
        .dashboard-link {
          display: inline-block;
          padding: 12px 24px;
          background: #121212;
          color: #FAF8F5;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
        }
        .dashboard-link:hover {
          background: #232724;
          transform: translateY(-1px);
        }

        section {
          padding: 20px 0;
        }

        /* Section Headers */
        .section-header {
          margin-bottom: 48px;
          text-align: center;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .header-meta {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .section-title {
          font-size: clamp(28px, 4vw, 36px);
          font-weight: 700;
          color: #121212;
          font-family: 'Outfit', sans-serif;
          letter-spacing: -0.5px;
        }

        .accent-underline {
          width: 60px;
          height: 1.5px;
          background: #232724;
        }

        .section-subtitle {
          font-size: 14px;
          color: #706f6c;
          max-width: 500px;
          margin: 0 auto;
        }

        .section-action-link {
          font-size: 13px;
          font-weight: 600;
          color: #121212;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-top: 12px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
          background: none;
          border: none;
          cursor: pointer;
        }

        .section-action-link:hover {
          color: #706f6c;
        }

        .link-arrow {
          transition: transform 0.2s ease;
        }

        .section-action-link:hover .link-arrow {
          transform: translateX(3px);
        }

        /* Categories Carousel Slider */
        .carousel-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
        }

        .categories-carousel-track {
          display: flex;
          gap: 24px;
          overflow-x: auto;
          scroll-behavior: smooth;
          scrollbar-width: none; /* Firefox */
          padding: 12px 0;
          width: 100%;
        }

        .categories-carousel-track::-webkit-scrollbar {
          display: none; /* Safari and Chrome */
        }

        .carousel-item-card {
          width: 240px;
          flex-shrink: 0;
        }

        .carousel-nav-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(250, 248, 245, 0.9);
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          color: #121212;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          transition: all 0.2s ease;
        }

        .carousel-nav-btn:hover {
          background: #ffffff;
          transform: translateY(-50%) scale(1.08);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
        }

        .carousel-nav-btn.left {
          left: -22px;
        }

        .carousel-nav-btn.right {
          right: -22px;
        }

        /* New Arrivals Dark Banner Section */
        .new-arrivals-banner-section {
          background: #2D322F; /* Dark charcoal olive */
          border-radius: 24px;
          padding: 64px;
          color: #FAF8F5;
        }

        .new-arrivals-grid {
          display: grid;
          grid-template-columns: 4.2fr 7.8fr;
          gap: 48px;
          align-items: center;
        }

        .new-arrivals-grid.no-products {
          grid-template-columns: 1fr;
          max-width: 800px;
          margin: 0 auto;
          text-align: center;
        }

        .new-arrivals-grid.no-products .arrivals-info-pane {
          align-items: center;
        }

        .new-arrivals-grid.no-products .pane-discover-btn {
          align-self: center;
        }

        .arrivals-info-pane {
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .pane-tag {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #A39E93;
          margin-bottom: 16px;
        }

        .pane-title {
          font-family: 'Outfit', sans-serif;
          font-size: clamp(26px, 3vw, 36px);
          font-weight: 700;
          line-height: 1.25;
          margin-bottom: 16px;
          word-break: normal;
          overflow-wrap: break-word;
        }

        .pane-desc {
          font-size: 13px;
          color: #C1BCB2;
          line-height: 1.6;
          margin-bottom: 32px;
          word-break: normal;
          overflow-wrap: break-word;
        }

        .pane-discover-btn {
          align-self: flex-start;
          background: #FAF8F5;
          color: #232724;
          padding: 12px 28px;
          border-radius: 30px;
          font-size: 13px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.25s ease;
        }

        .pane-discover-btn:hover {
          background: #EFECE6;
          transform: translateY(-2px);
        }

        .pane-discover-btn .arrow {
          transition: transform 0.2s ease;
        }

        .pane-discover-btn:hover .arrow {
          transform: translateX(3px);
        }

        .arrivals-products-pane {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        /* Value Props Bar */
        .value-props-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #EFECE6;
          border-radius: 20px;
          padding: 24px 48px;
          gap: 24px;
          flex-wrap: wrap;
        }

        .value-item {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .value-icon {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(35, 39, 36, 0.04);
          color: #232724;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .value-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .value-title {
          font-size: 12px;
          font-weight: 600;
          color: #121212;
        }

        .value-desc {
          font-size: 10px;
          color: #706f6c;
        }

        /* Products Grid (4 Columns) */
        .products-grid-4 {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }

        /* Catalog search active state */
        .catalog-search-section {
          padding-top: 40px;
        }

        .products-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 80px 0;
          text-align: center;
        }

        .empty-icon {
          font-size: 48px;
        }

        .empty-state h3 {
          font-size: 24px;
          font-weight: 700;
          font-family: 'Outfit', sans-serif;
        }

        .empty-state p {
          color: #706f6c;
          font-size: 14px;
        }

        .reset-btn {
          margin-top: 20px;
          padding: 12px 28px;
          background: #121212;
          color: #FAF8F5;
          border-radius: 30px;
          font-weight: 600;
          font-size: 13px;
        }

        .reset-btn:hover {
          background: #232724;
          transform: translateY(-2px);
        }

        /* Shimmer loading */
        .skeleton-category-card {
          background: rgba(255, 255, 255, 0.6);
          border-radius: 80px 80px 16px 16px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .skeleton-image {
          width: 100%;
          aspect-ratio: 3.2/4;
          border-radius: 80px 80px 16px 16px;
          background: #e2e8f0;
        }
        .skeleton-title {
          width: 60%;
          height: 14px;
          border-radius: 4px;
          background: #e2e8f0;
        }

        /* Responsive breakpoints */
        @media (max-width: 1024px) {
          .carousel-item-card {
            width: 220px;
          }
          .new-arrivals-grid {
            grid-template-columns: 1fr;
            gap: 40px;
          }
          .arrivals-products-pane {
            grid-template-columns: repeat(3, 1fr);
          }
          .products-grid-4, .products-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .value-props-bar {
            justify-content: center;
            padding: 24px;
          }
        }

        @media (max-width: 768px) {
          .main-content {
            gap: 60px;
          }
          .new-arrivals-banner-section {
            padding: 32px 24px;
          }
          .arrivals-products-pane {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .carousel-nav-btn {
            display: none;
          }
          .carousel-item-card {
            width: 180px;
          }
          .products-grid-4, .products-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
          }
          .value-props-bar {
            flex-direction: column;
            align-items: flex-start;
            gap: 20px;
            padding: 24px 32px;
          }
           .catalog-header-main-row {
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
            margin-top: 12px;
          }
          .header-actions-col {
            width: 100%;
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
            padding: 12px 16px;
          }
          .sort-by-selector {
            justify-content: space-between;
            width: 100%;
          }
          .sort-select-wrapper {
            flex: 1;
            display: flex;
          }
          .sort-select-wrapper select {
            width: 100%;
          }
          .catalog-title {
            font-size: 24px;
          }
          .catalog-container-layout {
            gap: 12px;
          }
          .categories-pill-section {
            overflow-x: visible !important;
            padding-bottom: 0 !important;
          }
          .categories-pill-list {
            flex-wrap: wrap !important;
            white-space: normal !important;
            gap: 8px !important;
          }
        }

        /* Preview banner */
        .preview-warning-banner {
          width: 100%;
          padding: 12px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          font-weight: 600;
          z-index: 9999;
          box-sizing: border-box;
        }
        .preview-warning-banner.pending {
          background: #fffbeb;
          border-bottom: 1px solid #fef3c7;
          color: #d97706;
        }
        .preview-warning-banner.rejected {
          background: #fef2f2;
          border-bottom: 1px solid #fee2e2;
          color: #dc2626;
        }
        .preview-warning-banner.disabled {
          background: #f3f4f6;
          border-bottom: 1px solid #e5e7eb;
          color: #4b5563;
        }
        .banner-content {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .banner-badge {
          padding: 4px 8px;
          background: rgba(0,0,0,0.06);
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .banner-action-link {
          color: inherit;
          text-decoration: underline;
          font-weight: 700;
          white-space: nowrap;
        }
      `}</style>
    </main>
  );
}
