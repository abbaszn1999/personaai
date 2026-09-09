import React, { useState, useMemo, type DragEvent } from 'react';
import {
  Layers,
  CheckSquare,
  Square,
  MinusSquare,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Filter,
  Search,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Info,
  ShieldAlert,
  Database,
  Sliders,
  RotateCcw,
  Tag,
  Store,
  Plus,
  X,
  ArrowDown,
  Eye,
  Check,
  HelpCircle,
  FolderTree,
  ListFilter,
  Package,
  GripVertical,
  MoveRight,
  Trash2,
  ArrowRightLeft,
  Sparkle,
  Loader2,
  Pencil,
  FolderPlus,
  CornerDownRight,
  PlusCircle,
  FilePlus,
  Sparkles as SparklesIcon,
} from 'lucide-react';
import {
  CategoryGroupTree,
  LeafCategoryItem,
  StoreConnectionInfo,
  PlatformType,
  ShopifyCollection,
  ParentCategoryType,
} from '../types';
import {
  WOOCOMMERCE_CATEGORY_TREE,
  ALL_LEAF_CATEGORIES,
  DEFAULT_SELECTED_LEAF_IDS,
  SHOPIFY_RAW_COLLECTIONS,
  SAMPLE_SHOPIFY_PRODUCTS,
} from '../data/categoriesData';
import {
  PlpParentCategoryMappingView,
  SelectedPlpItem,
} from './PlpParentCategoryMappingView';
import {
  PARENT_CATEGORIES,
  normalizeToParentCategory,
} from '../utils/sizingStandards';

interface CategoriesScopeViewProps {
  storeConnection: StoreConnectionInfo;
  selectedLeafIds: string[];
  onUpdateSelectedLeafIds: (leafIds: string[]) => void;
  onContinueToSetup: () => void;
  onGoToConnectStore: () => void;
}

// Editable Tree Node Structure for Shopify Custom Hierarchy
export interface ShopifyTreeNode {
  id: string;
  name: string; // Department Collection Title
  collectionId?: string;
  subGroups: {
    id: string;
    name: string; // Subcategory Collection Title
    collectionId?: string;
    leafs: {
      id: string;
      name: string; // Leaf / Product Type Collection Title
      collectionId?: string;
      path: string;
      skuCount: number;
      isShallowWarning?: boolean;
    }[];
  }[];
  hasNoSubcategories?: boolean;
}

export interface CollectionPreviewTarget {
  title: string;
  collectionId?: string;
  level: string;
  path: string;
  skuCount: number;
}

export interface MockCatalogProduct {
  id: string;
  title: string;
  sku: string;
  price: string;
  compareAt?: string;
  imageThumbnail: string;
  imageUrl?: string;
  sizes: string[];
  stock: number;
  collections: string[];
  resolvedPath: string;
}

// Rich mock catalog dataset keyed by collection topic
const MOCK_CATALOG_DATABASE: MockCatalogProduct[] = [
  // Dresses
  {
    id: 'pr-w-dr-01',
    title: 'AeroTech Minimalist Linen Wrap Dress',
    sku: 'AT-DR-1092',
    price: '$88.00',
    compareAt: '$110.00',
    imageThumbnail: '👗',
    imageUrl: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=300&auto=format&fit=crop&q=80',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 46,
    collections: ['Women', 'Dresses', 'Casual Dresses', 'Summer Sale'],
    resolvedPath: 'Women > Dresses > Casual Dresses',
  },
  {
    id: 'pr-w-dr-02',
    title: 'Floral Tiered Bohemian Midi Sundress',
    sku: 'AT-DR-1093',
    price: '$94.00',
    imageThumbnail: '👗',
    imageUrl: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=300&auto=format&fit=crop&q=80',
    sizes: ['S', 'M', 'L'],
    stock: 28,
    collections: ['Women', 'Dresses', 'Casual Dresses', 'Trending Now'],
    resolvedPath: 'Women > Dresses > Casual Dresses',
  },
  {
    id: 'pr-w-dr-03',
    title: 'Velvet Evening Gala Gown with Slit',
    sku: 'AT-DR-2041',
    price: '$185.00',
    compareAt: '$220.00',
    imageThumbnail: '👗',
    imageUrl: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=300&auto=format&fit=crop&q=80',
    sizes: ['0', '2', '4', '6', '8', '10'],
    stock: 14,
    collections: ['Women', 'Dresses', 'Formal Dresses'],
    resolvedPath: 'Women > Dresses > Formal Dresses',
  },
  {
    id: 'pr-w-dr-04',
    title: 'Satin Cowl-Neck Pleated Slip Gown',
    sku: 'AT-DR-2042',
    price: '$148.00',
    imageThumbnail: '👗',
    imageUrl: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=300&auto=format&fit=crop&q=80',
    sizes: ['XS', 'S', 'M', 'L'],
    stock: 19,
    collections: ['Women', 'Dresses', 'Formal Dresses', 'Best Sellers'],
    resolvedPath: 'Women > Dresses > Formal Dresses',
  },
  // Tops
  {
    id: 'pr-m-top-01',
    title: 'Core Heavyweight Crewneck Athletic Tee',
    sku: 'AT-TS-3011',
    price: '$38.00',
    imageThumbnail: '👕',
    imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop&q=80',
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    stock: 120,
    collections: ['Men', 'Tops', 'T-Shirts', 'Best Sellers', 'Under $50'],
    resolvedPath: 'Men > Tops > T-Shirts',
  },
  {
    id: 'pr-m-top-02',
    title: 'Vintage Washed Drop-Shoulder Relaxed Tee',
    sku: 'AT-TS-3012',
    price: '$42.00',
    imageThumbnail: '👕',
    imageUrl: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=300&auto=format&fit=crop&q=80',
    sizes: ['S', 'M', 'L', 'XL'],
    stock: 75,
    collections: ['Men', 'Tops', 'T-Shirts', 'Trending Now'],
    resolvedPath: 'Men > Tops > T-Shirts',
  },
  {
    id: 'pr-w-top-01',
    title: 'Stripe Silk Button-Down Formal Blouse',
    sku: 'AT-BL-4011',
    price: '$112.00',
    compareAt: '$135.00',
    imageThumbnail: '👚',
    imageUrl: 'https://images.unsplash.com/photo-1598554747436-c9293d6a588f?w=300&auto=format&fit=crop&q=80',
    sizes: ['XS', 'S', 'M', 'L'],
    stock: 31,
    collections: ['Women', 'Tops', 'Blouses & Shirts', 'New Arrivals'],
    resolvedPath: 'Women > Tops > Blouses & Shirts',
  },
  {
    id: 'pr-w-top-02',
    title: 'Ruffle Collar Poplin Everyday Blouse',
    sku: 'AT-BL-4012',
    price: '$78.00',
    imageThumbnail: '👚',
    imageUrl: 'https://images.unsplash.com/photo-1564257631407-4deb1f99d992?w=300&auto=format&fit=crop&q=80',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 52,
    collections: ['Women', 'Tops', 'Blouses & Shirts'],
    resolvedPath: 'Women > Tops > Blouses & Shirts',
  },
  // Bottoms
  {
    id: 'pr-m-bot-01',
    title: 'Apex Raw Indigo Selvage Denim Jean',
    sku: 'AT-JN-5011',
    price: '$138.00',
    imageThumbnail: '👖',
    imageUrl: 'https://images.unsplash.com/photo-1542272604-780c96856592?w=300&auto=format&fit=crop&q=80',
    sizes: ['30x32', '32x32', '34x32', '36x34'],
    stock: 44,
    collections: ['Men', 'Bottoms', 'Jeans & Denim', 'Staff Favorites'],
    resolvedPath: 'Men > Bottoms > Jeans & Denim',
  },
  {
    id: 'pr-w-bot-01',
    title: 'High-Rise Straight Leg Vintage Denim',
    sku: 'AT-JN-5012',
    price: '$118.00',
    imageThumbnail: '👖',
    imageUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=300&auto=format&fit=crop&q=80',
    sizes: ['24', '25', '26', '27', '28', '29', '30'],
    stock: 62,
    collections: ['Women', 'Bottoms', 'Jeans & Denim', 'Best Sellers'],
    resolvedPath: 'Women > Bottoms > Jeans & Denim',
  },
  // Footwear
  {
    id: 'pr-u-fw-01',
    title: 'Velocity Prime Cushioned Runner',
    sku: 'AT-SN-6011',
    price: '$145.00',
    compareAt: '$160.00',
    imageThumbnail: '👟',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&auto=format&fit=crop&q=80',
    sizes: ['7', '8', '8.5', '9', '9.5', '10', '11', '12'],
    stock: 88,
    collections: ['Unisex', 'Footwear', 'Sneakers', 'Trending Now'],
    resolvedPath: 'Unisex > Footwear > Sneakers',
  },
  {
    id: 'pr-u-fw-02',
    title: 'Heritage Goodyear Welt Chelsea Boot',
    sku: 'AT-BT-7011',
    price: '$198.00',
    imageThumbnail: '🥾',
    imageUrl: 'https://images.unsplash.com/photo-1638247025967-b4e38f787b76?w=300&auto=format&fit=crop&q=80',
    sizes: ['8', '9', '10', '11', '12'],
    stock: 24,
    collections: ['Unisex', 'Footwear', 'Boots', 'Staff Favorites'],
    resolvedPath: 'Unisex > Footwear > Boots',
  },
];

function getSampleProductsForTarget(target: CollectionPreviewTarget): MockCatalogProduct[] {
  const query = target.title.toLowerCase();
  const path = target.path.toLowerCase();

  // Match directly against collection tags or resolved path
  const matched = MOCK_CATALOG_DATABASE.filter((prod) => {
    const inCols = prod.collections.some((c) =>
      c.toLowerCase().includes(query) || query.includes(c.toLowerCase())
    );
    const inPath =
      prod.resolvedPath.toLowerCase().includes(query) ||
      path.includes(prod.resolvedPath.toLowerCase().split(' > ')[0]);
    return inCols || inPath;
  });

  if (matched.length > 0) return matched;

  // Generic fallback generation based on target
  return [
    {
      id: `gen-${target.title.toLowerCase().replace(/\s+/g, '-')}-01`,
      title: `${target.title} Signature Style No. 1`,
      sku: `SKU-${target.title.substring(0, 3).toUpperCase()}-101`,
      price: '$68.00',
      imageThumbnail: '🏷️',
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      stock: 35,
      collections: [target.title, 'Active Store Item'],
      resolvedPath: target.path,
    },
    {
      id: `gen-${target.title.toLowerCase().replace(/\s+/g, '-')}-02`,
      title: `${target.title} Essential Edition No. 2`,
      sku: `SKU-${target.title.substring(0, 3).toUpperCase()}-102`,
      price: '$84.00',
      imageThumbnail: '🏷️',
      sizes: ['S', 'M', 'L'],
      stock: 22,
      collections: [target.title, 'Trending Now'],
      resolvedPath: target.path,
    },
    {
      id: `gen-${target.title.toLowerCase().replace(/\s+/g, '-')}-03`,
      title: `${target.title} Premium Tailored Piece`,
      sku: `SKU-${target.title.substring(0, 3).toUpperCase()}-103`,
      price: '$110.00',
      imageThumbnail: '🏷️',
      sizes: ['M', 'L', 'XL'],
      stock: 16,
      collections: [target.title, 'New Arrivals'],
      resolvedPath: target.path,
    },
  ];
}

