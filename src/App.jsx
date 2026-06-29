import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { compressImage } from './utils/imageCompressor';
import AltImage from './components/AltImage';
import AutomatedCampaignsDashboard from './components/AutomatedCampaignsDashboard';
import HomepageManagerDashboard from './components/HomepageManagerDashboard';
import {
  Settings, Save, AlertCircle, Package, Search, X, Edit, Tags,
  Image as ImageIcon, Database, Info, ShoppingCart, Phone, Mail,
  Send, CheckSquare, Square, Sparkles, Upload, Wand2, Plus,
  Layers, Trash2, LayoutDashboard, ChevronRight, Eye, ChevronDown, ChevronUp,
  Truck, Clock, ArrowLeftRight, PackageCheck, Percent, RefreshCw
} from 'lucide-react';

// Axios request interceptor to dynamically inject target credentials
axios.interceptors.request.use((config) => {
  const storeUrl = localStorage.getItem('shopifyStoreUrl') || import.meta.env.VITE_SHOPIFY_STORE_URL || '';
  const accessToken = localStorage.getItem('shopifyAccessToken') || import.meta.env.VITE_SHOPIFY_ACCESS_TOKEN || '';
  if (storeUrl) {
    config.headers['x-client-store-url'] = storeUrl.trim();
  }
  if (accessToken) {
    config.headers['x-client-access-token'] = accessToken.trim();
  }
  return config;
});

