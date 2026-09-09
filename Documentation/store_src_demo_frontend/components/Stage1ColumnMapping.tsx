import { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  FileSpreadsheet,
  Layers,
  Settings,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Info,
  Globe2,
} from 'lucide-react';
import { StoreFieldMapping, GoogleSchemaOption, StoreSizingSystemConfig, SizingSystemOption } from '../types';

interface Stage1Props {
  mappings: StoreFieldMapping[];
  schemaOptions: GoogleSchemaOption[];
  sizingConfig?: StoreSizingSystemConfig;
  availableBrands?: string[];
  onUpdateMapping: (id: string, newSchema: string) => void;
  onUpdateSizingConfig?: (config: StoreSizingSystemConfig) => void;
  onResetDefaults: () => void;
  onNext: () => void;
}

const DEFAULT_SIZING_OPTIONS: { value: SizingSystemOption; label: string; description: string }[] = [
  { value: 'US', label: 'US Sizing', description: 'US Standard Sizing (Inches / US Footwear)' },
  { value: 'UK', label: 'UK Sizing', description: 'UK Standard Sizing (Imperial / UK Footwear)' },
  { value: 'EU', label: 'EU Sizing', description: 'European Standard (Centimeters / Continental)' },
  { value: 'Alpha', label: 'Alpha (S/M/L/XL)', description: 'Standard Alpha grading (XS, S, M, L, XL, XXL)' },
  { value: 'Numeric', label: 'Numeric (28-38 / Waist)', description: 'Numeric waist, dress, or numerical grading' },
];

