import { supabaseClient } from '@/lib/supabase';
import { products } from '@/data/mockData';

const compressImage = (file, maxWidth = 800, maxHeight = 800) => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.FileReader) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new window.Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target.result);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // Compress as optimized JPEG at 70% quality
      };
      img.onerror = () => {
        resolve(event.target.result);
      };
    };
    reader.onerror = () => resolve('');
  });
};

const compressImageBase64 = (base64Str, maxWidth = 800, maxHeight = 800) => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !base64Str || !base64Str.startsWith('data:')) {
      resolve(base64Str || '');
      return;
    }

    const img = new window.Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

const generateUniqueProductSlug = async (storeId, name, productId = null) => {
  let baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
  if (!baseSlug) baseSlug = 'product';
  
  if (!supabaseClient) {
    let finalSlug = baseSlug;
    let counter = 1;
    const existing = products.filter(p => p.store_id === storeId && (productId ? p.id !== productId : true));
    const existingSlugs = existing.map(p => p.slug || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, ''));
    while (existingSlugs.includes(finalSlug)) {
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }
    return finalSlug;
  }

  let finalSlug = baseSlug;
  let counter = 1;
  let exists = true;
  
  while (exists) {
    let query = supabaseClient
      .from('products')
      .select('id')
      .eq('store_id', storeId)
      .eq('slug', finalSlug);
      
    if (productId) {
      query = query.neq('id', productId);
    }
    
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    } else {
      exists = false;
    }
  }
  return finalSlug;
};