export default function App() {
  const [storeUrl, setStoreUrl] = useState(() => localStorage.getItem('shopifyStoreUrl') || import.meta.env.VITE_SHOPIFY_STORE_URL || '');
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('shopifyAccessToken') || import.meta.env.VITE_SHOPIFY_ACCESS_TOKEN || '');
  const [storeName, setStoreName] = useState(() => localStorage.getItem('shopifyStoreName') || '');
  const [storeLogoUrl, setStoreLogoUrl] = useState(() => localStorage.getItem('shopifyStoreLogoUrl') || '');

  const isConfigured = !!storeUrl && !!accessToken;

  const [activeTab, setActiveTab] = useState('products');
  const [showSettings, setShowSettings] = useState(false);

  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [collections, setCollections] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [publications, setPublications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mainThemeId, setMainThemeId] = useState('');
  const [shopId, setShopId] = useState('');
  const [categoryOrder, setCategoryOrder] = useState(["t-shirts", "shorts", "trackpants", "swimwear", "joggers", "accessories"]);
  const [catOrderSaving, setCatOrderSaving] = useState(false);
  const [catOrderSuccess, setCatOrderSuccess] = useState('');
  const [catOrderError, setCatOrderError] = useState('');
  const [catOrderDirty, setCatOrderDirty] = useState(false);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCollection, setFilterCollection] = useState('');
  const [sortOption, setSortOption] = useState('newest');

  // The product currently being edited in the modal
  const [editingProduct, setEditingProduct] = useState(null);

  // Define main collections (parent collections) to avoid hyphen matching bugs
  const mainHandles = ['t-shirts', 'trackpants', 'swimwear', 'shorts', 'joggers', 'accessories', 'frontpage', 'avada-best-sellers', 'cockroach-special'];

  useEffect(() => {
    if (isConfigured) {
      fetchInitialData();
    }
  }, [isConfigured]);

  const fetchInitialData = async () => {
    setLoading(true);
    setError('');
    try {
      const initQuery = `
        query {
          publications(first: 50) { edges { node { id name } } }
          shop {
            id
            name
            metafield(namespace: "price_editor", key: "category_order") {
              value
            }
            productVendors(first: 250) { edges { node } }
            productTypes(first: 250) { edges { node } }
          }
          locations(first: 5) {
            edges { node { id name isActive } }
          }
          collections(first: 250) {
            edges { node { id title handle } }
          }
          themes(first: 10) {
            edges {
              node {
                id
                role
                files(first: 1, filenames: ["config/settings_data.json"]) {
                  nodes {
                    body {
                      ... on OnlineStoreThemeFileBodyText {
                        content
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      const initRes = await axios.post('/api/shopify/graphql.json', { query: initQuery });
      if (initRes.data.errors) throw new Error(initRes.data.errors[0].message);

      const locs = initRes.data.data.locations.edges.map(e => e.node).filter(l => l.isActive);
      setLocations(locs);
      setCollections(initRes.data.data.collections.edges.map(e => e.node));
      setVendors(initRes.data.data.shop.productVendors.edges.map(e => e.node).filter(Boolean));
      setProductTypes(initRes.data.data.shop.productTypes.edges.map(e => e.node).filter(Boolean));
      setPublications(initRes.data.data.publications.edges.map(e => e.node));

      const shopData = initRes.data.data.shop;
      setShopId(shopData.id || '');
      if (shopData.metafield?.value) {
        try {
          const parsedOrder = JSON.parse(shopData.metafield.value);
          if (Array.isArray(parsedOrder) && parsedOrder.length > 0) {
            setCategoryOrder(parsedOrder);
          }
        } catch (e) {
          console.error("Error parsing category order metafield:", e);
        }
      }

      // Auto-discover Shop Name from Shopify
      const fetchedShopName = initRes.data.data.shop?.name || '';
      if (fetchedShopName) {
        setStoreName(fetchedShopName);
        localStorage.setItem('shopifyStoreName', fetchedShopName);
      }

      // Auto-discover Store Logo from published theme
      const mainTheme = initRes.data.data.themes?.edges?.find(e => e.node.role === 'MAIN');
      if (mainTheme) {
        setMainThemeId(mainTheme.node.id.split('/').pop());
      }
      const settingsContent = mainTheme?.node?.files?.nodes?.[0]?.body?.content;
      if (settingsContent) {
        try {
          const cleanJsonStr = settingsContent.replace(/\/\*[\s\S]*?\*\//g, '').trim();
          const parsedSettings = JSON.parse(cleanJsonStr);
          const currentSettings = parsedSettings.current || parsedSettings;

          // Auto-discover logo URL
          const logoUri = currentSettings?.logo;
          if (logoUri && logoUri.startsWith('shopify://shop_images/')) {
            const logoFilename = logoUri.replace('shopify://shop_images/', '');
            if (logoFilename) {
              const fileQuery = `
                query {
                  files(first: 1, query: "filename:${logoFilename}") {
                    edges {
                      node {
                        ... on MediaImage {
                          image {
                            url
                          }
                        }
                      }
                    }
                  }
                }
              `;
              const fileRes = await axios.post('/api/shopify/graphql.json', { query: fileQuery });
              const logoUrl = fileRes.data?.data?.files?.edges?.[0]?.node?.image?.url;
              if (logoUrl) {
                setStoreLogoUrl(logoUrl);
                localStorage.setItem('shopifyStoreLogoUrl', logoUrl);
              }
            }
          }

          // Auto-discover social links
          const socialLinks = {
            facebook: currentSettings?.social_facebook_link || '',
            instagram: currentSettings?.social_instagram_link || '',
            twitter: currentSettings?.social_twitter_link || '',
            youtube: currentSettings?.social_youtube_link || '',
            tiktok: currentSettings?.social_tiktok_link || ''
          };

          const savedRecovery = localStorage.getItem('recoverySettings');
          const parsedRecovery = savedRecovery ? JSON.parse(savedRecovery) : {};
          let hasUpdates = false;
          if (socialLinks.facebook && !parsedRecovery.socialFacebook) { parsedRecovery.socialFacebook = socialLinks.facebook; hasUpdates = true; }
          if (socialLinks.instagram && !parsedRecovery.socialInstagram) { parsedRecovery.socialInstagram = socialLinks.instagram; hasUpdates = true; }
          if (socialLinks.twitter && !parsedRecovery.socialTwitter) { parsedRecovery.socialTwitter = socialLinks.twitter; hasUpdates = true; }
          if (socialLinks.youtube && !parsedRecovery.socialYoutube) { parsedRecovery.socialYoutube = socialLinks.youtube; hasUpdates = true; }
          if (socialLinks.tiktok && !parsedRecovery.socialTiktok) { parsedRecovery.socialTiktok = socialLinks.tiktok; hasUpdates = true; }
          if (hasUpdates) {
            localStorage.setItem('recoverySettings', JSON.stringify(parsedRecovery));
          }
        } catch (jsonErr) {
          console.warn("Failed to parse settings_data.json for branding/socials", jsonErr);
        }
      }

      await fetchProducts();
    } catch (err) {
      setError(err.message || 'Failed to initialize data');
      console.error(err);
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      let allProducts = [];
      let hasNextPage = true;
      let cursor = null;
      let fetchedCount = 0;

      while (hasNextPage && fetchedCount < 500) {
        const query = `
          query($cursor: String) {
            products(first: 50, sortKey: CREATED_AT, reverse: true, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  title
                  vendor
                  productType
                  tags
                  handle
                  descriptionHtml
                  seo { title description }
                  resourcePublications(first: 50) { edges { node { publication { id } isPublished } } }
                  collections(first: 10) { edges { node { id title handle } } }
                  images(first: 2) { edges { node { id url } } }
                  variants(first: 50) {
                    edges {
                      node {
                        id
                        title
                        price
                        compareAtPrice
                        inventoryItem {
                          id
                          inventoryLevels(first: 10) {
                            edges {
                              node {
                                location { id }
                                quantities(names: ["available"]) { quantity }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `;
        const response = await axios.post('/api/shopify/graphql.json', { query, variables: { cursor } });
        if (response.data.errors) throw new Error(response.data.errors[0].message);
        
        const productsData = response.data.data.products;
        const nodes = productsData.edges.map(edge => edge.node);
        allProducts = [...allProducts, ...nodes];
        
        hasNextPage = productsData.pageInfo.hasNextPage;
        cursor = productsData.pageInfo.endCursor;
        fetchedCount += nodes.length;
      }

      setProducts(allProducts);
    } catch (err) {
      setError(err.message || 'Failed to fetch products');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  if (!isConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4 font-sans text-slate-100">
        <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-700 text-center">
          <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-6">
            <Settings className="w-8 h-8 text-yellow-500 animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Configuration Required</h1>
          <p className="text-slate-400 mb-6 text-sm">
            Please open the <code className="bg-slate-900 px-2 py-1 rounded text-red-400 text-xs">.env</code> file in your project folder and add your Shopify Store URL and Admin API Access Token.
          </p>
        </div>
      </div>
    );
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus ? p.status === filterStatus : true;
    const matchesCollection = filterCollection ? p.collections?.edges?.some(e => e.node.id === filterCollection) : true;
    return matchesSearch && matchesStatus && matchesCollection;
  }).sort((a, b) => {
    if (sortOption === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortOption === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    
    const getPrice = (p) => {
      const prices = p.variants?.edges?.map(e => parseFloat(e.node.price)).filter(val => !isNaN(val));
      return prices && prices.length > 0 ? Math.min(...prices) : 0;
    };
    
    if (sortOption === 'price_low_high') return getPrice(a) - getPrice(b);
    if (sortOption === 'price_high_low') return getPrice(b) - getPrice(a);
    if (sortOption === 'alpha_a_z') return a.title.localeCompare(b.title);
    if (sortOption === 'alpha_z_a') return b.title.localeCompare(a.title);
    return 0;
  });
  const primaryLocationId = locations[0]?.id;

  return (
    <div className="h-screen bg-[#0F172A] text-slate-100 font-sans flex overflow-hidden">
      {/* LEFT SIDEBAR - PREMIUM DESIGN */}
      <aside className="w-64 bg-[#1E293B] border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          {storeLogoUrl ? (
            <img src={storeLogoUrl} alt={storeName || 'Store Logo'} className="w-10 h-10 object-contain rounded-lg bg-slate-900 border border-slate-700 p-1 shrink-0" />
          ) : (
            <div className="bg-gradient-to-tr from-yellow-500 to-amber-600 p-2 rounded-xl shadow-md shadow-amber-500/20 shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-base font-extrabold text-white tracking-wide uppercase leading-tight truncate">{storeName || 'Shopify Manager'}</h1>
            <p className="text-[10px] text-slate-400 font-medium truncate max-w-[150px]">{storeUrl}</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <button
            onClick={() => setActiveTab('products')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'products' ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/5 text-yellow-500 border border-yellow-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'}`}
          >
            <Package className="w-4 h-4" /> Products
          </button>
          <button
            onClick={() => setActiveTab('subcategories')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'subcategories' ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/5 text-yellow-500 border border-yellow-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'}`}
          >
            <Layers className="w-4 h-4" /> Subcategories
          </button>
          <button
            onClick={() => setActiveTab('delivery')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'delivery' ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/5 text-yellow-500 border border-yellow-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'}`}
          >
            <Truck className="w-4 h-4" /> Delivery Pipeline
          </button>
          <button
            onClick={() => setActiveTab('bulk-editor')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'bulk-editor' ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/5 text-yellow-500 border border-yellow-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'}`}
          >
            <Percent className="w-4 h-4" /> Bulk Price Editor
          </button>
          <button
            onClick={() => setActiveTab('seo-optimizer')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'seo-optimizer' ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/5 text-yellow-500 border border-yellow-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'}`}
          >
            <Sparkles className="w-4 h-4" /> AI SEO Optimizer
          </button>
          <button
            onClick={() => setActiveTab('alt-tagger')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'alt-tagger' ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/5 text-yellow-500 border border-yellow-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'}`}
          >
            <ImageIcon className="w-4 h-4" /> Alt Tag Manager
          </button>
          <button
            onClick={() => setActiveTab('offers')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'offers' ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/5 text-yellow-500 border border-yellow-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'}`}
          >
            <Tags className="w-4 h-4" /> Offers & Promos
          </button>
          <button
            onClick={() => setActiveTab('collections-manager')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'collections-manager' ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/5 text-yellow-500 border border-yellow-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'}`}
          >
            <LayoutDashboard className="w-4 h-4" /> Collections Manager
          </button>
          <button
            onClick={() => setActiveTab('combo-creator')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'combo-creator' ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/5 text-yellow-500 border border-yellow-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'}`}
          >
            <Layers className="w-4 h-4" /> Combo Creator
          </button>
          <button
            onClick={() => setActiveTab('homepage-manager')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'homepage-manager' ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/5 text-yellow-500 border border-yellow-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'}`}
          >
            <LayoutDashboard className="w-4 h-4" /> Homepage Manager
          </button>

        </nav>

        <div className="p-4 border-t border-slate-800 bg-[#151D30] space-y-3">
          <button
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <span className="flex items-center gap-2"><Settings className="w-4 h-4" /> Settings</span>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>

          <div className="pt-2 border-t border-slate-800/40 text-center select-none">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-sm">
              Made with ❤️ by Nitin Kaushik
            </span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0B0F19]">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-slate-800 px-8 flex items-center justify-between bg-[#0F172A]/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex-1 w-full relative">
            {activeTab === 'products' && (
              <div className="flex items-center gap-3 w-full lg:w-[650px] absolute left-0 top-1/2 -translate-y-1/2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 transition-all placeholder:text-slate-500 shadow-inner"
                  />
                </div>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 shrink-0">
                  <option value="">Status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
                <select value={filterCollection} onChange={e => setFilterCollection(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 shrink-0 max-w-[140px]">
                  <option value="">Categories</option>
                  {collections && collections.map(col => (
                    <option key={col.id} value={col.id}>{col.title}</option>
                  ))}
                </select>
                <select value={sortOption} onChange={e => setSortOption(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 shrink-0">
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="price_low_high">Price: Low-High</option>
                  <option value="price_high_low">Price: High-Low</option>
                  <option value="alpha_a_z">Name: A-Z</option>
                  <option value="alpha_z_a">Name: Z-A</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto max-w-7xl w-full mx-auto font-sans">
          {error && (
            <div className="mb-6 p-4 bg-red-950/40 border border-red-800/60 rounded-2xl flex items-center gap-3 text-red-400 shadow-md">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {activeTab === 'products' ? (
            loading && products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-40 text-slate-400">
                <div className="w-10 h-10 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="font-semibold text-sm">Fetching store data...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProducts.map(product => {
                  const variantCount = product.variants.edges.length;
                  const imgUrl = product.images.edges[0]?.node.url;

                  // Calculate price range
                  const prices = product.variants.edges.map(e => parseFloat(e.node.price)).filter(p => !isNaN(p));
                  const comparePrices = product.variants.edges.map(e => parseFloat(e.node.compareAtPrice)).filter(p => !isNaN(p) && p > 0);
                  const minPrice = prices.length ? Math.min(...prices) : 0;
                  const maxPrice = prices.length ? Math.max(...prices) : 0;
                  const minCompare = comparePrices.length ? Math.min(...comparePrices) : 0;
                  const priceDisplay = minPrice === maxPrice ? `₹${minPrice.toFixed(0)}` : `₹${minPrice.toFixed(0)} – ₹${maxPrice.toFixed(0)}`;
                  const hasDiscount = minCompare > 0 && minCompare > minPrice;
                  const discountPct = hasDiscount ? Math.round((1 - minPrice / minCompare) * 100) : 0;

                  return (
                    <div key={product.id} className="bg-[#1E293B] border border-slate-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl hover:border-slate-700/80 transition-all flex flex-col group">
                      <div className="p-5 flex items-start gap-4">
                        {imgUrl ? (
                          <img src={imgUrl} alt={product.title} className="w-20 h-20 rounded-xl object-cover bg-slate-900 border border-slate-700/60 shadow-inner shrink-0" />
                        ) : (
                          <div className="w-20 h-20 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700/60 shadow-inner shrink-0">
                            <ImageIcon className="w-8 h-8 text-slate-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h2 className="font-bold text-base text-white leading-snug mb-1 group-hover:text-yellow-500 transition-colors truncate">{product.title}</h2>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">{variantCount} variant{variantCount !== 1 ? 's' : ''}</span>
                            {product.vendor && <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">{product.vendor}</span>}
                          </div>
                          {/* Price display */}
                          <div className="flex items-center gap-2 mt-2.5">
                            <span className="text-sm font-extrabold text-yellow-400">{priceDisplay}</span>
                            {hasDiscount && (
                              <>
                                <span className="text-xs text-slate-500 line-through">₹{minCompare.toFixed(0)}</span>
                                <span className="px-1.5 py-0.5 bg-green-500/15 text-green-400 text-[10px] font-bold rounded border border-green-500/25">{discountPct}% off</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="px-5 pb-5 mt-auto">
                        <button
                          onClick={() => setEditingProduct(product)}
                          className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm"
                        >
                          <Edit className="w-4 h-4" /> Edit Product
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : activeTab === 'subcategories' ? (
            <SubcategoriesDashboard
              products={products}
              setProducts={setProducts}
              collections={collections}
              setCollections={setCollections}
              mainHandles={mainHandles}
              mainThemeId={mainThemeId}
              onRefresh={() => {
                fetchInitialData();
              }}
            />
          ) : activeTab === 'bulk-editor' ? (
            <BulkEditorDashboard
              products={products}
              locations={locations}
              onRefresh={fetchInitialData}
            />
          ) : activeTab === 'seo-optimizer' ? (
            <SeoOptimizerDashboard
              products={products}
              onRefresh={fetchInitialData}
            />
          ) : activeTab === 'alt-tagger' ? (
            <AltImageManagerDashboard
              onRefresh={fetchInitialData}
            />
          ) : activeTab === 'offers' || activeTab === 'collections-manager' ? (
            <OffersDashboard
              mode={activeTab}
              collections={collections}
              mainHandles={mainHandles}
              products={products}
              categoryOrder={categoryOrder}
              setCategoryOrder={setCategoryOrder}
              catOrderSaving={catOrderSaving}
              setCatOrderSaving={setCatOrderSaving}
              catOrderSuccess={catOrderSuccess}
              setCatOrderSuccess={setCatOrderSuccess}
              catOrderError={catOrderError}
              setCatOrderError={setCatOrderError}
              catOrderDirty={catOrderDirty}
              setCatOrderDirty={setCatOrderDirty}
              shopId={shopId}
            />
          ) : activeTab === 'homepage-manager' ? (
            <HomepageManagerDashboard products={products} collections={collections} mainThemeId={mainThemeId} />
          ) : activeTab === 'combo-creator' ? (
            <ComboCreatorDashboard products={products} />
          ) : (
            <DeliveryPipelineDashboard />
          )}
        </main>
      </div>

      {editingProduct && (
        <ProductEditorModal
          product={editingProduct}
          products={products}
          onClose={() => setEditingProduct(null)}
          collections={collections}
          mainHandles={mainHandles}
          vendors={vendors}
          productTypes={productTypes}
          publications={publications}
          primaryLocationId={primaryLocationId}
          onSaved={() => {
            fetchProducts();
            setEditingProduct(null);
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          storeUrl={storeUrl}
          setStoreUrl={setStoreUrl}
          accessToken={accessToken}
          setAccessToken={setAccessToken}
          storeName={storeName}
          setStoreName={setStoreName}
          storeLogoUrl={storeLogoUrl}
          setStoreLogoUrl={setStoreLogoUrl}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function DeliveryPipelineDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const query = `
        query getRecentOrders {
          orders(first: 50, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                name
                createdAt
                totalPrice
                displayFulfillmentStatus
                customer {
                  firstName
                  lastName
                  email
                  phone
                }
                fulfillments(first: 3) {
                  id
                  status
                  displayStatus
                  trackingInfo {
                    company
                    number
                    url
                  }
                }
                tags
              }
            }
          }
        }
      `;
      const res = await axios.post('/api/shopify/graphql.json', { query });
      if (res.data.errors) throw new Error(res.data.errors[0].message);

      const fetchedOrders = res.data.data.orders.edges.map(e => e.node);
      setOrders(fetchedOrders);
    } catch (err) {
      setError(err.message || 'Failed to fetch orders from Shopify');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getOrderStatus = (order) => {
    // 1. Check tag overrides
    const statusTag = order.tags.find(t => t.startsWith('Status: '));
    if (statusTag) {
      const status = statusTag.replace('Status: ', '').toUpperCase().replace(/ /g, '_');
      if (['NOT_FULFILLED', 'PICKUP_PENDING', 'TRANSIT', 'DELIVERED', 'RETURNED'].includes(status)) {
        return status;
      }
    }

    // 2. Check native statuses
    const nativeFulfillment = order.displayFulfillmentStatus;
    if (nativeFulfillment === 'UNFULFILLED' || nativeFulfillment === 'PARTIALLY_FULFILLED') {
      return 'NOT_FULFILLED';
    }

    if (order.fulfillments && order.fulfillments.length > 0) {
      const fNode = order.fulfillments[0];
      const fStatus = fNode.displayStatus || fNode.status;
      if (fStatus === 'DELIVERED') return 'DELIVERED';
      if (fStatus === 'FAILURE' || fStatus === 'CANCELED' || fStatus === 'LABEL_VOIDED') return 'RETURNED';
      if (fStatus === 'READY_FOR_PICKUP' || fStatus === 'PICKED_UP') return 'PICKUP_PENDING';
      // Any other active fulfillment status is transit/fulfilled
      return 'TRANSIT';
    }

    return 'NOT_FULFILLED';
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Remove any existing status tags and add the new one
    const cleanTags = order.tags.filter(t => !t.startsWith('Status: '));
    const formattedStatus = newStatus.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    const newTags = [...cleanTags, `Status: ${formattedStatus}`];

    // Optimistic state update
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, tags: newTags } : o));

    try {
      const mutation = `
        mutation orderUpdate($input: OrderInput!) {
          orderUpdate(input: $input) {
            order {
              id
              tags
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      const res = await axios.post('/api/shopify/graphql.json', {
        query: mutation,
        variables: {
          input: {
            id: orderId,
            tags: newTags
          }
        }
      });
      if (res.data.errors) throw new Error(res.data.errors[0].message);
      if (res.data.data.orderUpdate.userErrors?.length > 0) {
        throw new Error(res.data.data.orderUpdate.userErrors[0].message);
      }
    } catch (err) {
      alert("Failed to update status in Shopify: " + err.message);
      fetchOrders(); // Revert to server state
    } finally {
      setUpdatingId(null);
    }
  };

  // Group columns
  const columns = [
    { key: 'NOT_FULFILLED', title: 'Not Fulfilled', color: 'border-t-red-500 bg-red-950/10 text-red-400', icon: <Clock className="w-4 h-4" /> },
    { key: 'PICKUP_PENDING', title: 'Pickup Pending', color: 'border-t-yellow-500 bg-yellow-950/10 text-yellow-400', icon: <Package className="w-4 h-4" /> },
    { key: 'TRANSIT', title: 'In Transit', color: 'border-t-blue-500 bg-blue-950/10 text-blue-400', icon: <Truck className="w-4 h-4" /> },
    { key: 'DELIVERED', title: 'Delivered', color: 'border-t-green-500 bg-green-950/10 text-green-400', icon: <PackageCheck className="w-4 h-4" /> },
    { key: 'RETURNED', title: 'Returned / Failed', color: 'border-t-slate-500 bg-slate-900/40 text-slate-400', icon: <X className="w-4 h-4" /> },
  ];

  if (loading && orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-40 text-slate-400">
        <div className="w-10 h-10 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-semibold text-sm">Fetching delivery pipelines...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-950/40 border border-red-800/60 rounded-2xl flex items-center gap-3 text-red-400 shadow-md">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
            <Truck className="w-6 h-6 text-yellow-500" /> Delivery Pipeline
          </h2>
          <p className="text-xs text-slate-400 mt-1">Track & group orders by fulfillment and logistics status in real-time.</p>
        </div>
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
        >
          {loading ? 'Refreshing...' : 'Refresh Pipeline'}
        </button>
      </div>

      {/* Kanban Board Container */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-start select-none min-h-[600px] overflow-x-auto pb-4">
        {columns.map(col => {
          const colOrders = orders.filter(o => getOrderStatus(o) === col.key);

          return (
            <div key={col.key} className={`bg-[#1E293B] border border-slate-800 rounded-2xl flex flex-col max-h-[700px] overflow-hidden shadow-lg border-t-4 ${col.color.split(' ')[0]}`}>
              {/* Column Header */}
              <div className="p-4 border-b border-slate-800/65 bg-[#151D30]/40 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className={col.color.split(' ').slice(1).join(' ')}>{col.icon}</span>
                  <h3 className="font-bold text-sm text-white tracking-tight">{col.title}</h3>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">{colOrders.length}</span>
              </div>

              {/* Column Body - Cards List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[300px]">
                {colOrders.length === 0 ? (
                  <div className="h-full flex items-center justify-center py-10 text-center text-xs text-slate-500 italic">
                    No orders in this stage
                  </div>
                ) : (
                  colOrders.map(order => {
                    const custName = order.customer ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim() : 'Guest Customer';
                    const activeFulfillment = order.fulfillments?.[0];
                    const tracking = activeFulfillment?.trackingInfo?.[0];

                    return (
                      <div
                        key={order.id}
                        className={`bg-[#0F172A] border border-slate-800/80 rounded-xl p-3.5 space-y-3 hover:border-slate-700 transition-all shadow-sm flex flex-col group relative ${updatingId === order.id ? 'opacity-40 pointer-events-none' : ''}`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-xs font-black text-white bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700/80 group-hover:text-yellow-500 transition-colors">
                            {order.name}
                          </span>
                          <span className="text-xs font-extrabold text-yellow-500">
                            ₹{order.totalPrice}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-200 truncate">{custName}</p>
                          {order.customer?.phone && (
                            <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-500" /> {order.customer.phone}
                            </p>
                          )}
                          {order.customer?.email && (
                            <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                              <Mail className="w-3 h-3 text-slate-500" /> {order.customer.email}
                            </p>
                          )}
                        </div>

                        {/* Tracking / Fulfillment details */}
                        {activeFulfillment && (
                          <div className="bg-[#1E293B]/60 p-2 rounded-lg border border-slate-800/40 space-y-1 text-[10px]">
                            {tracking && (
                              <>
                                <div className="flex justify-between items-center text-slate-400">
                                  <span className="font-semibold">Carrier:</span>
                                  <span className="text-slate-300 font-bold">{tracking.company}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-400">
                                  <span className="font-semibold">Tracking #:</span>
                                  {tracking.url ? (
                                    <a href={tracking.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-extrabold font-mono truncate max-w-[100px]">
                                      {tracking.number}
                                    </a>
                                  ) : (
                                    <span className="font-mono text-slate-300 truncate max-w-[100px]">{tracking.number}</span>
                                  )}
                                </div>
                              </>
                            )}
                            <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-800/30">
                              <span className="font-semibold">Live Status:</span>
                              <span className="text-yellow-500 font-bold tracking-wide">
                                {(activeFulfillment.displayStatus || activeFulfillment.status || '').replace(/_/g, ' ')}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Pipeline Stage Transitions Selector */}
                        <div className="pt-2 border-t border-slate-850 flex items-center justify-between gap-1.5 mt-auto">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Move status</span>
                          <select
                            value={col.key}
                            onChange={e => updateOrderStatus(order.id, e.target.value)}
                            className="bg-[#1E293B] border border-slate-700/60 text-slate-300 rounded-lg text-[10px] py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-500/50 cursor-pointer font-bold"
                          >
                            <option value="NOT_FULFILLED">Not Fulfilled</option>
                            <option value="PICKUP_PENDING">Pickup Pending</option>
                            <option value="TRANSIT">In Transit</option>
                            <option value="DELIVERED">Delivered</option>
                            <option value="RETURNED">Returned/Failed</option>
                          </select>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsModal({ storeUrl, setStoreUrl, accessToken, setAccessToken, storeName, setStoreName, storeLogoUrl, setStoreLogoUrl, onClose }) {
  const [activeSettingsTab, setActiveSettingsTab] = useState('shopify');
  const [localStoreUrl, setLocalStoreUrl] = useState(storeUrl);
  const [localAccessToken, setLocalAccessToken] = useState(accessToken);
  const [localStoreName, setLocalStoreName] = useState(storeName);
  const [localStoreLogoUrl, setLocalStoreLogoUrl] = useState(storeLogoUrl);

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('recoverySettings');
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      aiProvider: parsed.aiProvider || 'groq',
      geminiApiKey: parsed.geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || '',
      geminiModel: parsed.geminiModel || 'gemini-1.5-flash',
      groqApiKey: parsed.groqApiKey || import.meta.env.VITE_GROQ_API_KEY || '',
      groqModel: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct', 'qwen/qwen3.6-27b', 'openai/gpt-oss-120b'].includes(parsed.groqModel) ? parsed.groqModel : 'llama-3.3-70b-versatile'
    };
  });

  const saveSettings = () => {
    localStorage.setItem('shopifyStoreUrl', localStoreUrl.trim());
    localStorage.setItem('shopifyAccessToken', localAccessToken.trim());
    localStorage.setItem('shopifyStoreName', localStoreName.trim());
    localStorage.setItem('shopifyStoreLogoUrl', localStoreLogoUrl.trim());
    setStoreUrl(localStoreUrl.trim());
    setAccessToken(localAccessToken.trim());
    setStoreName(localStoreName.trim());
    setStoreLogoUrl(localStoreLogoUrl.trim());

    localStorage.setItem('recoverySettings', JSON.stringify(settings));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 overflow-hidden text-slate-100 font-sans">
      <div className="bg-[#1E293B] border border-slate-800 rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden max-w-3xl h-[65vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#151D30] shrink-0">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-yellow-500" /> Shopify Manager Settings
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Settings Tabs Sidebar */}
          <aside className="w-48 bg-[#151D30]/60 border-r border-slate-800 p-4 space-y-1.5 shrink-0 flex flex-col">
            <button
              onClick={() => setActiveSettingsTab('shopify')}
              className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${activeSettingsTab === 'shopify' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'}`}
            >
              Shopify Credentials
            </button>
            <button
              onClick={() => setActiveSettingsTab('ai')}
              className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${activeSettingsTab === 'ai' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'}`}
            >
              AI Engine Setup
            </button>
          </aside>

          {/* Config Panel Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#0B0F19]/40 space-y-6">

            {activeSettingsTab === 'shopify' && (
              <div className="space-y-4">
                <h3 className="font-semibold text-white flex items-center gap-2 text-sm">
                  <Database className="w-4 h-4 text-yellow-500" /> Shopify & Store Details
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">Enter your Shopify store URL, API credentials, and branding details.</p>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Shopify Store URL (e.g. store.myshopify.com)</label>
                  <input
                    type="text"
                    value={localStoreUrl}
                    onChange={e => setLocalStoreUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none font-semibold"
                    placeholder="store.myshopify.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Admin API Access Token (starts with shpat_...)</label>
                  <input
                    type="password"
                    value={localAccessToken}
                    onChange={e => setLocalAccessToken(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none"
                    placeholder="shpat_..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Store Name (Branding)</label>
                  <input
                    type="text"
                    value={localStoreName}
                    onChange={e => setLocalStoreName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none font-semibold"
                    placeholder="e.g. 11FIT"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Store Logo URL</label>
                  <input
                    type="text"
                    value={localStoreLogoUrl}
                    onChange={e => setLocalStoreLogoUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none"
                    placeholder="e.g. https://domain.com/logo.png"
                  />
                </div>
              </div>
            )}

            {activeSettingsTab === 'ai' && (
              <div className="space-y-4">
                <h3 className="font-semibold text-white flex items-center gap-2 text-sm">
                  <Sparkles className="w-4 h-4 text-yellow-500" /> AI Engine Configuration
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">Configure the AI Provider and models for the AI Copilot.</p>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">AI Provider</label>
                  <select value={settings.aiProvider} onChange={e => setSettings({ ...settings, aiProvider: e.target.value })} className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none">
                    <option value="gemini">Google Gemini</option>
                    <option value="groq">Groq</option>
                  </select>
                </div>

                {settings.aiProvider === 'gemini' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Google Gemini API Key (Overrides .env)</label>
                      <input type="password" value={settings.geminiApiKey} onChange={e => setSettings({ ...settings, geminiApiKey: e.target.value })} className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none" placeholder="AIzaSy..." />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Gemini Model</label>
                      <select value={settings.geminiModel} onChange={e => setSettings({ ...settings, geminiModel: e.target.value })} className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none">
                        <option value="gemini-1.5-flash">Gemini 1.5 Flash (Recommended)</option>
                        <option value="gemini-1.5-pro-latest">Gemini 1.5 Pro</option>
                        <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash</option>
                      </select>
                    </div>
                  </>
                )}

                {settings.aiProvider === 'groq' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Groq API Key</label>
                      <input type="password" value={settings.groqApiKey} onChange={e => setSettings({ ...settings, groqApiKey: e.target.value })} className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none" placeholder="gsk_..." />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Groq Model</label>
                      <select value={settings.groqModel} onChange={e => setSettings({ ...settings, groqModel: e.target.value })} className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none">
                        <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile (Recommended)</option>
                        <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
                        <option value="meta-llama/llama-4-scout-17b-16e-instruct">Llama 4 Scout 17B (Preview)</option>
                        <option value="qwen/qwen3.6-27b">Qwen 3.6 27B</option>
                        <option value="openai/gpt-oss-120b">GPT-OSS 120B</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-800 bg-[#151D30] flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-750 transition-colors">
            Cancel
          </button>
          <button onClick={saveSettings} className="px-6 py-2 rounded-xl text-sm font-bold text-slate-950 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 transition-all shadow-md">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper functions for description
const htmlToText = (html) => {
  if (!html) return '';
  let text = html.replace(/<br\s*[\/]?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/\n\s*\n/g, '\n\n');
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return doc.documentElement.textContent.trim();
};

const textToHtml = (text) => {
  if (!text) return '';
  return text.split('\n\n').map(p => `<p>${p.trim().replace(/\n/g, '<br/>')}</p>`).join('');
};

function ProductEditorModal({ product, products, onClose, collections, mainHandles, vendors, productTypes, publications, primaryLocationId, onSaved }) {
  const [isSaving, setIsSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState('');
  const [error, setError] = useState('');

  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiError, setAiError] = useState('');

  // File upload state for image
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageBase64, setImageBase64] = useState('');

  const [generalData, setGeneralData] = useState({
    title: product.isNew ? '' : product.title,
    vendor: product.isNew ? '' : (product.vendor || ''),
    productType: product.isNew ? '' : (product.productType || ''),
    handle: product.isNew ? '' : (product.handle || ''),
    descriptionText: product.isNew ? '' : htmlToText(product.descriptionHtml),
    seoTitle: product.isNew ? '' : (product.seo?.title || ''),
    seoDescription: product.isNew ? '' : (product.seo?.description || ''),
    tags: product.isNew ? [] : (product.tags || []),
    collections: product.isNew ? [] : (product.collections?.edges?.map(e => e.node.id) || []),
    publications: product.isNew ? publications.map(p => p.id) : (product.resourcePublications?.edges?.filter(e => e.node.isPublished).map(e => e.node.publication.id) || []),
    price: product.isNew ? 0 : 0
  });

  const [rawTagsText, setRawTagsText] = useState('');
  const [newVendorInput, setNewVendorInput] = useState('');
  const [isCreatingNewVendor, setIsCreatingNewVendor] = useState(false);

  const [variantsData, setVariantsData] = useState(() => {
    if (product.isNew) return [];
    return product.variants.edges.map(e => {
      const v = e.node;
      let inventoryQty = 0;
      let invLocId = primaryLocationId;
      if (v.inventoryItem?.inventoryLevels?.edges?.length > 0) {
        const level = v.inventoryItem.inventoryLevels.edges.find(l => l.node.location.id === primaryLocationId) || v.inventoryItem.inventoryLevels.edges[0];
        if (level) {
          invLocId = level.node.location.id;
          if (level.node.quantities && level.node.quantities.length > 0) {
            inventoryQty = level.node.quantities[0].quantity;
          }
        }
      }
      return {
        id: v.id,
        title: v.title,
        price: v.price,
        compareAtPrice: v.compareAtPrice || '',
        inventoryItemId: v.inventoryItem?.id,
        inventoryLocationId: invLocId,
        inventoryQuantity: inventoryQty,
        originalInventoryQuantity: inventoryQty
      };
    });
  });

  const [bulkComparePrice, setBulkComparePrice] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkQty, setBulkQty] = useState('');

  // Identify subcategories in the store for the parent collections this product belongs to
  const assignedParentCollections = collections.filter(c =>
    mainHandles.includes(c.handle) && generalData.collections.includes(c.id)
  );

  // Available subcategories across the parent collections of the product
  const availableSubcategories = collections.filter(c =>
    assignedParentCollections.some(parent => c.handle && c.handle.startsWith(`${parent.handle}-`))
  );

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
      setImageBase64(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleApplyBulkComparePrice = () => {
    if (!bulkComparePrice) return;
    setVariantsData(prev => prev.map(v => ({ ...v, compareAtPrice: bulkComparePrice })));
    setBulkComparePrice('');
  };

  const handleApplyBulkPrice = () => {
    if (!bulkPrice) return;
    setVariantsData(prev => prev.map(v => ({ ...v, price: bulkPrice })));
    setBulkPrice('');
  };

  const handleApplyBulkQty = () => {
    const qty = parseInt(bulkQty, 10);
    if (isNaN(qty) || qty < 0) return;
    setVariantsData(prev => prev.map(v => ({ ...v, inventoryQuantity: qty })));
    setBulkQty('');
  };

  const handleSmartParse = () => {
    if (!rawTagsText.trim()) return;
    const lines = rawTagsText.split('\n').map(l => l.trim()).filter(Boolean);
    const newTags = [...new Set([...generalData.tags, ...lines])];
    setGeneralData(prev => ({ ...prev, tags: newTags }));
    setRawTagsText('');
  };

  const removeTag = (tagToRemove) => {
    setGeneralData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tagToRemove) }));
  };

  const updateVariant = (id, field, value) => {
    setVariantsData(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const toggleCollection = (collectionId) => {
    setGeneralData(prev => {
      const isSelected = prev.collections.includes(collectionId);
      return {
        ...prev,
        collections: isSelected ? prev.collections.filter(id => id !== collectionId) : [...prev.collections, collectionId]
      };
    });
  };

  const togglePublication = (pubId) => {
    setGeneralData(prev => {
      const isSelected = prev.publications.includes(pubId);
      return {
        ...prev,
        publications: isSelected ? prev.publications.filter(id => id !== pubId) : [...prev.publications, pubId]
      };
    });
  };

  const toggleAllPublications = () => {
    setGeneralData(prev => {
      if (prev.publications.length === publications.length) return { ...prev, publications: [] };
      return { ...prev, publications: publications.map(p => p.id) };
    });
  };

  // Toggle subcategories inside product tags (Sub: [SubName])
  const handleToggleSubcategory = (subTitle, isAssigned) => {
    const subTag = `Sub: ${subTitle}`;
    setGeneralData(prev => {
      const nextTags = isAssigned
        ? prev.tags.filter(t => t !== subTag)
        : [...prev.tags.filter(t => t !== subTag), subTag];
      return { ...prev, tags: nextTags };
    });
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim() && !imageBase64) {
      setAiError("Please provide some instructions or upload an image.");
      return;
    }

    setIsGeneratingAI(true);
    setAiError('');

    try {
      const savedSettings = JSON.parse(localStorage.getItem('recoverySettings') || '{}');
      const aiProvider = savedSettings.aiProvider || 'groq';

      const referenceProducts = (products || []).filter(p => p.id !== product.id).slice(0, 2).map(p => ({
        title: p.title,
        vendor: p.vendor,
        productType: p.productType,
        tags: p.tags.filter(t => !t.startsWith('Article_Code') && !t.includes('GSM')),
        descriptionText: htmlToText(p.descriptionHtml),
        seoTitle: p.seo?.title,
        seoDescription: p.seo?.description,
      }));

      const systemPrompt = `You are an AI assistant managing a Shopify product. 
Analyze the following existing products from the store:
Existing Product 1:
${JSON.stringify(referenceProducts[0] || {}, null, 2)}

Existing Product 2:
${JSON.stringify(referenceProducts[1] || {}, null, 2)}

You are either EDITING or CREATING a product. Use current values as baseline (if editing), and ONLY apply changes based on user prompt:
Current values:
${JSON.stringify({
        title: generalData.title,
        vendor: generalData.vendor,
        productType: generalData.productType,
        tags: generalData.tags,
        descriptionText: generalData.descriptionText,
        seoTitle: generalData.seoTitle,
        seoDescription: generalData.seoDescription,
      }, null, 2)}

List of available subcategories in the store:
${availableSubcategories.map(sub => sub.title.split("-").pop().trim()).join(', ')}

Your output MUST match the store's tone and formatting.
CRITICAL RULES:
1. Do NOT write or include any Article Code (e.g. N1008, E007, E-008) in the tags.
2. Select appropriate subcategories from the list above based on the product description or features. Return them in the 'subcategories' field.
3. Return ONLY a valid JSON object with the following keys:
- title: (string)
- descriptionHtml: (string with <p> and <br/>)
- vendor: (string, choose from existing or suggest)
- productType: (string)
- tags: (array of strings, do NOT include article codes)
- seoTitle: (string)
- seoDescription: (string)
- handle: (string)
- subcategories: (array of strings selected from the available subcategories above, e.g. ["Oversized", "Regular Fit"])
- price: (number, only set if user requested price or if this is a new product creation)

Do not wrap the JSON in markdown code blocks. Just output raw JSON.`;

      let responseText = '';

      if (aiProvider === 'gemini') {
        const apiKey = savedSettings.geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) throw new Error("Gemini API key is missing. Add it in Settings.");

        const primaryModel = savedSettings.geminiModel || 'gemini-1.5-flash';
        const fallbackModel = 'gemini-1.5-flash-8b';

        const contents = [];
        const userParts = [{ text: `User request: ${aiPrompt}` }];

        if (imageBase64) {
          userParts.push({ inlineData: { mimeType: imageFile.type, data: imageBase64 } });
        } else if (!product.isNew) {
          for (let i = 0; i < (product.images?.edges?.length || 0) && i < 1; i++) {
            try {
              const imgRes = await axios.get(product.images.edges[i].node.url, { responseType: 'blob' });
              const reader = new FileReader();
              const b64 = await new Promise((resolve) => {
                reader.readAsDataURL(imgRes.data);
                reader.onloadend = () => resolve(reader.result.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, ''));
              });
              userParts.push({ inlineData: { mimeType: imgRes.data.type, data: b64 } });
            } catch (e) {
              console.warn("Failed to load existing image for AI", e);
            }
          }
        }

        contents.push({ role: "user", parts: userParts });

        const requestPayload = {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: contents,
          generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
        };

        let res;
        try {
          res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${apiKey}`, requestPayload);
        } catch (primaryErr) {
          console.warn(`Primary model ${primaryModel} failed. Falling back to ${fallbackModel}...`, primaryErr);
          res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${apiKey}`, requestPayload);
        }
        responseText = res.data.candidates[0].content.parts[0].text;
      } else if (aiProvider === 'groq') {
        const groqApiKey = savedSettings.groqApiKey;
        if (!groqApiKey) throw new Error("Groq API key is missing. Add it in Settings.");

        const validGroqModels = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct', 'qwen/qwen3.6-27b', 'openai/gpt-oss-120b'];
        const groqModel = validGroqModels.includes(savedSettings.groqModel) ? savedSettings.groqModel : 'llama-3.3-70b-versatile';

        const isVisionModel = groqModel.includes('vision');
        const messages = [{ role: "system", content: systemPrompt }];

        if (imageBase64 && isVisionModel) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: `User request: ${aiPrompt}` },
              { type: "image_url", image_url: { url: `data:${imageFile.type};base64,${imageBase64}` } }
            ]
          });
        } else {
          messages.push({ role: "user", content: `User request: ${aiPrompt}` });
        }

        const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
          model: groqModel,
          messages: messages,
          temperature: 0.7,
          response_format: { type: "json_object" }
        }, {
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json'
          }
        });

        responseText = res.data.choices[0].message.content;
      }

      responseText = responseText.replace(/```json\n/g, '').replace(/```\n?/g, '');
      let parsedData = JSON.parse(responseText);

      const cleanedTags = (parsedData.tags || []).filter(t => !/^[A-Z]\d{3,4}$/.test(t) && !/^Article_/i.test(t));

      const subTags = (parsedData.subcategories || []).map(sub => `Sub: ${sub}`);
      const finalTags = [...new Set([...(cleanedTags || []), ...subTags])];

      setGeneralData(prev => ({
        ...prev,
        title: parsedData.title || prev.title,
        descriptionText: htmlToText(parsedData.descriptionHtml) || prev.descriptionText,
        tags: finalTags.length > 0 ? finalTags : prev.tags,
        vendor: parsedData.vendor || prev.vendor,
        productType: parsedData.productType || prev.productType,
        handle: parsedData.handle || prev.handle,
        seoTitle: parsedData.seoTitle || prev.seoTitle,
        seoDescription: parsedData.seoDescription || prev.seoDescription,
        price: parsedData.price || prev.price
      }));
      setAiPrompt('');

    } catch (err) {
      console.error(err);
      setAiError(err.response?.data?.error?.message || err.message || "Failed to generate AI suggestions");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const saveProduct = async () => {
    setIsSaving(true);
    setError('');
    setSavingStatus(product.isNew ? 'Creating product in Shopify...' : 'Updating general product details...');

    try {
      const originalCollections = product.isNew ? [] : (product.collections?.edges?.map(e => e.node.id) || []);
      const collectionsToJoin = generalData.collections.filter(id => !originalCollections.includes(id));
      const collectionsToLeave = originalCollections.filter(id => !generalData.collections.includes(id));

      let finalProductId = product.id;
      let finalVariantId = null;
      let finalInventoryItemId = null;

      if (product.isNew) {
        const createMutation = `
          mutation productCreate($input: ProductInput!) {
            productCreate(input: $input) {
              product { id variants(first: 1) { edges { node { id inventoryItem { id } } } } }
              userErrors { message field }
            }
          }
        `;
        const createInput = {
          title: generalData.title,
          vendor: generalData.vendor,
          productType: generalData.productType,
          handle: generalData.handle,
          descriptionHtml: textToHtml(generalData.descriptionText),
          tags: generalData.tags,
          seo: {
            title: generalData.seoTitle,
            description: generalData.seoDescription
          },
          collectionsToJoin: generalData.collections.length > 0 ? generalData.collections : undefined,
        };
        const createRes = await axios.post('/api/shopify/graphql.json', { query: createMutation, variables: { input: createInput } });
        if (createRes.data.errors) throw new Error("GraphQL Error: " + createRes.data.errors[0].message);
        if (createRes.data.data.productCreate.userErrors?.length > 0) throw new Error("Shopify Error: " + createRes.data.data.productCreate.userErrors[0].message);

        finalProductId = createRes.data.data.productCreate.product.id;
        const newVariant = createRes.data.data.productCreate.product.variants.edges[0].node;
        finalVariantId = newVariant.id;
        finalInventoryItemId = newVariant.inventoryItem.id;
      } else {
        const productMutation = `
          mutation productUpdate($input: ProductInput!) {
            productUpdate(input: $input) {
              userErrors { message field }
            }
          }
        `;
        const productInput = {
          id: product.id,
          title: generalData.title,
          vendor: generalData.vendor,
          productType: generalData.productType,
          handle: generalData.handle,
          descriptionHtml: textToHtml(generalData.descriptionText),
          tags: generalData.tags,
          seo: {
            title: generalData.seoTitle,
            description: generalData.seoDescription
          },
          collectionsToJoin: collectionsToJoin.length > 0 ? collectionsToJoin : undefined,
          collectionsToLeave: collectionsToLeave.length > 0 ? collectionsToLeave : undefined,
        };

        const pRes = await axios.post('/api/shopify/graphql.json', { query: productMutation, variables: { input: productInput } });
        if (pRes.data.errors) throw new Error("GraphQL Error: " + pRes.data.errors[0].message);
        if (pRes.data.data.productUpdate.userErrors?.length > 0) throw new Error("Shopify Error: " + pRes.data.data.productUpdate.userErrors[0].message);
      }

      setSavingStatus('Updating sales channels...');
      const originalPublications = product.isNew ? [] : (product.resourcePublications?.edges?.filter(e => e.node.isPublished).map(e => e.node.publication.id) || []);
      const pubsToPublish = generalData.publications.filter(id => !originalPublications.includes(id)).map(id => ({ publicationId: id }));
      const pubsToUnpublish = originalPublications.filter(id => !generalData.publications.includes(id)).map(id => ({ publicationId: id }));

      if (pubsToPublish.length > 0) {
        const pubMut = `mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { message } } }`;
        const res = await axios.post('/api/shopify/graphql.json', { query: pubMut, variables: { id: finalProductId, input: pubsToPublish } });
        if (res.data.data.publishablePublish?.userErrors?.length > 0) throw new Error("Publication Error: " + res.data.data.publishablePublish.userErrors[0].message);
      }

      if (!product.isNew && pubsToUnpublish.length > 0) {
        const unpubMut = `mutation publishableUnpublish($id: ID!, $input: [PublicationInput!]!) { publishableUnpublish(id: $id, input: $input) { userErrors { message } } }`;
        const res = await axios.post('/api/shopify/graphql.json', { query: unpubMut, variables: { id: finalProductId, input: pubsToUnpublish } });
        if (res.data.data.publishableUnpublish?.userErrors?.length > 0) throw new Error("Publication Error: " + res.data.data.publishableUnpublish.userErrors[0].message);
      }

      if (product.isNew) {
        setSavingStatus('Updating variant price...');
        const pricesMutation = `
          mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors { message }
            }
          }
        `;
        const pricesInput = [{ id: finalVariantId, price: generalData.price.toString() }];
        const vRes = await axios.post('/api/shopify/graphql.json', { query: pricesMutation, variables: { productId: finalProductId, variants: pricesInput } });
        if (vRes.data.data.productVariantsBulkUpdate.userErrors?.length > 0) throw new Error("Price Update Error: " + vRes.data.data.productVariantsBulkUpdate.userErrors[0].message);

        if (primaryLocationId && generalData.price > 0) {
          setSavingStatus('Updating variant inventory...');
          const inventoryMutation = `
            mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
              inventorySetQuantities(input: $input) { userErrors { message } }
            }
          `;
          const invInput = {
            name: "available", reason: "correction", ignoreCompareQuantity: true,
            quantities: [{ inventoryItemId: finalInventoryItemId, locationId: primaryLocationId, quantity: 10 }]
          };
          await axios.post('/api/shopify/graphql.json', { query: inventoryMutation, variables: { input: invInput } });
        }
      } else {
        // ── Step: Update variant prices & compareAtPrice ────────────────────
        setSavingStatus('Updating variant prices...');
        const pricesMutation = `
          mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              productVariants { id price compareAtPrice }
              userErrors { message field }
            }
          }
        `;
        // BUG FIX: include `price` field — was previously only sending compareAtPrice
        const pricesInput = variantsData.map(v => {
          const priceVal = parseFloat(v.price);
          const compareVal = v.compareAtPrice !== '' && v.compareAtPrice !== null && v.compareAtPrice !== undefined
            ? parseFloat(v.compareAtPrice) : null;
          return {
            id: v.id,
            price: isNaN(priceVal) ? v.price : priceVal.toFixed(2),
            // Send null explicitly to clear a compare-at price
            compareAtPrice: compareVal !== null && !isNaN(compareVal) ? compareVal.toFixed(2) : null
          };
        });

        const vRes = await axios.post('/api/shopify/graphql.json', { query: pricesMutation, variables: { productId: finalProductId, variants: pricesInput } });
        if (vRes.data.errors) throw new Error("GraphQL Error in Price Update: " + vRes.data.errors[0].message);
        if (vRes.data.data.productVariantsBulkUpdate.userErrors?.length > 0) throw new Error("Shopify Error in Price Update: " + vRes.data.data.productVariantsBulkUpdate.userErrors[0].message);

        // ── Step: Update inventory quantities ───────────────────────────────
        setSavingStatus('Updating inventory quantities...');
        if (primaryLocationId) {
          const changedVariants = variantsData.filter(v =>
            v.inventoryItemId &&
            v.inventoryLocationId &&
            parseInt(v.inventoryQuantity, 10) !== parseInt(v.originalInventoryQuantity, 10)
          );

          if (changedVariants.length > 0) {
            // Use inventorySetOnHandQuantities (correct modern Shopify API)
            const inventoryMutation = `
              mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
                inventorySetOnHandQuantities(input: $input) {
                  userErrors { message field }
                }
              }
            `;
            const invInput = {
              reason: 'correction',
              setQuantities: changedVariants.map(v => ({
                inventoryItemId: v.inventoryItemId,
                locationId: v.inventoryLocationId,
                quantity: parseInt(v.inventoryQuantity, 10) || 0
              }))
            };
            const iRes = await axios.post('/api/shopify/graphql.json', { query: inventoryMutation, variables: { input: invInput } });
            if (iRes.data.errors) throw new Error("GraphQL Error in Inventory: " + iRes.data.errors[0].message);
            if (iRes.data.data.inventorySetOnHandQuantities.userErrors?.length > 0) throw new Error("Shopify Error in Inventory: " + iRes.data.data.inventorySetOnHandQuantities.userErrors[0].message);
          }
        }
      }

      setSavingStatus('Refreshing data...');
      onSaved();
    } catch (err) {
      console.error("Save Error:", err);
      setError(err.message || 'Failed to save product.');
      setIsSaving(false);
      setSavingStatus('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 overflow-hidden text-slate-100 font-sans">
      <div className="bg-[#1E293B] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#151D30] shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">
              {product.isNew ? 'Create New Product' : `Edit Product: ${product.title}`}
            </h2>
            {primaryLocationId && <p className="text-xs text-slate-400 mt-1">Inventory updates will sync to primary location.</p>}
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-[#0B0F19]/40 space-y-6">
          {error && (
            <div className="p-4 bg-red-950/30 border border-red-800 text-red-400 text-sm rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">

              {/* AI ASSISTANT PANEL */}
              <div className="bg-purple-950/30 p-5 rounded-xl border border-purple-800/50 shadow-md space-y-4">
                <h3 className="font-bold flex items-center gap-2 text-purple-300"><Wand2 className="w-4.5 h-4.5 text-purple-400" /> AI Copilot</h3>
                <p className="text-xs text-purple-400 leading-relaxed">Ask AI to generate optimized product titles, descriptions, and assign appropriate subcategories based on your inputs.</p>
                {aiError && <div className="text-xs text-red-400 font-semibold">{aiError}</div>}

                {product.isNew && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Product Reference Image</label>
                    <div className="flex items-center gap-4">
                      {imagePreview ? (
                        <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-700 shadow-sm">
                          <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                          <button onClick={() => { setImageFile(null); setImagePreview(''); setImageBase64(''); }} className="absolute top-1 right-1 bg-slate-900/80 p-1 rounded-full text-red-400"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <label className="w-20 h-20 flex flex-col items-center justify-center border border-dashed border-slate-700 rounded-lg cursor-pointer hover:bg-slate-800 hover:border-purple-500 transition-colors">
                          <Upload className="w-5 h-5 text-slate-500 mb-1" />
                          <span className="text-[9px] text-slate-400 font-medium">Upload Image</span>
                          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                        </label>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <textarea
                    rows={2}
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    placeholder="Instructions (e.g. Generate copy for a premium cotton regular fit travel tee...)"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 text-white rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none placeholder:text-slate-500"
                  />
                </div>
                <button
                  onClick={handleAIGenerate}
                  disabled={isGeneratingAI || (!aiPrompt.trim() && !imageBase64)}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-xl text-sm transition-colors disabled:opacity-50 flex justify-center items-center gap-2 shadow-md shadow-purple-600/10"
                >
                  {isGeneratingAI ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Wand2 className="w-4 h-4" />}
                  {isGeneratingAI ? 'Processing Suggestions...' : 'Apply AI Suggestions'}
                </button>
              </div>

              {/* GENERAL INFORMATION */}
              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md space-y-4">
                <h3 className="font-bold flex items-center gap-2 text-white"><Info className="w-4.5 h-4.5 text-slate-400" /> General Info</h3>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Product Title</label>
                  <input type="text" value={generalData.title} onChange={e => setGeneralData({ ...generalData, title: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none font-semibold" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* BRAND / VENDOR SELECTABLE DROPDOWN */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Brand / Vendor</label>
                    {isCreatingNewVendor ? (
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={newVendorInput}
                          onChange={e => setNewVendorInput(e.target.value)}
                          placeholder="New brand name..."
                          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none"
                        />
                        <button
                          onClick={() => {
                            if (newVendorInput.trim()) {
                              setGeneralData({ ...generalData, vendor: newVendorInput.trim() });
                            }
                            setIsCreatingNewVendor(false);
                          }}
                          className="px-2.5 bg-yellow-500 text-slate-950 font-bold rounded-xl text-xs"
                        >
                          OK
                        </button>
                      </div>
                    ) : (
                      <select
                        value={generalData.vendor}
                        onChange={e => {
                          if (e.target.value === '__NEW__') {
                            setNewVendorInput('');
                            setIsCreatingNewVendor(true);
                          } else {
                            setGeneralData({ ...generalData, vendor: e.target.value });
                          }
                        }}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none select-none"
                      >
                        <option value="">Select Brand...</option>
                        {vendors.map(v => <option key={v} value={v}>{v}</option>)}
                        <option value="__NEW__" className="text-yellow-500 font-semibold">+ Add New Brand...</option>
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Product Type</label>
                    <select
                      value={generalData.productType}
                      onChange={e => setGeneralData({ ...generalData, productType: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none"
                    >
                      <option value="">Select Type...</option>
                      {productTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>


                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Collections</label>
                    <div className="max-h-32 overflow-y-auto border border-slate-700 rounded-xl bg-slate-800/50 p-2 space-y-1">
                      {collections.filter(c => mainHandles.includes(c.handle)).map(col => (
                        <label key={col.id} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer p-1 hover:bg-slate-800 rounded-lg">
                          <input type="checkbox" checked={generalData.collections.includes(col.id)} onChange={() => toggleCollection(col.id)} className="rounded bg-slate-900 border-slate-700 text-yellow-500 focus:ring-yellow-500/50" />
                          {col.title}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-400">Sales Channels</label>
                      <button onClick={toggleAllPublications} className="text-[10px] font-bold text-yellow-500 hover:text-yellow-400 transition-colors">
                        {generalData.publications.length === publications.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="max-h-32 overflow-y-auto border border-slate-700 rounded-xl bg-slate-800/50 p-2 space-y-1">
                      {publications.map(pub => (
                        <label key={pub.id} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer p-1 hover:bg-slate-800 rounded-lg">
                          <input type="checkbox" checked={generalData.publications.includes(pub.id)} onChange={() => togglePublication(pub.id)} className="rounded bg-slate-900 border-slate-700 text-yellow-500 focus:ring-yellow-500/50" />
                          {pub.name}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* SUBCATEGORY SELECTOR IN EDIT/CREATE PANEL */}
                {availableSubcategories.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Category Subcategories mapping</label>
                    <div className="flex flex-wrap gap-2 p-3 border border-slate-700 rounded-xl bg-slate-850">
                      {availableSubcategories.map(sub => {
                        const subName = sub.title.split("-").pop().trim();
                        const isAssigned = generalData.tags.includes(`Sub: ${subName}`);
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => handleToggleSubcategory(subName, isAssigned)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${isAssigned ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30 shadow-sm' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750'}`}
                          >
                            {subName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Product Description</label>
                  <textarea rows={4} value={generalData.descriptionText} onChange={e => setGeneralData({ ...generalData, descriptionText: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none" />
                </div>
              </div>

            </div>

              {/* SEO METADATA */}
              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md space-y-4">
                <h3 className="font-bold flex items-center gap-2 text-white"><Search className="w-4.5 h-4.5 text-slate-400" /> Search Listing</h3>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">URL Handle</label>
                  <div className="flex rounded-xl bg-slate-800 border border-slate-700 overflow-hidden text-sm">
                    <span className="bg-slate-750 px-3 py-2 text-slate-400 border-r border-slate-700 select-none shrink-0 truncate max-w-[250px]">
                      https://{import.meta.env.VITE_SHOPIFY_STORE_URL || 'store.myshopify.com'}/products/
                    </span>
                    <input
                      type="text"
                      value={generalData.handle}
                      onChange={e => setGeneralData({ ...generalData, handle: e.target.value })}
                      className="w-full px-3 py-2 bg-transparent text-white focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">SEO Title</label>
                  <input type="text" value={generalData.seoTitle} onChange={e => setGeneralData({ ...generalData, seoTitle: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">SEO Description</label>
                  <textarea rows={2} value={generalData.seoDescription} onChange={e => setGeneralData({ ...generalData, seoDescription: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none" />
                </div>
              </div>

              {/* SMART TAGS PARSER */}
              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md space-y-4">
                <h3 className="font-bold flex items-center gap-2 text-white"><Tags className="w-4.5 h-4.5 text-slate-400" /> Tags</h3>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {generalData.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                      {tag} <button onClick={() => removeTag(tag)} className="hover:text-red-500 ml-1"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Paste formatted text (one tag per line)</label>
                  <textarea rows={2} placeholder="Design: Graphic Print&#10;GSM: 180" value={rawTagsText} onChange={e => setRawTagsText(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none" />
                </div>
                <button onClick={handleSmartParse} disabled={!rawTagsText.trim()} className="w-full bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-bold py-2 rounded-xl text-xs disabled:opacity-50 transition-colors">
                  Extract Tags
                </button>
              </div>



            <div className="space-y-6">
              {/* PRICE & INITIAL INVENTORY (ONLY FOR NEW CREATIONS) */}
              {product.isNew && (
                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md space-y-4">
                  <h3 className="font-bold flex items-center gap-2 text-white"><Database className="w-4.5 h-4.5 text-slate-400" /> Pricing & Initial Inventory</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Price</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                        <input type="number" value={generalData.price} onChange={e => setGeneralData({ ...generalData, price: parseFloat(e.target.value) || 0 })} className="w-full pl-7 pr-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-xl text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none font-semibold" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Initial Quantity (Location 1)</label>
                      <input type="number" value={10} disabled className="w-full px-3 py-2 bg-slate-800/40 border border-slate-700/60 text-slate-500 rounded-xl text-sm outline-none font-semibold cursor-not-allowed" />
                    </div>
                  </div>
                </div>
              )}

              {/* VARIANTS & INVENTORY LIST (ONLY FOR EXISTING PRODUCTS) */}
              {!product.isNew && (
                <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-md flex flex-col overflow-hidden">
                  {/* ── Header ─────────────────────────────────────────── */}
                  <div className="px-5 pt-4 pb-3 border-b border-slate-800 bg-[#151D30]/70">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-sm flex items-center gap-2 text-white">
                        <Database className="w-4 h-4 text-yellow-500" /> Variant Stock
                      </h3>
                      <span className="text-[10px] text-yellow-500/60 font-semibold uppercase tracking-widest">Bulk Fill</span>
                    </div>

                    {/* ── Bulk fill rows ───────────────────────────────── */}
                    <div className="grid grid-cols-3 gap-2">
                      {/* Price */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-1">Selling Price</label>
                        <div className="flex gap-1.5">
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">₹</span>
                            <input
                              type="number" value={bulkPrice}
                              onChange={e => setBulkPrice(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleApplyBulkPrice()}
                              className="w-full pl-5 pr-2 py-1.5 bg-[#0F172A] border border-slate-700 rounded-lg text-xs text-white focus:ring-1 focus:ring-yellow-500/70 outline-none placeholder:text-slate-600"
                              placeholder="e.g. 399"
                            />
                          </div>
                          <button onClick={handleApplyBulkPrice} disabled={!bulkPrice}
                            className="px-2.5 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-[11px] font-extrabold rounded-lg disabled:opacity-30 transition-colors shrink-0">
                            ✓
                          </button>
                        </div>
                      </div>

                      {/* Compare At */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-1">Compare At</label>
                        <div className="flex gap-1.5">
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">₹</span>
                            <input
                              type="number" value={bulkComparePrice}
                              onChange={e => setBulkComparePrice(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleApplyBulkComparePrice()}
                              className="w-full pl-5 pr-2 py-1.5 bg-[#0F172A] border border-slate-700 rounded-lg text-xs text-white focus:ring-1 focus:ring-yellow-500/70 outline-none placeholder:text-slate-600"
                              placeholder="e.g. 699"
                            />
                          </div>
                          <button onClick={handleApplyBulkComparePrice} disabled={!bulkComparePrice}
                            className="px-2.5 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-[11px] font-extrabold rounded-lg disabled:opacity-30 transition-colors shrink-0">
                            ✓
                          </button>
                        </div>
                      </div>

                      {/* Stock Qty */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-1">Stock Qty</label>
                        <div className="flex gap-1.5">
                          <input
                            type="number" min="0" step="1" value={bulkQty}
                            onChange={e => setBulkQty(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleApplyBulkQty()}
                            className="flex-1 px-2 py-1.5 bg-[#0F172A] border border-slate-700 rounded-lg text-xs text-white focus:ring-1 focus:ring-yellow-500/70 outline-none placeholder:text-slate-600"
                            placeholder="e.g. 100"
                          />
                          <button onClick={handleApplyBulkQty} disabled={bulkQty === ''}
                            className="px-2.5 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-[11px] font-extrabold rounded-lg disabled:opacity-30 transition-colors shrink-0">
                            ✓
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-y-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-[#151D30]/30 border-b border-slate-850 text-slate-400 sticky top-0">
                        <tr>
                          <th className="px-4 py-3">Variant</th>
                          <th className="px-4 py-3">Price</th>
                          <th className="px-4 py-3 w-28">Compare At</th>
                          <th className="px-4 py-3 w-24">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {variantsData.map(v => (
                          <tr key={v.id} className="hover:bg-slate-800/30">
                            <td className="px-4 py-3 font-semibold text-white truncate max-w-[120px]">{v.title === 'Default Title' ? 'Default' : v.title}</td>
                            <td className="px-4 py-3">
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">₹</span>
                                <input type="number" value={v.price} onChange={e => updateVariant(v.id, 'price', e.target.value)} className="w-full pl-5 pr-2 py-1 bg-slate-800 border border-slate-750 text-white rounded text-xs focus:ring-1 focus:ring-yellow-500/50 outline-none font-semibold" />
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                                <input type="number" value={v.compareAtPrice} onChange={e => updateVariant(v.id, 'compareAtPrice', e.target.value)} className="w-full pl-5 pr-2 py-1 bg-slate-800 border border-slate-750 text-white rounded text-xs focus:ring-1 focus:ring-yellow-500/50 outline-none" />
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <input type="number" value={v.inventoryQuantity} onChange={e => updateVariant(v.id, 'inventoryQuantity', e.target.value)} className="w-full px-2 py-1 bg-slate-800 border border-slate-750 text-white rounded text-xs focus:ring-1 focus:ring-yellow-500/50 outline-none" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}


            </div>

          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-[#151D30] flex items-center justify-between shrink-0">
          <div className="text-xs font-bold text-yellow-500">{savingStatus}</div>
          <div className="flex gap-3">
            <button onClick={onClose} disabled={isSaving} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-750 disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button onClick={saveProduct} disabled={isSaving} className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-950 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 disabled:opacity-50 transition-all flex items-center gap-2 shadow-md">
              {isSaving ? <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> : <Save className="w-4 h-4" />}
              {isSaving ? 'Saving...' : product.isNew ? 'Create Product' : 'Save Changes'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}



function SubcategoriesDashboard({ products, setProducts, collections, setCollections, mainHandles, mainThemeId, onRefresh }) {
  const [selectedParentId, setSelectedParentId] = useState('');
  const [expandedParents, setExpandedParents] = useState(new Set());
  const [selectedSub, setSelectedSub] = useState(null);

  const [newSubName, setNewSubName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  // --- Metafield State ---
  const [metafieldData, setMetafieldData] = useState([]);
  const [metafieldId, setMetafieldId] = useState(null);
  const [themeLoading, setThemeLoading] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeError, setThemeError] = useState('');
  const [currentBlock, setCurrentBlock] = useState(null); 
  const [pendingUploadAsset, setPendingUploadAsset] = useState(null);

  // Parent collections: handles in mainHandles
  const parentCollections = collections.filter(c => c.handle && mainHandles.includes(c.handle));
  const activeParent = parentCollections.find(p => p.id === selectedParentId) || parentCollections[0];

  useEffect(() => {
    if (activeParent) {
      fetchMetafield();
    }
  }, [activeParent?.id]);

  const fetchMetafield = async () => {
    setThemeLoading(true);
    setThemeError('');
    try {
      const query = `
        query {
          collection(id: "${activeParent.id}") {
            metafield(namespace: "price_editor", key: "subcategories") {
              id
              value
            }
          }
        }
      `;
      const res = await axios.post('/api/shopify/graphql.json', { query });
      const mf = res.data?.data?.collection?.metafield;
      if (mf) {
        setMetafieldId(mf.id);
        setMetafieldData(JSON.parse(mf.value || "[]"));
      } else {
        setMetafieldId(null);
        setMetafieldData([]);
      }
    } catch (err) {
      setThemeError(err.message || 'Failed to load subcategories config');
    } finally {
      setThemeLoading(false);
    }
  };

  const handleThemeImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setThemeLoading(true);
    try {
      // Compress to max 800x800 for subcategory icons
      const compressed = await compressImage(file, 800, 800, 0.8);
      setPendingUploadAsset({ file: compressed.file, base64: compressed.base64 });
      // clear the custom text URL so the new file takes precedence
      setCurrentBlock(prev => ({ ...prev, custom_icon_asset: '', icon_image: '' }));
      
      // Auto-trigger save settings button click
      setTimeout(() => {
        const btn = document.getElementById('save-theme-btn');
        if (btn) btn.click();
      }, 150);
    } catch (err) {
      setThemeError(err.message || 'Failed to process/compress uploaded image');
    } finally {
      setThemeLoading(false);
    }
  };

  // Find corresponding block when selectedSub changes
  useEffect(() => {
    setPendingUploadAsset(null); // clear any pending upload when switching tabs
    if (!selectedSub) {
      setCurrentBlock(null);
      return;
    }
    const subName = selectedSub.title.split("-").pop().trim();
    const existing = metafieldData.find(item => item.suffix && item.suffix.toLowerCase() === subName.toLowerCase());
    
    if (existing) {
      setCurrentBlock({ ...existing, isNew: false });
    } else {
      setCurrentBlock({ suffix: subName, custom_icon_asset: '', icon_image: '', isNew: true });
    }
  }, [selectedSub, metafieldData]);

  const handleSaveThemeBlock = async () => {
    if (!currentBlock || !activeParent) return;
    setThemeSaving(true);
    setThemeError('');

    try {
      let finalAssetKey = currentBlock.custom_icon_asset || '';

      if (pendingUploadAsset) {
        const timestamp = Date.now();
        const ext = pendingUploadAsset.file.name.split('.').pop() || 'png';
        const assetKey = `assets/subcat-${selectedSub.id.split('/').pop()}-${timestamp}.${ext}`;
        const base64Data = pendingUploadAsset.base64.split(',')[1]; 

        const uploadPayload = {
          asset: { key: assetKey, attachment: base64Data }
        };
        const assetRes = await axios.put(`/api/shopify/themes/${mainThemeId}/assets.json`, uploadPayload);
        if (assetRes.data.errors) throw new Error("Failed to upload image: " + JSON.stringify(assetRes.data.errors));
        
        finalAssetKey = assetKey.replace('assets/', '');
      }

      const newData = [...metafieldData];
      const existingIdx = newData.findIndex(item => item.suffix && item.suffix.toLowerCase() === currentBlock.suffix.toLowerCase());
      
      const newBlock = {
        suffix: currentBlock.suffix,
        icon_image: currentBlock.icon_image || '',
        custom_icon_asset: finalAssetKey
      };

      if (existingIdx >= 0) {
        newData[existingIdx] = newBlock;
      } else {
        newData.push(newBlock);
      }

      const query = `
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id value }
            userErrors { message }
          }
        }
      `;
      const variables = {
        metafields: [
          {
            ownerId: activeParent.id,
            namespace: "price_editor",
            key: "subcategories",
            type: "json",
            value: JSON.stringify(newData)
          }
        ]
      };

      const res = await axios.post('/api/shopify/graphql.json', { query, variables });
      const userErrors = res.data.data.metafieldsSet.userErrors;
      if (userErrors && userErrors.length > 0) throw new Error(userErrors[0].message);

      const savedMf = res.data.data.metafieldsSet.metafields[0];
      setMetafieldId(savedMf.id);
      setMetafieldData(newData);
      setPendingUploadAsset(null);
      setCurrentBlock({ ...newBlock, isNew: false });
      alert('Subcategory settings saved!');
    } catch(err) {
      setThemeError(err.message || 'Failed to save subcategory settings');
    } finally {
      setThemeSaving(false);
    }
  };

  // Modals for viewing product details and adding products to subcategory
  const [previewProduct, setPreviewProduct] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Initialize selectedParentId
  useEffect(() => {
    if (parentCollections.length > 0 && !selectedParentId) {
      setSelectedParentId(parentCollections[0].id);
      setExpandedParents(new Set([parentCollections[0].id]));
    }
  }, [parentCollections, selectedParentId]);

  // Toggle expanded state of a parent collection in the sidebar (only one open at a time)
  const toggleParentExpand = (parentId) => {
    setSelectedParentId(parentId);
    setExpandedParents(prev => {
      const next = new Set();
      if (!prev.has(parentId)) {
        next.add(parentId);
      }
      return next;
    });
    setSelectedSub(null); // clear sub selection when toggling parent
  };

  if (parentCollections.length === 0) {
    return <div className="py-20 text-center text-slate-400">No collections found.</div>;
  }

  // Get subcategories of a specific parent
  const getSubcategories = (parent) => {
    return collections.filter(c => c.handle && c.handle.startsWith(`${parent.handle}-`));
  };

  // Subcategories of the active parent
  const activeParentSubcategories = getSubcategories(activeParent);

  // Products assigned to the currently selected subcategory
  const assignedProducts = selectedSub ? products.filter(p => {
      const subName = selectedSub.title.split("-").pop().trim();
      return p.tags.some(t => t.toLowerCase() === `sub: ${subName.toLowerCase()}`);
    }) : [];

  // Products in parent collection that are NOT assigned to this subcategory (for the add popup)
  const assignableProducts = selectedSub ? products.filter(p =>
    p.collections.edges.some(e => e.node.id === activeParent.id)
  ) : [];

  const handleAddSubcategory = async (e) => {
    e.preventDefault();
    if (!newSubName.trim()) return;
    setLoading(true);
    setError('');

    const formattedTitle = `${activeParent.title} - ${newSubName.trim()}`;
    const subTag = `Sub: ${newSubName.trim()}`;

    try {
      // 1. Create Smart Collection
      const createMutation = `
        mutation collectionCreate($input: CollectionInput!) {
          collectionCreate(input: $input) {
            collection { id title handle }
            userErrors { message }
          }
        }
      `;

      const variables = {
        input: {
          title: formattedTitle,
          ruleSet: {
            appliedDisjunctively: false,
            rules: [
              {
                column: "TAG",
                relation: "EQUALS",
                condition: subTag
              }
            ]
          }
        }
      };

      const res = await axios.post('/api/shopify/graphql.json', { query: createMutation, variables });
      if (res.data.errors) throw new Error(res.data.errors[0].message);
      const userErrors = res.data.data.collectionCreate.userErrors;
      if (userErrors && userErrors.length > 0) throw new Error(userErrors[0].message);

      const newCol = res.data.data.collectionCreate.collection;

      // 2. Publish to Online Store
      const publishMutation = `
        mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            userErrors { message }
          }
        }
      `;
      await axios.post('/api/shopify/graphql.json', {
        query: publishMutation,
        variables: {
          id: newCol.id,
          input: [{ publicationId: "gid://shopify/Publication/356681089105" }]
        }
      });

      // 3. Auto-add to Metafield
      if (activeParent) {
        const newData = [...metafieldData];
        const subName = newSubName.trim();
        const existingIdx = newData.findIndex(item => item.suffix && item.suffix.toLowerCase() === subName.toLowerCase());
        if (existingIdx === -1) {
          newData.push({ suffix: subName, custom_icon_asset: '', icon_image: '' });
          
          const query = `
            mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $metafields) {
                metafields { id value }
              }
            }
          `;
          const variables = {
            metafields: [
              {
                ownerId: activeParent.id,
                namespace: "price_editor",
                key: "subcategories",
                type: "json",
                value: JSON.stringify(newData)
              }
            ]
          };
          await axios.post('/api/shopify/graphql.json', { query, variables });
          setMetafieldData(newData);
        }
      }

      if (setCollections) {
        setCollections(prev => [...prev.filter(c => c.id !== newCol.id), newCol]);
      }

      setNewSubName('');
      onRefresh();
      // Auto select the new sub
      setSelectedSub(newCol);
    } catch (err) {
      setError(err.message || 'Failed to create subcategory');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubcategory = async (subId) => {
    if (!confirm("Are you sure you want to delete this subcategory? This will delete the collection on Shopify.")) return;
    setActionLoading(subId);
    setError('');
    try {
      const deleteMutation = `
        mutation collectionDelete($id: ID!) {
          collectionDelete(input: { id: $id }) {
            deletedCollectionId
            userErrors { message }
          }
        }
      `;
      const res = await axios.post('/api/shopify/graphql.json', { query: deleteMutation, variables: { id: subId } });
      if (res.data.errors) throw new Error(res.data.errors[0].message);
      const userErrors = res.data.data.collectionDelete.userErrors;
      if (userErrors && userErrors.length > 0) throw new Error(userErrors[0].message);

      // Delete from Metafield
      if (activeParent && selectedSub) {
        const subName = selectedSub.title.split("-").pop().trim();
        const newData = metafieldData.filter(item => !(item.suffix && item.suffix.toLowerCase() === subName.toLowerCase()));
        if (newData.length !== metafieldData.length) {
          const query = `
            mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $metafields) {
                metafields { id }
              }
            }
          `;
          const variables = {
            metafields: [
              {
                ownerId: activeParent.id,
                namespace: "price_editor",
                key: "subcategories",
                type: "json",
                value: JSON.stringify(newData)
              }
            ]
          };
          await axios.post('/api/shopify/graphql.json', { query, variables });
          setMetafieldData(newData);
        }
      }

      if (setCollections) {
        setCollections(prev => prev.filter(c => c.id !== subId));
      }

      setSelectedSub(null);
      onRefresh();
    } catch (err) {
      setError(err.message || 'Failed to delete subcategory');
    } finally {
      setActionLoading('');
    }
  };

  const handleRemoveProductFromSub = async (product) => {
    const subName = selectedSub.title.split("-").pop().trim();
    const subTag = `Sub: ${subName}`;
    const exactTagToRemove = product.tags.find(t => t.toLowerCase() === subTag.toLowerCase()) || subTag;

    // Optimistic UI Update
    setProducts(prevProducts =>
      prevProducts.map(p => {
        if (p.id === product.id) {
          const nextCollectionsEdges = p.collections.edges.filter(e => e.node.id !== selectedSub.id);
          return {
            ...p,
            tags: p.tags.filter(t => t !== exactTagToRemove),
            collections: { ...p.collections, edges: nextCollectionsEdges }
          };
        }
        return p;
      })
    );

    setActionLoading(product.id);
    setError('');

    try {
      const removeMut = `
        mutation tagsRemove($id: ID!, $tags: [String!]!) {
          tagsRemove(id: $id, tags: $tags) {
            userErrors { message }
          }
        }
      `;
      const res = await axios.post('/api/shopify/graphql.json', { query: removeMut, variables: { id: product.id, tags: [exactTagToRemove] } });
      if (res.data.errors) throw new Error(res.data.errors[0].message);
      const userErrors = res.data.data?.tagsRemove?.userErrors;
      if (userErrors && userErrors.length > 0) throw new Error(userErrors[0].message);
      // Wait for Shopify to update smart collection membership in the background
      await new Promise(resolve => setTimeout(resolve, 2500));
      onRefresh();
    } catch (err) {
      setError(err.message || 'Failed to remove product from subcategory');
      // Revert if failed
      setProducts(prevProducts =>
        prevProducts.map(p => {
          if (p.id === product.id) {
            const nextCollectionsEdges = [...p.collections.edges.filter(e => e.node.id !== selectedSub.id), { node: selectedSub }];
            return {
              ...p,
              tags: [...p.tags.filter(t => t !== exactTagToRemove), exactTagToRemove],
              collections: { ...p.collections, edges: nextCollectionsEdges }
            };
          }
          return p;
        })
      );
    } finally {
      setActionLoading('');
    }
  };

  const handleAssignToggle = async (product, shouldAssign) => {
    const subName = selectedSub.title.split("-").pop().trim();
    const subTag = `Sub: ${subName}`;
    const exactTagToRemove = product.tags.find(t => t.toLowerCase() === subTag.toLowerCase()) || subTag;

    // Optimistic UI Update
    setProducts(prevProducts =>
      prevProducts.map(p => {
        if (p.id === product.id) {
          const nextTags = shouldAssign
            ? [...p.tags.filter(t => t !== exactTagToRemove), subTag] // Use canonical SubTag when adding
            : p.tags.filter(t => t !== exactTagToRemove);
          const nextCollectionsEdges = shouldAssign
            ? [...p.collections.edges.filter(e => e.node.id !== selectedSub.id), { node: selectedSub }]
            : p.collections.edges.filter(e => e.node.id !== selectedSub.id);
          return { ...p, tags: nextTags, collections: { ...p.collections, edges: nextCollectionsEdges } };
        }
        return p;
      })
    );

    setActionLoading(product.id);
    setError('');

    try {
      if (shouldAssign) {
        const addMut = `
          mutation tagsAdd($id: ID!, $tags: [String!]!) {
            tagsAdd(id: $id, tags: $tags) { userErrors { message } }
          }
        `;
        const res = await axios.post('/api/shopify/graphql.json', { query: addMut, variables: { id: product.id, tags: [subTag] } });
        if (res.data.errors) throw new Error(res.data.errors[0].message);
        const userErrors = res.data.data?.tagsAdd?.userErrors;
        if (userErrors && userErrors.length > 0) throw new Error(userErrors[0].message);
      } else {
        const removeMut = `
          mutation tagsRemove($id: ID!, $tags: [String!]!) {
            tagsRemove(id: $id, tags: $tags) { userErrors { message } }
          }
        `;
        const res = await axios.post('/api/shopify/graphql.json', { query: removeMut, variables: { id: product.id, tags: [exactTagToRemove] } });
        if (res.data.errors) throw new Error(res.data.errors[0].message);
        const userErrors = res.data.data?.tagsRemove?.userErrors;
        if (userErrors && userErrors.length > 0) throw new Error(userErrors[0].message);
      }
      // Wait for Shopify to update smart collection membership in the background
      await new Promise(resolve => setTimeout(resolve, 2500));
      onRefresh();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to update product tags');
      // Revert if failed
      setProducts(prevProducts =>
        prevProducts.map(p => {
          if (p.id === product.id) {
            const nextTags = !shouldAssign
              ? [...p.tags.filter(t => t !== exactTagToRemove), subTag]
              : p.tags.filter(t => t !== exactTagToRemove);
            const nextCollectionsEdges = !shouldAssign
              ? [...p.collections.edges.filter(e => e.node.id !== selectedSub.id), { node: selectedSub }]
              : p.collections.edges.filter(e => e.node.id !== selectedSub.id);
            return { ...p, tags: nextTags, collections: { ...p.collections, edges: nextCollectionsEdges } };
          }
          return p;
        })
      );
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl overflow-hidden min-h-[600px] text-slate-100 font-sans">

        {/* SIDEBAR - NESTED ACCORDION VIEW */}
      <div className="lg:col-span-1 border-r border-slate-800 bg-[#151D30]/40 p-5 space-y-4">
        <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Collections Hierarchy</h3>
        <div className="space-y-2">
          {parentCollections.map(parent => {
            const isExpanded = expandedParents.has(parent.id);
            const parentSubs = getSubcategories(parent);
            const isCurrentParent = activeParent.id === parent.id;

            return (
              <div key={parent.id} className="space-y-1">
                <button
                  onClick={() => toggleParentExpand(parent.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${isCurrentParent ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <span className="flex items-center gap-2"><Plus className="w-3.5 h-3.5 text-yellow-500" /> {parent.title}</span>
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {/* Subcategories Collapsed List */}
                {isExpanded && (
                  <div className="pl-6 space-y-1 transition-all">
                    {parentSubs.length === 0 ? (
                      <div className="text-[11px] text-slate-500 italic py-1 pl-3">No subcategories.</div>
                    ) : parentSubs.map(sub => {
                      const subName = sub.title.split("-").pop().trim();
                      const isSubActive = selectedSub?.id === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => {
                            setSelectedParentId(parent.id);
                            setSelectedSub(sub);
                          }}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between group ${isSubActive ? 'bg-yellow-500/10 text-yellow-500' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          <span>• {subName}</span>
                          <span className="text-[10px] text-slate-500 group-hover:text-slate-300 font-bold">
                            {products.filter(p => p.tags.some(t => t.toLowerCase() === `sub: ${subName.toLowerCase()}`)).length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* MAIN PANEL CONTENT */}
      <div className="lg:col-span-3 p-6 space-y-6 flex flex-col min-w-0">

        {/* Header section when no subcategory is selected */}
        {!selectedSub ? (
          <div className="flex-1 flex flex-col items-center justify-center py-32 text-center">
            <Layers className="w-12 h-12 text-slate-600 mb-4 animate-pulse" />
            <h2 className="text-lg font-bold text-white mb-1">Select a Subcategory</h2>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">Expand a collection on the left and select one of its subcategories to map products, view listings, or create new ones.</p>

            {/* Quick Create Subcategory inside dashboard panel */}
            <div className="mt-8 p-6 bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 text-left">Quick add under {activeParent.title}</h3>
              <form onSubmit={handleAddSubcategory} className="flex gap-2">
                <input
                  type="text"
                  value={newSubName}
                  onChange={e => setNewSubName(e.target.value)}
                  placeholder="Subcategory name (e.g. Cotton)..."
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !newSubName.trim()}
                  className="bg-yellow-500 hover:bg-yellow-600 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                >
                  Create
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* Active Subcategory Details View */
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-850 pb-4">
              <div>
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{activeParent.title}</div>
                <h2 className="text-xl font-bold text-white mt-0.5">{selectedSub.title.split("-").pop().trim()} View</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="bg-yellow-500 hover:bg-yellow-600 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md"
                >
                  Assign Products
                </button>
                <button
                  onClick={() => handleDeleteSubcategory(selectedSub.id)}
                  disabled={actionLoading === selectedSub.id}
                  className="p-2 border border-slate-700 hover:border-red-800 hover:bg-red-950/20 text-slate-400 hover:text-red-400 rounded-xl transition-all"
                  title="Delete Subcategory"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-950/30 border border-red-800 rounded-xl text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            {/* Theme Display Settings (Icon & Name) */}
            <div className="bg-[#151D30]/40 border border-slate-800 rounded-xl p-5 relative">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-300">Theme Display Settings</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">Edit how this subcategory appears in the store slider.</p>
                </div>
                {themeLoading && <span className="text-[10px] text-yellow-500 font-bold">Loading Theme Data...</span>}
                {themeError && <span className="text-[10px] text-red-500 font-bold">{themeError}</span>}
              </div>

              {currentBlock && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Display Name (Suffix)</label>
                    <input
                      type="text"
                      value={currentBlock.suffix || ''}
                      onChange={(e) => setCurrentBlock(prev => ({ ...prev, suffix: e.target.value }))}
                      placeholder="e.g. Regular Fit"
                      className="w-full bg-[#0B0F19] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Theme Icon</label>
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-2">
                        <label className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all border border-slate-700 cursor-pointer flex items-center justify-center whitespace-nowrap">
                          <span>Upload Image</span>
                          <input type="file" accept="image/*" className="hidden" onChange={handleThemeImageChange} />
                        </label>
                        <input
                          type="text"
                          value={currentBlock.custom_icon_asset || currentBlock.icon_image || ''}
                          onChange={(e) => {
                             setPendingUploadAsset(null);
                             setCurrentBlock(prev => ({ ...prev, custom_icon_asset: '', icon_image: e.target.value }));
                          }}
                          placeholder="Or paste URL (shopify://...)"
                          className="flex-1 bg-[#0B0F19] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none font-mono min-w-0"
                        />
                      </div>
                      
                      <button
                        onClick={handleSaveThemeBlock}
                        disabled={themeSaving}
                        id="save-theme-btn" className="bg-pink-600 hover:bg-pink-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md flex items-center justify-center w-full"
                      >
                        {themeSaving ? 'Saving...' : 'Save Theme Settings'}
                      </button>
                    </div>
                  </div>
                  
                  {(pendingUploadAsset || currentBlock.custom_icon_asset || currentBlock.icon_image) && (
                    <div className="md:col-span-2 mt-2 bg-[#0B0F19] rounded-lg border border-slate-800 flex items-center justify-center p-3 relative min-h-[5rem]">
                      {pendingUploadAsset ? (
                        <>
                          <img src={pendingUploadAsset.base64} alt="preview" className="h-16 w-auto object-contain" />
                          <span className="absolute top-2 right-2 text-[9px] font-bold bg-green-500/20 text-green-400 px-2 py-0.5 rounded">Pending Upload</span>
                        </>
                      ) : currentBlock.custom_icon_asset ? (
                        <div className="flex flex-col items-center">
                           <span className="text-xs text-slate-400 italic text-center">Uploaded Theme Asset:<br/>{currentBlock.custom_icon_asset}</span>
                        </div>
                      ) : currentBlock.icon_image.startsWith('shopify://') ? (
                        <span className="text-xs text-slate-400 italic text-center">Shopify Image URL: {currentBlock.icon_image.split('/').pop()}</span>
                      ) : (
                        <img src={currentBlock.icon_image} alt="preview" className="h-16 w-auto object-contain" onError={(e) => e.target.style.display='none'} />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* List of Products Assigned to the Subcategory */}
            <div className="space-y-3">
              <h3 className="font-bold text-sm text-slate-300">Products in this subcategory</h3>
              <div className="border border-slate-800 rounded-xl overflow-hidden shadow-lg bg-[#151D30]/20">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#151D30]/40 border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="px-5 py-4 w-16">Image</th>
                      <th className="px-5 py-4">Title</th>
                      <th className="px-5 py-4">Vendor</th>
                      <th className="px-5 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {assignedProducts.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="p-8 text-center text-slate-500 italic">No products assigned. Click "Assign Products" to populate this subcategory.</td>
                      </tr>
                    ) : assignedProducts.map(p => {
                      const imgUrl = p.images.edges[0]?.node.url;
                      return (
                        <tr key={p.id} className="hover:bg-slate-850/30">
                          <td className="px-5 py-3">
                            {imgUrl ? (
                              <img src={imgUrl} alt={p.title} className="w-10 h-12 object-cover rounded-lg bg-slate-900 border border-slate-700/60 shadow cursor-pointer hover:scale-105 transition-transform" onClick={() => setPreviewProduct(p)} />
                            ) : (
                              <div className="w-10 h-12 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700/60 shadow cursor-pointer" onClick={() => setPreviewProduct(p)}>
                                <ImageIcon className="w-4 h-4 text-slate-500" />
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3 font-semibold text-white cursor-pointer" onClick={() => setPreviewProduct(p)}>{p.title}</td>
                          <td className="px-5 py-3 text-slate-400">{p.vendor}</td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setPreviewProduct(p)}
                                className="p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg transition-colors"
                                title="View Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleRemoveProductFromSub(p)}
                                disabled={actionLoading === p.id}
                                className="p-1.5 border border-slate-750 hover:border-red-650 hover:bg-red-955/20 text-red-400 hover:text-red-300 rounded-lg transition-colors"
                                title="Remove from Subcategory"
                              >
                                {actionLoading === p.id ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ASSIGN PRODUCTS POPUP MODAL (SHOWS IMAGES & DETAILS SNIPPETS) */}
      {showAssignModal && selectedSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 text-slate-100 font-sans">
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#151D30]">
              <div>
                <h2 className="text-md font-bold text-white">Assign to {selectedSub.title.split("-").pop().trim()}</h2>
                <p className="text-[10px] text-slate-400 mt-0.5">Toggle checkboxes to add/remove products, or click a card to view images & details before adding.</p>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 bg-[#0B0F19]/40 space-y-3">
              {assignableProducts.map(p => {
                const subName = selectedSub.title.split("-").pop().trim();
                const isAssigned = p.tags.some(t => t.toLowerCase() === `sub: ${subName.toLowerCase()}`);
                const imgUrl = p.images.edges[0]?.node.url;
                const descSnippet = htmlToText(p.descriptionHtml).substring(0, 100);
                const otherSubs = p.tags.filter(t => t.startsWith('Sub: ') && t.toLowerCase() !== `sub: ${subName.toLowerCase()}`).map(t => t.replace('Sub: ', ''));

                return (
                  <div
                    key={p.id}
                    className="flex items-start gap-4 p-3 bg-slate-900 border border-slate-800/80 rounded-xl hover:border-slate-700/80 transition-all cursor-pointer select-none"
                    onClick={() => setPreviewProduct(p)}
                  >
                    <div className="pt-0.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleAssignToggle(p, !isAssigned)}
                        className="text-slate-500 hover:text-yellow-500 transition-colors"
                        disabled={actionLoading === p.id}
                      >
                        {actionLoading === p.id ? (
                          <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : isAssigned ? (
                          <CheckSquare className="w-5 h-5 text-yellow-500" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </div>

                    {imgUrl ? (
                      <img src={imgUrl} alt={p.title} className="w-12 h-15 object-cover rounded-lg bg-slate-950 border border-slate-700/60 shadow shrink-0" />
                    ) : (
                      <div className="w-12 h-15 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700/60 shadow shrink-0">
                        <ImageIcon className="w-5 h-5 text-slate-500" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-xs text-white leading-tight truncate">{p.title}</h4>
                        <span className="text-[10px] text-yellow-500 hover:underline shrink-0 font-semibold flex items-center gap-1">
                          <Eye className="w-3 h-3" /> View & Add
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">{descSnippet || 'No description available.'}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.vendor && <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-md font-semibold">{p.vendor}</span>}
                        {p.productType && <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-md font-semibold">{p.productType}</span>}
                        {otherSubs.map(otherSub => (
                          <span key={otherSub} className="text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded-md font-bold">
                            Sub: {otherSub}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-800 bg-[#151D30] flex justify-end shrink-0">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-yellow-500 hover:bg-yellow-600 transition-all shadow-md"
              >
                Close & Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* READ-ONLY DETAIL PREVIEW MODAL */}
      {previewProduct && (() => {
        const previewSubName = selectedSub ? selectedSub.title.split("-").pop().trim() : '';
        const otherSubs = previewProduct.tags.filter(t => t.startsWith('Sub: ') && t.toLowerCase() !== `sub: ${previewSubName.toLowerCase()}`).map(t => t.replace('Sub: ', ''));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 text-slate-100 font-sans">
            <div className="bg-[#1E293B] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#151D30]">
                <h2 className="text-sm font-bold text-white">Product Preview</h2>
                <button onClick={() => setPreviewProduct(null)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#0B0F19]/40">
                <div className="flex flex-col md:flex-row gap-6">
                  {previewProduct.images.edges[0]?.node.url ? (
                    <div className="w-full md:w-48 h-64 shrink-0 rounded-xl overflow-hidden bg-slate-950 border border-slate-750 shadow-inner flex items-center justify-center">
                      <img src={previewProduct.images.edges[0].node.url} alt={previewProduct.title} className="w-full h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-full md:w-48 h-64 shrink-0 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-750 shadow">
                      <ImageIcon className="w-12 h-12 text-slate-500" />
                    </div>
                  )}
                  <div className="flex-1 space-y-4">
                    <div>
                      <h3 className="text-lg font-bold text-white leading-tight">{previewProduct.title}</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {previewProduct.vendor && <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-lg font-semibold">{previewProduct.vendor}</span>}
                        {previewProduct.productType && <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-lg font-semibold">{previewProduct.productType}</span>}
                        {otherSubs.map(otherSub => (
                          <span key={otherSub} className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-lg font-bold">
                            Sub: {otherSub}
                          </span>
                        ))}
                      </div>
                    </div>

                    {previewProduct.variants?.edges?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Pricing & Options</h4>
                        <div className="text-sm font-bold text-yellow-500">
                          ₹{previewProduct.variants.edges[0].node.price}
                          {previewProduct.variants.edges.length > 1 && ` (and ${previewProduct.variants.edges.length - 1} other options)`}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</h4>
                      <div className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-4 border border-slate-800 rounded-xl max-h-40 overflow-y-auto">
                        {htmlToText(previewProduct.descriptionHtml) || 'No description provided.'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Product Tags</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {previewProduct.tags.length === 0 ? (
                      <span className="text-xs text-slate-500 italic">No tags.</span>
                    ) : previewProduct.tags.map(t => (
                      <span key={t} className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md font-semibold">{t}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-800 bg-[#151D30] flex flex-col sm:flex-row gap-3 justify-end shrink-0">

                {/* Add/Remove Subcategory button if active */}
                {selectedSub && (() => {
                  const subName = selectedSub.title.split("-").pop().trim();
                  const isAssigned = previewProduct.tags.some(t => t.toLowerCase() === `sub: ${subName.toLowerCase()}`);
                  return (
                    <button
                      onClick={async () => {
                        setActionLoading(previewProduct.id);
                        await handleAssignToggle(previewProduct, !isAssigned);
                        const subTag = `Sub: ${subName}`;
                        setPreviewProduct(prev => {
                          const nextCollectionsEdges = !isAssigned
                            ? [...prev.collections.edges.filter(e => e.node.id !== selectedSub.id), { node: selectedSub }]
                            : prev.collections.edges.filter(e => e.node.id !== selectedSub.id);
                          return {
                            ...prev,
                            tags: !isAssigned
                              ? [...prev.tags.filter(t => t !== subTag), subTag]
                              : prev.tags.filter(t => t !== subTag),
                            collections: { ...prev.collections, edges: nextCollectionsEdges }
                          };
                        });
                      }}
                      disabled={actionLoading === previewProduct.id}
                      className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${isAssigned
                          ? 'bg-red-650/20 text-red-400 border border-red-500/30 hover:bg-red-950/40'
                          : 'bg-yellow-500 text-slate-950 hover:bg-yellow-600 shadow-md shadow-yellow-500/10'
                        }`}
                    >
                      {isAssigned ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      {isAssigned ? 'Remove from Subcategory' : 'Add to Subcategory'}
                    </button>
                  );
                })()}

                <button
                  onClick={() => setPreviewProduct(null)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}



function BulkEditorDashboard({ products, locations, onRefresh }) {
  // ── shared tab state ─────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('campaign'); // 'campaign' | 'direct' | 'inventory'

  // ── campaign mode state ──────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [vendorFilter, setVendorFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [opType, setOpType] = useState('discount');
  const [adjustType, setAdjustType] = useState('percent');
  const [adjustValue, setAdjustValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // ── direct edit mode state ───────────────────────────────────────────────
  // directEdits: { [variantId]: { price?, compareAtPrice?, inventory? } }
  const [directEdits, setDirectEdits] = useState({});
  const [directSaving, setDirectSaving] = useState(false);
  const [directSearch, setDirectSearch] = useState('');
  const [directStatus, setDirectStatus] = useState('');
  const [expandedProducts, setExpandedProducts] = useState(new Set());

  // ── bulk inventory mode state ────────────────────────────────────────────
  const [invSelectedIds, setInvSelectedIds] = useState(new Set());
  const [invQty, setInvQty] = useState('');
  const [invVendorFilter, setInvVendorFilter] = useState('');
  const [invTypeFilter, setInvTypeFilter] = useState('');
  const [invLoading, setInvLoading] = useState(false);
  const [invStatus, setInvStatus] = useState('');

  const primaryLocationId = locations?.[0]?.id || null;

  const vendors = [...new Set(products.map(p => p.vendor).filter(Boolean))];
  const types = [...new Set(products.map(p => p.productType).filter(Boolean))];

  const filtered = products.filter(p => {
    if (vendorFilter && p.vendor !== vendorFilter) return false;
    if (typeFilter && p.productType !== typeFilter) return false;
    return true;
  });

  // ── campaign helpers ─────────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(p => p.id)));
  };

  const handleBulkUpdate = async () => {
    const selectedList = products.filter(p => selectedIds.has(p.id));
    if (selectedList.length === 0) return alert('Select at least one product!');
    if (opType !== 'revert' && (!adjustValue || isNaN(adjustValue) || parseFloat(adjustValue) <= 0))
      return alert('Please enter a valid positive adjustment value.');

    setLoading(true);
    const value = parseFloat(adjustValue) || 0;
    let successCount = 0;

    try {
      for (let i = 0; i < selectedList.length; i++) {
        const product = selectedList[i];
        setStatusMessage(`Processing ${i + 1}/${selectedList.length}: ${product.title}...`);

        const variants = product.variants.edges.map(e => e.node);
        const updatedVariants = variants.map(v => {
          const originalPrice = parseFloat(v.price) || 0;
          let newPrice = originalPrice;
          let newComparePrice = parseFloat(v.compareAtPrice) || null;

          if (opType === 'discount') {
            newComparePrice = originalPrice;
            newPrice = adjustType === 'percent'
              ? originalPrice * (1 - value / 100)
              : Math.max(0, originalPrice - value);
          } else if (opType === 'flat_adjust') {
            newPrice = adjustType === 'percent'
              ? originalPrice * (1 + value / 100)
              : Math.max(0, originalPrice + value);
          } else if (opType === 'revert') {
            if (v.compareAtPrice) { newPrice = parseFloat(v.compareAtPrice); newComparePrice = null; }
          }

          return {
            id: v.id,
            price: newPrice.toFixed(2),
            compareAtPrice: newComparePrice ? newComparePrice.toFixed(2) : null
          };
        });

        const mutation = `
          mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors { message }
            }
          }`;
        const res = await axios.post('/api/shopify/graphql.json', {
          query: mutation,
          variables: { productId: product.id, variants: updatedVariants }
        });
        if (!res.data.errors && !res.data.data.productVariantsBulkUpdate.userErrors?.length) successCount++;
      }

      alert(`Successfully updated ${successCount} products!`);
      setSelectedIds(new Set());
      setAdjustValue('');
      onRefresh();
    } catch (err) {
      alert('Failed during bulk operation: ' + err.message);
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  // ── direct edit helpers ──────────────────────────────────────────────────
  const directFiltered = products.filter(p =>
    p.title.toLowerCase().includes(directSearch.toLowerCase())
  );
  const toggleExpand = (id) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const expandAll = () => setExpandedProducts(new Set(directFiltered.map(p => p.id)));
  const collapseAll = () => setExpandedProducts(new Set());

  const handleDirectChange = (variantId, field, value) => {
    setDirectEdits(prev => ({
      ...prev,
      [variantId]: { ...(prev[variantId] || {}), [field]: value }
    }));
  };

  const isDirty = Object.keys(directEdits).length > 0;
  const changedVariantCount = Object.keys(directEdits).length;

  const handleSaveDirectEdits = async () => {
    if (!isDirty) return;
    setDirectSaving(true);
    setDirectStatus('');

    // ── 1. Collect price changes grouped by product ──────────────────────
    const productVariantMap = {};
    const inventoryChanges = []; // { inventoryItemId, locationId, quantity }

    for (const product of products) {
      for (const edge of product.variants.edges) {
        const v = edge.node;
        if (!directEdits[v.id]) continue;
        const edit = directEdits[v.id];

        // Price / compareAt
        if (edit.price !== undefined || edit.compareAtPrice !== undefined) {
          if (!productVariantMap[product.id]) productVariantMap[product.id] = [];
          const origPrice = parseFloat(v.price) || 0;
          const origCompare = v.compareAtPrice ? parseFloat(v.compareAtPrice) : null;
          const editedPrice = edit.price !== undefined ? parseFloat(edit.price) : origPrice;
          const editedCompare = edit.compareAtPrice !== undefined
            ? (edit.compareAtPrice === '' ? null : parseFloat(edit.compareAtPrice))
            : origCompare;
          productVariantMap[product.id].push({
            id: v.id,
            price: isNaN(editedPrice) ? v.price : editedPrice.toFixed(2),
            compareAtPrice: editedCompare && !isNaN(editedCompare) ? editedCompare.toFixed(2) : null
          });
        }

        // Inventory
        if (edit.inventory !== undefined && primaryLocationId) {
          const inventoryItemId = v.inventoryItem?.id;
          if (inventoryItemId) {
            inventoryChanges.push({
              inventoryItemId,
              locationId: primaryLocationId,
              quantity: parseInt(edit.inventory, 10)
            });
          }
        }
      }
    }

    let priceSuccess = 0;
    let invSuccess = false;
    try {
      // ── 2. Save prices ─────────────────────────────────────────────────
      const productIds = Object.keys(productVariantMap);
      for (let i = 0; i < productIds.length; i++) {
        const productId = productIds[i];
        const p = products.find(x => x.id === productId);
        setDirectStatus(`Saving prices ${i + 1}/${productIds.length}: ${p?.title || productId}...`);
        const mutation = `
          mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors { message }
            }
          }`;
        const res = await axios.post('/api/shopify/graphql.json', {
          query: mutation,
          variables: { productId, variants: productVariantMap[productId] }
        });
        if (!res.data.errors && !res.data.data.productVariantsBulkUpdate.userErrors?.length) priceSuccess++;
      }

      // ── 3. Save inventory ─────────────────────────────────────────────
      if (inventoryChanges.length > 0) {
        setDirectStatus(`Updating inventory for ${inventoryChanges.length} variant(s)...`);
        const invMutation = `
          mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
            inventorySetOnHandQuantities(input: $input) {
              userErrors { message }
            }
          }`;
        const invRes = await axios.post('/api/shopify/graphql.json', {
          query: invMutation,
          variables: {
            input: {
              reason: 'correction',
              setQuantities: inventoryChanges.map(c => ({
                inventoryItemId: c.inventoryItemId,
                locationId: c.locationId,
                quantity: isNaN(c.quantity) ? 0 : c.quantity
              }))
            }
          }
        });
        if (!invRes.data.errors && !invRes.data.data.inventorySetOnHandQuantities.userErrors?.length) {
          invSuccess = true;
        }
      }

      const parts = [];
      if (priceSuccess > 0) parts.push(`prices for ${priceSuccess} product(s)`);
      if (inventoryChanges.length > 0) parts.push(invSuccess ? `inventory for ${inventoryChanges.length} variant(s)` : 'inventory (some errors)');
      alert(`Saved: ${parts.join(' & ') || 'nothing changed'}.`);
      setDirectEdits({});
      onRefresh();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setDirectSaving(false);
      setDirectStatus('');
    }
  };

  const discardDirectEdits = () => {
    if (window.confirm('Discard all unsaved changes (prices & inventory)?')) setDirectEdits({});
  };

  // ── bulk inventory helpers ───────────────────────────────────────────────
  const invVendors = [...new Set(products.map(p => p.vendor).filter(Boolean))];
  const invTypes = [...new Set(products.map(p => p.productType).filter(Boolean))];
  const invFiltered = products.filter(p => {
    if (invVendorFilter && p.vendor !== invVendorFilter) return false;
    if (invTypeFilter && p.productType !== invTypeFilter) return false;
    return true;
  });
  const toggleInvSelect = (id) => {
    setInvSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleInvSelectAll = () => {
    if (invSelectedIds.size === invFiltered.length) setInvSelectedIds(new Set());
    else setInvSelectedIds(new Set(invFiltered.map(p => p.id)));
  };

  const handleBulkInventoryUpdate = async () => {
    if (!primaryLocationId) return alert('No active location found. Please ensure your store has an active location.');
    if (invSelectedIds.size === 0) return alert('Select at least one product!');
    const qty = parseInt(invQty, 10);
    if (isNaN(qty) || qty < 0) return alert('Enter a valid non-negative quantity.');

    const selectedProducts = products.filter(p => invSelectedIds.has(p.id));
    const setQuantities = [];
    for (const product of selectedProducts) {
      for (const edge of product.variants.edges) {
        const v = edge.node;
        const itemId = v.inventoryItem?.id;
        if (itemId) setQuantities.push({ inventoryItemId: itemId, locationId: primaryLocationId, quantity: qty });
      }
    }

    if (setQuantities.length === 0) return alert('No inventory items found for the selected products.');

    setInvLoading(true);
    setInvStatus(`Setting inventory to ${qty} for ${setQuantities.length} variant(s)...`);
    try {
      const mutation = `
        mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
          inventorySetOnHandQuantities(input: $input) {
            userErrors { message }
          }
        }`;
      const res = await axios.post('/api/shopify/graphql.json', {
        query: mutation,
        variables: { input: { reason: 'correction', setQuantities } }
      });
      if (!res.data.errors && !res.data.data.inventorySetOnHandQuantities.userErrors?.length) {
        alert(`Successfully set inventory to ${qty} for ${setQuantities.length} variant(s) across ${invSelectedIds.size} product(s)!`);
        setInvSelectedIds(new Set());
        setInvQty('');
        onRefresh();
      } else {
        const errs = res.data.data?.inventorySetOnHandQuantities?.userErrors?.map(e => e.message).join(', ');
        alert('Shopify error: ' + (errs || 'Unknown error'));
      }
    } catch (err) {
      alert('Failed to update inventory: ' + err.message);
    } finally {
      setInvLoading(false);
      setInvStatus('');
    }
  };

  return (
    <div className="space-y-0">
      {/* Tab switcher */}
      <div className="flex bg-[#1E293B] border border-slate-800 rounded-t-2xl overflow-hidden">
        <button
          onClick={() => setActiveTab('campaign')}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 ${
            activeTab === 'campaign'
              ? 'bg-[#151D30] text-yellow-400 border-yellow-500'
              : 'text-slate-400 hover:text-white border-transparent hover:bg-slate-800/40'
          }`}
        >
          <Percent className="w-4 h-4" /> Bulk Discount & Ops
        </button>
        <button
          onClick={() => setActiveTab('direct')}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 ${
            activeTab === 'direct'
              ? 'bg-[#151D30] text-yellow-400 border-yellow-500'
              : 'text-slate-400 hover:text-white border-transparent hover:bg-slate-800/40'
          }`}
        >
          <Edit className="w-4 h-4" /> Price & Inventory Edit
          {changedVariantCount > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-yellow-500 text-slate-950 text-[10px] font-extrabold rounded-full">
              {changedVariantCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 ${
            activeTab === 'inventory'
              ? 'bg-[#151D30] text-yellow-400 border-yellow-500'
              : 'text-slate-400 hover:text-white border-transparent hover:bg-slate-800/40'
          }`}
        >
          <Database className="w-4 h-4" /> Bulk Inventory
        </button>
      </div>

      {/* ── CAMPAIGN TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'campaign' && (
        <div className="bg-[#1E293B] border border-slate-800 border-t-0 rounded-b-2xl shadow-xl flex flex-col overflow-hidden">
          <div className="p-6 border-b border-slate-800 bg-[#151D30]/60 space-y-4">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                <Percent className="w-5 h-5 text-yellow-500"/> Bulk Price & Discount Editor
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Select products to bulk-apply discounts, modify general prices, or revert active discount campaigns.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-[#0F172A] p-4 rounded-xl border border-slate-800">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Filter by Brand</label>
                <select value={vendorFilter} onChange={e => { setVendorFilter(e.target.value); setSelectedIds(new Set()); }} className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 text-white rounded-lg text-xs outline-none">
                  <option value="">All Brands</option>
                  {vendors.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Filter by Type</label>
                <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setSelectedIds(new Set()); }} className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 text-white rounded-lg text-xs outline-none">
                  <option value="">All Types</option>
                  {types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Operation</label>
                <select value={opType} onChange={e => setOpType(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 text-white rounded-lg text-xs outline-none">
                  <option value="discount">Apply Discount Campaign</option>
                  <option value="flat_adjust">Modify Price Directly</option>
                  <option value="revert">Revert/Remove Discount</option>
                </select>
              </div>
              <div>
                {opType !== 'revert' ? (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Value</label>
                      <input type="number" value={adjustValue} onChange={e => setAdjustValue(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 text-white rounded-lg text-xs outline-none" placeholder={adjustType === 'percent' ? 'e.g. 15' : 'e.g. 100'} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Unit</label>
                      <select value={adjustType} onChange={e => setAdjustType(e.target.value)} className="px-2 py-1.5 bg-slate-800 border border-slate-700 text-white rounded-lg text-xs outline-none">
                        <option value="percent">%</option>
                        <option value="flat">₹</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="py-2 text-xs text-yellow-500 font-semibold">Will clear Compare-At Prices</div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-xs text-slate-400 font-semibold">{selectedIds.size} products selected.</span>
              <button onClick={handleBulkUpdate} disabled={loading || selectedIds.size === 0}
                className="px-5 py-2 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl text-xs transition-all disabled:opacity-50 flex items-center gap-2 shadow-md cursor-pointer">
                {loading ? <div className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> : <Save className="w-3.5 h-3.5"/>}
                {loading ? 'Processing...' : 'Run Bulk Update'}
              </button>
            </div>
          </div>

          {statusMessage && (
            <div className="p-3 bg-yellow-950/20 border-b border-slate-800 text-yellow-500 text-xs font-semibold text-center animate-pulse">{statusMessage}</div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#151D30]/40 border-b border-slate-800 text-xs uppercase font-semibold text-slate-400">
                <tr>
                  <th className="px-5 py-4 w-10">
                    <button onClick={toggleSelectAll} className="text-slate-500 hover:text-slate-300 transition-colors">
                      {selectedIds.size === filtered.length && filtered.length > 0 ? <CheckSquare className="w-5 h-5 text-yellow-500"/> : <Square className="w-5 h-5"/>}
                    </button>
                  </th>
                  <th className="px-5 py-4">Product</th>
                  <th className="px-5 py-4">Brand</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4">Price Range</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.length === 0 ? (
                  <tr><td colSpan="5" className="p-8 text-center text-slate-500 italic">No products found matching filters.</td></tr>
                ) : filtered.map(p => {
                  const prices = p.variants.edges.map(e => parseFloat(e.node.price));
                  const minP = Math.min(...prices), maxP = Math.max(...prices);
                  const priceDisplay = minP === maxP ? `₹${minP}` : `₹${minP} – ₹${maxP}`;
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30">
                      <td className="px-5 py-4">
                        <button onClick={() => toggleSelect(p.id)} className="text-slate-500 hover:text-slate-300 transition-colors">
                          {selectedIds.has(p.id) ? <CheckSquare className="w-5 h-5 text-yellow-500"/> : <Square className="w-5 h-5"/>}
                        </button>
                      </td>
                      <td className="px-5 py-4 font-bold text-white">{p.title}</td>
                      <td className="px-5 py-4 text-slate-400">{p.vendor || '—'}</td>
                      <td className="px-5 py-4 text-slate-400">{p.productType || '—'}</td>
                      <td className="px-5 py-4 text-yellow-500 font-extrabold">{priceDisplay}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DIRECT PRICE EDIT TAB ─────────────────────────────────────────── */}
      {activeTab === 'direct' && (
        <div className="bg-[#1E293B] border border-slate-800 border-t-0 rounded-b-2xl shadow-xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-slate-800 bg-[#151D30]/60 space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                  <Edit className="w-5 h-5 text-yellow-500"/> Direct Price & Inventory Editor
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Edit selling price, compare-at price &amp; stock quantity per variant. Expand a product, type new values, then save all at once.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {isDirty && (
                  <button onClick={discardDirectEdits}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5"/> Discard ({changedVariantCount})
                  </button>
                )}
                <button onClick={handleSaveDirectEdits} disabled={directSaving || !isDirty}
                  className="px-5 py-2 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl text-xs transition-all disabled:opacity-50 flex items-center gap-2 shadow-md cursor-pointer">
                  {directSaving ? <div className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> : <Save className="w-3.5 h-3.5"/>}
                  {directSaving ? 'Saving...' : `Save All${changedVariantCount > 0 ? ` (${changedVariantCount} changed)` : ''}`}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative max-w-xs flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="Search products..." value={directSearch} onChange={e => setDirectSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white outline-none focus:ring-1 focus:ring-yellow-500 placeholder:text-slate-500" />
              </div>
              <button onClick={expandAll} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1">
                <ChevronDown className="w-3 h-3"/> Expand All
              </button>
              <button onClick={collapseAll} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1">
                <ChevronUp className="w-3 h-3"/> Collapse All
              </button>
            </div>
          </div>

          {directStatus && (
            <div className="p-3 bg-yellow-950/20 border-b border-slate-800 text-yellow-500 text-xs font-semibold text-center animate-pulse">{directStatus}</div>
          )}

          {/* Product accordion rows */}
          <div className="divide-y divide-slate-800/60 overflow-y-auto">
            {directFiltered.length === 0 ? (
              <div className="p-8 text-center text-slate-500 italic text-sm">No products found.</div>
            ) : directFiltered.map(product => {
              const isExpanded = expandedProducts.has(product.id);
              const variants = product.variants.edges.map(e => e.node);
              const imgUrl = product.images.edges[0]?.node.url;
              const hasChanges = variants.some(v => directEdits[v.id]);

              return (
                <div key={product.id}>
                  {/* Accordion toggle row */}
                  <button onClick={() => toggleExpand(product.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-800/40 transition-colors text-left">
                    {imgUrl ? (
                      <img src={imgUrl} alt={product.title} className="w-10 h-10 rounded-lg object-cover bg-slate-900 border border-slate-700 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700 shrink-0">
                        <Package className="w-5 h-5 text-slate-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm truncate">{product.title}</span>
                        {hasChanges && (
                          <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold rounded-full border border-yellow-500/30">Edited</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-slate-500">{variants.length} variant{variants.length !== 1 ? 's' : ''}</span>
                        {product.vendor && <span className="text-xs text-yellow-500/70">{product.vendor}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-slate-500">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {/* Variants table when expanded */}
                  {isExpanded && (
                    <div className="px-5 pb-5">
                      <div className="bg-[#0F172A] rounded-xl border border-slate-800 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                              <th className="px-4 py-3 text-left">Variant</th>
                              <th className="px-4 py-3 text-left w-36">Selling Price (₹)</th>
                              <th className="px-4 py-3 text-left w-36">
                                Compare-At (₹) <span className="normal-case font-normal text-slate-600">optional</span>
                              </th>
                              <th className="px-4 py-3 text-left w-28">Stock (Qty)</th>
                              <th className="px-4 py-3 text-left">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {variants.map(v => {
                              const edit = directEdits[v.id] || {};
                              const currentPrice = edit.price !== undefined ? edit.price : v.price;
                              const currentCompare = edit.compareAtPrice !== undefined ? edit.compareAtPrice : (v.compareAtPrice || '');
                              // Current stock from inventoryLevels (sum across locations, show primary)
                              const invLevels = v.inventoryItem?.inventoryLevels?.edges || [];
                              const primaryLevel = invLevels.find(e => e.node.location?.id === primaryLocationId) || invLevels[0];
                              const currentStock = primaryLevel?.node?.quantities?.find(q => q)?.quantity ?? '—';
                              const currentInv = edit.inventory !== undefined ? edit.inventory : (typeof currentStock === 'number' ? currentStock : '');
                              const isChanged = !!directEdits[v.id];
                              const origP = parseFloat(v.price) || 0;
                              const newP = parseFloat(currentPrice);
                              const savingPct = isChanged && newP > 0 && origP > 0 ? Math.round((1 - newP / origP) * 100) : null;
                              const invChanged = edit.inventory !== undefined;

                              return (
                                <tr key={v.id} className={isChanged ? 'bg-yellow-500/5' : 'hover:bg-slate-800/20'}>
                                  <td className="px-4 py-3 font-semibold" style={{ color: isChanged ? '#fde68a' : '#cbd5e1' }}>
                                    {v.title === 'Default Title' ? 'Default' : v.title}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="relative">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold pointer-events-none">₹</span>
                                      <input type="number" min="0" step="0.01" value={currentPrice}
                                        onChange={e => handleDirectChange(v.id, 'price', e.target.value)}
                                        className={`w-full pl-6 pr-2 py-1.5 rounded-lg font-bold outline-none transition-all border text-xs ${
                                          isChanged
                                            ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-300 focus:ring-1 focus:ring-yellow-500'
                                            : 'bg-slate-800 border-slate-700 text-white focus:ring-1 focus:ring-yellow-500/50 focus:border-yellow-500/50'
                                        }`} />
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="relative">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold pointer-events-none">₹</span>
                                      <input type="number" min="0" step="0.01" value={currentCompare} placeholder="—"
                                        onChange={e => handleDirectChange(v.id, 'compareAtPrice', e.target.value)}
                                        className="w-full pl-6 pr-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 outline-none focus:ring-1 focus:ring-yellow-500/50 focus:border-yellow-500/50 transition-all placeholder:text-slate-600" />
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <input type="number" min="0" step="1" value={currentInv} placeholder={String(currentStock)}
                                      onChange={e => handleDirectChange(v.id, 'inventory', e.target.value)}
                                      className={`w-full px-2 py-1.5 rounded-lg text-xs font-bold outline-none transition-all border ${
                                        invChanged
                                          ? 'bg-blue-500/10 border-blue-500/40 text-blue-300 focus:ring-1 focus:ring-blue-500'
                                          : 'bg-slate-800 border-slate-700 text-slate-300 focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50'
                                      }`} />
                                  </td>
                                  <td className="px-4 py-3">
                                    {isChanged ? (
                                      <div className="flex flex-col gap-1">
                                        {(edit.price !== undefined || edit.compareAtPrice !== undefined) && (
                                          <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 font-bold rounded text-[9px] border border-yellow-500/30 inline-flex items-center gap-1">
                                            ₹ Price
                                            {savingPct !== null && savingPct > 0 && <span className="text-green-400">-{savingPct}%</span>}
                                            {savingPct !== null && savingPct < 0 && <span className="text-red-400">+{Math.abs(savingPct)}%</span>}
                                          </span>
                                        )}
                                        {invChanged && (
                                          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 font-bold rounded text-[9px] border border-blue-500/30">
                                            📦 Stock
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-slate-600 text-[10px]">Unchanged</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sticky save bar */}
          {isDirty && (
            <div className="sticky bottom-0 border-t border-yellow-500/30 bg-[#0F172A]/95 backdrop-blur px-6 py-3 flex items-center justify-between">
              <span className="text-xs text-yellow-400 font-semibold">
                ⚠️ {changedVariantCount} variant{changedVariantCount !== 1 ? 's' : ''} with unsaved changes
              </span>
              <div className="flex items-center gap-3">
                <button onClick={discardDirectEdits} className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 rounded-lg text-xs font-bold transition-all">Discard</button>
                <button onClick={handleSaveDirectEdits} disabled={directSaving}
                  className="px-5 py-1.5 bg-gradient-to-r from-yellow-500 to-amber-600 text-slate-950 font-bold rounded-lg text-xs transition-all disabled:opacity-60 flex items-center gap-1.5 shadow-md shadow-yellow-500/20">
                  {directSaving ? <div className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> : <Save className="w-3 h-3"/>}
                  {directSaving ? 'Saving...' : 'Save to Shopify'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BULK INVENTORY TAB ────────────────────────────────────────────── */}
      {activeTab === 'inventory' && (
        <div className="bg-[#1E293B] border border-slate-800 border-t-0 rounded-b-2xl shadow-xl flex flex-col overflow-hidden">
          <div className="p-6 border-b border-slate-800 bg-[#151D30]/60 space-y-4">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                <Database className="w-5 h-5 text-yellow-500"/> Bulk Inventory Manager
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Select products and set a fixed stock quantity for ALL their variants at the primary location in one click.
              </p>
              {!primaryLocationId && (
                <div className="mt-2 p-2 bg-red-950/40 border border-red-800/50 rounded-lg text-red-400 text-xs">
                  ⚠️ No active location found. Please ensure your Shopify store has at least one active location.
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-[#0F172A] p-4 rounded-xl border border-slate-800">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Filter by Brand</label>
                <select value={invVendorFilter} onChange={e => { setInvVendorFilter(e.target.value); setInvSelectedIds(new Set()); }} className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 text-white rounded-lg text-xs outline-none">
                  <option value="">All Brands</option>
                  {invVendors.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Filter by Type</label>
                <select value={invTypeFilter} onChange={e => { setInvTypeFilter(e.target.value); setInvSelectedIds(new Set()); }} className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 text-white rounded-lg text-xs outline-none">
                  <option value="">All Types</option>
                  {invTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Set Quantity To</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={invQty}
                  onChange={e => setInvQty(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 text-white rounded-lg text-xs outline-none focus:ring-1 focus:ring-yellow-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Operation</label>
                <div className="text-xs text-slate-400 py-1.5 font-semibold">Set On-Hand Quantity (correction)</div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-xs text-slate-400 font-semibold">{invSelectedIds.size} product(s) selected.</span>
              <button onClick={handleBulkInventoryUpdate} disabled={invLoading || invSelectedIds.size === 0 || !invQty || !primaryLocationId}
                className="px-5 py-2 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl text-xs transition-all disabled:opacity-50 flex items-center gap-2 shadow-md cursor-pointer">
                {invLoading ? <div className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> : <Database className="w-3.5 h-3.5"/>}
                {invLoading ? 'Updating...' : 'Set Inventory for Selected'}
              </button>
            </div>
          </div>

          {invStatus && (
            <div className="p-3 bg-yellow-950/20 border-b border-slate-800 text-yellow-500 text-xs font-semibold text-center animate-pulse">{invStatus}</div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#151D30]/40 border-b border-slate-800 text-xs uppercase font-semibold text-slate-400">
                <tr>
                  <th className="px-5 py-4 w-10">
                    <button onClick={toggleInvSelectAll} className="text-slate-500 hover:text-slate-300 transition-colors">
                      {invSelectedIds.size === invFiltered.length && invFiltered.length > 0 ? <CheckSquare className="w-5 h-5 text-yellow-500"/> : <Square className="w-5 h-5"/>}
                    </button>
                  </th>
                  <th className="px-5 py-4">Product</th>
                  <th className="px-5 py-4">Brand</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4">Variants</th>
                  <th className="px-5 py-4">Current Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {invFiltered.length === 0 ? (
                  <tr><td colSpan="6" className="p-8 text-center text-slate-500 italic">No products found.</td></tr>
                ) : invFiltered.map(p => {
                  const variants = p.variants.edges.map(e => e.node);
                  const totalStock = variants.reduce((sum, v) => {
                    const levels = v.inventoryItem?.inventoryLevels?.edges || [];
                    const level = levels.find(e => e.node.location?.id === primaryLocationId) || levels[0];
                    const qty = level?.node?.quantities?.[0]?.quantity ?? 0;
                    return sum + (typeof qty === 'number' ? qty : 0);
                  }, 0);
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30">
                      <td className="px-5 py-4">
                        <button onClick={() => toggleInvSelect(p.id)} className="text-slate-500 hover:text-slate-300 transition-colors">
                          {invSelectedIds.has(p.id) ? <CheckSquare className="w-5 h-5 text-yellow-500"/> : <Square className="w-5 h-5"/>}
                        </button>
                      </td>
                      <td className="px-5 py-4 font-bold text-white">{p.title}</td>
                      <td className="px-5 py-4 text-slate-400">{p.vendor || '—'}</td>
                      <td className="px-5 py-4 text-slate-400">{p.productType || '—'}</td>
                      <td className="px-5 py-4 text-slate-400">{variants.length}</td>
                      <td className="px-5 py-4">
                        <span className={`font-bold ${totalStock === 0 ? 'text-red-400' : totalStock < 5 ? 'text-yellow-400' : 'text-green-400'}`}>
                          {totalStock} units
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SeoOptimizerDashboard({ products, onRefresh }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Missing SEO: empty titles/descriptions or default titles
  const targetProducts = products.filter(p => {
    const titleEmpty = !p.seo?.title || p.seo.title.trim() === '';
    const descEmpty = !p.seo?.description || p.seo.description.trim() === '';
    return titleEmpty || descEmpty;
  });

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === targetProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(targetProducts.map(p => p.id)));
    }
  };

  const handleBulkOptimize = async () => {
    const selectedList = targetProducts.filter(p => selectedIds.has(p.id));
    if (selectedList.length === 0) return alert("Select at least one product to optimize!");

    const savedSettings = JSON.parse(localStorage.getItem('recoverySettings') || '{}');
    const aiProvider = savedSettings.aiProvider || 'groq';
    const apiKey = aiProvider === 'gemini' 
      ? (savedSettings.geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY)
      : savedSettings.groqApiKey;

    if (!apiKey) {
      return alert("Missing AI API Key! Please configure your Gemini or Groq credentials in the Settings modal.");
    }

    setLoading(true);
    let successCount = 0;

    try {
      for (let i = 0; i < selectedList.length; i++) {
        const product = selectedList[i];
        setStatusMessage(`AI Optimizing product ${i + 1} of ${selectedList.length}: ${product.title}...`);

        const pDescClean = htmlToText(product.descriptionHtml || '').substring(0, 300);
        const systemPrompt = `You are a professional SEO optimizer for a Shopify e-commerce brand.
For the product "${product.title}" (Type: "${product.productType || 'Apparel'}", Brand: "${product.vendor || ''}", Description: "${pDescClean}"), generate optimal SEO metadata:
1. SEO Page Title (under 70 characters, compelling, keyword-rich).
2. SEO Meta Description (under 160 characters, descriptive, includes a call-to-action).

Return ONLY a valid JSON object with precisely these keys:
{
  "seoTitle": "...",
  "seoDescription": "..."
}
Do not wrap it in markdown block. Return raw JSON.`;

        let responseText = '';

        if (aiProvider === 'gemini') {
          const model = savedSettings.geminiModel || 'gemini-1.5-flash';
          const requestPayload = {
            contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
            generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
          };
          const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, requestPayload);
          responseText = res.data.candidates[0].content.parts[0].text;
        } else if (aiProvider === 'groq') {
          const model = savedSettings.groqModel || 'llama-3.3-70b-versatile';
          const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: model,
            messages: [{ role: "user", content: systemPrompt }],
            temperature: 0.7,
            response_format: { type: "json_object" }
          }, {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            }
          });
          responseText = res.data.choices[0].message.content;
        }

        responseText = responseText.replace(/```json\n/g, '').replace(/```\n?/g, '');
        const seoData = JSON.parse(responseText);

        if (seoData.seoTitle && seoData.seoDescription) {
          const mutation = `
            mutation productUpdate($input: ProductInput!) {
              productUpdate(input: $input) {
                userErrors { message }
              }
            }
          `;
          const variables = {
            input: {
              id: product.id,
              seo: {
                title: seoData.seoTitle.substring(0, 70),
                description: seoData.seoDescription.substring(0, 160)
              }
            }
          };
          const updateRes = await axios.post('/api/shopify/graphql.json', { query: mutation, variables });
          if (!updateRes.data.errors && !updateRes.data.data.productUpdate.userErrors?.length) {
            successCount++;
          }
        }
      }

      alert(`Successfully generated and saved SEO details for ${successCount} products!`);
      setSelectedIds(new Set());
      onRefresh();
    } catch (err) {
      alert("Failed during SEO optimization: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  return (
    <div className="bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl flex flex-col overflow-hidden">
      <div className="p-6 border-b border-slate-800 bg-[#151D30]/60 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-white"><Sparkles className="w-5 h-5 text-yellow-500"/> AI SEO Meta Optimizer</h2>
          <p className="text-xs text-slate-400 mt-1">Identifies products missing search listings and bulk-generates optimized Google SEO tags using AI.</p>
        </div>
        <button
          onClick={handleBulkOptimize}
          disabled={loading || selectedIds.size === 0}
          className="px-5 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl text-xs transition-all disabled:opacity-50 flex items-center gap-2 shadow-md cursor-pointer"
        >
          {loading ? <div className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> : <Sparkles className="w-4 h-4"/>}
          {loading ? 'Optimizing with AI...' : 'Bulk Optimize with AI'}
        </button>
      </div>

      {statusMessage && (
        <div className="p-3 bg-yellow-950/20 border-b border-slate-800 text-yellow-500 text-xs font-semibold text-center animate-pulse">
          {statusMessage}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-350">
          <thead className="bg-[#151D30]/40 border-b border-slate-800 text-xs uppercase font-semibold text-slate-400">
            <tr>
              <th className="px-5 py-4 w-10">
                <button onClick={toggleSelectAll} className="text-slate-500 hover:text-slate-300 transition-colors">
                  {selectedIds.size === targetProducts.length && targetProducts.length > 0 ? <CheckSquare className="w-5 h-5 text-yellow-500"/> : <Square className="w-5 h-5"/>}
                </button>
              </th>
              <th className="px-5 py-4">Product</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Brand</th>
              <th className="px-5 py-4">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {targetProducts.length === 0 ? (
              <tr><td colSpan="5" className="p-8 text-center text-slate-500 italic">No products found with missing SEO tags. Clean sweep!</td></tr>
            ) : targetProducts.map(p => {
              const titleEmpty = !p.seo?.title || p.seo.title.trim() === '';
              const descEmpty = !p.seo?.description || p.seo.description.trim() === '';
              let statusLabel = '';
              if (titleEmpty && descEmpty) statusLabel = 'Missing Title & Desc';
              else if (titleEmpty) statusLabel = 'Missing Title';
              else statusLabel = 'Missing Description';
              return (
                <tr key={p.id} className="hover:bg-slate-800/30">
                  <td className="px-5 py-4">
                    <button onClick={() => toggleSelect(p.id)} className="text-slate-500 hover:text-slate-300 transition-colors">
                      {selectedIds.has(p.id) ? <CheckSquare className="w-5 h-5 text-yellow-500"/> : <Square className="w-5 h-5"/>}
                    </button>
                  </td>
                  <td className="px-5 py-4 font-bold text-white">{p.title}</td>
                  <td className="px-5 py-4 text-xs font-bold text-yellow-500/80">{statusLabel}</td>
                  <td className="px-5 py-4 text-slate-400">{p.vendor || '—'}</td>
                  <td className="px-5 py-4 text-slate-400">{p.productType || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AltImageManagerDashboard({ onRefresh }) {
  const [imageList, setImageList] = useState([]);
  const [selectedImgIds, setSelectedImgIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const fetchImagesData = useCallback(async () => {
    setFetching(true);
    setError('');
    try {
      const query = `
        query getProductsImages {
          products(first: 50, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                title
                productType
                vendor
                media(first: 15) {
                  edges {
                    node {
                      id
                      alt
                      mediaContentType
                      ... on MediaImage {
                        image {
                          url
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      const res = await axios.post('/api/shopify/graphql.json', { query });
      if (res.data.errors) throw new Error(res.data.errors[0].message);

      const prods = res.data.data.products.edges.map(e => e.node);
      const unoptimized = [];
      prods.forEach(p => {
        const mediaItems = p.media?.edges || [];
        mediaItems.forEach(edge => {
          const mediaNode = edge.node;
          if (mediaNode.mediaContentType === 'IMAGE') {
            const imageUrl = mediaNode.image?.url;
            if (!imageUrl) return;

            const hasAlt = mediaNode.alt && mediaNode.alt.trim() !== '';
            const isDefault = mediaNode.alt === p.title;
            if (!hasAlt || isDefault) {
              unoptimized.push({
                productId: p.id,
                productTitle: p.title,
                productType: p.productType || 'Apparel',
                vendor: p.vendor || '',
                imageId: mediaNode.id,
                imageUrl: imageUrl,
                currentAlt: mediaNode.alt || ''
              });
            }
          }
        });
      });
      setImageList(unoptimized);
    } catch (err) {
      setError(err.message || 'Failed to fetch unoptimized images');
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchImagesData();
  }, [fetchImagesData]);

  const toggleSelectImg = (id) => {
    setSelectedImgIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllImgs = () => {
    if (selectedImgIds.size === imageList.length) {
      setSelectedImgIds(new Set());
    } else {
      setSelectedImgIds(new Set(imageList.map(img => img.imageId)));
    }
  };

  const handleBulkOptimizeAlts = async () => {
    const selectedList = imageList.filter(img => selectedImgIds.has(img.imageId));
    if (selectedList.length === 0) return alert("Select at least one image to tag!");

    const savedSettings = JSON.parse(localStorage.getItem('recoverySettings') || '{}');
    const groqKey = savedSettings.groqApiKey || import.meta.env.VITE_GROQ_API_KEY;

    if (!groqKey) {
      return alert("Missing Groq API Key! Please configure your Groq API credentials in the Settings modal.");
    }

    setLoading(true);
    let successCount = 0;

    const fetchWithRetry = async (fn, maxRetries = 4, initialDelay = 2000) => {
      let retries = 0;
      while (true) {
        try {
          return await fn();
        } catch (error) {
          const status = error.response?.status;
          const isRateLimit = status === 429;
          if (isRateLimit && retries < maxRetries) {
            const delay = initialDelay * Math.pow(2, retries);
            console.warn(`[API Rate Limit 429] Retrying after ${delay}ms delay... (Attempt ${retries + 1}/${maxRetries})`);
            setStatusMessage(`Rate limit hit. Retrying in ${Math.round(delay / 1000)} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            retries++;
          } else {
            throw error;
          }
        }
      }
    };

    try {
      for (let i = 0; i < selectedList.length; i++) {
        if (i > 0) {
          setStatusMessage("Waiting a brief moment to avoid rate limits...");
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

        const item = selectedList[i];
        setStatusMessage(`Analyzing image ${i + 1} of ${selectedList.length} with AI: ${item.productTitle}...`);

        const res = await fetchWithRetry(() => axios.post('https://api.groq.com/openai/v1/chat/completions', {
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: item.imageUrl }
                },
                {
                  type: 'text',
                  text: `Analyze this image for the product "${item.productTitle}" (Type: "${item.productType}", Brand: "${item.vendor}"). Write a highly concise, SEO-rich alt tag (under 12 words) describing the garment design, style, color, and fit. Return ONLY the alt tag text as raw output.`
                }
              ]
            }
          ],
          max_tokens: 80
        }, {
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          }
        }));

        console.log('[Groq Vision] Response data:', res.data);
        const generatedAlt = res.data.choices?.[0]?.message?.content?.trim();
        if (!generatedAlt) {
          console.warn('[Groq Vision] No alt tag text found in response:', res.data);
          alert(`Groq returned empty text for ${item.productTitle}.`);
          continue;
        }

        console.log(`[Groq Vision] Generated alt for "${item.productTitle}":`, generatedAlt);

        const mutation = `
          mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
            productUpdateMedia(productId: $productId, media: $media) {
              media { id alt }
              mediaUserErrors { field message }
            }
          }
        `;
        const variables = {
          productId: item.productId,
          media: [
            {
              id: item.imageId,
              alt: generatedAlt
            }
          ]
        };
        const updateRes = await fetchWithRetry(() => axios.post('/api/shopify/graphql.json', { query: mutation, variables }));
        console.log('[Shopify Update] Response:', updateRes.data);

        const mediaUserErrors = updateRes.data?.data?.productUpdateMedia?.mediaUserErrors || [];
        if (updateRes.data.errors || mediaUserErrors.length > 0) {
          const errMsg = mediaUserErrors.map(e => e.message).join(', ') || JSON.stringify(updateRes.data.errors);
          console.error('[Shopify Update] Failed to update alt tag:', errMsg);
          alert(`Shopify update failed for ${item.productTitle}: ${errMsg}`);
        } else {
          successCount++;
        }
      }

      alert(`Successfully generated and saved SEO alt tags for ${successCount} product images!`);
      setSelectedImgIds(new Set());
      fetchImagesData();
      onRefresh();
    } catch (err) {
      alert("Failed during Image Alt Tag optimization: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  return (
    <div className="bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl flex flex-col overflow-hidden">
      <div className="p-6 border-b border-slate-800 bg-[#151D30]/60 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-white">
            <ImageIcon className="w-5 h-5 text-yellow-500" /> AI Image Alt Tag Manager
          </h2>
          <p className="text-xs text-slate-400 mt-1">Scans product images and auto-generates descriptive, SEO-rich alt tags using the Groq Vision model.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchImagesData}
            disabled={fetching || loading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-bold transition-all"
          >
            {fetching ? 'Scanning...' : 'Scan Images'}
          </button>
          <button
            onClick={handleBulkOptimizeAlts}
            disabled={loading || selectedImgIds.size === 0 || fetching}
            className="px-5 py-2 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl text-xs transition-all disabled:opacity-50 flex items-center gap-2 shadow-md cursor-pointer"
          >
            {loading ? <div className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Analyzing Images with Groq...' : 'Bulk Tag Images with Groq'}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 bg-yellow-950/20 border-b border-slate-800 text-yellow-500 text-xs font-semibold text-center animate-pulse">
          {statusMessage}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-950/45 border-b border-slate-800 text-red-400 text-xs font-semibold">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-350">
          <thead className="bg-[#151D30]/40 border-b border-slate-800 text-xs uppercase font-semibold text-slate-400">
            <tr>
              <th className="px-5 py-4 w-10">
                <button onClick={toggleSelectAllImgs} className="text-slate-500 hover:text-slate-300 transition-colors">
                  {selectedImgIds.size === imageList.length && imageList.length > 0 ? <CheckSquare className="w-5 h-5 text-yellow-500" /> : <Square className="w-5 h-5" />}
                </button>
              </th>
              <th className="px-5 py-4 w-24">Image</th>
              <th className="px-5 py-4">Product Title</th>
              <th className="px-5 py-4">Current Alt Tag</th>
              <th className="px-5 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {fetching && imageList.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-12 text-center text-slate-400">
                  <div className="w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  Scanning product media library...
                </td>
              </tr>
            ) : imageList.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-8 text-center text-slate-500 italic">
                  All images have descriptive alt tags. No unoptimized media!
                </td>
              </tr>
            ) : (
              imageList.map(img => (
                <tr key={img.imageId} className="hover:bg-slate-800/30">
                  <td className="px-5 py-4">
                    <button onClick={() => toggleSelectImg(img.imageId)} className="text-slate-500 hover:text-slate-300 transition-colors">
                      {selectedImgIds.has(img.imageId) ? <CheckSquare className="w-5 h-5 text-yellow-500" /> : <Square className="w-5 h-5" />}
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <img src={img.imageUrl} alt={img.productTitle} className="w-12 h-16 object-cover bg-slate-900 border border-slate-800 rounded shadow-inner" />
                  </td>
                  <td className="px-5 py-4 font-bold text-white">{img.productTitle}</td>
                  <td className="px-5 py-4 text-xs font-mono text-slate-400 max-w-xs truncate">{img.currentAlt || 'None (using product title)'}</td>
                  <td className="px-5 py-4 text-xs font-bold text-yellow-500/80">Unoptimized</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OffersDashboard({
  mode,
  collections,
  mainHandles,
  products,
  categoryOrder,
  setCategoryOrder,
  catOrderSaving,
  setCatOrderSaving,
  catOrderSuccess,
  setCatOrderSuccess,
  catOrderError,
  setCatOrderError,
  catOrderDirty,
  setCatOrderDirty,
  shopId
}) {
  const [offersTab, setOffersTab] = useState('product-offers');

  const [themeId, setThemeId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [templatePath, setTemplatePath] = useState('templates/product.json');
  const [templateJson, setTemplateJson] = useState(null);
  const [sectionKey, setSectionKey] = useState('');
  const [offers, setOffers] = useState([]);
  const [generalSettings, setGeneralSettings] = useState({ heading: '', showViewAll: false });
  const [isDirty, setIsDirty] = useState(false);

  const [editingBlockId, setEditingBlockId] = useState(null);
  const [editCode, setEditCode] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTimer, setEditTimer] = useState('');

  useEffect(() => {
    if (offersTab === 'product-offers') {
      fetchThemeAndAsset();
    }
  }, [templatePath, offersTab]);

  const fetchThemeAndAsset = async () => {
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const themeQuery = `query { themes(first: 10) { edges { node { id role } } } }`;
      const themeRes = await axios.post('/api/shopify/graphql.json', { query: themeQuery });
      const mainTheme = themeRes.data.data.themes.edges.find(e => e.node.role === 'MAIN')?.node;
      if (!mainTheme) throw new Error("No active theme found!");
      const tId = mainTheme.id.split('/').pop();
      setThemeId(tId);

      const assetRes = await axios.get(`/api/shopify/themes/${tId}/assets.json?asset[key]=${templatePath}`);
      const parsedTemplate = JSON.parse(assetRes.data.asset.value);
      setTemplateJson(parsedTemplate);

      let foundSecKey = '';
      const targetSectionType = templatePath.includes('combo') ? 'main-combo' : 'main-product';
      if (parsedTemplate.sections) {
        for (const key of Object.keys(parsedTemplate.sections)) {
          if (parsedTemplate.sections[key]?.type === targetSectionType) { foundSecKey = key; break; }
        }
      }
      if (!foundSecKey && parsedTemplate.sections?.main) foundSecKey = 'main';
      setSectionKey(foundSecKey);

      const sectionObj = parsedTemplate.sections?.[foundSecKey];
      const blocksObj = sectionObj?.blocks || {};
      const order = sectionObj?.block_order || [];
      const extractedOffers = order.map(id => ({ id, ...blocksObj[id] })).filter(b => b && b.type === 'offer');
      setOffers(extractedOffers);
      setGeneralSettings({
        heading: sectionObj?.settings?.offers_heading || '',
        showViewAll: sectionObj?.settings?.show_view_all ?? true
      });
      setIsDirty(false);
    } catch (err) {
      setError(err.message || 'Failed to fetch theme.');
    } finally {
      setLoading(false);
    }
  };

  const moveOffer = (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === offers.length - 1) return;
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...offers];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, moved);
    setOffers(reordered);
    setIsDirty(true);
  };

  const handleDeleteOffer = (blockId) => {
    if (!window.confirm("Delete this offer?")) return;
    setOffers(prev => prev.filter(o => o.id !== blockId));
    setIsDirty(true);
  };

  const openEditModal = (offer = null) => {
    if (offer) {
      setEditingBlockId(offer.id);
      setEditCode(offer.settings?.offer_code || '');
      setEditDesc(offer.settings?.offer_desc || '');
      setEditTimer(offer.settings?.offer_timer || '');
    } else {
      setEditingBlockId('NEW');
      setEditCode('');
      setEditDesc('');
      setEditTimer('Ends in 07h 06m 05s');
    }
  };

  const handleSaveBlock = () => {
    if (!editCode.trim() || !editDesc.trim()) { alert("Required fields missing!"); return; }
    if (editingBlockId === 'NEW') {
      const newBlockId = `offer_${Date.now()}`;
      setOffers(prev => [...prev, { id: newBlockId, type: 'offer', settings: { offer_code: editCode, offer_desc: editDesc, offer_timer: editTimer } }]);
    } else {
      setOffers(prev => prev.map(o => o.id === editingBlockId ? { ...o, settings: { ...o.settings, offer_code: editCode, offer_desc: editDesc, offer_timer: editTimer } } : o));
    }
    setEditingBlockId(null);
    setIsDirty(true);
  };

  const handleSaveToShopify = async () => {
    if (!themeId || !templateJson || !sectionKey) return;
    setLoading(true);
    try {
      const updatedTemplate = JSON.parse(JSON.stringify(templateJson));
      const sectionObj = updatedTemplate.sections[sectionKey];
      const finalBlocks = { ...sectionObj.blocks };
      const oldOfferIds = Object.keys(finalBlocks).filter(id => finalBlocks[id]?.type === 'offer');
      oldOfferIds.forEach(id => delete finalBlocks[id]);
      offers.forEach(o => { finalBlocks[o.id] = { type: 'offer', settings: { offer_code: o.settings.offer_code, offer_desc: o.settings.offer_desc, offer_timer: o.settings.offer_timer } }; });
      const nonOfferIds = (sectionObj.block_order || []).filter(id => !oldOfferIds.includes(id));
      sectionObj.blocks = finalBlocks;
      sectionObj.block_order = [...offers.map(o => o.id), ...nonOfferIds];
      sectionObj.settings.offers_heading = generalSettings.heading;
      sectionObj.settings.show_view_all = generalSettings.showViewAll;
      await axios.put(`/api/shopify/themes/${themeId}/assets.json`, { asset: { key: templatePath, value: JSON.stringify(updatedTemplate, null, 2) } });
      setSuccessMsg("Changes saved successfully.");
      setIsDirty(false);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const parentCollections = collections
    .filter(c => c.handle && mainHandles.includes(c.handle))
    .sort((a, b) => {
      const idxA = categoryOrder.indexOf(a.handle);
      const idxB = categoryOrder.indexOf(b.handle);
      const sortA = idxA === -1 ? 999 : idxA;
      const sortB = idxB === -1 ? 999 : idxB;
      return sortA - sortB;
    });
  const [selectedCollectionId, setSelectedCollectionId] = useState(() => parentCollections[0]?.id || '');

  const getCategoryTitle = (handle) => {
    const col = collections.find(c => c.handle === handle);
    if (col) return col.title;
    if (handle === 't-shirts') return 'T-Shirts';
    if (handle === 'shorts') return 'Shorts';
    if (handle === 'trackpants') return 'Trackpants';
    if (handle === 'swimwear') return 'Swimwear';
    if (handle === 'joggers') return 'Joggers';
    if (handle === 'accessories') return 'Accessories';
    return handle.charAt(0).toUpperCase() + handle.slice(1);
  };

  const handleSaveCategoryOrder = async () => {
    if (!shopId) return alert("Shop GID is not loaded yet.");
    setCatOrderSaving(true);
    setCatOrderSuccess('');
    setCatOrderError('');
    try {
      const query = `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { message } } }`;
      const variables = {
        metafields: [{
          ownerId: shopId,
          namespace: "price_editor",
          key: "category_order",
          type: "json",
          value: JSON.stringify(categoryOrder)
        }]
      };
      const res = await axios.post('/api/shopify/graphql.json', { query, variables });
      if (res.data?.data?.metafieldsSet?.userErrors?.length > 0) {
        throw new Error(res.data.data.metafieldsSet.userErrors[0].message);
      }
      setCatOrderSuccess("Category order saved successfully!");
      setCatOrderDirty(false);
    } catch (err) {
      setCatOrderError(err.message || "Failed to save category order");
    } finally {
      setCatOrderSaving(false);
    }
  };
  const [campaigns, setCampaigns] = useState([]);
  const [campLoading, setCampLoading] = useState(false);
  const [campError, setCampError] = useState('');
  const [campSuccess, setCampSuccess] = useState('');
  const [campDirty, setCampDirty] = useState(false);
  const [editingCampaignIdx, setEditingCampaignIdx] = useState(null);
  const [campEditData, setCampEditData] = useState({ id: '', insert_after: 4, offer_box_height: 70, bg_color_1: '#111111', bg_color_2: '#2b2b2b', text_color: '#ffffff', heading_1: '', subheading_1: '', coupon_code_1: '', heading_2: '', subheading_2: '', coupon_code_2: '', heading_3: '', subheading_3: '', coupon_code_3: '', items: [] });
  const [searchProductQuery, setSearchProductQuery] = useState('');
  const [showSliderProductSelect, setShowSliderProductSelect] = useState(false);

  const [featuredProducts, setFeaturedProducts] = useState([null, null, null, null]);
  const [featLoading, setFeatLoading] = useState(false);
  const [featError, setFeatError] = useState('');
  const [featSuccess, setFeatSuccess] = useState('');
  const [featDirty, setFeatDirty] = useState(false);
  const [selectingSlotIdx, setSelectingSlotIdx] = useState(null);

  // Custom collection banner states
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerLoading, setBannerLoading] = useState(false);
  const [bannerError, setBannerError] = useState('');
  const [bannerSuccess, setBannerSuccess] = useState('');
  const [bannerDirty, setBannerDirty] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);

  // Sync sub-tab based on main mode changes
  useEffect(() => {
    if (mode === 'offers') {
      setOffersTab('product-offers');
    } else {
      setOffersTab('all-featured');
    }
  }, [mode]);

  // Select the first parent collection automatically when they finish loading
  useEffect(() => {
    if (!selectedCollectionId && parentCollections.length > 0) {
      setSelectedCollectionId(parentCollections[0].id);
    }
  }, [parentCollections, selectedCollectionId]);

  useEffect(() => {
    if (offersTab === 'collection-campaigns' && selectedCollectionId) {
      fetchCollectionCampaigns(selectedCollectionId);
    }
  }, [selectedCollectionId, offersTab]);

  useEffect(() => {
    if (offersTab === 'all-featured' && selectedCollectionId) {
      fetchFeaturedProducts(selectedCollectionId);
    }
  }, [selectedCollectionId, offersTab]);

  useEffect(() => {
    if (offersTab === 'collection-banners' && selectedCollectionId) {
      fetchCollectionBanner(selectedCollectionId);
    }
  }, [selectedCollectionId, offersTab]);

  const fetchFeaturedProducts = async (colId) => {
    setFeatLoading(true);
    setFeatError('');
    setFeatSuccess('');
    try {
      const query = `query { collection(id: "${colId}") { metafield(namespace: "price_editor", key: "featured_products") { value } } }`;
      const res = await axios.post('/api/shopify/graphql.json', { query });
      const mf = res.data?.data?.collection?.metafield;
      const handles = mf?.value ? JSON.parse(mf.value) : [];
      const mapped = [null, null, null, null].map((_, idx) => {
        const handle = handles[idx];
        if (!handle) return null;
        return products.find(p => p.handle === handle) || null;
      });
      setFeaturedProducts(mapped);
      setFeatDirty(false);
    } catch (err) { setFeatError(err.message); } finally { setFeatLoading(false); }
  };

  const handleSaveFeaturedProducts = async () => {
    setFeatLoading(true);
    setFeatSuccess('');
    setFeatError('');
    try {
      const handlesArray = featuredProducts.map(p => p ? p.handle : "");
      const query = `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { message } } }`;
      const variables = { metafields: [{ ownerId: selectedCollectionId, namespace: "price_editor", key: "featured_products", type: "json", value: JSON.stringify(handlesArray) }] };
      const res = await axios.post('/api/shopify/graphql.json', { query, variables });
      if (res.data?.data?.metafieldsSet?.userErrors?.length > 0) throw new Error(res.data.data.metafieldsSet.userErrors[0].message);
      setFeatSuccess("Featured products saved!");
      setFeatDirty(false);
    } catch (err) { setFeatError(err.message); } finally { setFeatLoading(false); }
  };

  const fetchCollectionBanner = async (colId) => {
    setBannerLoading(true);
    setBannerError('');
    setBannerSuccess('');
    try {
      const query = `query { collection(id: "${colId}") { metafield(namespace: "price_editor", key: "banner_image_url") { value } } }`;
      const res = await axios.post('/api/shopify/graphql.json', { query });
      const mf = res.data?.data?.collection?.metafield;
      setBannerUrl(mf?.value || '');
      setBannerDirty(false);
    } catch (err) {
      setBannerError(err.message || 'Failed to fetch banner image');
    } finally {
      setBannerLoading(false);
    }
  };

  const handleSaveCollectionBanner = async () => {
    setBannerLoading(true);
    setBannerSuccess('');
    setBannerError('');
    try {
      const query = `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { message } } }`;
      const variables = {
        metafields: [{
          ownerId: selectedCollectionId,
          namespace: "price_editor",
          key: "banner_image_url",
          type: "single_line_text_field",
          value: bannerUrl
        }]
      };
      const res = await axios.post('/api/shopify/graphql.json', { query, variables });
      if (res.data?.data?.metafieldsSet?.userErrors?.length > 0) {
        throw new Error(res.data.data.metafieldsSet.userErrors[0].message);
      }
      setBannerSuccess("Collection banner saved successfully!");
      setBannerDirty(false);
    } catch (err) {
      setBannerError(err.message || "Failed to save collection banner");
    } finally {
      setBannerLoading(false);
    }
  };

  const handleBannerFileUpload = async (file) => {
    if (!file) return;
    setBannerUploading(true);
    setBannerError('');
    setBannerSuccess('');
    try {
      // Step 1: Create staged upload target
      const stagedQuery = `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }`;
      const stagedVars = {
        input: [{
          resource: "FILE",
          filename: file.name,
          mimeType: file.type,
          httpMethod: "POST",
          fileSize: String(file.size)
        }]
      };
      const stagedRes = await axios.post('/api/shopify/graphql.json', { query: stagedQuery, variables: stagedVars });
      const stagedData = stagedRes.data?.data?.stagedUploadsCreate;
      if (stagedData?.userErrors?.length > 0) {
        throw new Error(stagedData.userErrors[0].message);
      }
      const target = stagedData.stagedTargets[0];

      // Step 2: Upload file to the staged target URL
      const formData = new FormData();
      target.parameters.forEach(param => {
        formData.append(param.name, param.value);
      });
      formData.append('file', file);

      await fetch(target.url, {
        method: 'POST',
        body: formData
      });

      // Step 3: Create the file in Shopify
      const fileCreateQuery = `mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            ... on GenericFile { url }
            ... on MediaImage { image { url } }
          }
          userErrors { field message }
        }
      }`;
      const fileCreateVars = {
        files: [{
          originalSource: target.resourceUrl,
          contentType: "IMAGE"
        }]
      };
      const fileRes = await axios.post('/api/shopify/graphql.json', { query: fileCreateQuery, variables: fileCreateVars });
      const fileData = fileRes.data?.data?.fileCreate;
      if (fileData?.userErrors?.length > 0) {
        throw new Error(fileData.userErrors[0].message);
      }

      // Step 4: Poll for file readiness — the image URL is not immediately available
      // We use the resourceUrl as a fallback while polling
      let finalUrl = target.resourceUrl;
      const createdFile = fileData?.files?.[0];
      if (createdFile?.image?.url) {
        finalUrl = createdFile.image.url;
      }

      // Poll for the final processed URL
      const pollForFile = async () => {
        const pollQuery = `query {
          files(first: 1, query: "filename:${file.name}") {
            edges {
              node {
                ... on MediaImage {
                  image { url }
                  fileStatus
                }
                ... on GenericFile {
                  url
                }
              }
            }
          }
        }`;
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 1500));
          try {
            const pollRes = await axios.post('/api/shopify/graphql.json', { query: pollQuery });
            const fileNode = pollRes.data?.data?.files?.edges?.[0]?.node;
            if (fileNode?.image?.url) return fileNode.image.url;
            if (fileNode?.url) return fileNode.url;
            if (fileNode?.fileStatus === 'READY' || fileNode?.fileStatus === 'UPLOADED') continue;
          } catch { /* retry */ }
        }
        return finalUrl;
      };

      const processedUrl = await pollForFile();
      setBannerUrl(processedUrl);
      setBannerDirty(true);
      setBannerSuccess("Image uploaded! Click 'Save Banner Image' to apply.");
    } catch (err) {
      setBannerError(err.message || "Failed to upload image");
    } finally {
      setBannerUploading(false);
    }
  };

  const handleSelectFeaturedProduct = (product) => {
    setFeaturedProducts(prev => {
      const next = [...prev];
      next[selectingSlotIdx] = product;
      return next;
    });
    setSelectingSlotIdx(null);
    setFeatDirty(true);
  };

  const handleClearFeaturedSlot = (idx) => {
    setFeaturedProducts(prev => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
    setFeatDirty(true);
  };

  const fetchCollectionCampaigns = async (colId) => {
    setCampLoading(true);
    try {
      const query = `query { collection(id: "${colId}") { metafield(namespace: "price_editor", key: "campaigns") { value } } }`;
      const res = await axios.post('/api/shopify/graphql.json', { query });
      const mf = res.data?.data?.collection?.metafield;
      setCampaigns(mf?.value ? JSON.parse(mf.value) : []);
      setCampDirty(false);
    } catch (err) { setCampError(err.message); } finally { setCampLoading(false); }
  };

  const handleSaveCampaignsToShopify = async () => {
    setCampLoading(true);
    try {
      const query = `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { message } } }`;
      const variables = { metafields: [{ ownerId: selectedCollectionId, namespace: "price_editor", key: "campaigns", type: "json", value: JSON.stringify(campaigns) }] };
      const res = await axios.post('/api/shopify/graphql.json', { query, variables });
      if (res.data?.data?.metafieldsSet?.userErrors?.length > 0) throw new Error(res.data.data.metafieldsSet.userErrors[0].message);
      setCampSuccess("Campaigns saved!");
      setCampDirty(false);
    } catch (err) { setCampError(err.message); } finally { setCampLoading(false); }
  };

  const moveCampaign = (index, direction) => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...campaigns];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, moved);
    setCampaigns(reordered);
    setCampDirty(true);
  };

  const handleDeleteCampaign = (index) => {
    if (!window.confirm("Delete banner?")) return;
    setCampaigns(prev => prev.filter((_, idx) => idx !== index));
    setCampDirty(true);
  };

  const openCampaignEdit = (index = null) => {
    if (index !== null) { setEditingCampaignIdx(index); setCampEditData({ ...campaigns[index] }); }
    else { setEditingCampaignIdx('NEW'); setCampEditData({ id: `camp-${Date.now()}`, insert_after: 4, offer_box_height: 70, bg_color_1: '#1e293b', bg_color_2: '#0f172a', text_color: '#ffffff', heading_1: 'SPECIAL OFFER', subheading_1: '', coupon_code_1: '', heading_2: '', subheading_2: '', coupon_code_2: '', heading_3: '', subheading_3: '', coupon_code_3: '', items: [] }); }
  };

  const applyCampaignChanges = () => {
    if (editingCampaignIdx === 'NEW') setCampaigns(prev => [...prev, campEditData]);
    else setCampaigns(prev => prev.map((c, idx) => idx === editingCampaignIdx ? campEditData : c));
    setEditingCampaignIdx(null);
    setCampDirty(true);
  };

  const handleAddProductToSlider = (product) => {
    const p = product.variants.edges[0]?.node;
    const newItem = { image: product.images.edges[0]?.node?.url || '', title: product.title, price: `₹${parseFloat(p?.price || 0).toFixed(0)}`, discount: '' };
    setCampEditData(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
    setShowSliderProductSelect(false);
  };

  return (
    <div className="space-y-6">
      {/* HEADER WITH TABS */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
            {mode === 'offers' ? (
              <><Tags className="w-6 h-6 text-yellow-500" /> Offers & Promos</>
            ) : (
              <><LayoutDashboard className="w-6 h-6 text-yellow-500" /> Collections Manager</>
            )}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {mode === 'offers' ? "Configure discount codes and promo timers." : "Manage collection sequences, featured slots, and custom banners."}
          </p>
        </div>

        <div className="flex bg-slate-900 p-1.5 rounded-xl border border-slate-800/80 shadow-inner">
          {mode === 'offers' ? (
            <>
              <button
                onClick={() => setOffersTab('product-offers')}
                className={`px-4.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  offersTab === 'product-offers'
                    ? 'bg-yellow-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                Product Page Offers
              </button>
              <button
                onClick={() => setOffersTab('collection-campaigns')}
                className={`px-4.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  offersTab === 'collection-campaigns'
                    ? 'bg-yellow-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                Collection Banner Campaigns
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setOffersTab('all-featured')}
                className={`px-4.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  offersTab === 'all-featured'
                    ? 'bg-yellow-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                All-Page Featured Products
              </button>
              <button
                onClick={() => setOffersTab('category-ordering')}
                className={`px-4.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  offersTab === 'category-ordering'
                    ? 'bg-yellow-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                Category Row Ordering
              </button>
              <button
                onClick={() => setOffersTab('collection-banners')}
                className={`px-4.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  offersTab === 'collection-banners'
                    ? 'bg-yellow-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                Custom Collection Banners
              </button>
            </>
          )}
        </div>
      </div>

      {/* PRODUCT OFFERS TAB */}
      {offersTab === 'product-offers' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white">Product Page Offers Config</h3>
              <p className="text-[11px] text-slate-400">Manage promotional blocks embedded in product details page.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-400">Select Page Type:</label>
              <select
                value={templatePath}
                onChange={(e) => setTemplatePath(e.target.value)}
                disabled={loading}
                className="bg-slate-800 border border-slate-700 text-xs text-white rounded-xl px-3 py-2 outline-none font-semibold focus:ring-2 focus:ring-yellow-500/50"
              >
                <option value="templates/product.json">Regular Product Page (product.json)</option>
                <option value="templates/product.combo.json">Combo Product Page (product.combo.json)</option>
              </select>
            </div>
          </div>

          {successMsg && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl flex items-center gap-3 text-emerald-400 shadow-md">
              <CheckSquare className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{successMsg}</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-2xl flex items-center gap-3 text-red-400 shadow-md">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {loading && !templateJson ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <div className="w-10 h-10 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="font-semibold text-sm">Loading theme offers configuration...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl p-6 flex flex-col gap-5 h-fit">
                <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Settings className="w-4 h-4 text-slate-400" /> Section Settings
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">Section Heading</label>
                    <input
                      type="text"
                      value={generalSettings.heading}
                      onChange={(e) => {
                        setGeneralSettings(prev => ({ ...prev, heading: e.target.value }));
                        setIsDirty(true);
                      }}
                      placeholder="e.g. Offers & Discounts"
                      className="w-full px-3.5 py-2.5 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-yellow-500/50 outline-none placeholder:text-slate-500 font-semibold"
                    />
                  </div>

                  <div className="flex items-center justify-between bg-slate-800/20 border border-slate-800/80 p-3.5 rounded-xl">
                    <div>
                      <span className="block text-xs font-bold text-white uppercase tracking-wide">Show 'View All' Link</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Displays a trigger to open full offers list.</span>
                    </div>
                    <button
                      onClick={() => {
                        setGeneralSettings(prev => ({ ...prev, showViewAll: !prev.showViewAll }));
                        setIsDirty(true);
                      }}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      {generalSettings.showViewAll ? (
                        <CheckSquare className="w-5 h-5 text-yellow-500" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <p className="text-[10px] text-slate-400 leading-relaxed italic">
                    These settings affect the entire offers panel on the selected template layout. Make sure to click "Save Changes to Shopify" to apply.
                  </p>
                </div>
              </div>

              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl p-6">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                    <div>
                      <h3 className="font-bold text-sm text-white">Active Discount Cards</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Reorder or customize items to optimize coupon cards.</p>
                    </div>
                    <button
                      onClick={() => openEditModal(null)}
                      className="px-3.5 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Promo Card
                    </button>
                  </div>

                  {offers.length === 0 ? (
                    <div className="text-center py-16 bg-slate-900/20 border border-dashed border-slate-800 rounded-2xl text-slate-500">
                      <Tags className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-xs font-medium">No offers configured in this template.</p>
                      <button onClick={() => openEditModal(null)} className="text-yellow-500 text-xs font-bold mt-2 hover:underline">Create your first offer block</button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {offers.map((offer, idx) => (
                        <div
                          key={offer.id}
                          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex items-center justify-between gap-4 transition-all"
                        >
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className="flex flex-col gap-1 shrink-0">
                              <button
                                disabled={idx === 0}
                                onClick={() => moveOffer(idx, 'up')}
                                className="p-1 text-slate-500 hover:text-yellow-500 disabled:opacity-20 transition-colors"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                              <button
                                disabled={idx === offers.length - 1}
                                onClick={() => moveOffer(idx, 'down')}
                                className="p-1 text-slate-500 hover:text-yellow-500 disabled:opacity-20 transition-colors"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 uppercase tracking-widest">
                                  {offer.settings?.offer_code || 'NO-CODE'}
                                </span>
                                {offer.settings?.offer_timer && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                    <Clock className="w-3 h-3 text-red-400" /> {offer.settings.offer_timer}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-semibold text-white truncate">
                                {offer.settings?.offer_desc || 'No description provided.'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => openEditModal(offer)}
                              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteOffer(offer.id)}
                              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-950/20 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {isDirty && (
                  <div className="bg-slate-900 border border-yellow-500/30 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-4 shadow-lg">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-white">Unsaved Changes Pending</p>
                        <p className="text-[10px] text-slate-400">You have made layout updates. Push these changes to Shopify to update live product pages.</p>
                      </div>
                    </div>
                    <button
                      onClick={handleSaveToShopify}
                      disabled={loading}
                      className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer shrink-0"
                    >
                      {loading ? <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> : <Save className="w-4 h-4" />}
                      Save Changes to Shopify
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AUTOMATED CAMPAIGNS TAB */}
      {offersTab === 'collection-campaigns' && (
        <AutomatedCampaignsDashboard products={products} collections={collections} />
      )}

      {/* ALL-PAGE FEATURED PRODUCTS TAB */}
      {offersTab === 'all-featured' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white">All-Page Featured Products</h3>
              <p className="text-[11px] text-slate-400">Select the 4 featured products to display at the top of this category section on the All Collections page.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-400">Select Category:</label>
              <select
                value={selectedCollectionId}
                onChange={(e) => setSelectedCollectionId(e.target.value)}
                disabled={featLoading}
                className="bg-slate-800 border border-slate-700 text-xs text-white rounded-xl px-3 py-2 outline-none font-semibold focus:ring-2 focus:ring-yellow-500/50"
              >
                {collections.map(col => (
                    <option key={col.id} value={col.id}>{col.title} ({col.handle})</option>
                  ))}
              </select>
            </div>
          </div>

          {featSuccess && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl flex items-center gap-3 text-emerald-400 shadow-md">
              <CheckSquare className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{featSuccess}</p>
            </div>
          )}

          {featError && (
            <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-2xl flex items-center gap-3 text-red-400 shadow-md">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{featError}</p>
            </div>
          )}

          {featLoading && featuredProducts.every(p => p === null) ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <div className="w-10 h-10 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="font-semibold text-sm">Fetching featured products...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Info Panel */}
              <div className="lg:col-span-1 bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl p-6 flex flex-col gap-5 h-fit">
                <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Info className="w-4 h-4 text-yellow-500" /> Featured Slots Info
                </h3>
                <div className="space-y-3 text-xs text-slate-350 leading-relaxed">
                  <p>
                    These 4 featured products are shown as standard items at the top of the collection section.
                  </p>
                  <p>
                    Any remaining products from this collection will automatically flow into the horizontal swiping slider below them.
                  </p>
                  <p className="text-[10px] text-slate-400 italic pt-2 border-t border-slate-800">
                    If fewer than 4 products are specified, the storefront will automatically fill the remaining slots with the first available products of this collection.
                  </p>
                </div>
              </div>

              {/* Featured Slots Grid */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl p-6">
                  <h3 className="font-bold text-sm text-white border-b border-slate-800 pb-4 mb-4">Selected Products (4 Slots)</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {featuredProducts.map((prod, idx) => (
                      <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 relative">
                        <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
                          <span className="text-[10px] font-black text-slate-400">SLOT {idx + 1}</span>
                          {prod && (
                            <button
                              onClick={() => handleClearFeaturedSlot(idx)}
                              className="text-[10px] text-red-400 hover:text-red-300 font-bold transition-colors"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        {prod ? (
                          <div className="flex items-center gap-3">
                            {prod.images?.edges?.[0]?.node?.url ? (
                              <img src={prod.images.edges[0].node.url} alt={prod.title} className="w-12 h-12 object-cover bg-slate-950 border border-slate-800 rounded-lg shrink-0" />
                            ) : (
                              <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-800 shrink-0"><ImageIcon className="w-6 h-6 text-slate-650" /></div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate">{prod.title}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{prod.vendor || 'No Vendor'}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="h-12 border border-dashed border-slate-800 rounded-lg flex items-center justify-center text-[11px] text-slate-500 italic">
                            Empty slot (Auto-fallback active)
                          </div>
                        )}

                        <button
                          onClick={() => setSelectingSlotIdx(idx)}
                          className="w-full mt-1 bg-slate-800 hover:bg-slate-750 text-white border border-slate-700 py-1.5 rounded-lg text-xs font-bold transition-all"
                        >
                          {prod ? 'Change Product' : 'Select Product'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {featDirty && (
                  <div className="bg-slate-900 border border-yellow-500/30 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-4 shadow-lg">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-white">Unsaved Featured Products</p>
                        <p className="text-[10px] text-slate-400">Save your slots selections to update the live storefront layout.</p>
                      </div>
                    </div>
                    <button
                      onClick={handleSaveFeaturedProducts}
                      disabled={featLoading}
                      className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer shrink-0"
                    >
                      {featLoading ? <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> : <Save className="w-4 h-4" />}
                      Save Featured Products
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CATEGORY ROW ORDERING TAB */}
      {offersTab === 'category-ordering' && (
        <div className="space-y-6">
          <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800">
            <h3 className="text-sm font-bold text-white">Category Row Ordering</h3>
            <p className="text-[11px] text-slate-400">Reorder categories to change their sequence on the collections all page.</p>
          </div>

          <div className="max-w-xl bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-1">
              <Layers className="w-5 h-5 text-yellow-500" />
              <h3 className="font-bold text-sm text-white">Category Sequence</h3>
            </div>

            {catOrderSuccess && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-400 text-xs font-semibold">
                {catOrderSuccess}
              </div>
            )}
            {catOrderError && (
              <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-red-400 text-xs font-semibold">
                {catOrderError}
              </div>
            )}

            <div className="space-y-2">
              {categoryOrder.map((handle, idx) => (
                <div key={handle} className="flex items-center justify-between bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-xs font-bold text-white">{getCategoryTitle(handle)}</span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={idx === 0}
                      onClick={() => {
                        const newOrder = [...categoryOrder];
                        const temp = newOrder[idx];
                        newOrder[idx] = newOrder[idx - 1];
                        newOrder[idx - 1] = temp;
                        setCategoryOrder(newOrder);
                        setCatOrderDirty(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-yellow-500 disabled:opacity-20 transition-colors cursor-pointer bg-slate-800 rounded-lg"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      disabled={idx === categoryOrder.length - 1}
                      onClick={() => {
                        const newOrder = [...categoryOrder];
                        const temp = newOrder[idx];
                        newOrder[idx] = newOrder[idx + 1];
                        newOrder[idx + 1] = temp;
                        setCategoryOrder(newOrder);
                        setCatOrderDirty(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-yellow-500 disabled:opacity-20 transition-colors cursor-pointer bg-slate-800 rounded-lg"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {catOrderDirty && (
              <button
                onClick={handleSaveCategoryOrder}
                disabled={catOrderSaving}
                className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer mt-2"
              >
                {catOrderSaving ? <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> : <Save className="w-4 h-4" />}
                Save Category Order
              </button>
            )}
          </div>
        </div>
      )}

      {/* CUSTOM COLLECTION BANNERS TAB */}
      {offersTab === 'collection-banners' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white">Custom Collection Banners</h3>
              <p className="text-[11px] text-slate-400">Upload or paste a banner image to display at the top of the collection page.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-400">Select Category:</label>
              <select
                value={selectedCollectionId}
                onChange={(e) => setSelectedCollectionId(e.target.value)}
                disabled={bannerLoading || bannerUploading}
                className="bg-slate-800 border border-slate-700 text-xs text-white rounded-xl px-3 py-2 outline-none font-semibold focus:ring-2 focus:ring-yellow-500/50"
              >
                {collections.map(col => (
                    <option key={col.id} value={col.id}>{col.title} ({col.handle})</option>
                  ))}
              </select>
            </div>
          </div>

          <div className="max-w-2xl bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl p-6 flex flex-col gap-6">
            {bannerSuccess && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-center gap-2 text-emerald-400 shadow-md">
                <CheckSquare className="w-4 h-4 shrink-0" />
                <p className="text-xs font-semibold">{bannerSuccess}</p>
              </div>
            )}
            
            {bannerError && (
              <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl flex items-center gap-2 text-red-400 shadow-md">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p className="text-xs font-semibold">{bannerError}</p>
              </div>
            )}

            {bannerLoading ? (
               <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                 <div className="w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                 <p className="font-semibold text-xs">Loading banner configuration...</p>
               </div>
            ) : (
              <>
                {/* Upload Zone */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-300 mb-1">Upload Image</label>
                  <div
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                      bannerUploading
                        ? 'border-yellow-500/50 bg-yellow-500/5'
                        : 'border-slate-700 hover:border-yellow-500/40 hover:bg-slate-900/50'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer.files[0];
                      if (file && file.type.startsWith('image/')) {
                        handleBannerFileUpload(file);
                      }
                    }}
                    onClick={() => {
                      if (!bannerUploading) {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e) => {
                          const file = e.target.files[0];
                          if (file) handleBannerFileUpload(file);
                        };
                        input.click();
                      }
                    }}
                  >
                    {bannerUploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-3 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-xs font-bold text-yellow-500">Uploading to Shopify Files...</p>
                        <p className="text-[10px] text-slate-400">This may take a few seconds while the image is processed.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="w-8 h-8 text-slate-500" />
                        <p className="text-xs font-bold text-slate-300">Click to browse or drag & drop an image</p>
                        <p className="text-[10px] text-slate-500">Supports JPG, PNG, GIF, WEBP. Uploaded directly to Shopify Files.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-slate-800"></div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">or paste URL</span>
                  <div className="flex-1 border-t border-slate-800"></div>
                </div>

                {/* URL Input */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Banner Image URL</label>
                  <input
                    type="text"
                    value={bannerUrl}
                    onChange={(e) => {
                      setBannerUrl(e.target.value);
                      setBannerDirty(true);
                    }}
                    placeholder="e.g. https://cdn.shopify.com/s/files/1/0123/4567/8910/files/banner.jpg"
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-yellow-500/50 outline-none"
                  />
                  <p className="text-[10px] text-slate-500">
                    Paste any Shopify CDN image URL here. Leave blank to use the default collection image.
                  </p>
                </div>

                {/* Banner Preview */}
                {bannerUrl && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-300">Preview</label>
                    <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-900 flex justify-center p-2 relative group min-h-[120px]">
                      <img
                        src={bannerUrl}
                        alt="Banner Preview"
                        className="max-h-48 object-contain rounded-lg"
                        onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }}
                      />
                      <div className="hidden absolute inset-0 items-center justify-center text-xs text-red-400 font-semibold bg-slate-900/90">
                        Invalid Image URL
                      </div>
                    </div>
                  </div>
                )}

                {/* Clear Banner Button */}
                {bannerUrl && (
                  <button
                    onClick={() => { setBannerUrl(''); setBannerDirty(true); }}
                    className="text-xs text-red-400 hover:text-red-300 font-bold transition-colors self-start flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Remove Banner (revert to default collection image)
                  </button>
                )}

                {bannerDirty && (
                  <button
                    onClick={handleSaveCollectionBanner}
                    disabled={bannerLoading}
                    className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                  >
                    <Save className="w-4 h-4" />
                    Save Banner Image
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* PRODUCT OFFERS EDIT BLOCK MODAL */}
      {editingBlockId && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 bg-[#151D30]/80 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Tags className="w-4 h-4 text-yellow-500" />
                {editingBlockId === 'NEW' ? 'Create New Promo Card' : 'Edit Promo Card Details'}
              </h3>
              <button
                onClick={() => setEditingBlockId(null)}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Coupon Code</label>
                <input
                  type="text"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  placeholder="e.g. FREESHIP"
                  className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:ring-1 focus:ring-yellow-500/70 outline-none uppercase font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Offer Description</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="e.g. Extra Rs.400 off on orders above 1999"
                  rows="3"
                  className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:ring-1 focus:ring-yellow-500/70 outline-none resize-none font-semibold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Countdown Timer / Additional Text (Optional)</label>
                <input
                  type="text"
                  value={editTimer}
                  onChange={(e) => setEditTimer(e.target.value)}
                  placeholder="e.g. Ends in 07h 06m 05s"
                  className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:ring-1 focus:ring-yellow-500/70 outline-none font-medium"
                />
                <span className="text-[9px] text-slate-500 mt-1 block leading-relaxed">
                  Leave blank to hide timer. Format MUST match: <code className="bg-slate-900 px-1 py-0.5 rounded text-yellow-500">Ends in XXh XXm XXs</code> to trigger automatic theme countdown logic.
                </span>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-900 border-t border-slate-800/80 flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingBlockId(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBlock}
                className="px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COLLECTION CAMPAIGN EDITOR MODAL */}
      {editingCampaignIdx !== null && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col my-8 max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-800 bg-[#151D30]/80 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-yellow-500" />
                {editingCampaignIdx === 'NEW' ? 'Create New Campaign Banner' : 'Edit Campaign Banner details'}
              </h3>
              <button
                onClick={() => setEditingCampaignIdx(null)}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Layout Config */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Insert After Product Index</label>
                  <input
                    type="number"
                    min="1"
                    value={campEditData.insert_after || 4}
                    onChange={(e) => setCampEditData(prev => ({ ...prev, insert_after: parseInt(e.target.value) || 4 }))}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:ring-1 focus:ring-yellow-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Banner Box Height (px)</label>
                  <input
                    type="number"
                    min="50"
                    max="500"
                    value={campEditData.offer_box_height || 70}
                    onChange={(e) => setCampEditData(prev => ({ ...prev, offer_box_height: parseInt(e.target.value) || 70 }))}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:ring-1 focus:ring-yellow-500 outline-none font-bold"
                  />
                </div>
              </div>

              {/* Design & Colors */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">BG Gradient Color 1</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={campEditData.bg_color_1 || '#1e293b'}
                      onChange={(e) => setCampEditData(prev => ({ ...prev, bg_color_1: e.target.value }))}
                      className="w-8 h-8 rounded border border-slate-700 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={campEditData.bg_color_1 || '#1e293b'}
                      onChange={(e) => setCampEditData(prev => ({ ...prev, bg_color_1: e.target.value }))}
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white uppercase font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">BG Gradient Color 2</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={campEditData.bg_color_2 || '#0f172a'}
                      onChange={(e) => setCampEditData(prev => ({ ...prev, bg_color_2: e.target.value }))}
                      className="w-8 h-8 rounded border border-slate-700 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={campEditData.bg_color_2 || '#0f172a'}
                      onChange={(e) => setCampEditData(prev => ({ ...prev, bg_color_2: e.target.value }))}
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white uppercase font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Text Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={campEditData.text_color || '#ffffff'}
                      onChange={(e) => setCampEditData(prev => ({ ...prev, text_color: e.target.value }))}
                      className="w-8 h-8 rounded border border-slate-700 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={campEditData.text_color || '#ffffff'}
                      onChange={(e) => setCampEditData(prev => ({ ...prev, text_color: e.target.value }))}
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white uppercase font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Banner Slides */}
              <div className="space-y-4 border-t border-slate-800 pt-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-yellow-500" /> Slides Configuration (Up to 3 Slides)
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Slide 1 */}
                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-3">
                    <span className="text-[9px] font-black text-slate-400 block border-b border-slate-800 pb-1.5">SLIDE 1</span>
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Slide 1 Heading"
                        value={campEditData.heading_1 || ''}
                        onChange={(e) => setCampEditData(prev => ({ ...prev, heading_1: e.target.value }))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Slide 1 Subheading"
                        value={campEditData.subheading_1 || ''}
                        onChange={(e) => setCampEditData(prev => ({ ...prev, subheading_1: e.target.value }))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Slide 1 Coupon Code"
                        value={campEditData.coupon_code_1 || ''}
                        onChange={(e) => setCampEditData(prev => ({ ...prev, coupon_code_1: e.target.value }))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white outline-none uppercase font-bold text-yellow-500"
                      />
                    </div>
                  </div>

                  {/* Slide 2 */}
                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-3">
                    <span className="text-[9px] font-black text-slate-400 block border-b border-slate-800 pb-1.5">SLIDE 2 (OPTIONAL)</span>
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Slide 2 Heading"
                        value={campEditData.heading_2 || ''}
                        onChange={(e) => setCampEditData(prev => ({ ...prev, heading_2: e.target.value }))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Slide 2 Subheading"
                        value={campEditData.subheading_2 || ''}
                        onChange={(e) => setCampEditData(prev => ({ ...prev, subheading_2: e.target.value }))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Slide 2 Coupon Code"
                        value={campEditData.coupon_code_2 || ''}
                        onChange={(e) => setCampEditData(prev => ({ ...prev, coupon_code_2: e.target.value }))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white outline-none uppercase font-bold text-yellow-500"
                      />
                    </div>
                  </div>

                  {/* Slide 3 */}
                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-3">
                    <span className="text-[9px] font-black text-slate-400 block border-b border-slate-800 pb-1.5">SLIDE 3 (OPTIONAL)</span>
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Slide 3 Heading"
                        value={campEditData.heading_3 || ''}
                        onChange={(e) => setCampEditData(prev => ({ ...prev, heading_3: e.target.value }))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Slide 3 Subheading"
                        value={campEditData.subheading_3 || ''}
                        onChange={(e) => setCampEditData(prev => ({ ...prev, subheading_3: e.target.value }))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Slide 3 Coupon Code"
                        value={campEditData.coupon_code_3 || ''}
                        onChange={(e) => setCampEditData(prev => ({ ...prev, coupon_code_3: e.target.value }))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white outline-none uppercase font-bold text-yellow-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Inline product slider items */}
              <div className="space-y-4 border-t border-slate-800 pt-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-yellow-500" /> Inline Product Slider Items
                  </h4>
                  <button
                    onClick={() => {
                      setSearchProductQuery('');
                      setShowSliderProductSelect(true);
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[10px] font-bold text-white transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Product
                  </button>
                </div>

                {!campEditData.items || campEditData.items.length === 0 ? (
                  <div className="text-center py-6 bg-slate-900/10 border border-dashed border-slate-850 rounded-xl text-[11px] text-slate-500 italic">
                    No products added to this banner's inline slider. Banners will display as text slides only.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {campEditData.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-slate-900 border border-slate-800/80 p-2 rounded-xl">
                        {item.image ? (
                          <img src={item.image} alt={item.title} className="w-10 h-10 object-cover bg-slate-950 border border-slate-800 rounded-lg shrink-0" />
                        ) : (
                          <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-800 shrink-0"><ImageIcon className="w-5 h-5 text-slate-600" /></div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{item.title}</p>
                          <p className="text-[10px] text-yellow-500 font-semibold mt-0.5">{item.price}</p>
                        </div>
                        <button
                          onClick={() => setCampEditData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-900 border-t border-slate-800/80 flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={() => setEditingCampaignIdx(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={applyCampaignChanges}
                className="px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SLIDER PRODUCT PICKER MODAL */}
      {showSliderProductSelect && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
            <div className="px-5 py-3.5 border-b border-slate-800 bg-[#151D30]/80 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-xs text-white">Select Product for Slider</h3>
              <button
                onClick={() => setShowSliderProductSelect(false)}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-855 bg-[#151D30]/30 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchProductQuery}
                  onChange={(e) => setSearchProductQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white outline-none focus:ring-1 focus:ring-yellow-500 font-semibold"
                />
              </div>
            </div>

            <div className="p-4 overflow-y-auto divide-y divide-slate-800/60 flex-1">
              {products
                .filter(p => {
                  const matchesSearch = p.title.toLowerCase().includes(searchProductQuery.toLowerCase());
                  if (!matchesSearch) return false;
                  if (selectedCollectionId) {
                    return p.collections?.edges?.some(edge => edge.node.id === selectedCollectionId);
                  }
                  return true;
                })
                .map(product => {
                  const img = product.images.edges[0]?.node?.url;
                  const priceVal = parseFloat(product.variants.edges[0]?.node?.price || 0);

                  return (
                    <div key={product.id} className="py-2.5 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3 min-w-0">
                        {img ? (
                          <img src={img} alt={product.title} className="w-9 h-9 object-cover rounded bg-slate-900 border border-slate-805 shrink-0" />
                        ) : (
                          <div className="w-9 h-9 bg-slate-800 rounded flex items-center justify-center border border-slate-805 shrink-0"><ImageIcon className="w-4 h-4 text-slate-650" /></div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate max-w-[200px]">{product.title}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">₹{priceVal.toFixed(0)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddProductToSlider(product)}
                        className="px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-[10px] font-extrabold rounded-lg transition-all cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* SLOT PRODUCT PICKER MODAL */}
      {selectingSlotIdx !== null && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
            <div className="px-5 py-3.5 border-b border-slate-800 bg-[#151D30]/80 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-xs text-white">Select Product for Slot {selectingSlotIdx + 1}</h3>
              <button
                onClick={() => setSelectingSlotIdx(null)}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-855 bg-[#151D30]/30 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchProductQuery}
                  onChange={(e) => setSearchProductQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white outline-none focus:ring-1 focus:ring-yellow-500 font-semibold"
                />
              </div>
            </div>

            <div className="p-4 overflow-y-auto divide-y divide-slate-800/60 flex-1">
              {products
                .filter(p => {
                  const matchesSearch = p.title.toLowerCase().includes(searchProductQuery.toLowerCase());
                  if (!matchesSearch) return false;
                  if (selectedCollectionId) {
                    return p.collections?.edges?.some(edge => edge.node.id === selectedCollectionId);
                  }
                  return true;
                })
                .map(product => {
                  const img = product.images.edges[0]?.node?.url;
                  const priceVal = parseFloat(product.variants.edges[0]?.node?.price || 0);
                  const isAlreadySelected = featuredProducts.some(fp => fp && fp.id === product.id);

                  return (
                    <div key={product.id} className="py-2.5 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3 min-w-0">
                        {img ? (
                          <img src={img} alt={product.title} className="w-9 h-9 object-cover rounded bg-slate-900 border border-slate-805 shrink-0" />
                        ) : (
                          <div className="w-9 h-9 bg-slate-800 rounded flex items-center justify-center border border-slate-805 shrink-0"><ImageIcon className="w-4 h-4 text-slate-650" /></div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate max-w-[200px]">{product.title}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">₹{priceVal.toFixed(0)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleSelectFeaturedProduct(product)}
                        disabled={isAlreadySelected}
                        className={`px-3 py-1 text-[10px] font-extrabold rounded-lg transition-all ${
                          isAlreadySelected
                            ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                            : 'bg-yellow-500 hover:bg-yellow-400 text-slate-950 cursor-pointer'
                        }`}
                      >
                        {isAlreadySelected ? 'Selected' : 'Select'}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ComboCreatorDashboard({ products }) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [comboCount, setComboCount] = useState(3);
  const [comboPrice, setComboPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeRules, setActiveRules] = useState([]);
  const [fetchingRules, setFetchingRules] = useState(false);

  useEffect(() => {
    fetchActiveComboRules();
  }, []);

  const fetchActiveComboRules = async () => {
    setFetchingRules(true);
    try {
      const res = await axios.get('/api/shopify/price_rules.json');
      const rules = res.data.price_rules || [];
      const filtered = rules.filter(r => r.title.startsWith('COMBO_PR_'));
      setActiveRules(filtered);
    } catch (err) {
      console.error("Error fetching price rules:", err);
    } finally {
      setFetchingRules(false);
    }
  };

  const handleCreateCombo = async (e) => {
    e.preventDefault();
    if (!selectedProductId || !comboPrice) {
      alert("Please select a product and enter the combo price.");
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const product = products.find(p => p.id === selectedProductId);
      if (!product) throw new Error("Product not found");

      const rawProductId = selectedProductId.split('/').pop();
      const minPrice = parseFloat(product.variants.edges[0]?.node.price || 0);
      
      const originalTotal = minPrice * comboCount;
      const discountVal = originalTotal - parseFloat(comboPrice);

      if (discountVal <= 0) {
        throw new Error(`Combo price (₹${comboPrice}) must be less than the regular total for ${comboCount} items (₹${originalTotal})`);
      }

      // 1. Create Price Rule
      const priceRuleRes = await axios.post('/api/shopify/price_rules.json', {
        price_rule: {
          title: `COMBO_PR_${rawProductId}_${comboCount}`,
          target_type: 'line_item',
          target_selection: 'entitled',
          allocation_method: 'across',
          value_type: 'fixed_amount',
          value: `-${discountVal.toFixed(2)}`,
          customer_selection: 'all',
          starts_at: new Date().toISOString(),
          entitled_product_ids: [parseInt(rawProductId)],
          prerequisite_quantity_range: {
            greater_than_or_equal_to: comboCount
          }
        }
      });
      const priceRuleId = priceRuleRes.data.price_rule.id;

      // 2. Create Discount Code
      const codeName = `11FIT-COMBO-${rawProductId}-${comboCount}`;
      if (priceRuleId) {
        await axios.post(`/api/shopify/price_rules/${priceRuleId}/discount_codes.json`, {
          discount_code: {
            code: codeName
          }
        });
      }

      // 3. Create Product Metafield for Combo Config
      await axios.post(`/api/shopify/products/${rawProductId}/metafields.json`, {
        metafield: {
          namespace: "price_editor",
          key: "combo_config",
          value: JSON.stringify({ count: parseInt(comboCount), price: parseFloat(comboPrice) }),
          type: "json"
        }
      });

      // Optimistic update of local rules list
      const newRule = priceRuleRes.data.price_rule;
      setActiveRules(prev => [newRule, ...prev.filter(r => r.id !== newRule.id)]);

      setSuccess(`Successfully created combo config for "${product.title}"! Code: ${codeName}`);
      setSelectedProductId('');
      setComboPrice('');
      setTimeout(fetchActiveComboRules, 1500);
    } catch (err) {
      setError(err.response?.data?.errors?.asset || err.message || "Failed to create combo discount");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRule = async (rule) => {
    if (!window.confirm("Delete this combo rule? This will also remove the discount code.")) return;
    setLoading(true);
    // Optimistic delete from local state
    setActiveRules(prev => prev.filter(r => r.id !== rule.id));
    try {
      await axios.delete(`/api/shopify/price_rules/${rule.id}.json`);

      // Parse product ID from rule title to update/remove metafield and template
      const parts = rule.title.split('_');
      const rawProductId = parts[2];
      if (rawProductId) {
        await axios.post(`/api/shopify/products/${rawProductId}/metafields.json`, {
          metafield: {
            namespace: "price_editor",
            key: "combo_config",
            value: JSON.stringify({ count: 0, price: 0 }),
            type: "json"
          }
        });
      }

      setSuccess("Successfully deleted combo discount.");
      setTimeout(fetchActiveComboRules, 3000);
    } catch (err) {
      setError("Failed to delete price rule.");
      console.error(err);
      fetchActiveComboRules();
    } finally {
      setLoading(false);
    }
  };

  const handleEditRule = (rule) => {
    const parts = rule.title.split('_');
    const rawProductId = parts[2];
    const count = parseInt(parts[3] || 3, 10);
    const product = products.find(p => p.id.includes(rawProductId));
    
    if (product) {
      setSelectedProductId(product.id);
      setComboCount(count);
      
      const minPrice = parseFloat(product.variants.edges[0]?.node.price || 0);
      const originalTotal = minPrice * count;
      const discountVal = Math.abs(parseFloat(rule.value));
      const calculatedComboPrice = originalTotal - discountVal;
      setComboPrice(calculatedComboPrice.toFixed(0));
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      alert("Product for this combo not found in the current list.");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
          <Layers className="w-6 h-6 text-yellow-500" /> Combo Creator
        </h2>
        <p className="text-xs text-slate-400 mt-1">Create dynamic bundle discounts for specific products. These will auto-apply and sync on the storefront.</p>
      </div>

      {success && (
        <div className="p-4 bg-green-950/40 border border-green-800/60 rounded-2xl text-green-400 text-sm font-medium">
          {success}
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-2xl text-red-400 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Create Combo Form */}
        <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 shadow-lg">
          <h3 className="text-base font-bold text-white mb-4">Create New Combo Discount</h3>
          <form onSubmit={handleCreateCombo} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Select Product</label>
              <select
                value={selectedProductId}
                onChange={e => setSelectedProductId(e.target.value)}
                className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
              >
                <option value="">Choose a product...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Combo Count (Quantity)</label>
                <select
                  value={comboCount}
                  onChange={e => setComboCount(parseInt(e.target.value))}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                >
                  <option value={2}>2 Products</option>
                  <option value={3}>3 Products</option>
                  <option value={4}>4 Products</option>
                  <option value={5}>5 Products</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Combo Price (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 897"
                  value={comboPrice}
                  onChange={e => setComboPrice(e.target.value)}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-700 text-slate-950 font-bold px-4 py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
            >
              {loading ? "Creating..." : "Generate Combo Coupon"}
            </button>
          </form>
        </div>

        {/* Active Combo Rules List */}
        <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-white">Active Combo Coupons</h3>
            <button
              type="button"
              onClick={fetchActiveComboRules}
              disabled={fetchingRules}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh Coupons"
            >
              <RefreshCw className={`w-4 h-4 ${fetchingRules ? 'animate-spin text-yellow-500' : ''}`} />
            </button>
          </div>
          {fetchingRules ? (
            <p className="text-xs text-slate-400">Loading coupons...</p>
          ) : activeRules.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No active combo coupons found.</p>
          ) : (
            <div className="space-y-3">
              {activeRules.map(rule => {
                const parts = rule.title.split('_');
                const rawProductId = parts[2];
                const count = parts[3];
                const product = products.find(p => p.id.includes(rawProductId));

                return (
                  <div key={rule.id} className="bg-[#0F172A] border border-slate-800/80 rounded-xl p-4 flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold text-white">{product ? product.title : `Product ID: ${rawProductId}`}</p>
                      <div className="flex gap-2 items-center mt-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">Pack of {count}</span>
                        <span className="text-xs text-yellow-500 font-bold">Discount: ₹{Math.abs(parseFloat(rule.value)).toFixed(0)}</span>
                      </div>
                      <p className="text-[10px] font-mono text-slate-400 mt-1 select-all">Code: 11FIT-COMBO-{rawProductId}-{count}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditRule(rule)}
                        className="p-2 hover:bg-yellow-500/10 text-slate-400 hover:text-yellow-400 rounded-lg transition-colors cursor-pointer"
                        title="Edit Combo Rule"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule)}
                        className="p-2 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                        title="Delete Combo Rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


