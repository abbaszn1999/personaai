import { useState } from 'react';
import {
  StageNumber,
  StoreFieldMapping,
  MockProduct,
  DiscoveredBrand,
  FoundSizeChart,
  GapItem,
  StoreConnectionInfo,
  StoreSizingSystemConfig,
  ParentCategoryType,
  StandardParentCategoryType,
  BrandResearchedCategoryChart,
  ResearchedChartVariant,
  PathChartAssignment,
  SkuChartOverride,
} from './types';
import {
  GOOGLE_SCHEMA_OPTIONS,
  INITIAL_MAPPINGS,
  MOCK_PRODUCTS,
  DISCOVERED_BRANDS_DATA,
  FOUND_SIZE_CHARTS,
  INITIAL_GAP_ITEMS,
  BRAND_RESEARCHED_CATEGORY_CHARTS,
  INITIAL_PATH_ASSIGNMENTS,
  INITIAL_SKU_OVERRIDES,
} from './data/mockData';
import {
  DEFAULT_CONNECTED_STORE,
  DEFAULT_SELECTED_LEAF_IDS,
} from './data/categoriesData';
import { Sidebar, MainAppTab } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { Stepper } from './components/Stepper';
import { Stage1ColumnMapping } from './components/Stage1ColumnMapping';
import { Stage2ItemPreview } from './components/Stage2ItemPreview';
import { Stage3BrandDiscovery } from './components/Stage3BrandDiscovery';
import { Stage4SizeChartResearch } from './components/Stage4SizeChartResearch';
import { Stage5ChartAssignment } from './components/Stage5ChartAssignment';
import { Stage6Confirmation } from './components/Stage6Confirmation';
import { JsonExtractorLoading } from './components/JsonExtractorLoading';
import { MappingToPreviewLoading } from './components/MappingToPreviewLoading';
import { SizeChartModal } from './components/SizeChartModal';
import { GapFillModal } from './components/GapFillModal';
import { SyncView } from './components/SyncView';
import { ConnectStoreView } from './components/ConnectStoreView';
import { CategoriesScopeView } from './components/CategoriesScopeView';
import { CategoryMappingView } from './components/CategoryMappingView';

