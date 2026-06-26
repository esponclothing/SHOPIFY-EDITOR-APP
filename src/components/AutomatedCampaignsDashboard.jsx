import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Megaphone, CheckSquare, AlertCircle, Trash2, Tag, Search, Plus, Image as ImageIcon, Edit2, Sparkles, Rocket, Settings, Palette, Calendar, History, BarChart3, Users, IndianRupee, Upload } from 'lucide-react';
import { compressImage } from '../utils/imageCompressor';

export default function AutomatedCampaignsDashboard({ products, collections }) {
  const [campaignName, setCampaignName] = useState('');
  const [discountType, setDiscountType] = useState('PERCENTAGE'); // PERCENTAGE, FIXED_AMOUNT, FLAT_RATE
  const [discountValue, setDiscountValue] = useState('');
  const [minQuantity, setMinQuantity] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  
  // Grid Banner Config
  const [showGridBanner, setShowGridBanner] = useState(false);
  const [gridInsertAfter, setGridInsertAfter] = useState('4');
  const [gridCollections, setGridCollections] = useState([]);
  const [gridBg1, setGridBg1] = useState('#1e293b');
  const [gridBg2, setGridBg2] = useState('#0f172a');
  const [bannerImage, setBannerImage] = useState('');
  const [mobileBannerImage, setMobileBannerImage] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [mobileImageUploading, setMobileImageUploading] = useState(false);
  
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const [activeTab, setActiveTab] = useState('campaigns');
  const [uiBgColor, setUiBgColor] = useState('#ffdf00');
  const [uiTextColor, setUiTextColor] = useState('#1a202c');
  const [uiAccentColor, setUiAccentColor] = useState('#d9480f');

  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [activeCampaigns, setActiveCampaigns] = useState([]);
  const [expiredCampaigns, setExpiredCampaigns] = useState([]);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [fetchingCampaigns, setFetchingCampaigns] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState(null);

  const handleImageUpload = async (file, isMobile = false) => {
    if (!file) return;
    if (isMobile) {
      setMobileImageUploading(true);
    } else {
      setImageUploading(true);
    }
    setError('');
    setSuccess('');
    try {
      // Compress the image before uploading to Shopify
      const maxDim = isMobile ? 750 : 1200;
      const compressed = await compressImage(file, maxDim, maxDim, 0.85);
      const fileToUpload = compressed.file;

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
          filename: fileToUpload.name,
          mimeType: fileToUpload.type,
          httpMethod: "POST",
          fileSize: String(fileToUpload.size)
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
      formData.append('file', fileToUpload);

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

      // Step 4: Poll for file readiness
      let finalUrl = target.resourceUrl;
      const createdFile = fileData?.files?.[0];
      if (createdFile?.image?.url) {
        finalUrl = createdFile.image.url;
      }

      const pollForFile = async () => {
        const pollQuery = `query {
          files(first: 1, query: "filename:${fileToUpload.name}") {
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
      if (isMobile) {
        setMobileBannerImage(processedUrl);
      } else {
        setBannerImage(processedUrl);
      }
      setSuccess("Image uploaded successfully!");
    } catch (err) {
      setError(err.message || "Failed to upload image");
    } finally {
      setImageUploading(false);
      setMobileImageUploading(false);
    }
  };

  useEffect(() => {
    fetchActiveCampaigns();
    fetchThemeSettings();
  }, []);


  const handleViewAnalytics = async (camp) => {
    setLoadingAnalytics(camp.id);
    setAnalyticsData(null);
    try {
      let allOrders = [];
      let hasNextPage = true;
      let cursor = null;
      let queryStr = `query($cursor: String) { orders(first: 100, after: $cursor, query: "created_at:>=${camp.discount.startsAt}") { pageInfo { hasNextPage endCursor } edges { node { id name createdAt totalPriceSet { presentmentMoney { amount } } customer { firstName lastName email } discountApplications(first: 10) { edges { node { ... on AutomaticDiscountApplication { title } } } } } } } }`;
      
      while (hasNextPage) {
        const res = await axios.post('/api/shopify/graphql.json', { query: queryStr, variables: { cursor } });
        const data = res.data?.data?.orders;
        if (!data) break;
        allOrders = [...allOrders, ...data.edges.map(e => e.node)];
        hasNextPage = data.pageInfo.hasNextPage;
        cursor = data.pageInfo.endCursor;
        if (allOrders.length >= 500) break;
      }

      const campOrders = allOrders.filter(o => {
        const hasMatch = o.discountApplications?.edges.some(e => e.node?.title === camp.title);
        if (camp.discount.endsAt) {
           return hasMatch && new Date(o.createdAt) <= new Date(camp.discount.endsAt);
        }
        return hasMatch;
      });

      const totalValue = campOrders.reduce((sum, o) => sum + parseFloat(o.totalPriceSet?.presentmentMoney?.amount || 0), 0);
      const customers = campOrders.map(o => o.customer).filter(c => c);
      
      const uniqueCustomers = [];
      const seen = new Set();
      for (const c of customers) {
         const key = c.email || (c.firstName + ' ' + c.lastName);
         if (!seen.has(key)) { seen.add(key); uniqueCustomers.push(c); }
      }

      setAnalyticsData({
        campaign: camp,
        totalOrders: campOrders.length,
        totalValue: totalValue.toFixed(2),
        customers: uniqueCustomers
      });
    } catch(err) {
      console.error(err);
      setError("Failed to fetch analytics");
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const fetchThemeSettings = async () => {
    try {
      const query = `query { shop { id metafield(namespace: "custom", key: "campaign_ui") { value } } }`;
      const res = await axios.post('/api/shopify/graphql.json', { query });
      if (res.data?.data?.shop) {
         window.shopifyShopId = res.data.data.shop.id;
         if (res.data.data.shop.metafield?.value) {
            const ui = JSON.parse(res.data.data.shop.metafield.value);
            if (ui.bg_color) setUiBgColor(ui.bg_color);
            if (ui.text_color) setUiTextColor(ui.text_color);
            if (ui.accent_color) setUiAccentColor(ui.accent_color);
         }
      }
    } catch(err) { console.error(err); }
  };

  const handleSaveThemeSettings = async () => {
    setLoading(true);
    try {
      const val = JSON.stringify({ bg_color: uiBgColor, text_color: uiTextColor, accent_color: uiAccentColor });
      const query = `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { message } } }`;
      await axios.post('/api/shopify/graphql.json', { query, variables: { metafields: [{ ownerId: window.shopifyShopId, namespace: "custom", key: "campaign_ui", type: "json", value: val }] } });
      setSuccess('Theme Settings saved!');
      setTimeout(() => setSuccess(''), 3000);
    } catch(e) {
      setError('Failed to save theme settings');
    } finally { setLoading(false); }
  };

  const fetchActiveCampaigns = async () => {
    setFetchingCampaigns(true);
    try {
      const query = `
        query {
          discountNodes(first: 100, query: "status:ACTIVE OR status:SCHEDULED OR status:EXPIRED") {
            edges {
              node {
                id
                discount {
                  ... on DiscountAutomaticBasic {
                    title
                    status
                    summary
                    startsAt
                    endsAt
                  }
                }
              }
            }
          }
        }
      `;
      const res = await axios.post('/api/shopify/graphql.json', { query });
      const nodes = res.data?.data?.discountNodes?.edges || [];
      const campaigns = nodes
        .map(n => {
          let summary = n.node.discount.summary;
          try {
            if (n.node.discount.customerGets?.items?.productsToAdd?.edges?.length > 0) {
              const count = n.node.discount.customerGets.items.productsToAdd.edges.length;
              summary += ` (${count} items selected)`;
            }
          } catch(e){}
          
          return {
            id: n.node.id,
            title: n.node.discount?.title,
            status: n.node.discount?.status,
            summary: summary,
            discount: n.node.discount
          };
        })
        .filter(c => c.title && c.title.startsWith('CAMP_'));
        
      setActiveCampaigns(campaigns.filter(c => c.status === 'ACTIVE' || c.status === 'SCHEDULED'));
      setExpiredCampaigns(campaigns.filter(c => c.status === 'EXPIRED'));
    } catch (err) {
      console.error("Error fetching campaigns:", err);
    } finally {
      setFetchingCampaigns(false);
    }
  };

  const filteredProducts = products.filter(p => p.title.toLowerCase().includes(searchTerm.toLowerCase()));

  const toggleProductSelection = (id) => {
    if (selectedProductIds.includes(id)) {
      setSelectedProductIds(selectedProductIds.filter(pid => pid !== id));
    } else {
      setSelectedProductIds([...selectedProductIds, id]);
    }
  };

  const handleSelectCollectionProducts = (e) => {
    const colId = e.target.value;
    if (!colId) return;
    const productsInCol = products.filter(p => 
      p.collections?.edges?.some(edge => edge.node.id === colId)
    );
    const newIds = productsInCol.map(p => p.id);
    const combined = Array.from(new Set([...selectedProductIds, ...newIds]));
    setSelectedProductIds(combined);
    e.target.value = '';
  };

  const toggleCollectionSelection = (id) => {
    if (gridCollections.includes(id)) {
      setGridCollections(gridCollections.filter(cid => cid !== id));
    } else {
      setGridCollections([...gridCollections, id]);
    }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!campaignName || !discountValue || selectedProductIds.length === 0) {
      setError("Please fill all required fields and select at least one product.");
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (editingCampaignId) {
        await cleanUpCampaignBanners(editingCampaignId);
      }

      const selectedProductGids = selectedProductIds.map(id => `gid://shopify/Product/${id.split('/').pop()}`);
      const selectedHandles = selectedProductIds.map(id => products.find(p => p.id === id)?.handle).filter(Boolean);
      const uniqueCampaignTitle = `CAMP_${discountType}_${discountValue}_${campaignName}_${Date.now()}`;

      let val = parseFloat(discountValue);
      let customerGets;

      if (discountType === 'PERCENTAGE') {
        customerGets = { value: { percentage: val / 100 }, items: { products: { productsToAdd: selectedProductGids } } };
      } else if (discountType === 'FIXED_AMOUNT') {
        customerGets = { value: { discountAmount: { amount: val, appliesOnEachItem: true } }, items: { products: { productsToAdd: selectedProductGids } } };
      } else if (discountType === 'FLAT_RATE') {
        const mq = parseInt(minQuantity);
        if (!mq || mq <= 0) {
           throw new Error("Minimum Quantity is required for Flat Rate bundles.");
        }

        let totalBasePrice = 0;
        let validProductCount = 0;
        selectedProductIds.forEach(id => {
          const prod = products.find(p => p.id === id);
          if (prod && prod.variants && prod.variants.edges && prod.variants.edges.length > 0) {
            totalBasePrice += parseFloat(prod.variants.edges[0]?.node?.price || 0);
            validProductCount++;
          }
        });

        if (validProductCount === 0) throw new Error("Could not determine prices for the selected products.");

        const avgPrice = totalBasePrice / validProductCount;
        const totalNormalPrice = avgPrice * mq;
        const targetFlatRate = parseFloat(discountValue);

        if (targetFlatRate >= totalNormalPrice) {
           throw new Error(`Flat Rate (₹${targetFlatRate}) must be lower than the normal bundle price (₹${totalNormalPrice.toFixed(2)} for ${mq} items). Please increase the Minimum Quantity or lower the Flat Rate.`);
        }

        const discountNeeded = totalNormalPrice - targetFlatRate;
        let calculatedPercentage = Math.max(0, Math.min(1, discountNeeded / totalNormalPrice));
        customerGets = { value: { percentage: parseFloat(calculatedPercentage.toFixed(4)) }, items: { products: { productsToAdd: selectedProductGids } } };
      }

      const minimumRequirement = minQuantity && parseInt(minQuantity) > 0 
        ? { quantity: { greaterThanOrEqualToQuantity: String(parseInt(minQuantity)) } }
        : null;

      const startsAtVal = startsAt ? new Date(startsAt).toISOString() : new Date().toISOString();
      const endsAtVal = endsAt ? new Date(endsAt).toISOString() : null;

      const variables = {
        ...(editingCampaignId && { id: editingCampaignId }),
        automaticBasicDiscount: {
          title: uniqueCampaignTitle,
          startsAt: startsAtVal,
          ...(endsAtVal && { endsAt: endsAtVal }),
          customerGets,
          ...(minimumRequirement && { minimumRequirement })
        }
      };

      const mutation = editingCampaignId ? `
        mutation discountAutomaticBasicUpdate($id: ID!, $automaticBasicDiscount: DiscountAutomaticBasicInput!) {
          discountAutomaticBasicUpdate(id: $id, automaticBasicDiscount: $automaticBasicDiscount) {
            automaticDiscountNode { id }
            userErrors { field message }
          }
        }
      ` : `
        mutation discountAutomaticBasicCreate($automaticBasicDiscount: DiscountAutomaticBasicInput!) {
          discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {
            automaticDiscountNode { id }
            userErrors { field message }
          }
        }
      `;

      const res = await axios.post('/api/shopify/graphql.json', { query: mutation, variables });
      const responseData = editingCampaignId ? res.data?.data?.discountAutomaticBasicUpdate : res.data?.data?.discountAutomaticBasicCreate;

      if (responseData.userErrors?.length > 0) throw new Error(responseData.userErrors[0].message);
      const discountNodeId = responseData.automaticDiscountNode.id;

      const metafields = selectedProductIds.map(id => ({
        ownerId: `gid://shopify/Product/${id.split('/').pop()}`,
        namespace: "custom",
        key: "active_campaign",
        type: "json",
        value: JSON.stringify({
          campaignId: discountNodeId,
          campaignName: campaignName,
          discountType,
          discountValue: parseFloat(discountValue),
          minQuantity: parseInt(minQuantity) || 1,
          relatedProducts: selectedHandles,
          starts_at: startsAt,
          ends_at: endsAt
        })
      }));

      if (showGridBanner && gridCollections.length > 0) {
         const campaignData = {
          insert_after: parseInt(gridInsertAfter) || 4,
          heading_1: campaignName,
          bg_color_1: gridBg1,
          bg_color_2: gridBg2,
          banner_image: bannerImage,
          banner_image_mobile: mobileBannerImage,
          items: selectedHandles,
          campaign_id: discountNodeId,
          starts_at: startsAt,
          ends_at: endsAt
        };

        for (const colId of gridCollections) {
          const colGid = `gid://shopify/Collection/${colId.split('/').pop()}`;
          const colRes = await axios.post('/api/shopify/graphql.json', { query: `query { collection(id: "${colGid}") { metafield(namespace: "price_editor", key: "campaigns") { value } } }` });
          let existingCamps = [];
          try { existingCamps = JSON.parse(colRes.data.data.collection.metafield.value); } catch(e){}
          if (!Array.isArray(existingCamps)) existingCamps = [];
          existingCamps.push(campaignData);

          metafields.push({
            ownerId: colGid,
            namespace: "price_editor",
            key: "campaigns",
            type: "json",
            value: JSON.stringify(existingCamps)
          });
        }
      }

      for (let i = 0; i < metafields.length; i += 25) {
        await axios.post('/api/shopify/graphql.json', { 
          query: `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message } } }`, 
          variables: { metafields: metafields.slice(i, i + 25) } 
        });
      }

      setSuccess(editingCampaignId ? "Campaign updated successfully!" : "Campaign created successfully!");
      setCampaignName('');
      setDiscountValue('');
      setMinQuantity('');
      setStartsAt('');
      setEndsAt('');
      setSelectedProductIds([]);
      setGridCollections([]);
      setBannerImage('');
      setShowGridBanner(false);
      setEditingCampaignId(null);
      fetchActiveCampaigns();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to save campaign");
    } finally {
      setLoading(false);
    }
  };

  const cleanUpCampaignBanners = async (campaignId) => {
    const colRes = await axios.post('/api/shopify/graphql.json', { query: `query { collections(first: 250) { edges { node { id metafield(namespace: "price_editor", key: "campaigns") { value } } } } }` });
    const colMetafieldsToUpdate = colRes.data?.data?.collections?.edges?.filter(e => e.node.metafield?.value).map(col => {
      let campaigns = JSON.parse(col.node.metafield.value);
      return {
        ownerId: col.node.id,
        namespace: "price_editor",
        key: "campaigns",
        type: "json",
        value: JSON.stringify(campaigns.filter(c => c.campaign_id !== campaignId))
      };
    }).filter(m => JSON.parse(m.value).length >= 0);

    if (colMetafieldsToUpdate.length > 0) {
      await axios.post('/api/shopify/graphql.json', { 
        query: `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { message } } }`, 
        variables: { metafields: colMetafieldsToUpdate } 
      });
    }

    const prodRes = await axios.post('/api/shopify/graphql.json', { query: `query { products(first: 250) { edges { node { id metafield(namespace: "custom", key: "active_campaign") { id value } } } } }` });
      for (const prod of prodRes.data?.data?.products?.edges || []) {
        if (prod.node.metafield?.value && JSON.parse(prod.node.metafield.value).campaignId === campaignId) {
          await axios.post('/api/shopify/graphql.json', { query: `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { message } } }`, variables: { metafields: [{ ownerId: prod.node.id, namespace: "custom", key: "active_campaign", type: "json", value: "{}" }] } });
        }
      }
  };

  const handleDeleteCampaign = async (campaign) => {
    if (!window.confirm("Delete this campaign?")) return;
    setLoading(true);
    try {
      await cleanUpCampaignBanners(campaign.id);
      await axios.post('/api/shopify/graphql.json', { query: `mutation discountAutomaticDelete($id: ID!) { discountAutomaticDelete(id: $id) { userErrors { message } } }`, variables: { id: campaign.id } });
      fetchActiveCampaigns();
    } finally {
      setLoading(false);
    }
  };

  const handleEditCampaign = async (campaign) => {
    setLoading(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const query = `query { discountNode(id: "${campaign.id}") { discount { ... on DiscountAutomaticBasic { startsAt endsAt customerGets { items { ... on DiscountProducts { products(first: 250) { edges { node { id } } } } } } minimumRequirement { ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity } } } } } }`;
      const res = await axios.post('/api/shopify/graphql.json', { query });
      const data = res.data.data.discountNode.discount;
      const parts = campaign.title.split('_');
      setCampaignName(parts[3] || '');
      setDiscountType(parts[1]);
      setDiscountValue(parts[2]);
      setMinQuantity(data.minimumRequirement?.greaterThanOrEqualToQuantity || '');
      const toLocalISO = (isoString) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      };
      setStartsAt(toLocalISO(data.startsAt));
      setEndsAt(toLocalISO(data.endsAt));
      setSelectedProductIds(data.customerGets.items.products.edges.map(e => e.node.id));
      setEditingCampaignId(campaign.id);

      // Fetch all collections to check grid banner campaigns metafield
      const collectionsQuery = `
        query {
          collections(first: 250) {
            edges {
              node {
                id
                metafield(namespace: "price_editor", key: "campaigns") {
                  value
                }
              }
            }
          }
        }
      `;
      const colRes = await axios.post('/api/shopify/graphql.json', { query: collectionsQuery });
      const collectionsData = colRes.data?.data?.collections?.edges || [];
      
      const matchedCollections = [];
      let foundBannerData = null;
      collectionsData.forEach(edge => {
        if (edge.node.metafield?.value) {
          try {
            const camps = JSON.parse(edge.node.metafield.value);
            if (Array.isArray(camps)) {
              const match = camps.find(c => c.campaign_id === campaign.id);
              if (match) {
                matchedCollections.push(edge.node.id);
                if (!foundBannerData) {
                  foundBannerData = match;
                }
              }
            }
          } catch (e) {
            console.error("Error parsing collection campaigns metafield:", e);
          }
        }
      });

      if (foundBannerData) {
        setShowGridBanner(true);
        setGridInsertAfter(String(foundBannerData.insert_after || '4'));
        setGridBg1(foundBannerData.bg_color_1 || '#1e293b');
        setGridBg2(foundBannerData.bg_color_2 || '#0f172a');
        setBannerImage(foundBannerData.banner_image || '');
        setMobileBannerImage(foundBannerData.banner_image_mobile || '');
        setGridCollections(matchedCollections);
      } else {
        setShowGridBanner(false);
        setGridInsertAfter('4');
        setGridBg1('#1e293b');
        setGridBg2('#0f172a');
        setBannerImage('');
        setMobileBannerImage('');
        setGridCollections([]);
      }
    } catch (err) {
      console.error("Error loading campaign details:", err);
      setError("Failed to load all campaign details correctly.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-yellow-500" /> Automated Campaigns
        </h2>
        <div className="flex p-1 bg-slate-800/50 rounded-xl border border-slate-700 w-fit">
          <button onClick={() => setActiveTab('campaigns')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'campaigns' ? 'bg-[#1E293B] text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
            <Rocket className="w-4 h-4" /> Campaigns
          </button>
          <button onClick={() => setActiveTab('theme')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'theme' ? 'bg-[#1E293B] text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
            <Palette className="w-4 h-4" /> Theme UI
          </button>
          <button onClick={() => setActiveTab('history')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'history' ? 'bg-[#1E293B] text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
            <History className="w-4 h-4" /> History
          </button>
        </div>
      </div>

      {success && <div className="p-4 bg-green-900/20 border border-green-800 rounded-2xl text-green-400 text-sm">{success}</div>}
      {error && <div className="p-4 bg-red-900/20 border border-red-800 rounded-2xl text-red-400 text-sm">{error}</div>}

      {activeTab === 'theme' && (
        <div className="p-6 rounded-2xl border border-slate-700 bg-[#1E293B] shadow-xl max-w-2xl">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><Palette className="w-5 h-5 text-yellow-500" /> Banner Theme Colors</h3>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Background Color</label>
                <div className="flex gap-3">
                  <input type="color" value={uiBgColor} onChange={e => setUiBgColor(e.target.value)} className="w-10 h-10 rounded border-none bg-transparent cursor-pointer" />
                  <input type="text" value={uiBgColor} onChange={e => setUiBgColor(e.target.value)} className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 text-sm text-white focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Text Color</label>
                <div className="flex gap-3">
                  <input type="color" value={uiTextColor} onChange={e => setUiTextColor(e.target.value)} className="w-10 h-10 rounded border-none bg-transparent cursor-pointer" />
                  <input type="text" value={uiTextColor} onChange={e => setUiTextColor(e.target.value)} className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 text-sm text-white focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Accent / Icon Color</label>
                <div className="flex gap-3">
                  <input type="color" value={uiAccentColor} onChange={e => setUiAccentColor(e.target.value)} className="w-10 h-10 rounded border-none bg-transparent cursor-pointer" />
                  <input type="text" value={uiAccentColor} onChange={e => setUiAccentColor(e.target.value)} className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 text-sm text-white focus:outline-none" />
                </div>
              </div>
            </div>
            
            <div className="p-4 rounded-xl border" style={{ backgroundColor: uiBgColor, borderColor: uiAccentColor }}>
              <div className="flex justify-between items-center">
                <span style={{ color: uiTextColor, fontWeight: 'bold' }}>PREVIEW BANNER</span>
                <span style={{ color: uiAccentColor, fontWeight: 'bold' }}>20% OFF</span>
              </div>
            </div>

            <button onClick={handleSaveThemeSettings} disabled={loading} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition-all flex justify-center items-center gap-2">
              {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Settings className="w-4 h-4" />}
              {loading ? 'Saving...' : 'Save Live Theme'}
            </button>
          </div>
        </div>
      )}


      {activeTab === 'history' && (
        <div className="space-y-6 max-w-4xl">
          <h3 className="text-lg font-bold text-white flex items-center gap-2"><History className="w-5 h-5 text-yellow-500" /> Campaign History & Analytics</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6">
              <h4 className="text-base font-bold text-white mb-4">Expired Campaigns</h4>
              {expiredCampaigns.length === 0 ? (
                 <p className="text-sm text-slate-400">No expired campaigns found.</p>
              ) : (
                <div className="space-y-3">
                  {expiredCampaigns.map(camp => (
                    <div key={camp.id} className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-white">{camp.title.replace('CAMP_', '').split('_')[2] || 'Campaign'}</h4>
                          <span className="px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400 text-[9px] font-bold border border-slate-500/30">Expired</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">{camp.summary}</p>
                        {(camp.startsAt || camp.endsAt) && (
                          <p className="text-[9px] text-slate-400 mt-1.5 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            {camp.startsAt ? new Date(camp.startsAt).toLocaleString() : 'N/A'} - {camp.endsAt ? new Date(camp.endsAt).toLocaleString() : 'No End Date'}
                          </p>
                        )}
                      </div>
                      <button onClick={() => handleViewAnalytics(camp)} className="px-3 py-1.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-xs font-bold hover:bg-indigo-500/30 transition-colors flex items-center gap-1">
                        {loadingAnalytics === camp.id ? <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div> : <BarChart3 className="w-3 h-3" />}
                        Analytics
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {analyticsData && (
              <div className="bg-[#1E293B] border border-slate-700 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-400 to-orange-500"></div>
                <h4 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-yellow-500" /> Results: {analyticsData.campaign.title.replace('CAMP_', '').split('_')[2]}</h4>
                
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                      <Tag className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-semibold mb-1">Total Orders</p>
                      <p className="text-2xl font-black text-white">{analyticsData.totalOrders}</p>
                    </div>
                  </div>
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                      <IndianRupee className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-semibold mb-1">Total Value</p>
                      <p className="text-2xl font-black text-white">₹{analyticsData.totalValue}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-6">
                  <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> Customer List</h4>
                  {analyticsData.customers.length === 0 ? (
                    <p className="text-sm text-slate-500">No customers found for this campaign.</p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-700 pr-2">
                      {analyticsData.customers.map((c, i) => (
                        <div key={i} className="bg-[#0F172A] border border-slate-800 rounded-lg p-3">
                          <p className="text-sm font-bold text-slate-200">{c.firstName} {c.lastName}</p>
                          <p className="text-xs text-slate-500">{c.email || 'No email provided'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'campaigns' && (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        <div className={`p-6 rounded-2xl border shadow-xl relative overflow-hidden transition-all duration-300 ${editingCampaignId ? 'bg-indigo-950/20 border-indigo-500/50 shadow-indigo-900/20' : 'bg-[#1E293B] border-slate-700'}`}>
          {editingCampaignId && (
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
          )}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              {editingCampaignId ? <><Edit2 className="w-5 h-5 text-indigo-400" /> Edit Campaign</> : <><Sparkles className="w-5 h-5 text-yellow-500" /> New Campaign</>}
            </h3>
            {editingCampaignId && (
              <button onClick={() => {
                setEditingCampaignId(null);
                setCampaignName('');
                setDiscountValue('');
                setMinQuantity('');
                setStartsAt('');
                setEndsAt('');
                setSelectedProductIds([]);
                setGridCollections([]);
                setShowGridBanner(false);
                setBannerImage('');
              }} className="text-xs text-slate-400 hover:text-white underline">
                Cancel Edit
              </button>
            )}
          </div>
          
          <form onSubmit={handleCreateCampaign} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Campaign Display Name</label>
              <input
                type="text"
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                placeholder="e.g. Summer Super Sale"
                className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Discount Type</label>
                <select
                  value={discountType}
                  onChange={e => setDiscountType(e.target.value)}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                >
                  <option value="PERCENTAGE">Percentage (%) Off</option>
                  <option value="FIXED_AMOUNT">Fixed Amount (₹) Off Each Item</option>
                  <option value="FLAT_RATE">Flat Rate (₹) for Bundle</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  {discountType === 'FLAT_RATE' ? 'Flat Rate Value (₹)' : 'Discount Value'}
                </label>
                <input
                  type="number"
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                  placeholder="e.g. 15"
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                />
              </div>
            </div>

            {discountType === 'FLAT_RATE' && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <p className="text-[10px] text-yellow-500 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span><strong>Dynamic Flat Rate:</strong> Because your products have varying prices, we dynamically calculate the exact Percentage Discount needed based on the <strong>average price</strong> of all selected products. Minimum Quantity is required.</span>
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Minimum Quantity Required (Optional)</label>
              <input
                type="number"
                value={minQuantity}
                onChange={e => setMinQuantity(e.target.value)}
                placeholder="e.g. 3 (Buy 3 to get discount)"
                className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 flex justify-between"><span>Start Time</span> <span className="text-slate-500 font-normal">Optional</span></label>
                <input
                  type="datetime-local"
                  value={startsAt}
                  onClick={e => { try { e.target.showPicker(); } catch(err){} }}
                  onChange={e => setStartsAt(e.target.value)}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 flex justify-between"><span>End Time</span> <span className="text-slate-500 font-normal">Optional</span></label>
                <input
                  type="datetime-local"
                  value={endsAt}
                  onClick={e => { try { e.target.showPicker(); } catch(err){} }}
                  onChange={e => setEndsAt(e.target.value)}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                />
              </div>
            </div>

            {/* Collection Grid Banner Configuration */}
            <div className="pt-4 border-t border-slate-800">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={showGridBanner}
                  onChange={e => setShowGridBanner(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-yellow-500 focus:ring-yellow-500/50"
                />
                <span className="text-sm font-semibold text-white group-hover:text-yellow-500 transition-colors">Show Banner in Collection Grid</span>
              </label>

              {showGridBanner && (
                <div className="mt-4 p-4 bg-[#0F172A] border border-slate-700 rounded-xl space-y-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-2">Select Collections</label>
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-slate-700">
                      {collections && collections.map(col => (
                        <span 
                          key={col.id} 
                          onClick={() => toggleCollectionSelection(col.id)}
                          className={`text-[10px] px-2 py-1 rounded-md cursor-pointer border transition-colors ${gridCollections.includes(col.id) ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'}`}
                        >
                          {col.title}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Insert After (Product Count)</label>
                      <input type="number" value={gridInsertAfter} onChange={e => setGridInsertAfter(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Background Gradient Color 1</label>
                      <div className="flex gap-2">
                        <input type="color" value={gridBg1} onChange={e => setGridBg1(e.target.value)} className="w-8 h-8 rounded border-none bg-transparent cursor-pointer" />
                        <input type="text" value={gridBg1} onChange={e => setGridBg1(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Background Gradient Color 2</label>
                      <div className="flex gap-2">
                        <input type="color" value={gridBg2} onChange={e => setGridBg2(e.target.value)} className="w-8 h-8 rounded border-none bg-transparent cursor-pointer" />
                        <input type="text" value={gridBg2} onChange={e => setGridBg2(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] text-slate-400 mb-1">Desktop Banner Image</label>
                    <div className="flex gap-2">
                      <input type="text" value={bannerImage} onChange={e => setBannerImage(e.target.value)} placeholder="Main Desktop Banner Image URL" className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white" />
                      <button
                        type="button"
                        disabled={imageUploading}
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = (e) => {
                            const file = e.target.files[0];
                            if (file) handleImageUpload(file, false);
                          };
                          input.click();
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        {imageUploading ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5 text-yellow-500" />
                            <span>Upload</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] text-slate-400 mb-1">Mobile Banner Image (Optional)</label>
                    <div className="flex gap-2">
                      <input type="text" value={mobileBannerImage} onChange={e => setMobileBannerImage(e.target.value)} placeholder="Mobile Banner Image URL (Optional)" className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white" />
                      <button
                        type="button"
                        disabled={mobileImageUploading}
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = (e) => {
                            const file = e.target.files[0];
                            if (file) handleImageUpload(file, true);
                          };
                          input.click();
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        {mobileImageUploading ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5 text-yellow-500" />
                            <span>Upload</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800">
              <label className="block text-xs font-semibold text-slate-300 mb-3 flex justify-between items-center">
                <span>Select Products ({selectedProductIds.length} chosen)</span>
              </label>
              
              <div className="relative mb-3 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-slate-500"
                  />
                </div>
                <select 
                  onChange={handleSelectCollectionProducts}
                  className="bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-slate-500 max-w-[180px]"
                >
                  <option value="">+ Add by Category...</option>
                  {collections && collections.map(col => (
                    <option key={col.id} value={col.id}>{col.title} ({col.handle})</option>
                  ))}
                </select>
              </div>

              <div className="h-64 overflow-y-auto bg-[#0F172A] border border-slate-800 rounded-xl p-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-700">
                {filteredProducts.map(p => {
                  const isSelected = selectedProductIds.includes(p.id);
                  return (
                    <div 
                      key={p.id}
                      onClick={() => toggleProductSelection(p.id)}
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-yellow-500/10 border border-yellow-500/30' : 'hover:bg-slate-800/50 border border-transparent'}`}
                    >
                      <div className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${isSelected ? 'bg-yellow-500 border-yellow-500' : 'border-slate-600 bg-slate-800'}`}>
                        {isSelected && <CheckSquare className="w-3 h-3 text-slate-900" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs truncate ${isSelected ? 'text-yellow-500 font-semibold' : 'text-slate-300'}`}>{p.title}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !campaignName || selectedProductIds.length === 0}
              className={`w-full py-3 px-4 ${editingCampaignId ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/50' : 'bg-yellow-500 hover:bg-yellow-400 shadow-yellow-900/20'} text-slate-900 font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading ? <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> : (editingCampaignId ? <Edit2 className="w-4 h-4" /> : <Rocket className="w-4 h-4" />)}
              {loading ? 'Processing...' : editingCampaignId ? 'Update Campaign' : 'Launch Campaign'}
            </button>
          </form>
        </div>

        <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6">
          <h3 className="text-base font-bold text-white mb-4">Active Campaigns</h3>
          <div className="space-y-3">
            {activeCampaigns.map(camp => (
              <div key={camp.id} className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-bold text-white">{camp.title.replace('CAMP_', '').split('_')[2]}</h4>
                    {camp.status === 'SCHEDULED' && <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[9px] font-bold border border-blue-500/30">Scheduled</span>}
                    {camp.discount?.endsAt && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold border border-amber-500/30 flex items-center gap-1"><Calendar className="w-3 h-3" /> Ends {new Date(camp.discount.endsAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                  <p className="text-[10px] text-emerald-400 mt-1">{camp.summary}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEditCampaign(camp)} className="p-2 text-slate-400 hover:text-indigo-400"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDeleteCampaign(camp)} className="p-2 text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
