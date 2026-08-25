'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDashboard } from '@/context/DashboardContext';
import PageLoader from '@/components/PageLoader';
import Link from 'next/link';

function AddProductFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get('id');
  const isEditing = !!productId;

  const { products, categories, loading, addProduct, updateProduct } = useDashboard();

  const [productImages, setProductImages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    stock: '',
    category: '',
    status: 'Published',
    seo_title: '',
    seo_description: '',
    og_title: '',
    og_description: '',
    canonical_url: '',
    spec_dimensions: '',
    spec_material: '',
    spec_finish: '',
    spec_warranty: '',
    spec_origin: '',
    shipping_details: '',
    return_policy: '',
    weight: ''
  });

  const imageInputRef = useRef(null);

  // Populate form if editing
  useEffect(() => {
    if (isEditing && products && products.length > 0) {
      const product = products.find(p => String(p.id) === String(productId));
      if (product) {
        setFormData({
          name: product.name || '',
          description: product.description || '',
          price: product.price || '',
          stock: product.stock || '',
          category: product.category || '',
          status: product.status || 'Published',
          seo_title: product.seo_title || '',
          seo_description: product.seo_description || '',
          og_title: product.og_title || '',
          og_description: product.og_description || '',
          canonical_url: product.canonical_url || '',
          spec_dimensions: product.spec_dimensions || '',
          spec_material: product.spec_material || '',
          spec_finish: product.spec_finish || '',
          spec_warranty: product.spec_warranty || '',
          spec_origin: product.spec_origin || '',
          shipping_details: product.shipping_details || '',
          return_policy: product.return_policy || '',
          weight: product.weight !== undefined && product.weight !== null ? product.weight : ''
        });
        setProductImages(product.images || [product.image]);
      }
    }
  }, [isEditing, productId, products]);

  // Save form draft to sessionStorage as the user types (only when adding a new product)
  useEffect(() => {
    if (!isEditing) {
      sessionStorage.setItem('add_product_draft_form', JSON.stringify(formData));
    }
  }, [formData, isEditing]);

  useEffect(() => {
    if (!isEditing && productImages.length > 0) {
      sessionStorage.setItem('add_product_draft_images', JSON.stringify(productImages));
    }
  }, [productImages, isEditing]);

  // Restore form draft on mount
  useEffect(() => {
    if (!isEditing) {
      const savedForm = sessionStorage.getItem('add_product_draft_form');
      const savedImages = sessionStorage.getItem('add_product_draft_images');
      if (savedForm) {
        try {
          const parsed = JSON.parse(savedForm);
          setFormData(prev => ({ ...prev, ...parsed }));
        } catch (e) {
          console.error('Failed to restore draft form:', e);
        }
      }
      if (savedImages) {
        try {
          const parsed = JSON.parse(savedImages);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setProductImages(parsed);
          }
        } catch (e) {
          console.error('Failed to restore draft images:', e);
        }
      }
    }
  }, [isEditing]);

  const handleCancel = () => {
    if (!isEditing) {
      sessionStorage.removeItem('add_product_draft_form');
      sessionStorage.removeItem('add_product_draft_images');
    }
    router.push('/dashboard/products');
  };

  const handleProductImageUpload = (e) => {
    const files = Array.from(e.target.files);
    
    if (productImages.length >= 6) {
      alert('You can upload a maximum of 6 images.');
      return;
    }
    
    const remainingSlots = 6 - productImages.length;
    const filesToUpload = files.slice(0, remainingSlots);
    
    if (files.length > remainingSlots) {
      alert(`You can only add up to ${remainingSlots} more image(s). Only the first ${remainingSlots} will be uploaded.`);
    }

    filesToUpload.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProductImages(prev => {
          if (prev.length >= 6) return prev;
          return [...prev, reader.result];
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const removeProductImage = (index) => {
    setProductImages(prev => prev.filter((_, i) => i !== index));
  };

  const setAsMain = (index) => {
    setProductImages(prev => {
      const newImages = [...prev];
      const [target] = newImages.splice(index, 1);
      newImages.unshift(target);
      return newImages;
    });
  };

  const handleSaveProduct = async () => {
    if (!formData.name || !formData.price) {
      alert('Please fill in all required fields (Name and Price)');
      return;
    }

    if (productImages.length === 0) {
      alert('Please upload at least 1 product image.');
      return;
    }

    if (productImages.length > 6) {
      alert('You can upload a maximum of 6 images.');
      return;
    }

    // Weight field validation
    if (formData.weight !== undefined && formData.weight !== null && formData.weight !== '') {
      const weightVal = parseFloat(formData.weight);
      if (isNaN(weightVal) || weightVal <= 0) {
        alert('Product Weight must be a positive number greater than 0.');
        setSaving(false);
        return;
      }
    }

    setSaving(true);
    try {
      const productData = {
        ...formData,
        price: parseFloat(formData.price),
        stock: parseInt(formData.stock) || 0,
        image: productImages[0] || 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800',
        images: productImages,
        seo_title: formData.seo_title || null,
        seo_description: formData.seo_description || null,
        og_title: formData.og_title || null,
        og_description: formData.og_description || null,
        canonical_url: formData.canonical_url || null,
        spec_dimensions: formData.spec_dimensions || null,
        spec_material: formData.spec_material || null,
        spec_finish: formData.spec_finish || null,
        spec_warranty: formData.spec_warranty || null,
        spec_origin: formData.spec_origin || null,
        shipping_details: formData.shipping_details || null,
        return_policy: formData.return_policy || null,
        weight: (formData.weight !== undefined && formData.weight !== null && formData.weight !== '') 
          ? parseFloat(formData.weight) 
          : null
      };

      if (isEditing) {
        await updateProduct(productId, productData);
      } else {
        const numericalIds = products
          .map(p => parseInt(p.id))
          .filter(id => !isNaN(id));
        
        const nextId = numericalIds.length > 0 
          ? Math.max(...numericalIds) + 1 
          : products.length + 1;

        await addProduct({
          ...productData,
          id: nextId.toString(),
          date: new Date().toISOString().split('T')[0]
        });
      }
      
      if (!isEditing) {
        sessionStorage.removeItem('add_product_draft_form');
        sessionStorage.removeItem('add_product_draft_images');
      }
      router.push('/dashboard/products');
    } catch (err) {
      console.error('Error saving product:', err);
      alert('Failed to save product: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && products.length === 0) {
    return <PageLoader />;
  }

  return (
    <div className="add-product-page-container">
      <div className="add-product-header">
        <Link href="/dashboard/products" className="back-link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          Back to Products
        </Link>
        <div className="title-row">
          <h1>{isEditing ? 'Edit Product' : 'Add New Product'}</h1>
          <p>{isEditing ? `Modifying: ${formData.name}` : 'Create a brand new item in your inventory.'}</p>
        </div>
      </div>

      <div className="product-form-card">
        <div className="form-group">
          <label>Product Name <span className="required">*</span></label>
          <div className="input-with-icon-right">
            <input 
              type="text" 
              placeholder="e.g. Modern Coffee Table" 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '12px' }}>
          <label>Description</label>
          <textarea 
            placeholder="Describe the product..." 
            rows="3"
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
          ></textarea>
        </div>

        <div className="form-row" style={{ marginTop: '12px' }}>
          <div className="form-group">
            <label>Price (Rupees) <span className="required">*</span></label>
            <div className="input-with-icon">
              <div className="input-prefix">₹</div>
              <input 
                type="number" 
                placeholder="0.00" 
                value={formData.price}
                onChange={(e) => setFormData({...formData, price: e.target.value})}
                onKeyDown={(e) => {
                  if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                }}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Stock Quantity <span className="required">*</span></label>
            <div className="input-with-icon">
              <div className="input-prefix">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
              </div>
              <input 
                type="number" 
                placeholder="0" 
                value={formData.stock}
                onChange={(e) => setFormData({...formData, stock: e.target.value})}
                onKeyDown={(e) => {
                  if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault();
                }}
              />
            </div>
          </div>
        </div>

        <div className="form-row" style={{ marginTop: '12px' }}>
          <div className="form-group">
            <label>Category <span className="optional">(optional)</span></label>
            <div className="input-with-icon">
              <div className="input-prefix">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path></svg>
              </div>
              <select 
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
              >
                <option value="">Select category (optional)</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Publish Status</label>
            <div className="input-with-icon">
              <div className="input-prefix">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line></svg>
              </div>
              <select
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value})}
              >
                <option value="Published">Published (visible on store)</option>
                <option value="Draft">Draft (hidden from store)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-row" style={{ marginTop: '12px' }}>
          <div className="form-group">
            <label>Product Weight (grams) <span className="optional">(optional)</span></label>
            <div className="input-with-icon">
              <div className="input-prefix">g</div>
              <input 
                type="number" 
                placeholder="e.g. 500" 
                step="any"
                min="0.01"
                value={formData.weight}
                onChange={(e) => setFormData({...formData, weight: e.target.value})}
                onKeyDown={(e) => {
                  if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                }}
              />
            </div>
            <p className="help-text" style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              Enter the product/package weight in grams.
            </p>
          </div>
          <div className="form-group" style={{ visibility: 'hidden' }}>
            {/* Spacer */}
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '16px' }}>
          <label>Product Images <span style={{ color: '#ef4444' }}>*</span></label>
          <p className="help-text">Upload between 1 and 6 images of your product. (Current: {productImages.length}/6)</p>
          
          <input 
            type="file" 
            ref={imageInputRef} 
            style={{ display: 'none' }} 
            multiple 
            accept="image/*"
            onChange={handleProductImageUpload}
          />

          <div className="product-upload-box" onClick={() => imageInputRef.current.click()}>
            <div className="upload-circle">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M17.5 19a5.5 5.5 0 0 0 1-10.9A7 7 0 0 0 5 8.4a5 5 0 0 0 0 9.6"></path><polyline points="17 13 12 8 7 13"></polyline><line x1="12" y1="8" x2="12" y2="18"></line></svg>
            </div>
            <div className="upload-text">
              <strong>Drag & drop images here</strong>
              <span>or <button type="button" className="text-btn" onClick={(e) => { e.stopPropagation(); imageInputRef.current.click(); }}>Choose Files</button></span>
              <p className="upload-sub">PNG, JPG or WEBP (max. 5MB each)</p>
            </div>
          </div>

          {productImages.length > 0 && (
            <div className="images-preview-grid">
              {productImages.map((img, index) => (
                <div key={index} className={`image-preview-item ${index === 0 ? 'is-main' : ''}`}>
                  <img src={img} alt={`Preview ${index}`} />
                  {index === 0 ? (
                    <span className="main-image-badge">⭐ Main</span>
                  ) : (
                    <button 
                      type="button" 
                      className="set-main-action-btn" 
                      onClick={(e) => { e.stopPropagation(); setAsMain(index); }}
                    >
                      Set Main
                    </button>
                  )}
                  <button type="button" className="remove-image-btn" onClick={(e) => { e.stopPropagation(); removeProductImage(index); }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Tabs Customization Section */}
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#1e293b', marginBottom: '12px' }}>Product Tabs (Specifications, Shipping & Returns)</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label>Dimensions</label>
              <input 
                type="text" 
                placeholder="e.g. Standard size" 
                value={formData.spec_dimensions}
                onChange={(e) => setFormData({...formData, spec_dimensions: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Material</label>
              <input 
                type="text" 
                placeholder="e.g. Premium sustainably sourced materials" 
                value={formData.spec_material}
                onChange={(e) => setFormData({...formData, spec_material: e.target.value})}
              />
            </div>
          </div>

          <div className="form-row" style={{ marginTop: '8px' }}>
            <div className="form-group">
              <label>Finish</label>
              <input 
                type="text" 
                placeholder="e.g. Satin matte protective coating" 
                value={formData.spec_finish}
                onChange={(e) => setFormData({...formData, spec_finish: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Warranty</label>
              <input 
                type="text" 
                placeholder="e.g. 2 Year Manufacturer Warranty" 
                value={formData.spec_warranty}
                onChange={(e) => setFormData({...formData, spec_warranty: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Origin</label>
              <input 
                type="text" 
                placeholder="e.g. Designed & Crafted locally" 
                value={formData.spec_origin}
                onChange={(e) => setFormData({...formData, spec_origin: e.target.value})}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '8px' }}>
            <label>Shipping Details (Custom text or list)</label>
            <textarea 
              placeholder={`e.g. Secure & Swift Logistics

All orders are processed and handed over to standard premium courier networks within 24 hours of confirmation.

- Standard Shipping: Delivered in 3-5 business days. Free for this product.
- Express Shipping: Delivered in 1-2 business days (if selected at checkout).
- Transit Safety: Fully insured shipments with custom packaging to prevent breakages.`} 
              rows="8"
              value={formData.shipping_details}
              onChange={(e) => setFormData({...formData, shipping_details: e.target.value})}
            ></textarea>
          </div>

          <div className="form-group" style={{ marginTop: '8px' }}>
            <label>Return Policy (Custom text or list)</label>
            <textarea 
              placeholder={`e.g. 7-Day Return & Replacement Policy

We stand behind the craftsmanship of our products. If you are not completely satisfied, we offer a hassle-free return window.

- Items must be returned in their original packaging and unused condition.
- Refunds are processed to the original payment source within 3-5 days after warehouse validation.
- In case of manufacturing defects, contact our support with unboxing images for instant replacements.`} 
              rows="8"
              value={formData.return_policy}
              onChange={(e) => setFormData({...formData, return_policy: e.target.value})}
            ></textarea>
          </div>
        </div>

        {/* SEO Optimization Section */}
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#1e293b', marginBottom: '12px' }}>SEO Optimization</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label>SEO Title</label>
              <input 
                type="text" 
                placeholder="e.g. Premium Leather Sofa - Buy Online" 
                value={formData.seo_title}
                onChange={(e) => setFormData({...formData, seo_title: e.target.value})}
              />
              <span className="help-text">Current: {formData.seo_title.length} chars</span>
            </div>
            <div className="form-group">
              <label>Canonical URL</label>
              <input 
                type="text" 
                placeholder="https://example.com/product" 
                value={formData.canonical_url}
                onChange={(e) => setFormData({...formData, canonical_url: e.target.value})}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '8px' }}>
            <label>SEO Description</label>
            <textarea 
              placeholder="Description snippet that appears in search results..." 
              rows="2"
              value={formData.seo_description}
              onChange={(e) => setFormData({...formData, seo_description: e.target.value})}
            ></textarea>
            <span className="help-text">Current: {formData.seo_description.length} chars</span>
          </div>

          <div className="form-row" style={{ marginTop: '8px' }}>
            <div className="form-group">
              <label>Open Graph Title</label>
              <input 
                type="text" 
                placeholder="Social share title" 
                value={formData.og_title}
                onChange={(e) => setFormData({...formData, og_title: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Open Graph Description</label>
              <textarea 
                placeholder="Social share description" 
                rows="2"
                value={formData.og_description}
                onChange={(e) => setFormData({...formData, og_description: e.target.value})}
              ></textarea>
            </div>
          </div>

          {/* Google Search Preview for Product */}
          <div className="google-preview-container" style={{ marginTop: '16px' }}>
            <h4>Google Search Preview</h4>
            <div className="google-preview-box">
              <div className="google-url">
                {formData.canonical_url || `https://kreatorstore.com/store/store-slug/product/${productId || 'product-slug'}`}
              </div>
              <div className="google-title">
                {formData.seo_title || formData.name || 'Product Name'}
              </div>
              <div className="google-description">
                {formData.seo_description || formData.description || 'No description provided. Add an SEO description to help people find your product.'}
              </div>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="form-footer-actions">
          <button type="button" className="cancel-btn" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="save-submit-btn" disabled={saving} onClick={handleSaveProduct}>
            {saving ? (
              'Saving...'
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                Save Product
              </>
            )}
          </button>
        </div>
      </div>

      <style jsx>{`
        .add-product-page-container {
          padding: 0 0 40px 0;
          width: 100%;
          font-family: 'Outfit', sans-serif;
        }

        .add-product-header {
          margin-bottom: 24px;
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #6366f1;
          font-weight: 700;
          font-size: 13px;
          text-decoration: none;
          margin-bottom: 12px;
          transition: transform 0.2s ease;
        }

        .back-link:hover {
          transform: translateX(-4px);
        }

        .title-row h1 {
          font-size: 26px;
          font-weight: 800;
          color: #1e293b;
          margin: 0;
        }

        .title-row p {
          font-size: 13px;
          color: #64748b;
          margin: 2px 0 0 0;
        }

        .product-form-card {
          background: #fff;
          border-radius: 16px;
          padding: 32px;
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.03);
          border: 1px solid #f1f5f9;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .form-group label {
          font-size: 12px;
          font-weight: 700;
          color: #1e293b;
        }

        .input-with-icon, .input-with-icon-right {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-prefix {
          position: absolute;
          left: 10px;
          color: #8b5cf6;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f3ff;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 13px;
        }

        .input-with-icon input, .input-with-icon select {
          padding-left: 44px !important;
        }

        .input-with-icon-right svg {
          position: absolute;
          right: 10px;
          background: #f5f3ff;
          padding: 5px;
          border-radius: 6px;
        }

        .form-group input, .form-group textarea, .form-group select {
          width: 100%;
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
          font-size: 13px;
          outline: none;
          transition: border-color 0.2s;
          font-family: inherit;
        }

        .form-group select {
          appearance: none;
          cursor: pointer;
        }

        .form-group input:focus, .form-group textarea:focus, .form-group select:focus {
          border-color: #8b5cf6;
        }

        .required {
          color: #ef4444;
          margin-left: 2px;
        }

        .help-text {
          font-size: 11px;
          color: #94a3b8;
          margin: 2px 0 0 0;
        }

        .product-upload-box {
          border: 1.5px dashed #e2e8f0;
          border-radius: 10px;
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          background: #fff;
          cursor: pointer;
          transition: border-color 0.2s;
        }

        .product-upload-box:hover {
          border-color: #8b5cf6;
        }

        .upload-circle {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #f5f3ff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .upload-text {
          display: flex;
          flex-direction: column;
        }

        .upload-text strong {
          font-size: 13px;
          color: #1e293b;
        }

        .upload-text span {
          font-size: 12px;
          color: #64748b;
        }

        .text-btn {
          background: none;
          border: none;
          color: #6366f1;
          font-weight: 700;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }

        .upload-sub {
          font-size: 10px;
          color: #94a3b8;
          margin: 2px 0 0 0;
        }

        .images-preview-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 12px;
        }

        .image-preview-item {
          width: 90px;
          height: 90px;
          border-radius: 12px;
          position: relative;
          overflow: hidden;
          border: 2px solid #e2e8f0;
          background: #f8fafc;
          transition: all 0.2s ease;
        }

        .image-preview-item.is-main {
          border-color: #8b5cf6;
          box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.15);
        }

        .image-preview-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .main-image-badge {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: #8b5cf6;
          color: white;
          font-size: 10px;
          font-weight: 700;
          text-align: center;
          padding: 4px 0;
          z-index: 5;
        }

        .set-main-action-btn {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(15, 23, 42, 0.7);
          color: white;
          font-size: 10px;
          font-weight: 600;
          text-align: center;
          padding: 4px 0;
          border: none;
          cursor: pointer;
          transition: background 0.2s;
          z-index: 5;
        }

        .set-main-action-btn:hover {
          background: #8b5cf6;
        }

        .remove-image-btn {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 20px;
          height: 20px;
          background: rgba(239, 68, 68, 0.9);
          color: white;
          border: none;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0.8;
          transition: opacity 0.2s, transform 0.2s;
          z-index: 10;
        }

        .remove-image-btn:hover {
          opacity: 1;
          transform: scale(1.1);
        }

        .google-preview-container {
          background: #f8fafc;
          border-radius: 12px;
          padding: 16px;
          border: 1px solid #e2e8f0;
        }

        .google-preview-container h4 {
          font-size: 13px;
          font-weight: 800;
          color: #475569;
          margin: 0 0 10px 0;
        }

        .google-preview-box {
          font-family: Arial, sans-serif;
        }

        .google-url {
          font-size: 12px;
          color: #202124;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .google-title {
          font-size: 16px;
          color: #1a0dab;
          text-decoration: none;
          margin-bottom: 4px;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 400;
        }

        .google-title:hover {
          text-decoration: underline;
        }

        .google-description {
          font-size: 13px;
          color: #4d5156;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .form-footer-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 32px;
          border-top: 1px solid #f1f5f9;
          padding-top: 24px;
        }

        .cancel-btn {
          padding: 10px 24px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #475569;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cancel-btn:hover {
          background: #f8fafc;
          color: #1e293b;
        }

        .save-submit-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 28px;
          border-radius: 8px;
          background: #6366f1;
          color: #fff;
          border: none;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        }

        .save-submit-btn:hover {
          background: #4f46e5;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
        }

        .save-submit-btn:disabled {
          background: #cbd5e1;
          color: #94a3b8;
          box-shadow: none;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .product-form-card {
            padding: 20px !important;
          }
          .form-row {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .form-footer-actions {
            flex-direction: column-reverse;
          }
          .form-footer-actions button, .form-footer-actions .cancel-btn {
            width: 100%;
            justify-content: center;
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
}

export default function AddProductPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AddProductFormContent />
    </Suspense>
  );
}