// Preset standard tree if user clicks "Load Standard Apparel Demo"
const STANDARD_SAMPLE_SHOPIFY_TREE: ShopifyTreeNode[] = [
  {
    id: 'sh-node-women',
    name: 'Women',
    collectionId: 'col-women',
    subGroups: [
      {
        id: 'sh-sub-women-dresses',
        name: 'Dresses',
        collectionId: 'col-dresses',
        leafs: [
          {
            id: 'sh-leaf-w-dresses-casual',
            name: 'Casual Dresses',
            collectionId: 'col-casual-dresses',
            path: 'Women > Dresses > Casual Dresses',
            skuCount: 610,
          },
          {
            id: 'sh-leaf-w-dresses-formal',
            name: 'Formal Dresses',
            collectionId: 'col-formal-dresses',
            path: 'Women > Dresses > Formal Dresses',
            skuCount: 280,
          },
        ],
      },
      {
        id: 'sh-sub-women-tops',
        name: 'Tops',
        collectionId: 'col-tops',
        leafs: [
          {
            id: 'sh-leaf-w-tops-tshirts',
            name: 'T-Shirts',
            collectionId: 'col-tshirts',
            path: 'Women > Tops > T-Shirts',
            skuCount: 1420,
          },
          {
            id: 'sh-leaf-w-tops-blouses',
            name: 'Blouses & Shirts',
            collectionId: 'col-blouses',
            path: 'Women > Tops > Blouses & Shirts',
            skuCount: 890,
          },
        ],
      },
      {
        id: 'sh-sub-women-bottoms',
        name: 'Bottoms',
        collectionId: 'col-bottoms',
        leafs: [
          {
            id: 'sh-leaf-w-bottoms-jeans',
            name: 'Jeans & Denim',
            collectionId: 'col-jeans',
            path: 'Women > Bottoms > Jeans & Denim',
            skuCount: 880,
          },
        ],
      },
    ],
  },
  {
    id: 'sh-node-men',
    name: 'Men',
    collectionId: 'col-men',
    subGroups: [
      {
        id: 'sh-sub-men-tops',
        name: 'Tops',
        collectionId: 'col-tops',
        leafs: [
          {
            id: 'sh-leaf-m-tops-tshirts',
            name: 'T-Shirts',
            collectionId: 'col-tshirts',
            path: 'Men > Tops > T-Shirts',
            skuCount: 1650,
          },
        ],
      },
      {
        id: 'sh-sub-men-bottoms',
        name: 'Bottoms',
        collectionId: 'col-bottoms',
        leafs: [
          {
            id: 'sh-leaf-m-bottoms-jeans',
            name: 'Jeans & Denim',
            collectionId: 'col-jeans',
            path: 'Men > Bottoms > Jeans & Denim',
            skuCount: 920,
          },
        ],
      },
    ],
  },
  {
    id: 'sh-node-unisex',
    name: 'Unisex',
    collectionId: 'col-unisex',
    subGroups: [
      {
        id: 'sh-sub-unisex-footwear',
        name: 'Footwear',
        collectionId: 'col-footwear',
        leafs: [
          {
            id: 'sh-leaf-u-footwear-sneakers',
            name: 'Sneakers',
            collectionId: 'col-sneakers',
            path: 'Unisex > Footwear > Sneakers',
            skuCount: 840,
          },
          {
            id: 'sh-leaf-u-footwear-boots',
            name: 'Boots',
            collectionId: 'col-boots',
            path: 'Unisex > Footwear > Boots',
            skuCount: 440,
          },
        ],
      },
    ],
  },
];

