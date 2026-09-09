import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Layers,
  CheckCircle,
  Tag,
  Filter,
  ChevronDown,
  Sparkles,
  Footprints,
  Shield,
  Shirt,
} from 'lucide-react';
import { MockProduct, ParentCategoryType } from '../types';
import { PARENT_CATEGORIES, normalizeToParentCategory } from '../utils/sizingStandards';

interface Stage2Props {
  products: MockProduct[];
  onPrev: () => void;
  onNext: () => void;
  onUpdateProduct?: (productId: string, parentCategory: ParentCategoryType) => void;
}

type BrandFilterType = 'all' | 'global' | 'private' | 'null';
type ParentCategoryFilterType = 'all' | ParentCategoryType;

export function Stage2ItemPreview({ products: initialProducts, onPrev, onNext, onUpdateProduct }: Stage2Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [brandFilter, setBrandFilter] = useState<BrandFilterType>('all');
  const [parentCatFilter, setParentCatFilter] = useState<ParentCategoryFilterType>('all');
  const [localProducts, setLocalProducts] = useState<MockProduct[]>(initialProducts);

  const products = localProducts;

  const handleParentCategoryChange = (productId: string, newCategory: ParentCategoryType) => {
    setLocalProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, parentCategory: newCategory } : p))
    );
    if (onUpdateProduct) {
      onUpdateProduct(productId, newCategory);
    }
  };

  // Calculate counts for brand filters
  const globalCount = products.filter((p) => p.brandType === 'global').length;
  const privateCount = products.filter((p) => p.brandType === 'private').length;
  const nullCount = products.filter((p) => p.brandType === 'null' || !p.brand || p.brand.trim() === '').length;
  const allCount = products.length;

  const filteredProducts = products.filter((prod) => {
    const isNullBrand = prod.brandType === 'null' || !prod.brand || prod.brand.trim() === '';
    const brandName = prod.brand || '';
    const currentParentCat = prod.parentCategory || normalizeToParentCategory(prod.category);

    const matchesSearch =
      prod.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prod.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      brandName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      currentParentCat.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prod.category.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (brandFilter === 'global' && prod.brandType !== 'global') return false;
    if (brandFilter === 'private' && prod.brandType !== 'private') return false;
    if (brandFilter === 'null' && !isNullBrand) return false;

    if (parentCatFilter !== 'all' && currentParentCat !== parentCatFilter) return false;

    return true;
  });

  const getParentCategoryBadge = (category: ParentCategoryType) => {
    switch (category) {
      case 'Tops':
        return {
          bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          dot: 'bg-indigo-500',
          icon: <Shirt className="w-3.5 h-3.5 text-indigo-600" />,
        };
      case 'Outerwear / Jackets':
        return {
          bg: 'bg-cyan-50 text-cyan-900 border-cyan-200',
          dot: 'bg-cyan-500',
          icon: <Shield className="w-3.5 h-3.5 text-cyan-600" />,
        };
      case 'Bottoms':
        return {
          bg: 'bg-emerald-50 text-emerald-900 border-emerald-200',
          dot: 'bg-emerald-500',
          icon: <Layers className="w-3.5 h-3.5 text-emerald-600" />,
        };
      case 'Dresses / Full-body':
        return {
          bg: 'bg-purple-50 text-purple-900 border-purple-200',
          dot: 'bg-purple-500',
          icon: <Sparkles className="w-3.5 h-3.5 text-purple-600" />,
        };
      case 'Footwear':
        return {
          bg: 'bg-amber-50 text-amber-900 border-amber-200',
          dot: 'bg-amber-500',
          icon: <Footprints className="w-3.5 h-3.5 text-amber-600" />,
        };
      default:
        return {
          bg: 'bg-slate-100 text-slate-800 border-slate-200',
          dot: 'bg-slate-500',
          icon: <Layers className="w-3.5 h-3.5 text-slate-600" />,
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs w-full">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-100">
              Stage 2 of 6
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-600" />
              10 Fields Mapped
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Preview — Catalog, Brands &amp; Parent Category Mapping
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Inspect your mapped catalog items. Products are classified into <strong>Brands</strong> (Global, Private, Null) and mapped to one of the <strong>5 Standard Parent Categories</strong> (Tops, Outerwear / Jackets, Bottoms, Dresses / Full-body, Footwear) to drive automated sizing research.
          </p>
        </div>

        {/* Filter / Search Bar */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search SKU, title, brand, category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-slate-50/50"
            />
          </div>
        </div>
      </div>

      {/* Filter Bar: Brand Type & Parent Category */}
      <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        {/* Row 1: Brand Type Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 text-xs font-medium pl-1 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" /> Brand Filter:
            </span>

            {/* All Brands */}
            <button
              type="button"
              onClick={() => setBrandFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                brandFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <span>All Items</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                brandFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {allCount}
              </span>
            </button>

            {/* Global Brands (Green) */}
            <button
              type="button"
              onClick={() => setBrandFilter('global')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                brandFilter === 'global'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Global Brands</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                brandFilter === 'global' ? 'bg-white/20 text-white' : 'bg-emerald-200/80 text-emerald-900'
              }`}>
                {globalCount}
              </span>
            </button>

            {/* Private Brands (Yellow) */}
            <button
              type="button"
              onClick={() => setBrandFilter('private')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                brandFilter === 'private'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>Private Brands</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                brandFilter === 'private' ? 'bg-white/20 text-white' : 'bg-amber-200/80 text-amber-900'
              }`}>
                {privateCount}
              </span>
            </button>

            {/* Null / No Brand (Red) */}
            <button
              type="button"
              onClick={() => setBrandFilter('null')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                brandFilter === 'null'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span>Null / No Brand</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                brandFilter === 'null' ? 'bg-white/20 text-white' : 'bg-rose-200/80 text-rose-900'
              }`}>
                {nullCount}
              </span>
            </button>
          </div>

          {/* Color Legend Quick Reference */}
          <div className="flex items-center gap-3 text-[11px] text-slate-500 border-t sm:border-t-0 pt-2 sm:pt-0">
            <span className="font-semibold text-slate-400">Legend:</span>
            <span className="flex items-center gap-1 font-medium text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Green = Global
            </span>
            <span className="flex items-center gap-1 font-medium text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span> Yellow = Private
            </span>
            <span className="flex items-center gap-1 font-medium text-rose-700">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span> Red = Null
            </span>
          </div>
        </div>

        {/* Row 2: Parent Category Quick Filters */}
        <div className="pt-2 border-t border-slate-100 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-slate-400 text-xs font-medium pl-1 flex items-center gap-1 flex-shrink-0">
            <Filter className="w-3.5 h-3.5 text-purple-600" /> Parent Category:
          </span>

          <button
            type="button"
            onClick={() => setParentCatFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer ${
              parentCatFilter === 'all'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All 5 Categories
          </button>

          {PARENT_CATEGORIES.map((cat) => {
            const count = products.filter(
              (p) => (p.parentCategory || normalizeToParentCategory(p.category)) === cat
            ).length;
            const isSelected = parentCatFilter === cat;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => setParentCatFilter(cat)}
                className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-purple-50/70 text-purple-900 border border-purple-200/80 hover:bg-purple-100'
                }`}
              >
                <span>{cat}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  isSelected ? 'bg-white/25 text-white' : 'bg-purple-200/80 text-purple-950'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Product Title &amp; Image (title)</th>
                <th className="px-3 py-3.5">SKU (id)</th>
                <th className="px-3 py-3.5">Brand Field (brand)</th>
                <th className="px-3 py-3.5 min-w-[200px]">Parent Category (1 of 5 Standards)</th>
                <th className="px-3 py-3.5">Category (google_product_category)</th>
                <th className="px-3 py-3.5">Sizes (size)</th>
                <th className="px-3 py-3.5">Price</th>
                <th className="px-3 py-3.5">Availability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((product) => {
                const isNull = product.brandType === 'null' || !product.brand || product.brand.trim() === '';
                const isPrivate = product.brandType === 'private';
                const isGlobal = product.brandType === 'global';
                const currentParentCat = (product.parentCategory || normalizeToParentCategory(product.category)) as ParentCategoryType;
                const badgeInfo = getParentCategoryBadge(currentParentCat);

                return (
                  <tr
                    key={product.id}
                    className={`transition-colors ${
                      isNull
                        ? 'bg-rose-50/20 hover:bg-rose-50/50'
                        : isPrivate
                        ? 'bg-amber-50/20 hover:bg-amber-50/50'
                        : 'hover:bg-slate-50/70'
                    }`}
                  >
                    {/* Image & Title */}
                    <td className="px-4 py-3 min-w-[240px]">
                      <div className="flex items-center gap-3">
                        <img
                          src={product.imageUrl}
                          alt={product.title}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-lg object-cover bg-slate-100 flex-shrink-0 border border-slate-200/80"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 line-clamp-1" title={product.title}>
                            {product.title}
                          </p>
                          <p className="text-[11px] text-slate-400 line-clamp-1">{product.description}</p>
                        </div>
                      </div>
                    </td>

                    {/* SKU */}
                    <td className="px-3 py-3 font-mono text-slate-600 whitespace-nowrap">{product.sku}</td>

                    {/* Brand Field with Color-coded Tags */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {isNull ? (
                        /* RED: Null / No Brand */
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-300 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          <span>Null (No Brand)</span>
                        </span>
                      ) : isPrivate ? (
                        /* YELLOW: Private Brand (e.g. Moustache Store) */
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                          <span>{product.brand}</span>
                          <span className="text-[9px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-200/60 px-1 py-0.2 rounded">
                            Private
                          </span>
                        </span>
                      ) : isGlobal ? (
                        /* GREEN: Global Brand */
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span>{product.brand}</span>
                          <span className="text-[9px] uppercase tracking-wider font-semibold text-emerald-700 bg-emerald-200/60 px-1 py-0.2 rounded">
                            Global
                          </span>
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                          {product.brand}
                        </span>
                      )}
                    </td>

                    {/* Dedicated Column: Parent Category (One of the 5 Standards) */}
                    <td className="px-3 py-3 whitespace-nowrap min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <div className="relative inline-block w-full">
                          <select
                            value={currentParentCat}
                            onChange={(e) =>
                              handleParentCategoryChange(product.id, e.target.value as ParentCategoryType)
                            }
                            className={`w-full appearance-none pl-8 pr-7 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-400 ${badgeInfo.bg}`}
                          >
                            {PARENT_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat} className="bg-white text-slate-900 font-normal">
                                {cat}
                              </option>
                            ))}
                          </select>
                          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                            {badgeInfo.icon}
                          </div>
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Raw Store Category */}
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap max-w-[170px] truncate" title={product.category}>
                      {product.category}
                    </td>

                    {/* Sizes */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1 max-w-[140px]">
                        {product.sizes.slice(0, 3).map((sz) => (
                          <span
                            key={sz}
                            className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-mono text-[10px] font-medium border border-purple-100"
                          >
                            {sz}
                          </span>
                        ))}
                        {product.sizes.length > 3 && (
                          <span className="text-[10px] text-slate-400 font-mono self-center">
                            +{product.sizes.length - 3}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Price */}
                    <td className="px-3 py-3 font-bold text-slate-900 whitespace-nowrap">{product.price}</td>

                    {/* Availability */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {product.availability === 'in_stock' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          In Stock ({product.stockQty})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-semibold text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Low Stock ({product.stockQty})
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom summary bar */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              <span>
                <strong>12,480 total SKUs</strong> in catalog
              </span>
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> {globalCount} Global
              </span>
              <span className="flex items-center gap-1 text-amber-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> {privateCount} Private
              </span>
              <span className="flex items-center gap-1 text-rose-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span> {nullCount} Null
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onPrev}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>

            <button
              type="button"
              onClick={onNext}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] hover:opacity-95 shadow-md shadow-purple-500/25 active:scale-98 transition-all cursor-pointer"
            >
              <span>Looks Good — Start Brand Research</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
