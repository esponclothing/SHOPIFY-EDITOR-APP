import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Save, AlertCircle, CheckSquare, Plus, Trash2, Edit2, 
  Image as ImageIcon, LayoutGrid, ShoppingBag, Sparkles, 
  ArrowUp, ArrowDown, RefreshCw, X, Search
} from 'lucide-react';

export default function HomepageManagerDashboard({ products, collections, mainThemeId }) {
  const [activeSubTab, setActiveSubTab] = useState('deals'); // deals, categories, trending
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [indexJson, setIndexJson] = useState(null);
  const [dealSectionKey, setDealSectionKey] = useState('');
  const [dealBlocks, setDealBlocks] = useState([]);
  
  const [categorySectionKey, setCategorySectionKey] = useState('');
  const [categoryBlocks, setCategoryBlocks] = useState([]);

  const [trendingSectionKey, setTrendingSectionKey] = useState('');
  const [trendingBlocks, setTrendingBlocks] = useState([]);

  // Modals / Selection states
  const [showProductSelect, setShowProductSelect] = useState(false);
  const [searchProductQuery, setSearchProductQuery] = useState('');
  const [editingCategoryIdx, setEditingCategoryIdx] = useState(null);
  const [productSelectTarget, setProductSelectTarget] = useState('deals'); // 'deals' or 'trending'
  
  // Category Edit Temp State
  const [catEditData, setCatEditData] = useState({ title: '', image: '', link: '' });

  useEffect(() => {
    if (mainThemeId) {
      fetchHomepageData();
    }
  }, [mainThemeId]);

  const fetchHomepageData = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await axios.get(`/api/shopify/themes/${mainThemeId}/assets.json?asset[key]=templates/index.json`);
      const parsed = JSON.parse(res.data.asset.value);
      setIndexJson(parsed);

      // Locate 11fit-3d-deal section
      let dealKey = '';
      let categoryKey = '';
      let trendingKey = '';
      if (parsed.sections) {
        for (const key of Object.keys(parsed.sections)) {
          if (parsed.sections[key]?.type === '11fit-3d-deal') {
            dealKey = key;
          }
          if (parsed.sections[key]?.type === '11fit-category-bubbles') {
            categoryKey = key;
          }
          if (parsed.sections[key]?.type === '11fit-flash-sale') {
            trendingKey = key;
          }
        }
      }
      
      setDealSectionKey(dealKey);
      setCategorySectionKey(categoryKey);
      setTrendingSectionKey(trendingKey);

      if (dealKey) {
        const sec = parsed.sections[dealKey];
        const blocks = sec.block_order.map(id => ({ id, ...sec.blocks[id] })).filter(b => b.type === 'deal');
        setDealBlocks(blocks);
      } else {
        setDealBlocks([]);
      }

      if (categoryKey) {
        const sec = parsed.sections[categoryKey];
        const blocks = sec.block_order.map(id => ({ id, ...sec.blocks[id] })).filter(b => b.type === 'category');
        setCategoryBlocks(blocks);
      } else {
        setCategoryBlocks([]);
      }

      if (trendingKey) {
        const sec = parsed.sections[trendingKey];
        const blocks = sec.block_order.map(id => ({ id, ...sec.blocks[id] })).filter(b => b.type === 'product_item');
        setTrendingBlocks(blocks);
      } else {
        setTrendingBlocks([]);
      }

    } catch (err) {
      setError(err.message || 'Failed to fetch homepage layout config');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveHomepage = async (updatedDeals, updatedCategories, updatedTrending) => {
    if (!indexJson) return;
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const copyJson = JSON.parse(JSON.stringify(indexJson));

      if (dealSectionKey && updatedDeals) {
        const sec = copyJson.sections[dealSectionKey];
        // clean old deal blocks
        const oldIds = sec.block_order;
        oldIds.forEach(id => delete sec.blocks[id]);
        
        // build new ones
        const newBlocks = {};
        const newOrder = [];
        updatedDeals.forEach((block, idx) => {
          const id = block.id || `deal_${Date.now()}_${idx}`;
          newBlocks[id] = {
            type: 'deal',
            settings: {
              product: block.settings.product || ''
            }
          };
          newOrder.push(id);
        });
        sec.blocks = newBlocks;
        sec.block_order = newOrder;
      }

      if (categorySectionKey && updatedCategories) {
        const sec = copyJson.sections[categorySectionKey];
        // clean old category blocks
        const oldIds = sec.block_order;
        oldIds.forEach(id => delete sec.blocks[id]);

        // build new ones
        const newBlocks = {};
        const newOrder = [];
        updatedCategories.forEach((block, idx) => {
          const id = block.id || `category_${Date.now()}_${idx}`;
          newBlocks[id] = {
            type: 'category',
            settings: {
              title: block.settings.title || '',
              image: block.settings.image || '',
              link: block.settings.link || ''
            }
          };
          newOrder.push(id);
        });
        sec.blocks = newBlocks;
        sec.block_order = newOrder;
      }

      if (trendingSectionKey && updatedTrending) {
        const sec = copyJson.sections[trendingSectionKey];
        // clean old trending blocks
        const oldIds = sec.block_order;
        oldIds.forEach(id => delete sec.blocks[id]);

        // build new ones
        const newBlocks = {};
        const newOrder = [];
        updatedTrending.forEach((block, idx) => {
          const id = block.id || `product_item_${Date.now()}_${idx}`;
          newBlocks[id] = {
            type: 'product_item',
            settings: {
              product: block.settings.product || ''
            }
          };
          newOrder.push(id);
        });
        sec.blocks = newBlocks;
        sec.block_order = newOrder;
      }

      const payload = {
        asset: {
          key: 'templates/index.json',
          value: JSON.stringify(copyJson, null, 2)
        }
      };

      await axios.put(`/api/shopify/themes/${mainThemeId}/assets.json`, payload);
      setIndexJson(copyJson);
      setSuccess('Homepage settings successfully saved to Shopify!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // --- DEALS ACTIONS ---
  const handleAddDealProduct = (product) => {
    const newDeal = {
      id: `deal_${Date.now()}`,
      type: 'deal',
      settings: {
        product: product.handle
      }
    };
    const updated = [...dealBlocks, newDeal];
    setDealBlocks(updated);
    setShowProductSelect(false);
    handleSaveHomepage(updated, null);
  };

  const handleRemoveDeal = (idx) => {
    const updated = dealBlocks.filter((_, i) => i !== idx);
    setDealBlocks(updated);
    handleSaveHomepage(updated, null);
  };

  const moveDeal = (idx, dir) => {
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= dealBlocks.length) return;
    const copy = [...dealBlocks];
    const temp = copy[idx];
    copy[idx] = copy[targetIdx];
    copy[targetIdx] = temp;
    setDealBlocks(copy);
    handleSaveHomepage(copy, null);
  };

  // --- TRENDING ACTIONS ---
  const handleAddTrendingProduct = (product) => {
    const newTrend = {
      id: `product_item_${Date.now()}`,
      type: 'product_item',
      settings: {
        product: product.handle
      }
    };
    const updated = [...trendingBlocks, newTrend];
    setTrendingBlocks(updated);
    setShowProductSelect(false);
    handleSaveHomepage(null, null, updated);
  };

  const handleRemoveTrending = (idx) => {
    const updated = trendingBlocks.filter((_, i) => i !== idx);
    setTrendingBlocks(updated);
    handleSaveHomepage(null, null, updated);
  };

  const moveTrending = (idx, dir) => {
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= trendingBlocks.length) return;
    const copy = [...trendingBlocks];
    const temp = copy[idx];
    copy[idx] = copy[targetIdx];
    copy[targetIdx] = temp;
    setTrendingBlocks(copy);
    handleSaveHomepage(null, null, copy);
  };

  // --- CATEGORIES ACTIONS ---
  const handleEditCategory = (idx) => {
    setEditingCategoryIdx(idx);
    const cat = categoryBlocks[idx];
    setCatEditData({
      title: cat.settings.title || '',
      image: cat.settings.image || '',
      link: cat.settings.link || ''
    });
  };

  const handleSaveCategoryEdit = () => {
    const updated = categoryBlocks.map((c, i) => {
      if (i === editingCategoryIdx) {
        return {
          ...c,
          settings: {
            title: catEditData.title,
            image: catEditData.image,
            link: catEditData.link
          }
        };
      }
      return c;
    });
    setCategoryBlocks(updated);
    setEditingCategoryIdx(null);
    handleSaveHomepage(null, updated);
  };

  const moveCategory = (idx, dir) => {
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= categoryBlocks.length) return;
    const copy = [...categoryBlocks];
    const temp = copy[idx];
    copy[idx] = copy[targetIdx];
    copy[targetIdx] = temp;
    setCategoryBlocks(copy);
    handleSaveHomepage(null, copy);
  };

  const handleRemoveCategory = (idx) => {
    if (!window.confirm("Remove this category bubble?")) return;
    const updated = categoryBlocks.filter((_, i) => i !== idx);
    setCategoryBlocks(updated);
    handleSaveHomepage(null, updated);
  };

  const handleAddCategory = () => {
    const newCat = {
      id: `category_${Date.now()}`,
      type: 'category',
      settings: {
        title: 'New Category',
        image: '',
        link: 'shopify://collections/all'
      }
    };
    const updated = [...categoryBlocks, newCat];
    setCategoryBlocks(updated);
    setEditingCategoryIdx(updated.length - 1);
    setCatEditData({ title: 'New Category', image: '', link: 'shopify://collections/all' });
  };

  const filteredProducts = products.filter(p =>
    p.title.toLowerCase().includes(searchProductQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* HEADER WITH SUB-TABS */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-yellow-500" /> Homepage Manager
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure Deal of the Day products and Category Bubbles shown on your storefront homepage.
          </p>
        </div>

        <div className="flex bg-slate-900 p-1.5 rounded-xl border border-slate-800/80 shadow-inner">
          <button
            onClick={() => setActiveSubTab('deals')}
            className={`px-4.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'deals'
                ? 'bg-yellow-500 text-slate-950 shadow-md font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" /> Deal of the Day
          </button>
          <button
            onClick={() => setActiveSubTab('categories')}
            className={`px-4.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'categories'
                ? 'bg-yellow-500 text-slate-950 shadow-md font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Category Bubbles
          </button>
          <button
            onClick={() => setActiveSubTab('trending')}
            className={`px-4.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'trending'
                ? 'bg-yellow-500 text-slate-950 shadow-md font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Trending Products
          </button>
        </div>
      </div>

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl flex items-center gap-3 text-emerald-400 shadow-md">
          <CheckSquare className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">{success}</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-2xl flex items-center gap-3 text-red-400 shadow-md">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-10 h-10 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="font-semibold text-sm">Loading homepage settings...</p>
        </div>
      ) : (
        <>
          {/* DEALS SUB-TAB */}
          {activeSubTab === 'deals' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl p-6 h-fit">
                <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
                  <ShoppingBag className="w-4 h-4 text-yellow-500" /> Luxe 3D Deal
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  The "Deal of the Day" section displays up to 8 exclusive featured products.
                </p>
                <button
                  onClick={() => {
                    setProductSelectTarget('deals');
                    setShowProductSelect(true);
                  }}
                  className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add Deal Product
                </button>
              </div>

              <div className="lg:col-span-2 bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl p-6">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                  <h3 className="font-bold text-sm text-white">Active Deal Products ({dealBlocks.length})</h3>
                  {saving && <span className="text-xs text-yellow-500 font-bold">Saving...</span>}
                </div>

                {dealBlocks.length === 0 ? (
                  <div className="text-center py-16 bg-slate-900/20 border border-dashed border-slate-800 rounded-2xl text-slate-500">
                    <ShoppingBag className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs font-medium">No products selected for Deal of the Day.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dealBlocks.map((block, idx) => {
                      const prod = products.find(p => p.handle === block.settings.product);
                      const imgUrl = prod?.images?.edges?.[0]?.node?.url;
                      return (
                        <div key={block.id || idx} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex items-center justify-between gap-4 transition-all">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className="flex flex-col gap-1 shrink-0">
                              <button disabled={idx === 0} onClick={() => moveDeal(idx, 'up')} className="p-1 text-slate-500 hover:text-yellow-500 disabled:opacity-20 transition-colors">
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button disabled={idx === dealBlocks.length - 1} onClick={() => moveDeal(idx, 'down')} className="p-1 text-slate-500 hover:text-yellow-500 disabled:opacity-20 transition-colors">
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {imgUrl ? (
                              <img src={imgUrl} alt={prod?.title} className="w-10 h-12 object-cover rounded-lg bg-slate-950 border border-slate-750" />
                            ) : (
                              <div className="w-10 h-12 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-750 shrink-0">
                                <ImageIcon className="w-4 h-4 text-slate-500" />
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-bold text-white truncate">{prod ? prod.title : block.settings.product}</h4>
                              <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{prod ? prod.vendor : 'Shopify Product'}</p>
                            </div>
                          </div>

                          <button onClick={() => handleRemoveDeal(idx)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-950/20 rounded-lg transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TRENDING SUB-TAB */}
          {activeSubTab === 'trending' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl p-6 h-fit">
                <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
                  <Sparkles className="w-4 h-4 text-yellow-500" /> Trending Products
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Configure the products shown in the homepage "Trending Products" auto-swiper. 
                  If no products are selected, the storefront will automatically show the top products.
                </p>
                <button
                  onClick={() => {
                    setProductSelectTarget('trending');
                    setShowProductSelect(true);
                  }}
                  className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add Trending Product
                </button>
              </div>

              <div className="lg:col-span-2 bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl p-6">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                  <h3 className="font-bold text-sm text-white">Active Trending Products ({trendingBlocks.length})</h3>
                  {saving && <span className="text-xs text-yellow-500 font-bold">Saving...</span>}
                </div>

                {trendingBlocks.length === 0 ? (
                  <div className="text-center py-16 bg-slate-900/20 border border-dashed border-slate-800 rounded-2xl text-slate-500">
                    <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs font-medium">No custom trending products selected. The theme will auto-fallback to show top products.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {trendingBlocks.map((block, idx) => {
                      const prod = products.find(p => p.handle === block.settings.product);
                      const imgUrl = prod?.images?.edges?.[0]?.node?.url;
                      return (
                        <div key={block.id || idx} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex items-center justify-between gap-4 transition-all">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className="flex flex-col gap-1 shrink-0">
                              <button disabled={idx === 0} onClick={() => moveTrending(idx, 'up')} className="p-1 text-slate-500 hover:text-yellow-500 disabled:opacity-20 transition-colors">
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button disabled={idx === trendingBlocks.length - 1} onClick={() => moveTrending(idx, 'down')} className="p-1 text-slate-500 hover:text-yellow-500 disabled:opacity-20 transition-colors">
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {imgUrl ? (
                              <img src={imgUrl} alt={prod?.title} className="w-10 h-12 object-cover rounded-lg bg-slate-950 border border-slate-750" />
                            ) : (
                              <div className="w-10 h-12 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-750 shrink-0">
                                <ImageIcon className="w-4 h-4 text-slate-500" />
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-bold text-white truncate">{prod ? prod.title : block.settings.product}</h4>
                              <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{prod ? prod.vendor : 'Shopify Product'}</p>
                            </div>
                          </div>

                          <button onClick={() => handleRemoveTrending(idx)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-950/20 rounded-lg transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CATEGORIES SUB-TAB */}
          {activeSubTab === 'categories' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl p-6 h-fit">
                <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
                  <Sparkles className="w-4 h-4 text-yellow-500" /> Category Bubbles
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Homepage Category Bubbles display rounded image links to collections at the top of your homepage.
                </p>
                <button
                  onClick={handleAddCategory}
                  className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add Bubble Item
                </button>
              </div>

              <div className="lg:col-span-2 bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl p-6">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                  <h3 className="font-bold text-sm text-white">Active Category Bubbles ({categoryBlocks.length})</h3>
                  {saving && <span className="text-xs text-yellow-500 font-bold">Saving...</span>}
                </div>

                {categoryBlocks.length === 0 ? (
                  <div className="text-center py-16 bg-slate-900/20 border border-dashed border-slate-800 rounded-2xl text-slate-500">
                    <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs font-medium">No category bubbles configured.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {categoryBlocks.map((block, idx) => {
                      const isEditing = editingCategoryIdx === idx;
                      return (
                        <div key={block.id || idx} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all">
                          {isEditing ? (
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Title</label>
                                  <input
                                    type="text"
                                    value={catEditData.title}
                                    onChange={e => setCatEditData({ ...catEditData, title: e.target.value })}
                                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Link URL</label>
                                  <input
                                    type="text"
                                    value={catEditData.link}
                                    onChange={e => setCatEditData({ ...catEditData, link: e.target.value })}
                                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none font-mono"
                                  />
                                </div>
                                <div className="md:col-span-2">
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Image URL</label>
                                  <input
                                    type="text"
                                    value={catEditData.image}
                                    onChange={e => setCatEditData({ ...catEditData, image: e.target.value })}
                                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none font-mono"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingCategoryIdx(null)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold">Cancel</button>
                                <button onClick={handleSaveCategoryEdit} className="px-4 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1"><Save className="w-3.5 h-3.5" /> Save Item</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className="flex flex-col gap-1 shrink-0">
                                  <button disabled={idx === 0} onClick={() => moveCategory(idx, 'up')} className="p-1 text-slate-500 hover:text-yellow-500 disabled:opacity-20 transition-colors">
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button disabled={idx === categoryBlocks.length - 1} onClick={() => moveCategory(idx, 'down')} className="p-1 text-slate-500 hover:text-yellow-500 disabled:opacity-20 transition-colors">
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {block.settings.image ? (
                                  <img src={block.settings.image} alt={block.settings.title} className="w-10 h-10 object-cover rounded-full bg-slate-950 border border-slate-750 shrink-0" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-750 shrink-0">
                                    <ImageIcon className="w-4 h-4 text-slate-500" />
                                  </div>
                                )}

                                <div className="flex-1 min-w-0">
                                  <h4 className="text-xs font-bold text-white truncate">{block.settings.title}</h4>
                                  <p className="text-[9px] font-mono text-slate-500 mt-0.5 truncate">{block.settings.link}</p>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <button onClick={() => handleEditCategory(idx)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all">
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleRemoveCategory(idx)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-950/20 rounded-lg transition-all">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* SELECT PRODUCT MODAL */}
      {showProductSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[75vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#151D30]">
              <h3 className="font-bold text-sm text-white">
                {productSelectTarget === 'deals' ? 'Select Product for Deal' : 'Select Product for Trending'}
              </h3>
              <button onClick={() => setShowProductSelect(false)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 bg-slate-900/60 border-b border-slate-850 flex gap-2">
              <Search className="w-4 h-4 text-slate-500 my-auto" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchProductQuery}
                onChange={e => setSearchProductQuery(e.target.value)}
                className="flex-1 bg-transparent text-xs text-white outline-none border-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredProducts.map(p => {
                const img = p.images?.edges?.[0]?.node?.url;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (productSelectTarget === 'deals') {
                        handleAddDealProduct(p);
                      } else {
                        handleAddTrendingProduct(p);
                      }
                    }}
                    className="flex items-center gap-3 p-2 bg-slate-900 border border-slate-800/80 rounded-xl hover:border-slate-700/80 cursor-pointer select-none"
                  >
                    {img ? (
                      <img src={img} alt={p.title} className="w-8 h-10 object-cover rounded bg-slate-950 border border-slate-800" />
                    ) : (
                      <div className="w-8 h-10 rounded bg-slate-800 flex items-center justify-center border border-slate-800">
                        <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-white truncate">{p.title}</h4>
                      <p className="text-[10px] text-slate-500">{p.vendor}</p>
                    </div>
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