export function CategoriesScopeView({
  storeConnection,
  selectedLeafIds,
  onUpdateSelectedLeafIds,
  onContinueToSetup,
  onGoToConnectStore,
}: CategoriesScopeViewProps) {
  // Platform mode: toggleable so user can see both Shopify and WooCommerce experiences
  const [activePlatformMode, setActivePlatformMode] = useState<PlatformType>(
    storeConnection.platform === 'woocommerce' ? 'woocommerce' : 'shopify'
  );

  // --------------------------------------------------------------------------
  // MODE A (WooCommerce) State
  // --------------------------------------------------------------------------
  const [wooSearchQuery, setWooSearchQuery] = useState('');
  const [wooFilterMode, setWooFilterMode] = useState<'all' | 'fit_relevant' | 'selected' | 'warnings'>('all');
  const [collapsedWooGroups, setCollapsedWooGroups] = useState<Record<string, boolean>>({});
  const [collapsedWooSubGroups, setCollapsedWooSubGroups] = useState<Record<string, boolean>>({});

  // --------------------------------------------------------------------------
  // Drag & Drop Hierarchy Tree State
  // Starts completely EMPTY so the user can experience building from scratch
  // --------------------------------------------------------------------------
  const [shopifyTree, setShopifyTree] = useState<ShopifyTreeNode[]>([]);
  const [shopifySelectedLeafIds, setShopifySelectedLeafIds] = useState<string[]>([]);
  const [shopifyCollectionFilter, setShopifyCollectionFilter] = useState<'all' | 'unassigned' | 'assigned'>('all');
  const [shopifyCollectionSearch, setShopifyCollectionSearch] = useState('');
  const [collapsedShopifyGroups, setCollapsedShopifyGroups] = useState<Record<string, boolean>>({});
  const [collapsedShopifySubGroups, setCollapsedShopifySubGroups] = useState<Record<string, boolean>>({});

  // Drag state & AI Classify state & Product Preview state
  const [draggedCollection, setDraggedCollection] = useState<ShopifyCollection | null>(null);
  const [activeDropZone, setActiveDropZone] = useState<string | null>(null);
  const [isAiClassifying, setIsAiClassifying] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<CollectionPreviewTarget | null>(null);
  const [previewSearch, setPreviewSearch] = useState('');

  // Manual Naming & Node Creation State
  const [isAddingDept, setIsAddingDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [addingSubForGroupId, setAddingSubForGroupId] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [addingLeafForSubId, setAddingLeafForSubId] = useState<string | null>(null);
  const [newLeafName, setNewLeafName] = useState('');

  // Inline Node Renaming State
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeText, setEditingNodeText] = useState('');

  // Quick Map Modal State (point-and-click alternative to drag-and-drop)
  const [quickAssignCol, setQuickAssignCol] = useState<ShopifyCollection | null>(null);

  // --------------------------------------------------------------------------
  // Tab 2: 2-Step Workflow (Step 1: Hierarchy Tree Scope -> Step 2: Map PLPs to 5 Parent Categories)
  // --------------------------------------------------------------------------
  const [tabSubStep, setTabSubStep] = useState<'tree_scope' | 'plp_mapping'>('tree_scope');
  const [plpCategoryMappings, setPlpCategoryMappings] = useState<Record<string, ParentCategoryType>>({});

  // ==========================================================================
  // MODE A (WooCommerce) Handlers
  // ==========================================================================
  const toggleWooGroup = (groupId: string) => {
    setCollapsedWooGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const toggleWooSubGroup = (subGroupId: string) => {
    setCollapsedWooSubGroups((prev) => ({ ...prev, [subGroupId]: !prev[subGroupId] }));
  };

  const isWooLeafSelected = (id: string) => selectedLeafIds.includes(id);

  const handleToggleWooLeaf = (id: string) => {
    if (selectedLeafIds.includes(id)) {
      onUpdateSelectedLeafIds(selectedLeafIds.filter((item) => item !== id));
    } else {
      onUpdateSelectedLeafIds([...selectedLeafIds, id]);
    }
  };

  const handleToggleWooSubGroup = (leafs: LeafCategoryItem[]) => {
    const leafIds = leafs.map((l) => l.id);
    const allSelected = leafIds.every((id) => selectedLeafIds.includes(id));

    if (allSelected) {
      onUpdateSelectedLeafIds(selectedLeafIds.filter((id) => !leafIds.includes(id)));
    } else {
      const newIds = Array.from(new Set([...selectedLeafIds, ...leafIds]));
      onUpdateSelectedLeafIds(newIds);
    }
  };

  const handleToggleWooGroup = (group: CategoryGroupTree) => {
    const allGroupLeafs = group.subGroups.flatMap((s) => s.leafs).map((l) => l.id);
    const allSelected = allGroupLeafs.every((id) => selectedLeafIds.includes(id));

    if (allSelected) {
      onUpdateSelectedLeafIds(selectedLeafIds.filter((id) => !allGroupLeafs.includes(id)));
    } else {
      const newIds = Array.from(new Set([...selectedLeafIds, ...allGroupLeafs]));
      onUpdateSelectedLeafIds(newIds);
    }
  };

  const filteredWooTree = useMemo(() => {
    const query = wooSearchQuery.trim().toLowerCase();

    return WOOCOMMERCE_CATEGORY_TREE.map((group) => {
      const filteredSubGroups = group.subGroups
        .map((sub) => {
          const filteredLeafs = sub.leafs.filter((leaf) => {
            if (
              query &&
              !leaf.leafName.toLowerCase().includes(query) &&
              !leaf.path.toLowerCase().includes(query) &&
              !leaf.productTypeSource.toLowerCase().includes(query)
            ) {
              return false;
            }
            if (wooFilterMode === 'fit_relevant' && !leaf.isFitRelevant) return false;
            if (wooFilterMode === 'selected' && !selectedLeafIds.includes(leaf.id)) return false;
            if (wooFilterMode === 'warnings' && !leaf.isShallowWarning) return false;
            return true;
          });

          return { ...sub, leafs: filteredLeafs };
        })
        .filter((sub) => sub.leafs.length > 0);

      return { ...group, subGroups: filteredSubGroups };
    }).filter((group) => group.subGroups.length > 0);
  }, [wooSearchQuery, wooFilterMode, selectedLeafIds]);

  // ==========================================================================
  // MODE B (Shopify) Drag & Drop and Tree Manipulation Handlers
  // ==========================================================================
  
  // Collect all assigned collection IDs in the tree
  const assignedCollectionIds = useMemo(() => {
    const ids = new Set<string>();
    shopifyTree.forEach((group) => {
      if (group.collectionId) ids.add(group.collectionId);
      group.subGroups.forEach((sub) => {
        if (sub.collectionId) ids.add(sub.collectionId);
        sub.leafs.forEach((leaf) => {
          if (leaf.collectionId) ids.add(leaf.collectionId);
        });
      });
    });
    return ids;
  }, [shopifyTree]);

  // Filter raw collections for the left panel
  const filteredShopifyCollections = useMemo(() => {
    const query = shopifyCollectionSearch.trim().toLowerCase();
    return SHOPIFY_RAW_COLLECTIONS.filter((col) => {
      if (query && !col.title.toLowerCase().includes(query) && !col.handle.toLowerCase().includes(query)) {
        return false;
      }
      const isAssigned = assignedCollectionIds.has(col.id);
      if (shopifyCollectionFilter === 'assigned' && !isAssigned) return false;
      if (shopifyCollectionFilter === 'unassigned' && isAssigned) return false;
      return true;
    });
  }, [shopifyCollectionSearch, shopifyCollectionFilter, assignedCollectionIds]);

  // Toggle tree collapse in Shopify mode
  const toggleShopifyGroup = (groupId: string) => {
    setCollapsedShopifyGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const toggleShopifySubGroup = (subGroupId: string) => {
    setCollapsedShopifySubGroups((prev) => ({ ...prev, [subGroupId]: !prev[subGroupId] }));
  };

  // Checkbox handlers in Shopify mode
  const isShopifyLeafSelected = (id: string) => shopifySelectedLeafIds.includes(id);

  const handleToggleShopifyLeaf = (leafId: string) => {
    if (shopifySelectedLeafIds.includes(leafId)) {
      setShopifySelectedLeafIds(shopifySelectedLeafIds.filter((id) => id !== leafId));
    } else {
      setShopifySelectedLeafIds([...shopifySelectedLeafIds, leafId]);
    }
  };

  // Toggle Subcategory (handles both leaf-based subcategories and direct leaf-less subcategories)
  const handleToggleShopifySubGroup = (subGroup: { id: string; leafs: { id: string }[] }) => {
    if (subGroup.leafs.length > 0) {
      const leafIds = subGroup.leafs.map((l) => l.id);
      const allSelected = leafIds.length > 0 && leafIds.every((id) => shopifySelectedLeafIds.includes(id));

      if (allSelected) {
        setShopifySelectedLeafIds(shopifySelectedLeafIds.filter((id) => !leafIds.includes(id)));
      } else {
        setShopifySelectedLeafIds(Array.from(new Set([...shopifySelectedLeafIds, ...leafIds])));
      }
    } else {
      // Subcategory without leaves can be selected / deselected directly!
      if (shopifySelectedLeafIds.includes(subGroup.id)) {
        setShopifySelectedLeafIds(shopifySelectedLeafIds.filter((id) => id !== subGroup.id));
      } else {
        setShopifySelectedLeafIds([...shopifySelectedLeafIds, subGroup.id]);
      }
    }
  };

  const handleToggleShopifyGroup = (group: ShopifyTreeNode) => {
    const allGroupSelectableIds = group.subGroups.flatMap((s) =>
      s.leafs.length > 0 ? s.leafs.map((l) => l.id) : [s.id]
    );
    const allSelected =
      allGroupSelectableIds.length > 0 &&
      allGroupSelectableIds.every((id) => shopifySelectedLeafIds.includes(id));

    if (allSelected) {
      setShopifySelectedLeafIds(shopifySelectedLeafIds.filter((id) => !allGroupSelectableIds.includes(id)));
    } else {
      setShopifySelectedLeafIds(Array.from(new Set([...shopifySelectedLeafIds, ...allGroupSelectableIds])));
    }
  };

  // Drag and Drop Actions
  const handleDragStart = (col: ShopifyCollection) => {
    setDraggedCollection(col);
  };

  const handleDragEnd = () => {
    setDraggedCollection(null);
    setActiveDropZone(null);
  };

  const getDroppedCollection = (e: React.DragEvent): ShopifyCollection | null => {
    if (draggedCollection) return draggedCollection;
    const colId = e.dataTransfer.getData('text/plain');
    if (colId) {
      const found = SHOPIFY_RAW_COLLECTIONS.find((c) => c.id === colId);
      if (found) return found;
    }
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  };

  // Add Collection as Top-Level Category (Level 1)
  const handleDropAsTopCategory = (col: ShopifyCollection) => {
    // Prevent duplicate mapping
    if (assignedCollectionIds.has(col.id)) return;

    const newGroupId = `sh-node-${col.handle}-${Date.now()}`;
    const newGroup: ShopifyTreeNode = {
      id: newGroupId,
      name: col.title,
      collectionId: col.id,
      subGroups: [],
      hasNoSubcategories: true,
    };
    setShopifyTree((prev) => [...prev, newGroup]);
    setActiveDropZone(null);
    setDraggedCollection(null);
  };

  // Add Collection as Subcategory under a Category (Level 2)
  const handleDropAsSubcategory = (groupId: string, col: ShopifyCollection) => {
    // Prevent duplicate mapping
    if (assignedCollectionIds.has(col.id)) return;

    const newSubId = `sh-sub-${groupId}-${col.handle}-${Date.now()}`;
    setShopifyTree((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;
        const newSub = {
          id: newSubId,
          name: col.title,
          collectionId: col.id,
          leafs: [],
        };
        return {
          ...group,
          hasNoSubcategories: false,
          subGroups: [...group.subGroups, newSub],
        };
      })
    );
    // Automatically select the new subcategory
    setShopifySelectedLeafIds((s) => [...s, newSubId]);
    setActiveDropZone(null);
    setDraggedCollection(null);
  };

  // Add Collection as Sub-Subcategory / Leaf under a Subcategory (Level 3)
  const handleDropAsLeaf = (groupId: string, subGroupId: string, col: ShopifyCollection) => {
    // Prevent duplicate mapping
    if (assignedCollectionIds.has(col.id)) return;

    const newLeafId = `sh-leaf-${groupId}-${subGroupId}-${col.handle}-${Date.now()}`;
    setShopifyTree((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          subGroups: group.subGroups.map((sub) => {
            if (sub.id !== subGroupId) return sub;
            const path = `${group.name} > ${sub.name} > ${col.title}`;
            const newLeaf = {
              id: newLeafId,
              name: col.title,
              collectionId: col.id,
              path,
              skuCount: Math.round(col.productCount * 1.2),
            };
            // Replace direct subGroup selection with leaf selection
            setShopifySelectedLeafIds((s) => [...s.filter((id) => id !== subGroupId), newLeafId]);
            return {
              ...sub,
              leafs: [...sub.leafs, newLeaf],
            };
          }),
        };
      })
    );
    setActiveDropZone(null);
    setDraggedCollection(null);
  };

  // Remove elements from the tree (frees the collection to be remapped)
  const handleRemoveTopGroup = (groupId: string) => {
    setShopifyTree((prev) => prev.filter((g) => g.id !== groupId));
  };

  const handleRemoveSubGroup = (groupId: string, subGroupId: string) => {
    setShopifyTree((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const updatedSubs = g.subGroups.filter((s) => s.id !== subGroupId);
        return {
          ...g,
          subGroups: updatedSubs,
          hasNoSubcategories: updatedSubs.length === 0,
        };
      })
    );
    setShopifySelectedLeafIds((prev) => prev.filter((id) => id !== subGroupId));
  };

  const handleRemoveLeaf = (groupId: string, subGroupId: string, leafId: string) => {
    setShopifyTree((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          subGroups: g.subGroups.map((s) => {
            if (s.id !== subGroupId) return s;
            return {
              ...s,
              leafs: s.leafs.filter((l) => l.id !== leafId),
            };
          }),
        };
      })
    );
    setShopifySelectedLeafIds((prev) => prev.filter((id) => id !== leafId));
  };

  // Manual Category / Department Creation
  const handleCreateCustomDepartment = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newGroupId = `sh-dept-custom-${Date.now()}`;
    const newGroup: ShopifyTreeNode = {
      id: newGroupId,
      name: trimmed,
      subGroups: [],
      hasNoSubcategories: true,
    };
    setShopifyTree((prev) => [...prev, newGroup]);
    setNewDeptName('');
    setIsAddingDept(false);
  };

  // Manual Subcategory Creation under a Department
  const handleCreateCustomSubCategory = (groupId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newSubId = `sh-sub-custom-${groupId}-${Date.now()}`;
    setShopifyTree((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const newSub = {
          id: newSubId,
          name: trimmed,
          leafs: [],
        };
        return {
          ...g,
          hasNoSubcategories: false,
          subGroups: [...g.subGroups, newSub],
        };
      })
    );
    // Auto-select the newly created subcategory
    setShopifySelectedLeafIds((prev) => [...prev, newSubId]);
    setNewSubName('');
    setAddingSubForGroupId(null);
  };

  // Manual Leaf Creation under a Subcategory
  const handleCreateCustomLeaf = (groupId: string, subGroupId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newLeafId = `sh-leaf-custom-${groupId}-${subGroupId}-${Date.now()}`;
    setShopifyTree((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          subGroups: g.subGroups.map((sub) => {
            if (sub.id !== subGroupId) return sub;
            const path = `${g.name} > ${sub.name} > ${trimmed}`;
            const newLeaf = {
              id: newLeafId,
              name: trimmed,
              path,
              skuCount: 180,
            };
            return {
              ...sub,
              leafs: [...sub.leafs, newLeaf],
            };
          }),
        };
      })
    );
    // Auto-select the newly created leaf and remove subGroup id if present
    setShopifySelectedLeafIds((prev) => [...prev.filter((id) => id !== subGroupId), newLeafId]);
    setNewLeafName('');
    setAddingLeafForSubId(null);
  };

  // Start Renaming a Node
  const handleStartRename = (id: string, currentName: string) => {
    setEditingNodeId(id);
    setEditingNodeText(currentName);
  };

  // Save Renamed Node and dynamically recalculate paths
  const handleSaveRename = (targetId: string) => {
    const trimmed = editingNodeText.trim();
    if (!trimmed) {
      setEditingNodeId(null);
      return;
    }

    setShopifyTree((prev) =>
      prev.map((group) => {
        // Renaming Group (Department)
        if (group.id === targetId) {
          return {
            ...group,
            name: trimmed,
            subGroups: group.subGroups.map((sub) => ({
              ...sub,
              leafs: sub.leafs.map((l) => ({
                ...l,
                path: `${trimmed} > ${sub.name} > ${l.name}`,
              })),
            })),
          };
        }

        // Renaming Subgroup or Leaf inside this group
        return {
          ...group,
          subGroups: group.subGroups.map((sub) => {
            if (sub.id === targetId) {
              return {
                ...sub,
                name: trimmed,
                leafs: sub.leafs.map((l) => ({
                  ...l,
                  path: `${group.name} > ${trimmed} > ${l.name}`,
                })),
              };
            }

            // Renaming Leaf
            return {
              ...sub,
              leafs: sub.leafs.map((l) => {
                if (l.id === targetId) {
                  return {
                    ...l,
                    name: trimmed,
                    path: `${group.name} > ${sub.name} > ${trimmed}`,
                  };
                }
                return l;
              }),
            };
          }),
        };
      })
    );
    setEditingNodeId(null);
  };

  // Quick Map Collection without Drag & Drop
  const handleQuickAssign = (
    col: ShopifyCollection,
    target: { type: 'new_dept' } | { type: 'sub'; groupId: string } | { type: 'leaf'; groupId: string; subGroupId: string }
  ) => {
    if (target.type === 'new_dept') {
      handleDropAsTopCategory(col);
    } else if (target.type === 'sub') {
      handleDropAsSubcategory(target.groupId, col);
    } else if (target.type === 'leaf') {
      handleDropAsLeaf(target.groupId, target.subGroupId, col);
    }
    setQuickAssignCol(null);
  };

  // AI Auto-Classification Engine: builds optimal 3-tier hierarchy automatically
  const handleAiClassifyTree = () => {
    setIsAiClassifying(true);
    setTimeout(() => {
      setShopifyTree(STANDARD_SAMPLE_SHOPIFY_TREE);
      setShopifySelectedLeafIds([
        'sh-leaf-w-dresses-casual',
        'sh-leaf-w-dresses-formal',
        'sh-leaf-w-tops-tshirts',
        'sh-leaf-w-tops-blouses',
        'sh-leaf-w-bottoms-jeans',
        'sh-leaf-m-tops-tshirts',
        'sh-leaf-m-bottoms-jeans',
        'sh-leaf-u-footwear-sneakers',
        'sh-leaf-u-footwear-boots',
      ]);
      setIsAiClassifying(false);
    }, 600);
  };

  // Clear tree to empty canvas
  const handleClearShopifyTree = () => {
    setShopifyTree([]);
    setShopifySelectedLeafIds([]);
  };

  // Calculate Metrics
  const allShopifyTreeLeafs = useMemo(() => {
    return shopifyTree.flatMap((g) => g.subGroups.flatMap((s) => s.leafs));
  }, [shopifyTree]);

  const effectiveSelectedCount =
    activePlatformMode === 'woocommerce'
      ? selectedLeafIds.length
      : shopifySelectedLeafIds.length;

  const totalCalculatedScopedSkus = useMemo(() => {
    if (activePlatformMode === 'woocommerce') {
      return ALL_LEAF_CATEGORIES.filter((c) => selectedLeafIds.includes(c.id)).reduce(
        (acc, c) => acc + c.skuCount,
        0
      );
    } else {
      let total = 0;
      shopifyTree.forEach((group) => {
        group.subGroups.forEach((sub) => {
          if (sub.leafs.length > 0) {
            sub.leafs.forEach((leaf) => {
              if (shopifySelectedLeafIds.includes(leaf.id)) {
                total += leaf.skuCount;
              }
            });
          } else {
            // Direct subcategory selection (no leaves)
            if (shopifySelectedLeafIds.includes(sub.id)) {
              const rawCol = SHOPIFY_RAW_COLLECTIONS.find((c) => c.id === sub.collectionId);
              total += rawCol ? rawCol.productCount : 450;
            }
          }
        });
      });
      return total;
    }
  }, [activePlatformMode, selectedLeafIds, shopifySelectedLeafIds, shopifyTree]);

  const unassignedCount = SHOPIFY_RAW_COLLECTIONS.filter((c) => !assignedCollectionIds.has(c.id)).length;

  // Selected PLP Items computed for Step 2 Mapping
  const selectedPlpItems = useMemo((): SelectedPlpItem[] => {
    if (activePlatformMode === 'woocommerce') {
      return ALL_LEAF_CATEGORIES
        .filter((leaf) => selectedLeafIds.includes(leaf.id))
        .map((leaf) => {
          const mapped = plpCategoryMappings[leaf.id] || normalizeToParentCategory(leaf.path);
          return {
            id: leaf.id,
            path: leaf.path,
            title: leaf.leafName,
            parentGroup: leaf.parentGroup,
            subGroup: leaf.subGroup,
            skuCount: leaf.skuCount,
            sourceType: 'woocommerce',
            collectionOrCategorySource: leaf.productTypeSource,
            parentCategory: mapped,
            aiConfidence: 98,
          };
        });
    } else {
      const items: SelectedPlpItem[] = [];
      shopifyTree.forEach((group) => {
        group.subGroups.forEach((sub) => {
          if (sub.leafs.length > 0) {
            sub.leafs.forEach((leaf) => {
              if (shopifySelectedLeafIds.includes(leaf.id)) {
                const mapped = plpCategoryMappings[leaf.id] || normalizeToParentCategory(leaf.path);
                items.push({
                  id: leaf.id,
                  path: leaf.path,
                  title: leaf.name,
                  parentGroup: group.name,
                  subGroup: sub.name,
                  skuCount: leaf.skuCount,
                  sourceType: 'shopify',
                  collectionOrCategorySource: `Shopify Collection: ${leaf.name}`,
                  parentCategory: mapped,
                  aiConfidence: 96,
                });
              }
            });
          } else {
            if (shopifySelectedLeafIds.includes(sub.id)) {
              const path = `${group.name} > ${sub.name}`;
              const mapped = plpCategoryMappings[sub.id] || normalizeToParentCategory(path);
              const rawCol = SHOPIFY_RAW_COLLECTIONS.find((c) => c.id === sub.collectionId);
              items.push({
                id: sub.id,
                path,
                title: sub.name,
                parentGroup: group.name,
                subGroup: sub.name,
                skuCount: rawCol ? rawCol.productCount : 450,
                sourceType: 'shopify',
                collectionOrCategorySource: `Shopify Collection: ${sub.name}`,
                parentCategory: mapped,
                aiConfidence: 95,
              });
            }
          }
        });
      });
      return items;
    }
  }, [activePlatformMode, selectedLeafIds, shopifySelectedLeafIds, shopifyTree, plpCategoryMappings]);

  // Handler to update a single PLP category mapping
  const handleUpdatePlpCategory = (plpId: string, parentCategory: ParentCategoryType) => {
    setPlpCategoryMappings((prev) => ({
      ...prev,
      [plpId]: parentCategory,
    }));
  };

  // Handler to batch update multiple PLPs
  const handleBatchUpdatePlpCategory = (plpIds: string[], parentCategory: ParentCategoryType) => {
    setPlpCategoryMappings((prev) => {
      const updated = { ...prev };
      plpIds.forEach((id) => {
        updated[id] = parentCategory;
      });
      return updated;
    });
  };

  // Handler to auto-map all selected PLPs with AI
  const handleAutoMapAllWithAi = () => {
    setPlpCategoryMappings((prev) => {
      const updated = { ...prev };
      selectedPlpItems.forEach((plp) => {
        updated[plp.id] = normalizeToParentCategory(plp.path);
      });
      return updated;
    });
  };

  // --------------------------------------------------------------------------
  // STEP 2 VIEW: PLP Parent Category Mapping
  // --------------------------------------------------------------------------
  if (tabSubStep === 'plp_mapping') {
    return (
      <div className="max-w-7xl mx-auto pb-12">
        <PlpParentCategoryMappingView
          platform={activePlatformMode}
          selectedPlps={selectedPlpItems}
          onUpdatePlpCategory={handleUpdatePlpCategory}
          onBatchUpdateCategory={handleBatchUpdatePlpCategory}
          onAutoMapAllWithAi={handleAutoMapAllWithAi}
          onBackToTree={() => {
            setTabSubStep('tree_scope');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onConfirmAndContinue={onContinueToSetup}
        />
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // STEP 1 VIEW: Hierarchy Tree & Scope Selection (Shopify or WooCommerce)
  // --------------------------------------------------------------------------
  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-12">
      {/* 2-Step Progress Stepper Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Step 1 Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-purple-100 text-purple-900 border border-purple-200">
              <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse"></span>
              <span>Step 1: Build Tree &amp; Select PLP Scope</span>
            </div>

            <span className="text-slate-300 font-bold">&rarr;</span>

            {/* Step 2 Badge */}
            <button
              type="button"
              onClick={() => {
                if (effectiveSelectedCount > 0) {
                  setTabSubStep('plp_mapping');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              disabled={effectiveSelectedCount === 0}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                effectiveSelectedCount > 0
                  ? 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200 cursor-pointer'
                  : 'bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed'
              }`}
            >
              <span>Step 2: Map to 5 Parent Categories</span>
              {effectiveSelectedCount > 0 && (
                <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-mono">
                  {effectiveSelectedCount} Ready
                </span>
              )}
            </button>
          </div>

          {/* Platform Mode Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActivePlatformMode('shopify')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activePlatformMode === 'shopify'
                  ? 'bg-white text-purple-950 shadow-2xs border border-purple-200/90'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Store className="w-3.5 h-3.5 text-emerald-600" />
              <span>Shopify</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePlatformMode('woocommerce')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activePlatformMode === 'woocommerce'
                  ? 'bg-white text-purple-950 shadow-2xs border border-purple-200/90'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5 text-purple-600" />
              <span>WooCommerce</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-600">
          {activePlatformMode === 'shopify'
            ? 'Build your 3-tier sizing tree by dragging collections from the catalog bank, or auto-classify with AI. Select the collections you want to size, then click "Continue to Map PLPs".'
            : 'Select the categories and subcategories in your WooCommerce store to be mapped into the 5 standard parent sizing categories.'}
        </p>
      </div>

      {/* ===================================================================== */}
      {/* MODE A: WORDPRESS / WOOCOMMERCE REAL HIERARCHY TREE VIEW              */}
      {/* ===================================================================== */}
      {activePlatformMode === 'woocommerce' && (
        <div className="space-y-4">
          {/* Controls Bar: Search & Quick Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={wooSearchQuery}
                onChange={(e) => setWooSearchQuery(e.target.value)}
                placeholder="Filter categories (e.g., T-Shirts, Dresses, Jeans)..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white transition-all text-slate-800"
              />
              {wooSearchQuery && (
                <button
                  type="button"
                  onClick={() => setWooSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
              <button
                type="button"
                onClick={() => onUpdateSelectedLeafIds(DEFAULT_SELECTED_LEAF_IDS)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-900 hover:bg-purple-100 border border-purple-200/80 transition-all cursor-pointer"
              >
                Select Apparel &amp; Footwear
              </button>
              <button
                type="button"
                onClick={() => onUpdateSelectedLeafIds(ALL_LEAF_CATEGORIES.map((c) => c.id))}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => onUpdateSelectedLeafIds([])}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Tree Structure */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs divide-y divide-slate-100 overflow-hidden">
            {filteredWooTree.map((group) => {
              const isGroupCollapsed = !!collapsedWooGroups[group.id];
              const allGroupLeafs = group.subGroups.flatMap((s) => s.leafs);
              const groupLeafIds = allGroupLeafs.map((l) => l.id);
              const selectedInGroup = groupLeafIds.filter((id) => selectedLeafIds.includes(id)).length;
              const allGroupSelected = groupLeafIds.length > 0 && selectedInGroup === groupLeafIds.length;
              const someGroupSelected = selectedInGroup > 0 && selectedInGroup < groupLeafIds.length;

              return (
                <div key={group.id} className="transition-colors">
                  {/* Top-Level Category Node (e.g. ▾ Women) */}
                  <div className="px-4 py-3 bg-slate-50/70 flex items-center justify-between select-none">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => toggleWooGroup(group.id)}
                        className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
                        title={isGroupCollapsed ? 'Expand Group' : 'Collapse Group'}
                      >
                        {isGroupCollapsed ? (
                          <ChevronRight className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleWooGroup(group)}
                        className="flex items-center gap-2 cursor-pointer group text-left min-w-0"
                      >
                        <div className="text-purple-700">
                          {allGroupSelected ? (
                            <CheckSquare className="w-4 h-4 text-purple-700" />
                          ) : someGroupSelected ? (
                            <MinusSquare className="w-4 h-4 text-purple-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="text-sm font-bold text-slate-900 group-hover:text-purple-950">
                            {group.name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100/90 px-1.5 py-0.5 rounded border border-slate-200/60 font-normal">
                            Path: {group.name}
                          </span>
                        </div>
                      </button>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-semibold text-slate-500">
                        {selectedInGroup} / {groupLeafIds.length} Leafs Selected
                      </span>
                      <span className="text-xs font-mono font-medium text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded">
                        {allGroupLeafs.reduce((acc, l) => acc + l.skuCount, 0).toLocaleString()} SKUs
                      </span>
                    </div>
                  </div>

                  {/* Flat / Shallow Hierarchy Warning if branch has no real subcategories */}
                  {group.hasNoSubcategories && (
                    <div className="mx-6 my-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200/90 text-amber-900 flex items-center gap-2.5 text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="font-medium">
                        {group.flatWarning ||
                          'This category has no subcategories. Fit accuracy will be limited without more specific categorization.'}
                      </span>
                    </div>
                  )}

                  {/* Subgroups & Leaf Nodes */}
                  {!isGroupCollapsed && (
                    <div className="pl-6 pr-4 py-2 space-y-3 bg-white">
                      {group.subGroups.map((subGroup) => {
                        const isSubCollapsed = !!collapsedWooSubGroups[subGroup.id];
                        const subLeafIds = subGroup.leafs.map((l) => l.id);
                        const selectedInSub = subLeafIds.filter((id) => selectedLeafIds.includes(id)).length;
                        const allSubSelected = subLeafIds.length > 0 && selectedInSub === subLeafIds.length;
                        const someSubSelected = selectedInSub > 0 && selectedInSub < subLeafIds.length;

                        return (
                          <div key={subGroup.id} className="border-l-2 border-slate-200 pl-3 py-1 space-y-2">
                            {/* Mid-Level Subcategory Header (e.g. ▾ Tops) */}
                            <div className="flex items-center justify-between select-none">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleWooSubGroup(subGroup.id)}
                                  className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                                >
                                  {isSubCollapsed ? (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleWooSubGroup(subGroup.leafs)}
                                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-purple-900 cursor-pointer"
                                >
                                  {allSubSelected ? (
                                    <CheckSquare className="w-3.5 h-3.5 text-purple-700" />
                                  ) : someSubSelected ? (
                                    <MinusSquare className="w-3.5 h-3.5 text-purple-600" />
                                  ) : (
                                    <Square className="w-3.5 h-3.5 text-slate-300" />
                                  )}
                                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                    <span>{subGroup.name}</span>
                                    <span className="text-[10px] font-mono font-normal text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">
                                      Path: {group.name} &gt; {subGroup.name}
                                    </span>
                                  </div>
                                </button>
                              </div>

                              <span className="text-[11px] text-slate-400">
                                {selectedInSub}/{subLeafIds.length} leaves
                              </span>
                            </div>

                            {/* Leaf Level Nodes (Checkboxes at leaf level only are selectable) */}
                            {!isSubCollapsed && (
                              <div className="pl-6 space-y-1.5 pt-1">
                                {subGroup.leafs.map((leaf) => {
                                  const selected = isWooLeafSelected(leaf.id);
                                  return (
                                    <div
                                      key={leaf.id}
                                      onClick={() => handleToggleWooLeaf(leaf.id)}
                                      className={`flex items-center justify-between p-2 rounded-xl text-xs transition-all cursor-pointer border ${
                                        selected
                                          ? 'bg-purple-50/80 border-purple-200 text-purple-950 font-semibold'
                                          : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-700'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="shrink-0 text-purple-700">
                                          {selected ? (
                                            <CheckSquare className="w-4 h-4 text-purple-700" />
                                          ) : (
                                            <Square className="w-4 h-4 text-slate-300" />
                                          )}
                                        </div>
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="truncate">{leaf.leafName}</span>
                                            {leaf.isShallowWarning && (
                                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" /> Flat
                                              </span>
                                            )}
                                          </div>
                                          <span className="text-[10px] text-slate-400 block truncate font-mono">
                                            Path: {leaf.path}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-[11px] font-mono text-slate-500">
                                          {leaf.skuCount.toLocaleString()} SKUs
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODE B: SHOPIFY DRAG & DROP HIERARCHY TREE (CLEAN MAPPING VIEW)       */}
      {/* ===================================================================== */}
      {activePlatformMode === 'shopify' && (
        <div className="space-y-3">
          {/* TWO-PANEL SPLIT: LEFT (COLLECTIONS BANK) + RIGHT (TREE CANVAS) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* --------------------------------------------------------------- */}
            {/* LEFT PANEL: ALL SHOPIFY RAW COLLECTIONS BANK                   */}
            {/* --------------------------------------------------------------- */}
            <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 space-y-3 sticky top-20">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-700" />
                  <span className="text-xs font-bold text-slate-900">
                    Collections Bank ({SHOPIFY_RAW_COLLECTIONS.length})
                  </span>
                </div>
                {unassignedCount > 0 ? (
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    {unassignedCount} Unassigned
                  </span>
                ) : (
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                    All Mapped
                  </span>
                )}
              </div>

              {/* Filter Tabs & Search */}
              <div className="space-y-2">
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setShopifyCollectionFilter('all')}
                    className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                      shopifyCollectionFilter === 'all'
                        ? 'bg-white text-purple-950 shadow-2xs font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    All ({SHOPIFY_RAW_COLLECTIONS.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setShopifyCollectionFilter('unassigned')}
                    className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                      shopifyCollectionFilter === 'unassigned'
                        ? 'bg-white text-amber-900 shadow-2xs font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Unassigned ({unassignedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setShopifyCollectionFilter('assigned')}
                    className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                      shopifyCollectionFilter === 'assigned'
                        ? 'bg-white text-emerald-900 shadow-2xs font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    In Tree ({assignedCollectionIds.size})
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={shopifyCollectionSearch}
                    onChange={(e) => setShopifyCollectionSearch(e.target.value)}
                    placeholder="Search collections..."
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white text-slate-800 transition-all"
                  />
                  {shopifyCollectionSearch && (
                    <button
                      type="button"
                      onClick={() => setShopifyCollectionSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Collections Drag & Drop List */}
              <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                {filteredShopifyCollections.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No collections match your filter
                  </div>
                ) : (
                  filteredShopifyCollections.map((col) => {
                    const isAssigned = assignedCollectionIds.has(col.id);

                    return (
                      <div
                        key={col.id}
                        draggable={!isAssigned}
                        onDragStart={(e) => {
                          if (!isAssigned) {
                            handleDragStart(col);
                            e.dataTransfer.setData('text/plain', col.id);
                            e.dataTransfer.setData('application/json', JSON.stringify(col));
                            e.dataTransfer.effectAllowed = 'copyMove';
                          }
                        }}
                        onDragEnd={handleDragEnd}
                        className={`p-2.5 rounded-xl border text-xs transition-all select-none ${
                          draggedCollection?.id === col.id
                            ? 'opacity-40 border-purple-500 ring-2 ring-purple-300 scale-95'
                            : isAssigned
                            ? 'bg-slate-50/80 border-slate-200 text-slate-500 cursor-default opacity-85'
                            : col.isMarketingTag
                            ? 'bg-amber-50/40 border-amber-200/70 text-amber-950 cursor-grab active:cursor-grabbing hover:shadow-2xs'
                            : 'bg-white hover:bg-slate-50 border-slate-200/90 text-slate-800 shadow-2xs cursor-grab active:cursor-grabbing'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`p-1 rounded ${
                                isAssigned
                                  ? 'bg-slate-100 text-slate-400'
                                  : 'bg-purple-50 text-purple-600'
                              } shrink-0`}
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-xs text-slate-900 truncate">
                                  {col.title}
                                </span>
                                {col.isMarketingTag && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                    Promo Tag
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                {col.productCount.toLocaleString()} products
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1.5">
                            {/* Preview Eye Button on Collection Card */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewTarget({
                                  title: col.title,
                                  collectionId: col.id,
                                  level: 'Shopify Collection',
                                  path: col.title,
                                  skuCount: col.productCount,
                                });
                              }}
                              className="p-1 rounded-md text-slate-400 hover:text-purple-700 hover:bg-purple-100/70 transition-colors cursor-pointer"
                              title={`Preview live products in "${col.title}"`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {isAssigned ? (
                              <span
                                className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md"
                                title="Already mapped in tree. Remove from tree to remap."
                              >
                                <Check className="w-2.5 h-2.5" /> In Tree
                              </span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setQuickAssignCol(col)}
                                  className="text-[10px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded-md border border-purple-200/80 transition-colors cursor-pointer flex items-center gap-1"
                                  title="Quick Assign to Hierarchy"
                                >
                                  <FolderPlus className="w-3 h-3" /> Map
                                </button>
                                <span className="text-[9px] text-slate-400 hidden sm:inline">
                                  or Drag &rarr;
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* --------------------------------------------------------------- */}
            {/* RIGHT PANEL: CLEAN HIERARCHY TREE CANVAS                        */}
            {/* --------------------------------------------------------------- */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                if (activeDropZone !== 'root-outside') {
                  setActiveDropZone('root-outside');
                }
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) {
                  setActiveDropZone(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const col = getDroppedCollection(e);
                if (col) {
                  handleDropAsTopCategory(col);
                  setActiveDropZone(null);
                }
              }}
              className={`lg:col-span-8 space-y-3 min-h-[450px] transition-all rounded-3xl p-1 ${
                activeDropZone === 'root-outside' && draggedCollection
                  ? 'ring-2 ring-purple-400 bg-purple-50/30'
                  : ''
              }`}
            >
              {/* Controls Bar: Search & Quick Selection & AI Classification & Manual Creator */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <FolderTree className="w-4 h-4 text-purple-700" />
                  <span className="text-xs font-bold text-slate-800">
                    Hierarchy Tree:
                  </span>
                  <span className="text-xs font-semibold text-purple-900 bg-purple-100/90 px-2 py-0.5 rounded-md">
                    {shopifyTree.length} Categories &bull; {shopifySelectedLeafIds.length} of {allShopifyTreeLeafs.length} Leaves Selected
                  </span>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                  {/* Manual Add Category Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingDept(!isAddingDept);
                      setNewDeptName('');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                      isAddingDept
                        ? 'bg-purple-100 text-purple-900 border-purple-300'
                        : 'bg-slate-50 text-slate-700 hover:bg-purple-50 hover:text-purple-900 border-slate-200'
                    }`}
                    title="Manually create a new top-level category"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-purple-600" />
                    <span>+ New Category</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAiClassifyTree}
                    disabled={isAiClassifying}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-2xs shadow-purple-600/20 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-75"
                    title="Automatically classify store collections into Categories, Subcategories, and Leaves"
                  >
                    {isAiClassifying ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>AI Classifying...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>AI Auto-Classify</span>
                      </>
                    )}
                  </button>

                  {shopifyTree.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShopifySelectedLeafIds(allShopifyTreeLeafs.map((l) => l.id))}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setShopifySelectedLeafIds([])}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer"
                      >
                        Deselect All
                      </button>
                      <button
                        type="button"
                        onClick={handleClearShopifyTree}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Inline Manual Category Creator Bar */}
              {isAddingDept && (
                <div className="p-3 bg-purple-50/90 rounded-2xl border border-purple-200 shadow-2xs flex flex-col sm:flex-row items-center gap-2 animate-in fade-in duration-150">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-950 shrink-0">
                    <FolderPlus className="w-4 h-4 text-purple-700" />
                    <span>Create Custom Category:</span>
                  </div>
                  <input
                    type="text"
                    autoFocus
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateCustomDepartment(newDeptName);
                      if (e.key === 'Escape') setIsAddingDept(false);
                    }}
                    placeholder="e.g., Men, Women, Kids, Accessories, Footwear..."
                    className="flex-1 w-full px-3 py-1.5 text-xs bg-white border border-purple-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 text-slate-900 font-semibold"
                  />
                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCreateCustomDepartment(newDeptName)}
                      disabled={!newDeptName.trim()}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      + Create Category
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingDept(false)}
                      className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-purple-100 text-xs font-medium rounded-xl transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Main Hierarchy Tree Container */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs divide-y divide-slate-100 overflow-hidden">
                {shopifyTree.length === 0 ? (
                  /* Clean Minimalist Empty State */
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                      setActiveDropZone('root-outside');
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDragLeave={() => setActiveDropZone(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const col = getDroppedCollection(e);
                      if (col) handleDropAsTopCategory(col);
                    }}
                    className={`p-10 text-center rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center space-y-3 m-4 ${
                      activeDropZone === 'root-outside'
                        ? 'border-purple-600 bg-purple-100/90 ring-4 ring-purple-200'
                        : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
                      <FolderTree className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">Hierarchy Canvas is Ready</p>
                      <p className="text-xs text-slate-400 max-w-sm mt-0.5">
                        Build your custom category hierarchy by dragging collections or adding manually:
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-center pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddingDept(true)}
                        className="px-3.5 py-1.5 rounded-xl bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100 font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-purple-700" />
                        + Add Custom Category
                      </button>
                      <button
                        type="button"
                        onClick={handleAiClassifyTree}
                        className="px-3.5 py-1.5 rounded-xl bg-purple-600 text-white hover:bg-purple-700 font-bold text-xs shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        AI Auto-Classify Store
                      </button>
                    </div>
                  </div>
                ) : (
                  shopifyTree.map((group) => {
                    const isGroupCollapsed = !!collapsedShopifyGroups[group.id];
                    const allGroupLeafs = group.subGroups.flatMap((s) => s.leafs);
                    const groupSelectableIds = group.subGroups.flatMap((s) =>
                      s.leafs.length > 0 ? s.leafs.map((l) => l.id) : [s.id]
                    );
                    const selectedInGroup = groupSelectableIds.filter((id) =>
                      shopifySelectedLeafIds.includes(id)
                    ).length;
                    const allGroupSelected =
                      groupSelectableIds.length > 0 && selectedInGroup === groupSelectableIds.length;
                    const someGroupSelected =
                      selectedInGroup > 0 && selectedInGroup < groupSelectableIds.length;
                    const totalDeptSkus = group.subGroups.reduce((acc, sub) => {
                      if (sub.leafs.length > 0) {
                        return acc + sub.leafs.reduce((lAcc, l) => lAcc + l.skuCount, 0);
                      }
                      const rawCol = SHOPIFY_RAW_COLLECTIONS.find((c) => c.id === sub.collectionId);
                      return acc + (rawCol ? rawCol.productCount : 450);
                    }, 0) || (allGroupLeafs.reduce((acc, l) => acc + l.skuCount, 0) || 1200);

                    const isEditingThisGroup = editingNodeId === group.id;
                    const isDeptDropActive = activeDropZone === `dept-${group.id}`;

                    return (
                      <div key={group.id} className="transition-colors">
                        {/* Top-Level Category Node Header (Single Unified Drop Target) */}
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'copy';
                            setActiveDropZone(`dept-${group.id}`);
                          }}
                          onDragEnter={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'copy';
                          }}
                          onDragLeave={(e) => {
                            e.stopPropagation();
                            setActiveDropZone(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const col = getDroppedCollection(e);
                            if (col) handleDropAsSubcategory(group.id, col);
                          }}
                          className={`px-4 py-3 border-b border-slate-100 flex items-center justify-between select-none transition-all ${
                            isDeptDropActive
                              ? 'bg-purple-100/95 border-purple-500 ring-2 ring-purple-400'
                              : 'bg-slate-50/90'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => toggleShopifyGroup(group.id)}
                              className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors cursor-pointer shrink-0"
                              title={isGroupCollapsed ? 'Expand Category' : 'Collapse Category'}
                            >
                              {isGroupCollapsed ? (
                                <ChevronRight className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleShopifyGroup(group)}
                              className="text-purple-700 cursor-pointer shrink-0"
                            >
                              {allGroupSelected ? (
                                <CheckSquare className="w-4 h-4 text-purple-700" />
                              ) : someGroupSelected ? (
                                <MinusSquare className="w-4 h-4 text-purple-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 hover:text-slate-400" />
                              )}
                            </button>

                            {isEditingThisGroup ? (
                              <div className="flex items-center gap-1.5 flex-1 max-w-sm">
                                <input
                                  type="text"
                                  autoFocus
                                  value={editingNodeText}
                                  onChange={(e) => setEditingNodeText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveRename(group.id);
                                    if (e.key === 'Escape') setEditingNodeId(null);
                                  }}
                                  className="px-2 py-0.5 text-xs font-bold bg-white border border-purple-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-slate-900 w-full"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveRename(group.id)}
                                  className="p-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 cursor-pointer"
                                  title="Save Name"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingNodeId(null)}
                                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span
                                  onDoubleClick={() => handleStartRename(group.id, group.name)}
                                  className="text-sm font-bold text-slate-900 hover:text-purple-950 cursor-pointer"
                                  title="Double-click to rename"
                                >
                                  {group.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleStartRename(group.id, group.name)}
                                  className="p-1 text-slate-400 hover:text-purple-700 hover:bg-purple-100 rounded transition-colors cursor-pointer"
                                  title="Rename category"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <span className="px-2 py-0.2 rounded text-[9px] font-extrabold uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-200/80">
                                  Category
                                </span>
                                {isDeptDropActive && draggedCollection ? (
                                  <span className="text-[10px] font-bold text-purple-950 bg-purple-200/90 px-2 py-0.5 rounded border border-purple-400 animate-pulse">
                                    📥 Release to add "{draggedCollection.title}" as Subcategory
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono text-purple-700/80 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200/60 font-normal">
                                    Path: {group.name}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            {/* + Subcategory button on category */}
                            <button
                              type="button"
                              onClick={() => {
                                setAddingSubForGroupId(
                                  addingSubForGroupId === group.id ? null : group.id
                                );
                                setNewSubName('');
                              }}
                              className="px-2 py-1 rounded-lg text-purple-700 hover:bg-purple-100/90 border border-purple-200 transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
                              title={`Add custom subcategory under ${group.name}`}
                            >
                              <Plus className="w-3 h-3 text-purple-700" />
                              <span className="hidden sm:inline">+ Subcategory</span>
                            </button>

                            {/* Product Preview Eye Button on Category */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewTarget({
                                  title: group.name,
                                  collectionId: group.collectionId,
                                  level: 'Category (Level 1)',
                                  path: group.name,
                                  skuCount: totalDeptSkus,
                                });
                              }}
                              className="px-2 py-1 rounded-lg text-slate-600 hover:text-purple-800 hover:bg-purple-100/80 border border-slate-200/80 hover:border-purple-300 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                              title={`Preview live products in ${group.name}`}
                            >
                              <Eye className="w-3.5 h-3.5 text-purple-600" />
                              <span className="hidden md:inline">Preview</span>
                            </button>

                            <span className="text-xs font-semibold text-slate-500 hidden sm:inline">
                              {selectedInGroup} / {groupSelectableIds.length} Selected
                            </span>
                            <span className="text-xs font-mono font-medium text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-md">
                              {totalDeptSkus.toLocaleString()} SKUs
                            </span>

                            {/* Node Delete Button (frees collection to remap) */}
                            <button
                              type="button"
                              onClick={() => handleRemoveTopGroup(group.id)}
                              className="p-1 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Remove category from tree"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Inline Subcategory Creator Input Bar */}
                        {addingSubForGroupId === group.id && (
                          <div className="mx-4 my-2 p-2.5 bg-purple-50/70 rounded-xl border border-purple-200 flex items-center gap-2 animate-in fade-in duration-150">
                            <span className="text-xs font-bold text-purple-900 shrink-0">
                              New Subcategory in {group.name}:
                            </span>
                            <input
                              type="text"
                              autoFocus
                              value={newSubName}
                              onChange={(e) => setNewSubName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateCustomSubCategory(group.id, newSubName);
                                if (e.key === 'Escape') setAddingSubForGroupId(null);
                              }}
                              placeholder="e.g., Tops, Bottoms, Outerwear, Dresses, Footwear..."
                              className="flex-1 px-2.5 py-1 text-xs bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 font-semibold"
                            />
                            <button
                              type="button"
                              onClick={() => handleCreateCustomSubCategory(group.id, newSubName)}
                              disabled={!newSubName.trim()}
                              className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              + Add
                            </button>
                            <button
                              type="button"
                              onClick={() => setAddingSubForGroupId(null)}
                              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Flat / Shallow Hierarchy Warning if department has no subcategories */}
                        {group.hasNoSubcategories && group.subGroups.length === 0 && (
                          <div className="mx-6 my-2 p-2 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 flex items-center justify-between gap-2.5 text-xs">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                              <span className="font-medium text-[11px]">
                                <strong>{group.name}</strong> currently has no subcategories. Drag a collection onto this category row or click "+ Subcategory".
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Subgroups & Leaf Nodes */}
                        {!isGroupCollapsed && (
                          <div
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveDropZone(`dept-${group.id}`);
                            }}
                            onDragLeave={(e) => {
                              e.stopPropagation();
                              setActiveDropZone(null);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (draggedCollection) handleDropAsSubcategory(group.id, draggedCollection);
                            }}
                            className="pl-6 pr-4 py-2 space-y-2 bg-white"
                          >
                            {group.subGroups.length === 0 && (
                              <div className="text-center py-2 text-xs text-slate-400 italic bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                {draggedCollection
                                  ? `📥 Drop here to add "${draggedCollection.title}" as first Subcategory in ${group.name}`
                                  : `No subcategories yet. Drop a collection or click "+ Subcategory"`}
                              </div>
                            )}

                            {group.subGroups.map((subGroup) => {
                              const isSubCollapsed = !!collapsedShopifySubGroups[subGroup.id];
                              const subLeafIds = subGroup.leafs.map((l) => l.id);
                              const hasLeaves = subLeafIds.length > 0;
                              const isSubDirectlySelected = !hasLeaves && shopifySelectedLeafIds.includes(subGroup.id);
                              const selectedInSub = hasLeaves
                                ? subLeafIds.filter((id) => shopifySelectedLeafIds.includes(id)).length
                                : (isSubDirectlySelected ? 1 : 0);
                              const allSubSelected = hasLeaves
                                ? subLeafIds.length > 0 && selectedInSub === subLeafIds.length
                                : isSubDirectlySelected;
                              const someSubSelected = hasLeaves && selectedInSub > 0 && selectedInSub < subLeafIds.length;
                              const rawSubCol = SHOPIFY_RAW_COLLECTIONS.find((c) => c.id === subGroup.collectionId);
                              const totalSubSkus = hasLeaves
                                ? subGroup.leafs.reduce((acc, l) => acc + l.skuCount, 0)
                                : (rawSubCol ? rawSubCol.productCount : 450);

                              const isEditingThisSub = editingNodeId === subGroup.id;
                              const isSubDropActive = activeDropZone === `sub-${subGroup.id}`;

                              return (
                                <div
                                  key={subGroup.id}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.dataTransfer.dropEffect = 'copy';
                                    setActiveDropZone(`sub-${subGroup.id}`);
                                  }}
                                  onDragEnter={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.dataTransfer.dropEffect = 'copy';
                                  }}
                                  onDragLeave={(e) => {
                                    e.stopPropagation();
                                    setActiveDropZone(null);
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const col = getDroppedCollection(e);
                                    if (col) {
                                      handleDropAsLeaf(group.id, subGroup.id, col);
                                    }
                                  }}
                                  className={`border-l-2 pl-3 py-1.5 space-y-2 rounded-r-xl p-2 transition-all ${
                                    isSubDropActive
                                      ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-300'
                                      : isSubDirectlySelected
                                      ? 'border-purple-500 bg-purple-50/40'
                                      : 'border-purple-200 bg-slate-50/30'
                                  }`}
                                >
                                  {/* Mid-Level Subcategory Header (Single Unified Drop Target for Leaves) */}
                                  <div className="flex items-center justify-between select-none gap-2">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <button
                                        type="button"
                                        onClick={() => toggleShopifySubGroup(subGroup.id)}
                                        className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                                      >
                                        {isSubCollapsed ? (
                                          <ChevronRight className="w-3.5 h-3.5" />
                                        ) : (
                                          <ChevronDown className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                      
                                      <button
                                        type="button"
                                        onClick={() => handleToggleShopifySubGroup(subGroup)}
                                        className="text-purple-700 cursor-pointer shrink-0"
                                      >
                                        {allSubSelected ? (
                                          <CheckSquare className="w-3.5 h-3.5 text-purple-700" />
                                        ) : someSubSelected ? (
                                          <MinusSquare className="w-3.5 h-3.5 text-purple-600" />
                                        ) : (
                                          <Square className="w-3.5 h-3.5 text-slate-300 hover:text-slate-400" />
                                        )}
                                      </button>

                                      {isEditingThisSub ? (
                                        <div className="flex items-center gap-1.5 flex-1 max-w-xs">
                                          <input
                                            type="text"
                                            autoFocus
                                            value={editingNodeText}
                                            onChange={(e) => setEditingNodeText(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleSaveRename(subGroup.id);
                                              if (e.key === 'Escape') setEditingNodeId(null);
                                            }}
                                            className="px-2 py-0.5 text-xs font-bold bg-white border border-purple-400 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-600 text-slate-900 w-full"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleSaveRename(subGroup.id)}
                                            className="p-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 cursor-pointer"
                                            title="Save"
                                          >
                                            <Check className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setEditingNodeId(null)}
                                            className="p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                                            title="Cancel"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                          <span
                                            onDoubleClick={() => handleStartRename(subGroup.id, subGroup.name)}
                                            className="text-xs font-bold text-slate-800 hover:text-purple-900 cursor-pointer truncate"
                                            title="Double-click to rename"
                                          >
                                            {subGroup.name}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleStartRename(subGroup.id, subGroup.name)}
                                            className="p-0.5 text-slate-400 hover:text-purple-700 hover:bg-purple-100 rounded transition-colors cursor-pointer"
                                            title="Rename subcategory"
                                          >
                                            <Pencil className="w-2.5 h-2.5" />
                                          </button>
                                          <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-slate-200 text-slate-700">
                                            Subcategory
                                          </span>
                                          {isSubDropActive && draggedCollection ? (
                                            <span className="text-[10px] font-bold text-emerald-900 bg-emerald-200/90 px-1.5 py-0.5 rounded border border-emerald-400 animate-pulse">
                                              🌿 Release to add "{draggedCollection.title}" as Leaf Node
                                            </span>
                                          ) : (
                                            <span className="text-[10px] font-mono font-normal text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">
                                              Path: {group.name} &gt; {subGroup.name}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      {/* + Leaf button on Subcategory */}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAddingLeafForSubId(
                                            addingLeafForSubId === subGroup.id ? null : subGroup.id
                                          );
                                          setNewLeafName('');
                                        }}
                                        className="px-1.5 py-0.5 rounded text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors cursor-pointer flex items-center gap-0.5 text-[10px] font-bold"
                                        title={`Add manual leaf under ${subGroup.name}`}
                                      >
                                        <Plus className="w-2.5 h-2.5" />
                                        <span className="hidden md:inline">+ Leaf</span>
                                      </button>

                                      {/* Product Preview Eye Button on Subcategory */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPreviewTarget({
                                            title: subGroup.name,
                                            collectionId: subGroup.collectionId,
                                            level: 'Subcategory (Level 2)',
                                            path: `${group.name} > ${subGroup.name}`,
                                            skuCount: totalSubSkus,
                                          });
                                        }}
                                        className="px-1.5 py-0.5 rounded text-slate-500 hover:text-purple-700 hover:bg-purple-100/80 border border-slate-200/80 hover:border-purple-300 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                                        title={`Preview products in ${subGroup.name}`}
                                      >
                                        <Eye className="w-3 h-3 text-purple-600" />
                                        <span className="hidden lg:inline text-[10px]">Preview</span>
                                      </button>

                                      <span className="text-[11px] text-slate-400 hidden sm:inline">
                                        {hasLeaves
                                          ? `${selectedInSub}/${subLeafIds.length} leaves`
                                          : isSubDirectlySelected
                                          ? '1 selected (Direct)'
                                          : '0 selected'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveSubGroup(group.id, subGroup.id)
                                        }
                                        className="p-0.5 text-slate-300 hover:text-rose-600 cursor-pointer"
                                        title="Remove subcategory (frees collection to remap)"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Inline Leaf Creator Input Bar */}
                                  {addingLeafForSubId === subGroup.id && (
                                    <div className="ml-5 my-1.5 p-2 bg-purple-50/80 rounded-lg border border-purple-200 flex items-center gap-2 animate-in fade-in duration-150">
                                      <span className="text-[11px] font-bold text-purple-900 shrink-0">
                                        New Leaf in {subGroup.name}:
                                      </span>
                                      <input
                                        type="text"
                                        autoFocus
                                        value={newLeafName}
                                        onChange={(e) => setNewLeafName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleCreateCustomLeaf(group.id, subGroup.id, newLeafName);
                                          if (e.key === 'Escape') setAddingLeafForSubId(null);
                                        }}
                                        placeholder="e.g., Casual Dresses, Graphic Tees, Denim Jeans..."
                                        className="flex-1 px-2 py-0.5 text-xs bg-white border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-600 font-semibold"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleCreateCustomLeaf(group.id, subGroup.id, newLeafName)}
                                        disabled={!newLeafName.trim()}
                                        className="px-2 py-0.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-[11px] font-bold rounded transition-colors cursor-pointer"
                                      >
                                        + Add
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setAddingLeafForSubId(null)}
                                        className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}

                                  {/* Leaf Level Nodes */}
                                  {!isSubCollapsed && (
                                    <div className="pl-5 space-y-1.5 pt-1">
                                      {subGroup.leafs.length === 0 ? (
                                        <div className="text-[11px] text-slate-400 italic py-1 pl-2">
                                          {draggedCollection
                                            ? `🌿 Drop collection on this subcategory to add as Leaf Node`
                                            : `No leaf nodes yet. Select this subcategory directly or add leaves.`}
                                        </div>
                                      ) : (
                                        subGroup.leafs.map((leaf) => {
                                          const selected = isShopifyLeafSelected(leaf.id);
                                          const isEditingThisLeaf = editingNodeId === leaf.id;

                                          return (
                                            <div
                                              key={leaf.id}
                                              onClick={() => {
                                                if (!isEditingThisLeaf) handleToggleShopifyLeaf(leaf.id);
                                              }}
                                              className={`flex items-center justify-between p-2 rounded-xl text-xs transition-all cursor-pointer border ${
                                                selected
                                                  ? 'bg-purple-50/90 border-purple-200 text-purple-950 font-semibold shadow-2xs'
                                                  : 'bg-white hover:bg-slate-50 border-slate-200/80 text-slate-700'
                                              }`}
                                            >
                                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                <div className="shrink-0 text-purple-700">
                                                  {selected ? (
                                                    <CheckSquare className="w-4 h-4 text-purple-700" />
                                                  ) : (
                                                    <Square className="w-4 h-4 text-slate-300" />
                                                  )}
                                                </div>

                                                {isEditingThisLeaf ? (
                                                  <div
                                                    className="flex items-center gap-1.5 flex-1 max-w-xs"
                                                    onClick={(e) => e.stopPropagation()}
                                                  >
                                                    <input
                                                      type="text"
                                                      autoFocus
                                                      value={editingNodeText}
                                                      onChange={(e) => setEditingNodeText(e.target.value)}
                                                      onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveRename(leaf.id);
                                                        if (e.key === 'Escape') setEditingNodeId(null);
                                                      }}
                                                      className="px-2 py-0.5 text-xs font-bold bg-white border border-purple-400 rounded focus:outline-none focus:ring-1 focus:ring-purple-600 text-slate-900 w-full"
                                                    />
                                                    <button
                                                      type="button"
                                                      onClick={() => handleSaveRename(leaf.id)}
                                                      className="p-1 bg-purple-600 text-white rounded hover:bg-purple-700 cursor-pointer"
                                                      title="Save"
                                                    >
                                                      <Check className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => setEditingNodeId(null)}
                                                      className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                                                      title="Cancel"
                                                    >
                                                      <X className="w-3 h-3" />
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                      <span
                                                        onDoubleClick={(e) => {
                                                          e.stopPropagation();
                                                          handleStartRename(leaf.id, leaf.name);
                                                        }}
                                                        className="truncate font-bold"
                                                        title="Double-click to rename"
                                                      >
                                                        {leaf.name}
                                                      </span>
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleStartRename(leaf.id, leaf.name);
                                                        }}
                                                        className="p-0.5 text-slate-400 hover:text-purple-700 rounded transition-colors cursor-pointer"
                                                        title="Rename leaf"
                                                      >
                                                        <Pencil className="w-2.5 h-2.5" />
                                                      </button>
                                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-800">
                                                        Leaf Node
                                                      </span>
                                                      {leaf.isShallowWarning && (
                                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                                                          <AlertTriangle className="w-3 h-3" /> Flat
                                                        </span>
                                                      )}
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 block truncate font-mono mt-0.5">
                                                      Path: {leaf.path}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>

                                              <div className="flex items-center gap-2 shrink-0">
                                                {/* Product Preview Eye Button on Leaf */}
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPreviewTarget({
                                                      title: leaf.name,
                                                      collectionId: leaf.collectionId,
                                                      level: 'Leaf Node (Level 3)',
                                                      path: leaf.path,
                                                      skuCount: leaf.skuCount,
                                                    });
                                                  }}
                                                  className="p-1 rounded-md text-slate-400 hover:text-purple-700 hover:bg-purple-50 transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-medium"
                                                  title={`Preview products in ${leaf.name}`}
                                                >
                                                  <Eye className="w-3.5 h-3.5 text-purple-600" />
                                                  <span className="hidden lg:inline text-[10px]">Preview</span>
                                                </button>

                                                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                                  {leaf.skuCount.toLocaleString()} SKUs
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemoveLeaf(group.id, subGroup.id, leaf.id);
                                                  }}
                                                  className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                                                  title="Remove leaf (frees collection to remap)"
                                                >
                                                  <X className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Bottom Canvas Drop Zone to create a new Category (Level 1) */}
                {shopifyTree.length > 0 && (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'copy';
                      if (activeDropZone !== 'root-outside-bottom') {
                        setActiveDropZone('root-outside-bottom');
                      }
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'copy';
                      setActiveDropZone('root-outside-bottom');
                    }}
                    onDragLeave={(e) => {
                      e.stopPropagation();
                      if (activeDropZone === 'root-outside-bottom') {
                        setActiveDropZone(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const col = getDroppedCollection(e);
                      if (col) {
                        handleDropAsTopCategory(col);
                        setActiveDropZone(null);
                      }
                    }}
                    className={`p-3.5 m-3 text-center rounded-xl border-2 border-dashed transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      activeDropZone === 'root-outside-bottom' || (activeDropZone === 'root-outside' && draggedCollection)
                        ? 'border-purple-600 bg-purple-100/90 ring-4 ring-purple-200 text-purple-900 font-bold'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-purple-50/50 hover:border-purple-200 text-slate-500'
                    }`}
                  >
                    <PlusCircle className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-semibold">
                      {draggedCollection
                        ? `📥 Drop "${draggedCollection.title}" here to create as a new Category`
                        : 'Drop any collection here to create a new Category (Level 1)'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* QUICK MAP / POINT-AND-CLICK ASSIGNMENT MODAL                          */}
      {/* ===================================================================== */}
      {quickAssignCol && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150"
          onClick={() => setQuickAssignCol(null)}
        >
          <div
            className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl max-w-lg w-full p-5 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-700">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Map Collection: "{quickAssignCol.title}"
                  </h3>
                  <p className="text-xs text-slate-400">
                    {quickAssignCol.productCount} SKUs &bull; Choose where to place in hierarchy
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickAssignCol(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {/* Option 1: Top-Level Category */}
              <button
                type="button"
                onClick={() => handleQuickAssign(quickAssignCol, { type: 'new_dept' })}
                className="w-full text-left p-3 rounded-xl border border-purple-200 bg-purple-50/70 hover:bg-purple-100 text-purple-950 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <PlusCircle className="w-3.5 h-3.5 text-purple-700" />
                    Create as New Category (Level 1)
                  </div>
                  <div className="text-[11px] text-purple-700/80 font-mono mt-0.5">
                    Path: {quickAssignCol.title}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-purple-600 group-hover:translate-x-0.5 transition-transform" />
              </button>

              {/* Options for existing categories */}
              {shopifyTree.map((group) => (
                <div key={group.id} className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Under Category: <strong>{group.name}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickAssign(quickAssignCol, { type: 'sub', groupId: group.id })
                      }
                      className="px-2 py-1 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                    >
                      + Add as Subcategory
                    </button>
                  </div>

                  {group.subGroups.length > 0 && (
                    <div className="pl-3 space-y-1.5 border-l-2 border-slate-200">
                      {group.subGroups.map((sub) => (
                        <div key={sub.id} className="flex items-center justify-between text-xs py-1">
                          <span className="text-slate-600 font-medium text-[11px] truncate">
                            &bull; {sub.name}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleQuickAssign(quickAssignCol, {
                                type: 'leaf',
                                groupId: group.id,
                                subGroupId: sub.id,
                              })
                            }
                            className="px-2 py-0.5 bg-slate-100 hover:bg-purple-100 text-purple-800 rounded text-[10px] font-semibold cursor-pointer transition-colors"
                          >
                            + Add as Leaf
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PRODUCTS PREVIEW POPUP / MODAL                                        */}
      {/* ===================================================================== */}
      {previewTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150"
          onClick={() => {
            setPreviewTarget(null);
            setPreviewSearch('');
          }}
        >
          <div
            className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-slate-50/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-2xl bg-purple-600 text-white shadow-md shadow-purple-600/20 shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-slate-900 truncate">
                      {previewTarget.title}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-purple-100 text-purple-900 border border-purple-200">
                      {previewTarget.level}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono truncate mt-0.5">
                    Hierarchy Path: <strong className="text-purple-950">{previewTarget.path}</strong> &bull; {previewTarget.skuCount.toLocaleString()} Estimated Store SKUs
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPreviewTarget(null);
                  setPreviewSearch('');
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-200/70 transition-colors cursor-pointer shrink-0"
                title="Close Product Preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter & Live Status Bar */}
            <div className="px-5 py-2.5 border-b border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter preview items by title, SKU, or tag..."
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  className="w-full pl-8.5 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600"
                />
                {previewSearch && (
                  <button
                    type="button"
                    onClick={() => setPreviewSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500 w-full sm:w-auto justify-between sm:justify-end">
                <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 font-semibold px-2 py-0.5 rounded-lg border border-emerald-200/80 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Shopify Store Live Sync
                </span>
              </div>
            </div>

            {/* Products Grid Content */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3 bg-slate-50/50">
              {(() => {
                const sampleProducts = getSampleProductsForTarget(previewTarget);
                const filtered = previewSearch.trim()
                  ? sampleProducts.filter((p) =>
                      p.title.toLowerCase().includes(previewSearch.toLowerCase()) ||
                      p.sku.toLowerCase().includes(previewSearch.toLowerCase()) ||
                      p.collections.some((c) => c.toLowerCase().includes(previewSearch.toLowerCase()))
                    )
                  : sampleProducts;

                if (filtered.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-400 space-y-2">
                      <Package className="w-8 h-8 mx-auto text-slate-300" />
                      <p className="text-xs font-semibold">No items matching &ldquo;{previewSearch}&rdquo;</p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {filtered.map((product) => (
                      <div
                        key={product.id}
                        className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3 hover:border-purple-200 transition-all"
                      >
                        <div className="flex items-start gap-3">
                          {/* Image Thumbnail */}
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.title}
                              className="w-16 h-16 rounded-xl object-cover border border-slate-100 shrink-0"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center text-2xl shrink-0 border border-slate-200/70">
                              {product.imageThumbnail}
                            </div>
                          )}

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-mono font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                                {product.sku}
                              </span>
                              <span className="text-[11px] font-bold text-slate-900">
                                {product.price}
                                {product.compareAt && (
                                  <span className="text-[10px] text-slate-400 line-through ml-1 font-normal">
                                    {product.compareAt}
                                  </span>
                                )}
                              </span>
                            </div>

                            <h4 className="text-xs font-bold text-slate-800 leading-snug line-clamp-2">
                              {product.title}
                            </h4>

                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              <span>{product.stock} units in stock</span>
                            </div>
                          </div>
                        </div>

                        {/* Sizing & Tag Attributes */}
                        <div className="pt-2 border-t border-slate-100 space-y-2 text-[11px]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-400 text-[10px] font-medium">Sizes:</span>
                            {product.sizes.map((sz) => (
                              <span
                                key={sz}
                                className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/60"
                              >
                                {sz}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-slate-400 text-[10px] font-medium">Collections:</span>
                            {product.collections.map((c) => {
                              const isCurrent =
                                c.toLowerCase() === previewTarget.title.toLowerCase();
                              return (
                                <span
                                  key={c}
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
                                    isCurrent
                                      ? 'bg-purple-100 text-purple-950 font-bold border border-purple-200'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {c}
                                </span>
                              );
                            })}
                          </div>

                          <div className="flex items-center gap-1 text-[10px] text-emerald-800 bg-emerald-50/80 px-2 py-1 rounded-lg border border-emerald-200/60">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span className="font-semibold">Resolved Sizing Category:</span>
                            <span className="truncate font-mono">{product.resolvedPath}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200/80 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Products in <strong>{previewTarget.title}</strong> will automatically map to <strong>{previewTarget.path}</strong> during size chart generation.
              </span>
              <button
                type="button"
                onClick={() => {
                  setPreviewTarget(null);
                  setPreviewSearch('');
                }}
                className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer transition-colors shadow-2xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* BOTTOM FOOTER ACTION BAR (CONTINUE TO STEP 2: PLP MAPPING)            */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-4 z-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onGoToConnectStore}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            &larr; Back to Connect Store
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-xs text-slate-600">
            <strong>{effectiveSelectedCount}</strong> PLP category paths selected for sizing.
          </span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {effectiveSelectedCount === 0 && (
            <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Select at least 1 category path to continue
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              if (effectiveSelectedCount > 0) {
                setTabSubStep('plp_mapping');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            disabled={effectiveSelectedCount === 0}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs ${
              effectiveSelectedCount > 0
                ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20 cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <span>Continue to Map PLPs to Parent Categories</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