export const productService = {
  /**
   * Fetch a single product details by store ID and slug
   */
  getProductBySlug: async (storeId, slug) => {
    if (!supabaseClient) {
      const match = products.find(p => p.store_id === storeId && (p.slug === slug || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug));
      return match || null;
    }
    try {
      const { data, error } = await supabaseClient
        .from('products')
        .select('*, store:store_id(*), category:category_id(*)')
        .eq('store_id', storeId)
        .eq('slug', slug);

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const product = data[0];
      return {
        ...product,
        image: product.image_url || 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800',
        images: product.images || [product.image_url],
        category: product.category?.name || 'Uncategorized',
      };
    } catch (e) {
      console.error('Error fetching product by slug:', e);
      return null;
    }
  },
  /**
   * Fetch all products matching a specific storeId
   */
  getProductsByStore: async (storeId, includeDraft = false) => {
    if (!supabaseClient) return products;
    try {
      let query = supabaseClient
        .from('products')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });

      if (!includeDraft) {
        query = query.eq('status', 'Published');
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || [])
        .filter(p => !p.is_deleted)
        .map(p => ({
          ...p,
          image: p.image_url || 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800',
          images: p.images || [p.image_url],
        }));
    } catch (e) {
      console.error('Error fetching products by store:', e);
      return [];
    }
  },

  /**
   * Fetch a single product details by its ID
   */
  getProductById: async (productId) => {
    if (!supabaseClient) return products.find(p => p.id === parseInt(productId) || p.id === productId) || null;
    try {
      const { data, error } = await supabaseClient
        .from('products')
        .select('*, store:store_id(*), category:category_id(*)')
        .eq('id', productId);

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const product = data[0];
      return {
        ...product,
        image: product.image_url || 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800',
        images: product.images || [product.image_url],
        category: product.category?.name || 'Uncategorized',
      };
    } catch (e) {
      console.error('Error fetching product by ID:', e);
      return null;
    }
  },

  /**
   * Create a new product
   */
  createProduct: async (productInput) => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');

    console.log('[Kreatorstore - ProductService] createProduct input:', productInput);

    let mainImage = productInput.image || productInput.image_url || '';
    if (typeof mainImage === 'string' && mainImage.startsWith('data:')) {
      mainImage = await compressImageBase64(mainImage, 800, 800);
    }

    const compressedImages = [];
    if (productInput.images && Array.isArray(productInput.images)) {
      for (let img of productInput.images) {
        if (typeof img === 'string' && img.startsWith('data:')) {
          compressedImages.push(await compressImageBase64(img, 800, 800));
        } else {
          compressedImages.push(img);
        }
      }
    }

    const slug = productInput.slug || await generateUniqueProductSlug(productInput.store_id, productInput.name);

    const dbInput = {
      store_id: productInput.store_id,
      category_id: productInput.category_id || null,
      name: productInput.name,
      slug,
      description: productInput.description || '',
      price: parseFloat(productInput.price) || 0.00,
      image_url: mainImage,
      images: compressedImages,
      status: productInput.status || 'Published',
      stock: parseInt(productInput.stock) || 0,
      featured: !!productInput.featured,
      seo_title: productInput.seo_title || null,
      seo_description: productInput.seo_description || null,
      og_title: productInput.og_title || null,
      og_description: productInput.og_description || null,
      canonical_url: productInput.canonical_url || null,
      spec_dimensions: productInput.spec_dimensions !== undefined ? productInput.spec_dimensions : undefined,
      spec_material: productInput.spec_material !== undefined ? productInput.spec_material : undefined,
      spec_finish: productInput.spec_finish !== undefined ? productInput.spec_finish : undefined,
      spec_warranty: productInput.spec_warranty !== undefined ? productInput.spec_warranty : undefined,
      spec_origin: productInput.spec_origin !== undefined ? productInput.spec_origin : undefined,
      shipping_details: productInput.shipping_details !== undefined ? productInput.shipping_details : undefined,
      return_policy: productInput.return_policy !== undefined ? productInput.return_policy : undefined,
      weight: productInput.weight !== undefined ? productInput.weight : null,
    };

    console.log('[Kreatorstore - ProductService] dbInput mapped:', dbInput);

    const { data, error } = await supabaseClient
      .from('products')
      .insert([dbInput])
      .select();

    if (error) {
      console.error('[Kreatorstore - ProductService] Error creating product:', error);
      throw new Error(error.message || 'Failed to create product');
    }

    if (!data || data.length === 0) {
      throw new Error('Failed to create product: No data returned.');
    }

    const created = data[0];
    return {
      ...created,
      image: created.image_url,
      images: created.images
    };
  },

  /**
   * Update existing product record
   */
  updateProduct: async (productId, updateInput) => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');

    console.log('[Kreatorstore - ProductService] updateProduct input:', { productId, updateInput });

    let mainImage = updateInput.image || updateInput.image_url;
    if (typeof mainImage === 'string' && mainImage.startsWith('data:')) {
      mainImage = await compressImageBase64(mainImage, 800, 800);
    }

    const compressedImages = [];
    if (updateInput.images && Array.isArray(updateInput.images)) {
      for (let img of updateInput.images) {
        if (typeof img === 'string' && img.startsWith('data:')) {
          compressedImages.push(await compressImageBase64(img, 800, 800));
        } else {
          compressedImages.push(img);
        }
      }
    }

    let slug = updateInput.slug;
    if (updateInput.name && !slug) {
      const { data: currentProduct } = await supabaseClient
        .from('products')
        .select('store_id')
        .eq('id', productId)
        .single();
      if (currentProduct) {
        slug = await generateUniqueProductSlug(currentProduct.store_id, updateInput.name, productId);
      }
    }

    const dbInput = {
      category_id: updateInput.category_id !== undefined ? updateInput.category_id : undefined,
      name: updateInput.name,
      slug: slug,
      description: updateInput.description,
      price: updateInput.price !== undefined ? parseFloat(updateInput.price) : undefined,
      image_url: mainImage,
      images: updateInput.images !== undefined ? compressedImages : undefined,
      status: updateInput.status,
      stock: updateInput.stock !== undefined ? parseInt(updateInput.stock) : undefined,
      featured: updateInput.featured !== undefined ? !!updateInput.featured : undefined,
      seo_title: updateInput.seo_title,
      seo_description: updateInput.seo_description,
      og_title: updateInput.og_title,
      og_description: updateInput.og_description,
      canonical_url: updateInput.canonical_url,
      spec_dimensions: updateInput.spec_dimensions,
      spec_material: updateInput.spec_material,
      spec_finish: updateInput.spec_finish,
      spec_warranty: updateInput.spec_warranty,
      spec_origin: updateInput.spec_origin,
      shipping_details: updateInput.shipping_details,
      return_policy: updateInput.return_policy,
      weight: updateInput.weight !== undefined ? updateInput.weight : undefined,
    };

    // Filter undefined keys
    Object.keys(dbInput).forEach(key => dbInput[key] === undefined && delete dbInput[key]);

    console.log('[Kreatorstore - ProductService] dbInput mapped:', dbInput);

    const { data, error } = await supabaseClient
      .from('products')
      .update(dbInput)
      .eq('id', productId)
      .select();

    if (error) {
      console.error('[Kreatorstore - ProductService] Error updating product:', error);
      throw new Error(error.message || 'Failed to update product');
    }

    if (!data || data.length === 0) {
      throw new Error('Failed to update product: No data returned.');
    }

    const updated = data[0];
    return {
      ...updated,
      image: updated.image_url,
      images: updated.images
    };
  },

  deleteProduct: async (productId) => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');

    // Soft delete product by setting is_deleted = true
    const { error } = await supabaseClient
      .from('products')
      .update({ is_deleted: true })
      .eq('id', productId);

    if (error) {
      console.error('[Kreatorstore - ProductService] Error deleting product:', error);
      throw new Error(error.message || 'Failed to delete product');
    }
    return true;
  },

  /**
   * Upload product image file to product-images storage bucket
   */
  uploadProductImage: async (file, storeId) => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');
    const fileExt = file.name.split('.').pop();
    const filePath = `${storeId}/product-${Date.now()}.${fileExt}`;

    try {
      const { data, error } = await supabaseClient.storage
        .from('product-images')
        .upload(filePath, file, { upsert: true });
        
      if (error) {
        if (error.message?.includes('Bucket not found') || error.message?.includes('bucket_not_found')) {
          console.warn('[Kreatorstore - Storage] Bucket "product-images" not found. Attempting to create it...');
          try {
            await supabaseClient.storage.createBucket('product-images', { public: true });
            const { data: retryData, error: retryError } = await supabaseClient.storage
              .from('product-images')
              .upload(filePath, file, { upsert: true });
            if (!retryError) {
              const { data: { publicUrl } } = supabaseClient.storage
                .from('product-images')
                .getPublicUrl(filePath);
              return publicUrl;
            }
          } catch (createErr) {
            console.error('[Kreatorstore - Storage] Failed to create bucket programmatically:', createErr.message);
          }
        }
        console.warn('[Kreatorstore - Storage] Falling back to compressed Base64 data URL for product image.');
        return await compressImage(file, 800, 800);
      }
      
      const { data: { publicUrl } } = supabaseClient.storage
        .from('product-images')
        .getPublicUrl(filePath);
        
      return publicUrl;
    } catch (err) {
      console.warn('[Kreatorstore - Storage] Error uploading product image, falling back to Base64:', err.message);
      return await compressImage(file, 800, 800);
    }
  },

  /**
   * Fetch related products (same category and same store)
   */
  getRelatedProducts: async (storeId, categoryName, currentProductId) => {
    if (!supabaseClient) return [];
    try {
      // Find category first
      let categoryId = null;
      try {
        const { data: catData, error: catError } = await supabaseClient
          .from('categories')
          .select('id')
          .eq('store_id', storeId)
          .eq('name', categoryName);

        if (!catError && catData && catData.length > 0) {
          categoryId = catData[0].id;
        }
      } catch (catErr) {
        console.error('Error matching category in related products:', catErr);
      }

      let query = supabaseClient
        .from('products')
        .select('*')
        .eq('store_id', storeId)
        .eq('status', 'Published')
        .neq('id', currentProductId)
        .limit(4);

      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(p => ({
        ...p,
        image: p.image_url,
        images: p.images
      }));
    } catch (e) {
      console.error('Error fetching related products:', e);
      return [];
    }
  }
};

export default productService;