export function Stage1ColumnMapping({
  mappings,
  schemaOptions,
  sizingConfig = { defaultSystem: 'US', brandOverrides: {} },
  availableBrands = ['Nike', 'Adidas', 'Zara', 'Moustache Store', "Levi's", 'Urban Basics Co', 'New Balance', 'H&M'],
  onUpdateMapping,
  onUpdateSizingConfig,
  onResetDefaults,
  onNext,
}: Stage1Props) {
  const mappedCount = mappings.filter((m) => m.selectedSchema !== '(ignore this field)').length;
  const autoMappedCount = mappings.filter((m) => m.isAutoDetected).length;

  const [isOverridesExpanded, setIsOverridesExpanded] = useState(false);
  const [selectedBrandToAdd, setSelectedBrandToAdd] = useState('');
  const [selectedSystemToAdd, setSelectedSystemToAdd] = useState<SizingSystemOption>('EU');

  const activeOverrides = Object.entries(sizingConfig.brandOverrides || {});
  const activeOverrideCount = activeOverrides.length;

  const handleDefaultSystemChange = (sys: SizingSystemOption) => {
    if (onUpdateSizingConfig) {
      onUpdateSizingConfig({
        ...sizingConfig,
        defaultSystem: sys,
      });
    }
  };

  const handleAddOverride = () => {
    if (!selectedBrandToAdd || !onUpdateSizingConfig) return;
    onUpdateSizingConfig({
      ...sizingConfig,
      brandOverrides: {
        ...sizingConfig.brandOverrides,
        [selectedBrandToAdd]: selectedSystemToAdd,
      },
    });
    setSelectedBrandToAdd('');
  };

  const handleUpdateBrandOverride = (brandName: string, sys: SizingSystemOption) => {
    if (!onUpdateSizingConfig) return;
    onUpdateSizingConfig({
      ...sizingConfig,
      brandOverrides: {
        ...sizingConfig.brandOverrides,
        [brandName]: sys,
      },
    });
  };

  const handleRemoveOverride = (brandName: string) => {
    if (!onUpdateSizingConfig) return;
    const nextOverrides = { ...sizingConfig.brandOverrides };
    delete nextOverrides[brandName];
    onUpdateSizingConfig({
      ...sizingConfig,
      brandOverrides: nextOverrides,
    });
  };

  // Filter available brands that are not yet overridden
  const unassignedBrands = availableBrands.filter(
    (b) => !sizingConfig.brandOverrides || !(b in sizingConfig.brandOverrides)
  );

  return (
    <div className="space-y-6">
      {/* Stage Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs w-full">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-100">
              Stage 1 of 6
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
              Shopify Export v3.2
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Connect Your Store — Map Your Fields
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Align your CMS catalog attributes with the standardized Google Commerce Search schema and declare your store-wide raw sizing system.
          </p>
        </div>

        {/* Stats Pills */}
        <div className="flex items-center gap-3 flex-shrink-0 self-start md:self-auto">
          <div className="px-4 py-2 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100 text-left">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Auto-Matched</div>
            <div className="text-lg font-bold text-purple-900 flex items-center gap-1.5 whitespace-nowrap">
              <Sparkles className="w-4 h-4 text-pink-500" />
              {autoMappedCount}/{mappings.length} Fields
            </div>
          </div>

          <button
            type="button"
            onClick={onResetDefaults}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
            title="Restore default AI detected mappings"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* Mapping Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table Column Headers */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 bg-slate-50/90 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
          <div className="md:col-span-5 flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" />
            Your Store Field (CMS Export)
          </div>
          <div className="hidden md:flex md:col-span-1 justify-center"></div>
          <div className="md:col-span-6 flex items-center justify-between">
            <span>Google Commerce Search Field</span>
            <span className="text-[11px] font-normal text-slate-400 capitalize">Destination Schema</span>
          </div>
        </div>

        {/* Mapping Rows */}
        <div className="divide-y divide-slate-100">
          {mappings.map((item) => {
            const isIgnored = item.selectedSchema === '(ignore this field)';
            const isSizeField =
              item.selectedSchema === 'size' ||
              item.storeField.toLowerCase().includes('size');

            return (
              <div
                key={item.id}
                className={`grid grid-cols-1 md:grid-cols-12 gap-4 items-start px-6 py-4.5 transition-colors ${
                  isIgnored ? 'bg-slate-50/50 opacity-70' : 'hover:bg-purple-50/20'
                } ${isSizeField ? 'bg-gradient-to-r from-purple-50/30 via-white to-pink-50/15' : ''}`}
              >
                {/* Left: Your Store Field + Sample Value + Sizing System (if size field) */}
                <div className="md:col-span-5 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-900">{item.storeField}</span>
                    {item.isAutoDetected && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Auto-map detected ✓
                      </span>
                    )}
                    {item.selectedSchema === 'brand' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        Brand is optional
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 truncate font-mono bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200/80 inline-block max-w-full">
                    <span className="text-slate-400 mr-1.5 text-[10px]">Sample:</span>
                    {item.sampleValue}
                  </div>

                  {/* ULTRA-CLEAN SIZING SYSTEM DROPDOWN & OPTIONAL BRAND OVERRIDE */}
                  {isSizeField && (
                    <div className="pt-2 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Compact Inline Dropdown */}
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50/80 border border-purple-200/90 rounded-lg text-xs font-semibold shadow-2xs">
                          <Globe2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span className="text-purple-950 font-bold">Sizing Type:</span>
                          <div className="relative inline-block">
                            <select
                              id="store-sizing-system-select"
                              value={sizingConfig.defaultSystem}
                              onChange={(e) => handleDefaultSystemChange(e.target.value as SizingSystemOption)}
                              className="appearance-none pl-2 pr-6 py-0.5 text-xs font-bold text-purple-900 bg-white border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer shadow-2xs"
                            >
                              {DEFAULT_SIZING_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="w-3 h-3 text-purple-600 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>

                        {/* Optional Brand Override Button */}
                        <button
                          type="button"
                          onClick={() => setIsOverridesExpanded(!isOverridesExpanded)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                            activeOverrideCount > 0 || isOverridesExpanded
                              ? 'bg-purple-100/90 text-purple-900 border-purple-300 shadow-2xs'
                              : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200 shadow-2xs'
                          }`}
                        >
                          <Settings className="w-3.5 h-3.5 text-purple-600" />
                          <span>Brand Overrides <span className="text-[10px] text-slate-400 font-normal">(Optional)</span></span>
                          {activeOverrideCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-purple-600 text-white">
                              {activeOverrideCount}
                            </span>
                          )}
                          {isOverridesExpanded ? (
                            <ChevronUp className="w-3 h-3 text-purple-600" />
                          ) : (
                            <ChevronDown className="w-3 h-3 text-slate-400" />
                          )}
                        </button>
                      </div>

                      {/* Expanded Brand Overrides Inline Drawer */}
                      {isOverridesExpanded && (
                        <div className="space-y-2 bg-slate-50/90 p-3 rounded-xl border border-purple-200/80 shadow-2xs animate-fadeIn">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700">
                              Custom Brand Sizing Overrides
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Only if a brand uses a non-{sizingConfig.defaultSystem} standard
                            </span>
                          </div>

                          {/* Existing Brand Overrides List */}
                          {activeOverrides.length > 0 ? (
                            <div className="space-y-1.5">
                              {activeOverrides.map(([brandName, sys]) => (
                                <div
                                  key={brandName}
                                  className="flex items-center justify-between gap-2 p-1.5 px-2.5 bg-white rounded-lg border border-slate-200 text-xs shadow-2xs"
                                >
                                  <span className="font-bold text-slate-800">{brandName}</span>
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      value={sys}
                                      onChange={(e) =>
                                        handleUpdateBrandOverride(brandName, e.target.value as SizingSystemOption)
                                      }
                                      className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded px-2 py-0.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-400"
                                    >
                                      {DEFAULT_SIZING_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveOverride(brandName)}
                                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                      title="Remove override"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400 italic py-1.5 text-center bg-white rounded-lg border border-dashed border-slate-200">
                              No brand overrides set. All brands will use <strong>{sizingConfig.defaultSystem}</strong> sizing.
                            </div>
                          )}

                          {/* Add New Brand Override Row */}
                          {unassignedBrands.length > 0 && (
                            <div className="flex items-center gap-1.5 pt-1">
                              <select
                                value={selectedBrandToAdd}
                                onChange={(e) => setSelectedBrandToAdd(e.target.value)}
                                className="flex-1 text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-400"
                              >
                                <option value="">Select brand to override...</option>
                                {unassignedBrands.map((b) => (
                                  <option key={b} value={b}>
                                    {b}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={selectedSystemToAdd}
                                onChange={(e) => setSelectedSystemToAdd(e.target.value as SizingSystemOption)}
                                className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-400"
                              >
                                {DEFAULT_SIZING_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                disabled={!selectedBrandToAdd}
                                onClick={handleAddOverride}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer shadow-2xs"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Center: Indicator Arrow */}
                <div className="hidden md:flex md:col-span-1 justify-center text-slate-300 pt-2">
                  <ArrowRight className="w-4 h-4" />
                </div>

                {/* Right: Google Commerce Schema Dropdown */}
                <div className="md:col-span-6 flex items-center gap-3 pt-1">
                  <div className="relative w-full">
                    <select
                      value={item.selectedSchema}
                      onChange={(e) => onUpdateMapping(item.id, e.target.value)}
                      className={`w-full appearance-none px-3.5 py-2.5 text-sm font-medium rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 transition-all ${
                        isIgnored
                          ? 'border-slate-300 text-slate-400 bg-slate-50'
                          : 'border-purple-200/90 text-purple-950 font-semibold shadow-xs'
                      }`}
                    >
                      {schemaOptions.map((opt) => (
                        <option key={opt.value} value={opt.value} className="text-slate-800 py-1 font-normal">
                          {opt.label} — {opt.description}
                        </option>
                      ))}
                    </select>

                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                        <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Card Footer Bar */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>
              <strong className="font-semibold text-slate-900">{mappedCount} of {mappings.length}</strong> fields mapped to destination schema.
              {sizingConfig.defaultSystem && (
                <span className="ml-2 text-purple-700 font-semibold">
                  (Default sizing system: <strong>{sizingConfig.defaultSystem}</strong>
                  {activeOverrideCount > 0 ? `, ${activeOverrideCount} brand overrides` : ''})
                </span>
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={onNext}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] hover:opacity-95 shadow-md shadow-purple-500/25 active:scale-98 transition-all cursor-pointer"
          >
            <span>Confirm Mapping & Preview</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