export default function App() {
  // Primary Navigation Tab (Connect Store vs Categories vs Setup vs Sync)
  const [activeTab, setActiveTab] = useState<MainAppTab>('connect_store');

  // Store Connection & Category Scoping State
  const [storeConnection, setStoreConnection] = useState<StoreConnectionInfo>(DEFAULT_CONNECTED_STORE);
  const [selectedLeafIds, setSelectedLeafIds] = useState<string[]>(DEFAULT_SELECTED_LEAF_IDS);

  // Setup Pipeline Navigation State
  const [currentStage, setCurrentStage] = useState<StageNumber>(1);
  const [highestReachedStage, setHighestReachedStage] = useState<StageNumber>(1);

  // Setup Data States
  const [mappings, setMappings] = useState<StoreFieldMapping[]>(INITIAL_MAPPINGS);
  const [sizingConfig, setSizingConfig] = useState<StoreSizingSystemConfig>({
    defaultSystem: 'US',
    brandOverrides: {},
  });
  const [products, setProducts] = useState<MockProduct[]>(MOCK_PRODUCTS);
  const [brands, setBrands] = useState<DiscoveredBrand[]>(DISCOVERED_BRANDS_DATA);
  const [foundCharts] = useState<FoundSizeChart[]>(FOUND_SIZE_CHARTS);
  const [gapItems, setGapItems] = useState<GapItem[]>(INITIAL_GAP_ITEMS);
  const [brandCharts, setBrandCharts] = useState<BrandResearchedCategoryChart[]>(BRAND_RESEARCHED_CATEGORY_CHARTS);
  const [pathAssignments, setPathAssignments] = useState<PathChartAssignment[]>(INITIAL_PATH_ASSIGNMENTS);
  const [skuOverrides, setSkuOverrides] = useState<Record<string, SkuChartOverride>>(INITIAL_SKU_OVERRIDES);

  // Path Assignment & SKU Override Handlers
  const handleAddResearchedVariant = (
    brand: string,
    parentCategory: StandardParentCategoryType,
    variant: ResearchedChartVariant
  ) => {
    setBrandCharts((prev) => {
      const existing = prev.find(
        (c) => c.brand.toLowerCase() === brand.toLowerCase() && c.parentCategory === parentCategory
      );
      if (existing) {
        return prev.map((c) =>
          c.id === existing.id
            ? { ...c, variants: [...c.variants.filter((v) => v.id !== variant.id), variant] }
            : c
        );
      }
      return [
        ...prev,
        {
          id: `chart-custom-${Date.now()}`,
          brand,
          parentCategory,
          variants: [variant],
          status: 'done',
          confidence: 99.0,
          lastUpdated: 'Merchant Custom Template',
          source: 'Merchant Sizing Studio',
        },
      ];
    });
  };

  const handleUpdatePathAssignment = (
    param1: string,
    param2?: string | null,
    param3?: string,
    param4?: string
  ) => {
    if (param4 !== undefined) {
      // Called with (brand, merchantPath, assignedVariantId, assignedVariantName)
      const brand = param1;
      const merchantPath = param2 || '';
      const assignedVariantId = param3 !== undefined ? param3 : null;
      const assignedVariantName = param4;
      const isUnassigned =
        assignedVariantId === null ||
        assignedVariantName.toLowerCase().includes('unassigned');
      const status: 'assigned' | 'unassigned' = isUnassigned
        ? 'unassigned'
        : 'assigned';

      setPathAssignments((prev) => {
        const existingIdx = prev.findIndex(
          (p) =>
            p.brand.toLowerCase() === brand.toLowerCase() &&
            p.merchantPath.toLowerCase() === merchantPath.toLowerCase()
        );
        if (existingIdx >= 0) {
          const copy = [...prev];
          copy[existingIdx] = {
            ...copy[existingIdx],
            assignedVariantId,
            assignedVariantName,
            status,
            isAutoMatched: false,
          };
          return copy;
        }
        return [
          ...prev,
          {
            id: `assign-${Date.now()}`,
            brand,
            merchantPath,
            parentCategory: 'Tops',
            assignedVariantId,
            assignedVariantName,
            skuCount: 1,
            status,
            isAutoMatched: false,
          },
        ];
      });
    } else {
      // Called with (id, variantId, variantName)
      const id = param1;
      const assignedVariantId = param2 !== undefined ? param2 : null;
      const assignedVariantName = param3 || (assignedVariantId ? 'Assigned Variant' : 'Unassigned (No Size Chart)');
      const isUnassigned =
        assignedVariantId === null ||
        assignedVariantName.toLowerCase().includes('unassigned');
      const status: 'assigned' | 'unassigned' = isUnassigned
        ? 'unassigned'
        : 'assigned';

      setPathAssignments((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, assignedVariantId, assignedVariantName, status, isAutoMatched: false }
            : a
        )
      );
    }
  };

  const handleUpdateSkuOverride = (sku: string, override: SkuChartOverride | null) => {
    setSkuOverrides((prev) => {
      const copy = { ...prev };
      if (!override) {
        delete copy[sku];
      } else {
        copy[sku] = override;
      }
      return copy;
    });
  };

  // Setup Stage Process States
  const [isMappingLoading, setIsMappingLoading] = useState(false);
  const [brandDiscoveryDone, setBrandDiscoveryDone] = useState(true);
  const [sizeChartResearchDone, setSizeChartResearchDone] = useState(false);
  const [jsonExtractionDone, setJsonExtractionDone] = useState(false);

  // Modal States
  const [activeSizeChartModal, setActiveSizeChartModal] = useState<FoundSizeChart | null>(null);
  const [activeItemContext, setActiveItemContext] = useState<MockProduct | null>(null);
  const [activeChartInitialCategory, setActiveChartInitialCategory] = useState<ParentCategoryType | undefined>(undefined);
  const [activeChartInitialVariantId, setActiveChartInitialVariantId] = useState<string | undefined>(undefined);
  const [activeChartIsReadOnly, setActiveChartIsReadOnly] = useState<boolean>(false);
  const [activeGapModalItem, setActiveGapModalItem] = useState<GapItem | null>(null);

  // Brand Update Handler
  const handleUpdateBrand = (brandName: string, updates: Partial<DiscoveredBrand>) => {
    setBrands((prev) =>
      prev.map((b) => (b.name === brandName ? { ...b, ...updates } : b))
    );
  };

  const handleDeleteVariant = (brand: string, parentCat: ParentCategoryType, variantId: string) => {
    setBrandCharts((prev) =>
      prev.map((c) => {
        if (c.brand.toLowerCase() === brand.toLowerCase() && c.parentCategory === parentCat) {
          return {
            ...c,
            variants: c.variants.filter((v) => v.id !== variantId),
          };
        }
        return c;
      })
    );
  };

  // Setup Navigation handlers
  const hasExistingSizeChart = Boolean(
    sizingConfig.sizeChart && sizingConfig.sizeChart !== 'none'
  );

  const goToStage = (stage: StageNumber) => {
    setIsMappingLoading(false);
    setCurrentStage(stage);
    if (stage > highestReachedStage) {
      setHighestReachedStage(stage);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNext = () => {
    if (currentStage === 1 && hasExistingSizeChart) {
      goToStage(6);
      return;
    }
    if (currentStage < 6) {
      const next = (currentStage + 1) as StageNumber;
      goToStage(next);
    }
  };

  const handlePrev = () => {
    if (currentStage === 6 && hasExistingSizeChart) {
      goToStage(1);
      return;
    }
    if (currentStage > 1) {
      const prev = (currentStage - 1) as StageNumber;
      goToStage(prev);
    }
  };

  // Trigger loading between Stage 1 (Mapping) and Stage 2 (Preview)
  const handleConfirmMapping = () => {
    if (hasExistingSizeChart) {
      goToStage(6);
    } else {
      setIsMappingLoading(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleMappingLoadingComplete = () => {
    setIsMappingLoading(false);
    if (hasExistingSizeChart) {
      goToStage(6);
    } else {
      goToStage(2);
    }
  };

  // Reset demo to stage 1
  const handleResetDemo = () => {
    setIsMappingLoading(false);
    setCurrentStage(1);
    setHighestReachedStage(1);
    setMappings(INITIAL_MAPPINGS);
    setGapItems(INITIAL_GAP_ITEMS);
    setBrandDiscoveryDone(true);
    setSizeChartResearchDone(false);
    setJsonExtractionDone(false);
    setActiveSizeChartModal(null);
    setActiveItemContext(null);
    setActiveGapModalItem(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Mapping handlers
  const handleUpdateMapping = (id: string, newSchema: string) => {
    setMappings((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selectedSchema: newSchema, isAutoDetected: false } : item
      )
    );
  };

  const handleUpdateProductCategory = (productId: string, parentCategory: ParentCategoryType) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, parentCategory } : p))
    );
  };

  const handleResetMappings = () => {
    setMappings(INITIAL_MAPPINGS);
  };

  // Size Chart & Gap Modals
  const handleViewSizeChart = (
    chart: FoundSizeChart,
    item?: MockProduct,
    initialCat?: ParentCategoryType,
    initialVariantId?: string,
    isReadOnly?: boolean
  ) => {
    setActiveSizeChartModal(chart);
    setActiveItemContext(item || null);
    setActiveChartInitialCategory(initialCat);
    setActiveChartInitialVariantId(initialVariantId);
    setActiveChartIsReadOnly(Boolean(isReadOnly));
  };

  const handleOpenGapModal = (item: GapItem) => {
    setActiveGapModalItem(item);
  };

  const handleFillGapById = (gapId: string) => {
    const item = gapItems.find((g) => g.id === gapId);
    if (item) {
      setActiveGapModalItem(item);
    }
  };

  const handleSaveGapItem = (updatedItem: GapItem) => {
    setGapItems((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
  };

  const handleQuickCompleteAllGaps = () => {
    setGapItems((prev) =>
      prev.map((item) => ({
        ...item,
        status: 'complete',
      }))
    );
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 flex flex-row font-sans selection:bg-purple-200 selection:text-purple-900 overflow-x-hidden">
      {/* Left-Side Sidebar for Pipeline Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        currentStage={currentStage}
        highestReachedStage={highestReachedStage}
        onReset={handleResetDemo}
        storeConnection={storeConnection}
        selectedLeafCount={selectedLeafIds.length}
      />

      {/* Main Right Viewport Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
        {/* Top Header Bar */}
        <TopHeader
          activeTab={activeTab}
          onReset={handleResetDemo}
        />

        {/* ========================================================================= */}
        {/* Tab 1: Connect Your Store (Platform Authentication & Detection)           */}
        {/* ========================================================================= */}
        {activeTab === 'connect_store' && (
          <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
            <ConnectStoreView
              storeConnection={storeConnection}
              onUpdateStoreConnection={setStoreConnection}
              onContinueToCategories={() => {
                setActiveTab('categories');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </main>
        )}

        {/* ========================================================================= */}
        {/* Tab 2: Categories (Leaf-Level Sizing Scope Definition)                    */}
        {/* ========================================================================= */}
        {activeTab === 'categories' && (
          <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
            <CategoriesScopeView
              storeConnection={storeConnection}
              selectedLeafIds={selectedLeafIds}
              onUpdateSelectedLeafIds={setSelectedLeafIds}
              onContinueToSetup={() => {
                setActiveTab('mapping');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onGoToConnectStore={() => {
                setActiveTab('connect_store');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </main>
        )}

        {/* ========================================================================= */}
        {/* Tab 3: Mapping (Persona Fixed Taxonomy & Store Category Calibration)      */}
        {/* ========================================================================= */}
        {activeTab === 'mapping' && (
          <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
            <CategoryMappingView storeConnection={storeConnection} />
          </main>
        )}

        {/* ========================================================================= */}
        {/* Tab 3: Setup Tab: Pipeline Stepper & Stages                               */}
        {/* ========================================================================= */}
        {activeTab === 'setup' && (
          <div className="flex-1 flex flex-col w-full min-w-0">
            {/* Horizontal Multi-Step Progress Stepper */}
            <Stepper
              currentStage={currentStage}
              highestReachedStage={highestReachedStage}
              onSelectStage={goToStage}
              hasExistingSizeChart={hasExistingSizeChart}
            />

            {/* Main Pipeline Content Area */}
            <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
              <div className="w-full">
                {currentStage === 1 && (
                  !isMappingLoading ? (
                    <Stage1ColumnMapping
                      mappings={mappings}
                      schemaOptions={GOOGLE_SCHEMA_OPTIONS}
                      sizingConfig={sizingConfig}
                      availableBrands={brands.map((b) => b.name)}
                      storeConnection={storeConnection}
                      onUpdateMapping={handleUpdateMapping}
                      onUpdateSizingConfig={setSizingConfig}
                      onResetDefaults={handleResetMappings}
                      onNext={handleConfirmMapping}
                    />
                  ) : (
                    <MappingToPreviewLoading
                      onComplete={handleMappingLoadingComplete}
                      onCancel={() => setIsMappingLoading(false)}
                    />
                  )
                )}

                {currentStage === 2 && (
                  <Stage2ItemPreview
                    products={products}
                    onPrev={handlePrev}
                    onNext={handleNext}
                    onUpdateProduct={handleUpdateProductCategory}
                  />
                )}

                {currentStage === 3 && (
                  <Stage3BrandDiscovery
                    brands={brands}
                    isCompleted={brandDiscoveryDone}
                    onSetCompleted={setBrandDiscoveryDone}
                    onPrev={handlePrev}
                    onNext={handleNext}
                    onUpdateBrand={handleUpdateBrand}
                  />
                )}

                {currentStage === 4 && (
                  <Stage4SizeChartResearch
                    foundCharts={foundCharts}
                    gapItems={gapItems}
                    isCompleted={sizeChartResearchDone}
                    onSetCompleted={setSizeChartResearchDone}
                    onViewChart={handleViewSizeChart}
                    onFillGap={handleFillGapById}
                    onPrev={handlePrev}
                    onNext={handleNext}
                    sizingConfig={sizingConfig}
                    brandCharts={brandCharts}
                  />
                )}

                {currentStage === 5 && (
                  <Stage5ChartAssignment
                    pathAssignments={pathAssignments}
                    brandCharts={brandCharts}
                    products={products}
                    sizingConfig={sizingConfig}
                    onUpdatePathAssignment={(id, variantId, variantName) =>
                      handleUpdatePathAssignment(id, variantId, variantName)
                    }
                    onAddResearchedVariant={handleAddResearchedVariant}
                    onPrev={handlePrev}
                    onNext={handleNext}
                  />
                )}

                {currentStage === 6 && (
                  !jsonExtractionDone ? (
                    <JsonExtractorLoading
                      onComplete={() => setJsonExtractionDone(true)}
                      onCancel={() => goToStage(hasExistingSizeChart ? 1 : 5)}
                    />
                  ) : (
                    <Stage6Confirmation
                      products={products}
                      foundCharts={foundCharts}
                      gapItems={gapItems}
                      brandCharts={brandCharts}
                      pathAssignments={pathAssignments}
                      skuOverrides={skuOverrides}
                      sizingConfig={sizingConfig}
                      onUpdatePathAssignment={(brand, path, variantId, variantName) =>
                        handleUpdatePathAssignment(brand, path, variantId, variantName)
                      }
                      onUpdateSkuOverride={handleUpdateSkuOverride}
                      onViewChart={handleViewSizeChart}
                      onPrev={handlePrev}
                      onReset={handleResetDemo}
                      onRerunExtraction={() => setJsonExtractionDone(false)}
                      hasExistingSizeChart={hasExistingSizeChart}
                    />
                  )
                )}
              </div>
            </main>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 5: Sync Tab (Dashboard -> Delta Pipeline Stepper & Stages)             */}
        {/* ========================================================================= */}
        {activeTab === 'sync' && (
          <SyncView
            onGoToSetup={() => {
              setActiveTab('setup');
              goToStage(1);
            }}
            onViewSizeChart={handleViewSizeChart}
            onOpenGapModal={handleOpenGapModal}
          />
        )}

        {/* Subtle Footer inside main area */}
        <footer className="w-full border-t border-slate-200 bg-white py-3.5 mt-auto">
          <div className="w-full px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Persona Fit Intelligence</span>
              <span>·</span>
              <span>Store Onboarding Flow Demo</span>
            </div>
            <div>
              <span>Simulated Frontend Environment · No live API credentials required</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Modals rendered at root */}
      <SizeChartModal
        chart={activeSizeChartModal}
        item={activeItemContext}
        isOpen={Boolean(activeSizeChartModal)}
        sizingConfig={sizingConfig}
        brandCharts={brandCharts}
        initialCategory={activeChartInitialCategory}
        initialVariantId={activeChartInitialVariantId}
        isReadOnly={activeChartIsReadOnly}
        onDeleteVariant={handleDeleteVariant}
        onClose={() => {
          setActiveSizeChartModal(null);
          setActiveItemContext(null);
          setActiveChartInitialCategory(undefined);
          setActiveChartInitialVariantId(undefined);
          setActiveChartIsReadOnly(false);
        }}
      />

      <GapFillModal
        item={activeGapModalItem}
        isOpen={Boolean(activeGapModalItem)}
        sizingConfig={sizingConfig}
        onClose={() => setActiveGapModalItem(null)}
        onSave={handleSaveGapItem}
      />
    </div>
  );
}

