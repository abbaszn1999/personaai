import { useState } from 'react';
import {
  Store,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Server,
  Zap,
  Layers,
  Lock,
  ExternalLink,
  ChevronRight,
  Database,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { PlatformType, StoreConnectionInfo } from '../types';

interface ConnectStoreViewProps {
  storeConnection: StoreConnectionInfo;
  onUpdateStoreConnection: (info: StoreConnectionInfo) => void;
  onContinueToCategories?: () => void;
  onContinueToMapping?: () => void;
}

export function ConnectStoreView({
  storeConnection,
  onUpdateStoreConnection,
  onContinueToCategories,
  onContinueToMapping,
}: ConnectStoreViewProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>(storeConnection.platform);
  const [storeDomain, setStoreDomain] = useState(storeConnection.storeUrl);
  const [storeName, setStoreName] = useState(storeConnection.storeName);
  const [apiKey, setApiKey] = useState(storeConnection.apiKeyOrToken || 'shpat_98a72b14c3e80f2d917e335b2e9a');
  const [apiSecret, setApiSecret] = useState(storeConnection.apiSecret || 'shpss_88df29a103c847e1');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStep, setVerificationStep] = useState<number>(0);
  const [connectionSuccess, setConnectionSuccess] = useState<boolean>(storeConnection.isConnected);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Platform selection helper
  const handleSelectPlatform = (platform: PlatformType) => {
    setSelectedPlatform(platform);
    if (platform === 'shopify') {
      setStoreDomain('apex-apparel.myshopify.com');
      setStoreName('Apex Athletic & Apparel Co.');
      setApiKey('shpat_98a72b14c3e80f2d917e335b2e9a');
    } else if (platform === 'woocommerce') {
      setStoreDomain('https://apex-store.com');
      setStoreName('Apex Apparel WooCommerce');
      setApiKey('ck_e849204bf89320148ad');
      setApiSecret('cs_78120384812398401a');
    } else if (platform === 'bigcommerce') {
      setStoreDomain('https://api.bigcommerce.com/stores/x8f93a1/v3');
      setStoreName('Apex Apparel BigCommerce');
      setApiKey('bc_token_4920148120381023');
    } else {
      setStoreDomain('https://api.apex-store.com/v1/products/feed.json');
      setStoreName('Apex Custom Storefront');
      setApiKey('bearer_prod_sec_9918231023');
    }
  };

  const handleTestAndConnect = () => {
    setIsVerifying(true);
    setVerificationStep(1);

    setTimeout(() => {
      setVerificationStep(2);
      setTimeout(() => {
        setVerificationStep(3);
        setTimeout(() => {
          setVerificationStep(4);
          setTimeout(() => {
            setIsVerifying(false);
            setConnectionSuccess(true);
            onUpdateStoreConnection({
              isConnected: true,
              platform: selectedPlatform,
              storeName: storeName.trim() || 'Apex Athletic & Apparel Co.',
              storeUrl: storeDomain.trim() || 'apex-apparel.myshopify.com',
              totalSkuCount: 14850,
              detectedCurrency: 'USD',
              apiStatus: 'connected',
              connectedAt: new Date().toISOString(),
              taxonomySource:
                selectedPlatform === 'shopify'
                  ? 'Shopify product_type & Standard Taxonomy API'
                  : selectedPlatform === 'woocommerce'
                  ? 'WooCommerce REST API Category Hierarchy'
                  : 'Product Catalog Taxonomy',
              authMethod:
                selectedPlatform === 'shopify'
                  ? 'Custom App Admin API (2024-10)'
                  : 'REST API Key Authentication',
              apiKeyOrToken: apiKey,
              apiSecret: apiSecret,
            });
          }, 600);
        }, 600);
      }, 600);
    }, 600);
  };

  const handleDisconnect = () => {
    setConnectionSuccess(false);
    onUpdateStoreConnection({
      ...storeConnection,
      isConnected: false,
      apiStatus: 'disconnected',
    });
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-100 text-purple-800">
              Step 1 of Onboarding
            </span>
            <span className="text-xs font-semibold text-slate-400">·</span>
            <span className="text-xs font-medium text-slate-600">Store Authentication Gate</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Connect Your Ecommerce Store
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Authenticate your storefront to sync your raw product catalog and taxonomy. Persona reads your store's leaf taxonomy to scope sizing intelligence before running setup workflows.
          </p>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-3 self-start md:self-auto bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div
            className={`w-3 h-3 rounded-full ${
              storeConnection.isConnected ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-amber-400 ring-4 ring-amber-100'
            }`}
          />
          <div>
            <div className="text-xs font-bold text-slate-900">
              {storeConnection.isConnected ? 'Store Connected' : 'Connection Required'}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              {storeConnection.isConnected ? storeConnection.storeName : 'No active store'}
            </div>
          </div>
        </div>
      </div>

      {/* Connected Confirmation Card (If Connected) */}
      {storeConnection.isConnected && connectionSuccess && (
        <div className="bg-gradient-to-br from-emerald-50/90 to-teal-50/50 border border-emerald-200 rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs shadow-emerald-600/30">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-emerald-950">
                    {storeConnection.storeName}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-200 text-emerald-900 uppercase">
                    {storeConnection.platform}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Live Active
                  </span>
                </div>
                <p className="text-xs text-emerald-800">
                  Store endpoint <span className="font-mono font-semibold">{storeConnection.storeUrl}</span> is successfully linked. Total detected inventory:{' '}
                  <strong className="text-emerald-950 font-bold">14,850 SKUs</strong> across 24 leaf taxonomy nodes.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleDisconnect}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 hover:text-rose-600 transition-colors cursor-pointer"
              >
                Disconnect / Switch
              </button>

              <button
                type="button"
                onClick={onContinueToCategories}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-sm shadow-purple-600/30 transition-all cursor-pointer"
              >
                <span>Continue to Categories (Tab 2)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Metrics of Connected Store */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-emerald-200/70 text-xs">
            <div className="bg-white/80 rounded-xl p-2.5 border border-emerald-100">
              <div className="text-[10px] uppercase font-bold text-slate-400">Total Catalog SKUs</div>
              <div className="text-sm font-extrabold text-slate-900 mt-0.5">14,850</div>
            </div>
            <div className="bg-white/80 rounded-xl p-2.5 border border-emerald-100">
              <div className="text-[10px] uppercase font-bold text-slate-400">Taxonomy Source</div>
              <div className="text-sm font-bold text-slate-800 mt-0.5 truncate">
                {storeConnection.platform === 'shopify' ? 'product_type + API' : 'WP Category Tree'}
              </div>
            </div>
            <div className="bg-white/80 rounded-xl p-2.5 border border-emerald-100">
              <div className="text-[10px] uppercase font-bold text-slate-400">Storefront Currency</div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">USD ($)</div>
            </div>
            <div className="bg-white/80 rounded-xl p-2.5 border border-emerald-100">
              <div className="text-[10px] uppercase font-bold text-slate-400">Next Required Step</div>
              <div className="text-sm font-bold text-purple-700 mt-0.5">Scope Categories</div>
            </div>
          </div>
        </div>
      )}

      {/* Platform Selection & Credentials Form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-bold text-slate-900">Select Platform &amp; API Configuration</h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Read-only catalog &amp; taxonomy permissions
          </span>
        </div>

        <div className="p-6 space-y-6">
          {/* Platform Selector Grid */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              1. Choose Your Ecommerce Platform
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Shopify */}
              <button
                type="button"
                onClick={() => handleSelectPlatform('shopify')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                  selectedPlatform === 'shopify'
                    ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-600/20 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-[#95BF47]/15 text-[#5E8E3E] font-black flex items-center justify-center text-sm">
                    🛍️
                  </div>
                  {selectedPlatform === 'shopify' && (
                    <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  )}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">Shopify</div>
                  <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                    Admin API / App (product_type &amp; taxonomy)
                  </div>
                </div>
                <div className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded w-fit">
                  Full Taxonomy Support
                </div>
              </button>

              {/* WooCommerce / WordPress */}
              <button
                type="button"
                onClick={() => handleSelectPlatform('woocommerce')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                  selectedPlatform === 'woocommerce'
                    ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-600/20 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-[#96588A]/15 text-[#96588A] font-black flex items-center justify-center text-sm">
                    📦
                  </div>
                  {selectedPlatform === 'woocommerce' && (
                    <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  )}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">WooCommerce</div>
                  <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                    WordPress REST API (Nested Category hierarchy)
                  </div>
                </div>
                <div className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded w-fit">
                  Category &gt; Subcategory Tree
                </div>
              </button>

              {/* BigCommerce */}
              <button
                type="button"
                onClick={() => handleSelectPlatform('bigcommerce')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                  selectedPlatform === 'bigcommerce'
                    ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-600/20 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 font-black flex items-center justify-center text-sm">
                    🛒
                  </div>
                  {selectedPlatform === 'bigcommerce' && (
                    <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  )}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">BigCommerce</div>
                  <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                    Storefront v3 API &amp; Catalog
                  </div>
                </div>
                <div className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded w-fit">
                  Standard API
                </div>
              </button>

              {/* Custom API / Feed */}
              <button
                type="button"
                onClick={() => handleSelectPlatform('custom')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                  selectedPlatform === 'custom'
                    ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-600/20 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 font-black flex items-center justify-center text-sm">
                    ⚙️
                  </div>
                  {selectedPlatform === 'custom' && (
                    <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  )}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">Custom / Feed</div>
                  <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                    JSON Catalog Feed or GraphQL endpoint
                  </div>
                </div>
                <div className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded w-fit">
                  Direct Ingest
                </div>
              </button>
            </div>
          </div>

          {/* Platform Specific Credential Inputs */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              2. Enter Authentication Details ({selectedPlatform.toUpperCase()})
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  {selectedPlatform === 'shopify'
                    ? 'Shopify Store URL / Myshopify Domain'
                    : selectedPlatform === 'woocommerce'
                    ? 'WordPress Store URL'
                    : 'Store Domain / Endpoint'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={storeDomain}
                    onChange={(e) => setStoreDomain(e.target.value)}
                    placeholder={
                      selectedPlatform === 'shopify'
                        ? 'your-store.myshopify.com'
                        : 'https://your-store.com'
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {selectedPlatform === 'shopify'
                    ? 'Example: apex-apparel.myshopify.com'
                    : 'Your active HTTPS ecommerce base URL'}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Store Display Name
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Apex Athletic & Apparel"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Used for labeling reports and customer-facing size widgets
                </p>
              </div>
            </div>

            {/* API Keys */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  {selectedPlatform === 'shopify'
                    ? 'Admin API Access Token (shpat_...)'
                    : selectedPlatform === 'woocommerce'
                    ? 'WooCommerce Consumer Key (ck_...)'
                    : 'API Client Token'}
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter API token..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
                  />
                  <div className="absolute right-3 top-2.5 text-slate-400">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Requires scope: <code className="text-purple-700">read_products</code>,{' '}
                  <code className="text-purple-700">read_product_listings</code>
                </p>
              </div>

              {selectedPlatform === 'woocommerce' && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    WooCommerce Consumer Secret (cs_...)
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder="cs_..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
                    />
                    <div className="absolute right-3 top-2.5 text-slate-400">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Verification State Progression */}
            {isVerifying && (
              <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 space-y-2.5 animate-in fade-in">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-950">
                  <RefreshCw className="w-4 h-4 text-purple-600 animate-spin" />
                  <span>Verifying Store Connection &amp; Scanning Catalog...</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className={`flex items-center gap-2 ${verificationStep >= 1 ? 'text-purple-900 font-semibold' : 'text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${verificationStep >= 1 ? 'text-emerald-600' : 'text-slate-300'}`} />
                    <span>1. Validating API authentication credentials and endpoint security</span>
                  </div>
                  <div className={`flex items-center gap-2 ${verificationStep >= 2 ? 'text-purple-900 font-semibold' : 'text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${verificationStep >= 2 ? 'text-emerald-600' : 'text-slate-300'}`} />
                    <span>2. Querying Storefront metadata and store currency (USD detected)</span>
                  </div>
                  <div className={`flex items-center gap-2 ${verificationStep >= 3 ? 'text-purple-900 font-semibold' : 'text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${verificationStep >= 3 ? 'text-emerald-600' : 'text-slate-300'}`} />
                    <span>3. Fetching raw leaf taxonomy structure ({selectedPlatform === 'shopify' ? 'product_type' : 'Category > Subcategory hierarchy'})</span>
                  </div>
                  <div className={`flex items-center gap-2 ${verificationStep >= 4 ? 'text-emerald-900 font-bold' : 'text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${verificationStep >= 4 ? 'text-emerald-600' : 'text-slate-300'}`} />
                    <span>4. Verified: 14,850 SKUs detected across 24 leaf-level category paths</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Encrypted 256-bit API proxy · Zero write permissions requested</span>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleTestAndConnect}
                  disabled={isVerifying}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2"
                >
                  {isVerifying ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>{storeConnection.isConnected ? 'Re-Test & Save Connection' : 'Connect & Authenticate Store'}</span>
                    </>
                  )}
                </button>

                {storeConnection.isConnected && (
                  <button
                    type="button"
                    onClick={onContinueToMapping || onContinueToCategories}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-all shadow-sm shadow-purple-600/30 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Proceed to Mapping</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Technical Architecture Callout */}
      <div className="bg-slate-100/80 rounded-2xl p-5 border border-slate-200 text-xs space-y-2 text-slate-600">
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <Server className="w-4 h-4 text-purple-600" />
          <span>Why Connect First? Architectural Isolation &amp; Scope Discipline</span>
        </div>
        <p className="leading-relaxed">
          Authenticating your store platform unlocks the store taxonomy and collection endpoints. In the next step (<strong>Tab 2: Mapping</strong>), you map your store collections and product listing categories to the Persona fixed taxonomy. Every downstream agent workflow in <strong>Setup (Stage 1 to 6)</strong> will only ingest products inside your mapped categories, eliminating wasted compute on non-apparel items like gift cards or accessories.
        </p>
      </div>
    </div>
  );
}
