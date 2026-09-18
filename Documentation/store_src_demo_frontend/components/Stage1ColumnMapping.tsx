import { useState, useEffect } from 'react';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Info,
  Globe2,
  Settings,
  Table as TableIcon,
  ShieldCheck,
  Zap,
  Check,
  X,
  Search,
  ExternalLink,
  Code2,
  FileSpreadsheet,
  Database,
  FastForward,
} from 'lucide-react';
import {
  StoreFieldMapping,
  GoogleSchemaOption,
  StoreSizingSystemConfig,
  SizingSystemOption,
  StoreConnectionInfo,
  AcsRequiredField,
  AcsNativeAttribute,
  AcsCustomAttribute,
} from '../types';
import {
  INITIAL_ACS_REQUIRED_FIELDS,
  INITIAL_ACS_NATIVE_ATTRIBUTES,
  INITIAL_ACS_CUSTOM_ATTRIBUTES,
  AVAILABLE_CMS_FIELDS,
} from '../data/acsMappingData';
import { AddCustomAttributeModal } from './AddCustomAttributeModal';

interface Stage1Props {
  mappings?: StoreFieldMapping[];
  schemaOptions?: GoogleSchemaOption[];
  sizingConfig?: StoreSizingSystemConfig;
  availableBrands?: string[];
  storeConnection?: StoreConnectionInfo;
  onUpdateMapping?: (id: string, newSchema: string) => void;
  onUpdateSizingConfig?: (config: StoreSizingSystemConfig) => void;
  onResetDefaults?: () => void;
  onNext: () => void;
}

const DEFAULT_SIZING_OPTIONS: { value: SizingSystemOption; label: string; description: string }[] = [
  { value: 'US', label: 'US Sizing', description: 'US Standard Sizing (Inches / US Footwear)' },
  { value: 'UK', label: 'UK Sizing', description: 'UK Standard Sizing (Imperial / UK Footwear)' },
  { value: 'EU', label: 'EU Sizing', description: 'European Standard (Centimeters / Continental)' },
  { value: 'Alpha', label: 'Alpha (S/M/L/XL)', description: 'Standard Alpha grading (XS, S, M, L, XL, XXL)' },
  { value: 'Numeric', label: 'Numeric (28-38 / Waist)', description: 'Numeric waist, dress, or numerical grading' },
];

interface CmsFieldSelectProps {
  value?: string;
  onChange: (value: string) => void;
  accentColor?: 'purple' | 'blue' | 'emerald';
  id?: string;
}

function CmsFieldSelect({
  value,
  onChange,
  accentColor = 'purple',
  id,
}: CmsFieldSelectProps) {
  // Check if current value exists in AVAILABLE_CMS_FIELDS
  const allKnownValues = AVAILABLE_CMS_FIELDS.flatMap((g) => g.options.map((o) => o.value));
  const isCustomValue = value && !allKnownValues.includes(value);

  const ringClasses = {
    purple: 'focus:ring-purple-300 focus:border-purple-500 hover:border-purple-300',
    blue: 'focus:ring-blue-300 focus:border-blue-500 hover:border-blue-300',
    emerald: 'focus:ring-emerald-300 focus:border-emerald-500 hover:border-emerald-300',
  }[accentColor];

  return (
    <div className="relative w-full max-w-xs">
      <select
        id={id}
        value={value || 'unmapped'}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none pl-2.5 pr-7 py-1.5 text-xs font-mono font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg shadow-2xs hover:bg-slate-50/70 focus:outline-none focus:ring-2 transition-all cursor-pointer truncate ${ringClasses}`}
        title="Select CMS field to map into this ACS schema field"
      >
        {isCustomValue && (
          <option value={value}>
            {value} (Custom Store Field)
          </option>
        )}
        {AVAILABLE_CMS_FIELDS.map((group) => (
          <optgroup key={group.group} label={group.group} className="font-sans font-bold text-slate-500">
            {group.options.map((opt) => (
              <option key={opt.value} value={opt.value} className="font-mono font-medium text-slate-800">
                {opt.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

export function Stage1ColumnMapping({
  sizingConfig = { defaultSystem: 'US', brandOverrides: {} },
  availableBrands = ['Nike', 'Adidas', 'Zara', 'Moustache Store', "Levi's", 'Urban Basics Co', 'New Balance', 'H&M'],
  storeConnection,
  onUpdateSizingConfig,
  onResetDefaults,
  onNext,
}: Stage1Props) {
  // Connected platform (defaults to shopify if not provided)
  const platform = storeConnection?.platform || 'shopify';

  // State for Table 1 (Main & Required attributes: Required fields + Native attributes)
  const [requiredFields, setRequiredFields] = useState<AcsRequiredField[]>(INITIAL_ACS_REQUIRED_FIELDS);
  const [nativeAttributes, setNativeAttributes] = useState<AcsNativeAttribute[]>(INITIAL_ACS_NATIVE_ATTRIBUTES);

  // State for Table 2 (Custom attributes) - persisted in localStorage
  const [customAttributes, setCustomAttributes] = useState<AcsCustomAttribute[]>(() => {
    try {
      const saved = localStorage.getItem('persona_acs_custom_attributes');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore JSON errors
    }
    return INITIAL_ACS_CUSTOM_ATTRIBUTES;
  });

  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Table collapse states (Table 1: Main & Required Attributes, Table 2: Custom Attributes)
  const [isTable1Open, setIsTable1Open] = useState(true);
  const [isTable2Open, setIsTable2Open] = useState(true);

  // Size chart selection for the sizes attribute
  const [sizeChartSelection, setSizeChartSelection] = useState<string>(
    sizingConfig.sizeChart || 'none'
  );

  const handleSizeChartChange = (newChart: string) => {
    setSizeChartSelection(newChart);
    if (onUpdateSizingConfig) {
      onUpdateSizingConfig({
        ...sizingConfig,
        sizeChart: newChart,
      });
    }
    if (newChart === 'none') {
      showToast("Size chart: Don't have a size chart", 'info');
    } else {
      showToast(`Size chart set to "${newChart}"`, 'success');
    }
  };

  // Sync size chart selection if sizingConfig prop changes
  useEffect(() => {
    if (sizingConfig.sizeChart !== undefined) {
      setSizeChartSelection(sizingConfig.sizeChart);
    }
  }, [sizingConfig.sizeChart]);

  // Search filter across tables (retained for quick matching)
  const [searchQuery, setSearchQuery] = useState('');

  // Sizing system overrides expand/collapse
  const [isOverridesExpanded, setIsOverridesExpanded] = useState(false);
  const [selectedBrandToAdd, setSelectedBrandToAdd] = useState('');
  const [selectedSystemToAdd, setSelectedSystemToAdd] = useState<SizingSystemOption>('EU');

  // Feedback toast
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setFeedback({ message, type });
    setTimeout(() => {
      setFeedback(null);
    }, 3500);
  };

  // Persist custom attributes
  useEffect(() => {
    try {
      localStorage.setItem('persona_acs_custom_attributes', JSON.stringify(customAttributes));
    } catch {
      // ignore
    }
  }, [customAttributes]);

  const handleUpdateRequiredCmsField = (id: string, newCmsField: string) => {
    setRequiredFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, cmsField: newCmsField } : f))
    );
    showToast(`Updated CMS mapping to "${newCmsField}"`, 'info');
  };

  const handleUpdateNativeCmsField = (id: string, newCmsField: string) => {
    setNativeAttributes((prev) =>
      prev.map((a) => (a.id === id ? { ...a, cmsField: newCmsField } : a))
    );
    showToast(`Updated CMS mapping to "${newCmsField}"`, 'info');
  };

  const handleUpdateCustomCmsField = (id: string, newCmsField: string) => {
    setCustomAttributes((prev) =>
      prev.map((a) => (a.id === id ? { ...a, cmsField: newCmsField } : a))
    );
    showToast(`Updated CMS mapping to "${newCmsField}"`, 'info');
  };

  const handleAddCustomAttribute = (attr: AcsCustomAttribute) => {
    setCustomAttributes((prev) => [...prev, attr]);
    showToast(`Added custom attribute "${attr.acsKey}" to Table 2`, 'success');
  };

  const handleDeleteCustomAttribute = (id: string, keyName: string) => {
    setCustomAttributes((prev) => prev.filter((a) => a.id !== id));
    showToast(`Removed attribute "${keyName}"`, 'info');
  };

  const handleUpdateSample = (id: string, newSample: string) => {
    setCustomAttributes((prev) =>
      prev.map((a) => (a.id === id ? { ...a, sample: newSample } : a))
    );
  };

  const handleUpdateType = (id: string, newType: 'text' | 'number' | 'boolean') => {
    setCustomAttributes((prev) =>
      prev.map((a) => (a.id === id ? { ...a, type: newType } : a))
    );
  };

  const handleResetAll = () => {
    if (confirm('Reset custom attributes and mapping configuration to default ACS schema specification?')) {
      localStorage.removeItem('persona_acs_custom_attributes');
      setRequiredFields(INITIAL_ACS_REQUIRED_FIELDS);
      setNativeAttributes(INITIAL_ACS_NATIVE_ATTRIBUTES);
      setCustomAttributes(INITIAL_ACS_CUSTOM_ATTRIBUTES);
      setSizeChartSelection('none');
      if (onResetDefaults) {
        onResetDefaults();
      }
      showToast('Reset mappings to default ACS specification', 'info');
    }
  };

  // Sizing system overrides logic
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

  const unassignedBrands = availableBrands.filter(
    (b) => !sizingConfig.brandOverrides || !(b in sizingConfig.brandOverrides)
  );

  // Search filtering
  const q = searchQuery.toLowerCase().trim();
  const filteredRequired = requiredFields.filter(
    (f) =>
      !q ||
      f.acsField.toLowerCase().includes(q) ||
      (f.cmsField && f.cmsField.toLowerCase().includes(q)) ||
      f.shopify.toLowerCase().includes(q) ||
      f.wooCommerce.toLowerCase().includes(q) ||
      (f.description && f.description.toLowerCase().includes(q))
  );

  const filteredNative = nativeAttributes.filter(
    (a) =>
      !q ||
      a.acsField.toLowerCase().includes(q) ||
      (a.cmsField && a.cmsField.toLowerCase().includes(q)) ||
      a.shopify.toLowerCase().includes(q) ||
      a.wooCommerce.toLowerCase().includes(q) ||
      (a.resolverRule && a.resolverRule.toLowerCase().includes(q))
  );

  const filteredCustom = customAttributes.filter(
    (c) =>
      !q ||
      c.acsKey.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      (c.cmsField && c.cmsField.toLowerCase().includes(q)) ||
      c.sample.toLowerCase().includes(q) ||
      (c.shopifySource && c.shopifySource.toLowerCase().includes(q)) ||
      (c.wooCommerceSource && c.wooCommerceSource.toLowerCase().includes(q))
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Toast Notification */}
      {feedback && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl border border-slate-800 animate-slideUp">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Minimal Top Sub-Bar: Quick expand/collapse controls */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 text-sm">ACS Schema Mappings</span>
          <span className="text-slate-300">·</span>
          <span className="text-xs text-slate-500">Google Cloud Retail (ACS) Ingestion Engine</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIsTable1Open(true);
              setIsTable2Open(true);
            }}
            className="px-2.5 py-1 text-xs font-semibold text-purple-700 hover:text-purple-900 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
          >
            Expand All
          </button>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            onClick={() => {
              setIsTable1Open(false);
              setIsTable2Open(false);
            }}
            className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TABLE 1 — Main & Required Attributes (Required Fields + Native Attributes) */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Table Header Banner - Collapsible */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isTable1Open}
          onClick={() => setIsTable1Open(!isTable1Open)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsTable1Open(!isTable1Open);
            }
          }}
          className={`px-6 py-4.5 bg-gradient-to-r from-purple-50/70 via-white to-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 cursor-pointer select-none hover:bg-purple-50/30 transition-colors ${
            isTable1Open ? 'border-b border-slate-200' : ''
          }`}
        >
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                1
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Table 1 — Main attributes
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                12 Required
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                6 Native Attributes
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                1 Size Chart Spec
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Core product catalog specifications required for ingestion into Google ACS product indexes, native attributes, and catalog size chart.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
              18 of 18 Auto-Mapped
            </span>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 shadow-2xs">
              <span>{isTable1Open ? 'Collapse' : 'Expand'}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${
                  isTable1Open ? 'rotate-180' : ''
                }`}
              />
            </div>
          </div>
        </div>

        {/* Table Content */}
        {isTable1Open && (
          <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider select-none">
                <th className="py-3 px-6 w-1/3">ACS field</th>
                <th className="py-3 px-6 w-5/12">
                  <div className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-purple-600" />
                    <span>CMS Column (Map To)</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 uppercase">
                      Dropdown Selector
                    </span>
                  </div>
                </th>
                <th className="py-3 px-6 w-1/4">Sample</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {/* Section: Required Schema Fields */}
              <tr className="bg-slate-50/70 border-b border-slate-200/80">
                <td colSpan={3} className="py-2 px-6">
                  <span className="font-bold text-[11px] uppercase tracking-wider text-slate-700">
                    Required Fields (12)
                  </span>
                </td>
              </tr>
              {filteredRequired.map((row) => (
                <tr key={row.id} className="hover:bg-purple-50/20 transition-colors group">
                  {/* ACS Field */}
                  <td className="py-3.5 px-6 align-top">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-purple-950 bg-purple-50/80 px-2 py-0.5 rounded border border-purple-200/70 inline-block">
                          {row.acsField}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-100">
                          req
                        </span>
                      </div>
                      {row.description && (
                        <span className="text-[11px] text-slate-500 max-w-xs leading-snug">
                          {row.description}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* CMS Column Dropdown */}
                  <td className="py-3.5 px-6 align-top">
                    <div className="space-y-1.5">
                      <CmsFieldSelect
                        value={row.cmsField || (platform === 'woocommerce' ? row.wooCommerce : row.shopify)}
                        onChange={(val) => handleUpdateRequiredCmsField(row.id, val)}
                        accentColor="purple"
                      />
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                          <Check className="w-2.5 h-2.5 text-emerald-600" />
                          <span>Mapped to CMS</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {platform} field
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Sample Payload */}
                  <td className="py-3.5 px-6 align-top">
                    <div className="space-y-1">
                      <span className="font-mono text-xs text-slate-800 bg-slate-100/90 px-2 py-1 rounded border border-slate-200/80 inline-block max-w-xs truncate" title={row.sample}>
                        {row.sample || '—'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}

              {/* Section: Native Attributes */}
              <tr className="bg-slate-50/70 border-y border-slate-200/80">
                <td colSpan={3} className="py-2 px-6">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] uppercase tracking-wider text-slate-700">
                      Native Attributes (6) — Option-Name Resolver
                    </span>
                    <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                      Synonym Routing Active
                    </span>
                  </div>
                </td>
              </tr>
              {filteredNative.map((row) => {
                const isSizeField = row.acsField === 'sizes';

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors group ${
                      isSizeField ? 'bg-purple-50/30' : 'hover:bg-blue-50/20'
                    }`}
                  >
                    {/* ACS Field */}
                    <td className="py-3.5 px-6 align-top">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-blue-950 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-200/70 inline-block">
                            {row.acsField}
                          </span>
                          <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded">
                            Native
                          </span>
                        </div>
                        {row.resolverRule && (
                          <p className="text-[11px] text-slate-500 leading-snug">
                            {row.resolverRule}
                          </p>
                        )}

                        {/* If sizes, embed the Sizing System Configuration */}
                        {isSizeField && (
                          <div className="pt-2 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Sizing System Dropdown */}
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-purple-300 rounded-lg text-xs font-semibold shadow-2xs">
                                <Globe2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                <span className="text-purple-950 font-bold">Default System:</span>
                                <div className="relative inline-block">
                                  <select
                                    value={sizingConfig.defaultSystem}
                                    onChange={(e) =>
                                      handleDefaultSystemChange(e.target.value as SizingSystemOption)
                                    }
                                    className="appearance-none pl-2 pr-6 py-0.5 text-xs font-bold text-purple-900 bg-purple-50 border border-purple-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-400 cursor-pointer"
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

                              {/* Brand Overrides Button */}
                              <button
                                type="button"
                                onClick={() => setIsOverridesExpanded(!isOverridesExpanded)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                                  activeOverrideCount > 0 || isOverridesExpanded
                                    ? 'bg-purple-100 text-purple-900 border-purple-300 shadow-2xs'
                                    : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200 shadow-2xs'
                                }`}
                              >
                                <Settings className="w-3.5 h-3.5 text-purple-600" />
                                <span>Brand Overrides</span>
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
                              <div className="space-y-2 bg-white p-3 rounded-xl border border-purple-200 shadow-2xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-slate-700">
                                    Custom Brand Sizing Overrides
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    Only for labels diverging from {sizingConfig.defaultSystem} standard
                                  </span>
                                </div>

                                {activeOverrides.length > 0 ? (
                                  <div className="space-y-1.5">
                                    {activeOverrides.map(([brandName, sys]) => (
                                      <div
                                        key={brandName}
                                        className="flex items-center justify-between gap-2 p-1.5 px-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs shadow-2xs"
                                      >
                                        <span className="font-bold text-slate-800">{brandName}</span>
                                        <div className="flex items-center gap-1.5">
                                          <select
                                            value={sys}
                                            onChange={(e) =>
                                              handleUpdateBrandOverride(
                                                brandName,
                                                e.target.value as SizingSystemOption
                                              )
                                            }
                                            className="text-xs font-semibold bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-400"
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
                                  <div className="text-[11px] text-slate-400 italic py-1.5 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                    No brand overrides set. All brands will use <strong>{sizingConfig.defaultSystem}</strong> sizing.
                                  </div>
                                )}

                                {/* Add New Brand Override Row */}
                                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                                  <select
                                    value={selectedBrandToAdd}
                                    onChange={(e) => setSelectedBrandToAdd(e.target.value)}
                                    className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-400"
                                  >
                                    <option value="">Select brand...</option>
                                    {unassignedBrands.map((b) => (
                                      <option key={b} value={b}>
                                        {b}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={selectedSystemToAdd}
                                    onChange={(e) =>
                                      setSelectedSystemToAdd(e.target.value as SizingSystemOption)
                                    }
                                    className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-400"
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
                                    className="inline-flex items-center gap-1 px-3 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs shadow-2xs transition-colors cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Add</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* CMS Column Dropdown */}
                    <td className="py-3.5 px-6 align-top">
                      <div className="space-y-1.5">
                        <CmsFieldSelect
                          value={row.cmsField || (platform === 'woocommerce' ? row.wooCommerce : row.shopify)}
                          onChange={(val) => handleUpdateNativeCmsField(row.id, val)}
                          accentColor="blue"
                        />
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
                            <Check className="w-2.5 h-2.5 text-blue-600" />
                            <span>Resolver Key</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {platform} field
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Sample Option / Resolver Pattern (End column) */}
                    <td className="py-3.5 px-6 align-top">
                      <div className="space-y-1">
                        <span className="font-mono text-xs text-slate-800 bg-slate-100/90 px-2 py-1 rounded border border-slate-200/80 inline-block max-w-xs truncate" title={row.sample}>
                          {row.sample || '—'}
                        </span>
                        {isSizeField && (
                          <div className="text-[11px] text-purple-700 bg-purple-50/70 p-2 rounded-lg border border-purple-200/60 mt-1">
                            <span className="font-semibold">Resolver sample values:</span>
                            <div className="font-mono text-[10px] mt-0.5 text-purple-900">
                              ['S', 'M', 'L', 'XL']
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Section: Size Chart Specification (Dedicated row, separated from sizes) */}
              {(!q ||
                'size_chart'.includes(q) ||
                'size chart'.includes(q) ||
                'chart'.includes(q) ||
                sizeChartSelection.toLowerCase().includes(q)) && (
                <>
                  <tr className="bg-slate-50/70 border-y border-slate-200/80">
                    <td colSpan={3} className="py-2 px-6">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] uppercase tracking-wider text-slate-700">
                          Catalog Size Chart Specification
                        </span>
                        <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                          Fit & Sizing Model
                        </span>
                      </div>
                    </td>
                  </tr>
                  <tr className="hover:bg-indigo-50/20 transition-colors group bg-indigo-50/10">
                    {/* ACS Field */}
                    <td className="py-3.5 px-6 align-top">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-indigo-950 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-200/70 inline-block">
                            size_chart
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200/80">
                            Catalog Spec
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-snug">
                          Store size chart specification applied to catalog items (or select &quot;Don&apos;t have a size chart&quot;)
                        </p>
                      </div>
                    </td>

                    {/* CMS Column / Size Chart Dropdown Selector */}
                    <td className="py-3.5 px-6 align-top">
                      <div className="space-y-1.5 max-w-xs">
                        <div className="relative">
                          <select
                            id="catalog-size-chart-select"
                            value={sizeChartSelection}
                            onChange={(e) => handleSizeChartChange(e.target.value)}
                            className={`w-full appearance-none pl-2.5 pr-7 py-2 text-xs font-semibold rounded-lg border shadow-2xs focus:outline-none focus:ring-2 cursor-pointer truncate ${
                              sizeChartSelection === 'none'
                                ? 'bg-white text-slate-700 border-slate-200 focus:ring-indigo-300 hover:border-slate-300'
                                : 'bg-indigo-50 text-indigo-950 border-indigo-300 font-bold focus:ring-indigo-400 ring-2 ring-indigo-200/60'
                            }`}
                            title="Select size chart or specify if store doesn't have a size chart"
                          >
                            <option value="none">Don&apos;t have a size chart / Create with AI (Steps 2–5)</option>
                            <optgroup label="Select Existing Size Chart (Skips Steps 2–5 &rarr; Direct to Step 6)">
                              <option value="Standard Apparel (XS-3XL / Alpha)">
                                Standard Apparel (XS-3XL / Alpha)
                              </option>
                              <option value="Footwear & Shoes (US / EU / UK / CM)">
                                Footwear & Shoes (US / EU / UK / CM)
                              </option>
                              <option value="Pants & Trousers (Waist x Inseam)">
                                Pants & Trousers (Waist x Inseam)
                              </option>
                              <option value="Women's Tops & Dresses (0-16 / 32-48)">
                                Women&apos;s Tops & Dresses (0-16 / 32-48)
                              </option>
                              <option value="Men's Tailoring & Shirts (Chest / Collar)">
                                Men&apos;s Tailoring & Shirts (Chest / Collar)
                              </option>
                              <option value="Kids & Toddlers (Age / Height)">
                                Kids & Toddlers (Age / Height)
                              </option>
                              <option value="Custom Size Chart (Upload / Link)">
                                Custom Size Chart (Upload / Link)
                              </option>
                            </optgroup>
                          </select>
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>

                        {sizeChartSelection === 'none' ? (
                          <span className="text-[10px] text-slate-400 italic block leading-tight">
                            No size chart attached · Full AI sizing pipeline (Steps 2 to 5) will run
                          </span>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                <Check className="w-2.5 h-2.5 text-indigo-700 stroke-[3]" />
                                Attached
                              </span>
                              <span className="text-[10px] text-indigo-700 font-medium truncate max-w-[170px]" title={sizeChartSelection}>
                                {sizeChartSelection}
                              </span>
                            </div>

                            <div className="p-2 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200/80 text-[11px] text-indigo-950 flex items-start gap-1.5 leading-snug">
                              <FastForward className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold text-indigo-900">Existing Chart Active:</span> Steps 2–5 (Preview, Discovery, Research, Assignment) are skipped. You can proceed directly to <strong>Step 6: Active Overview</strong>.
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Sample */}
                    <td className="py-3.5 px-6 align-top">
                      <div className="space-y-1">
                        <span
                          className="font-mono text-xs text-slate-800 bg-slate-100/90 px-2 py-1 rounded border border-slate-200/80 inline-block max-w-xs truncate"
                          title={sizeChartSelection !== 'none' ? sizeChartSelection : 'No size chart specified'}
                        >
                          {sizeChartSelection !== 'none' ? `${sizeChartSelection.split(' ')[0]} Chart Spec` : 'None'}
                        </span>
                        {sizeChartSelection !== 'none' && (
                          <p className="text-[10px] text-slate-400 font-mono truncate">
                            Active sizing matrix attached
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* TABLE 2 — Custom attributes */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Table Header Banner - Collapsible */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isTable2Open}
          onClick={() => setIsTable2Open(!isTable2Open)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsTable2Open(!isTable2Open);
            }
          }}
          className={`px-6 py-4.5 bg-gradient-to-r from-emerald-50/70 via-white to-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 cursor-pointer select-none hover:bg-emerald-50/30 transition-colors ${
            isTable2Open ? 'border-b border-slate-200' : ''
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                2
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Table 2 — Custom attributes
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                {customAttributes.length} Defined
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
              Anything the resolver doesn't match becomes <code className="font-mono font-semibold text-emerald-800 bg-emerald-50 px-1 py-0.2 rounded">attributes.&lt;slugified_name&gt;</code>.
              Add new custom product attributes below and configure indexing & searchability.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsTable2Open(true);
                setIsAddModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100/90 hover:bg-emerald-200 border border-emerald-300 rounded-xl shadow-2xs transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-700" />
              <span>Add Custom Attribute</span>
            </button>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 shadow-2xs">
              <span>{isTable2Open ? 'Collapse' : 'Expand'}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${
                  isTable2Open ? 'rotate-180' : ''
                }`}
              />
            </div>
          </div>
        </div>

        {/* Table Content & Footer */}
        {isTable2Open && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider select-none">
                    <th className="py-3 px-6 w-1/4">ACS key</th>
                    <th className="py-3 px-4 w-28">Type</th>
                    <th className="py-3 px-6 w-5/12">
                      <div className="flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-emerald-600" />
                        <span>CMS Column (Map To)</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 uppercase">
                          Dropdown
                        </span>
                      </div>
                    </th>
                    <th className="py-3 px-6 w-1/3 text-left">Sample</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredCustom.map((row) => (
                    <tr key={row.id} className="hover:bg-emerald-50/20 transition-colors group">
                      {/* ACS Key */}
                      <td className="py-3.5 px-6 align-middle">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-emerald-950 bg-emerald-50/80 px-2.5 py-1 rounded-lg border border-emerald-200/80 inline-block">
                            {row.acsKey}
                          </span>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-3.5 px-4 align-middle">
                        <select
                          value={row.type}
                          onChange={(e) =>
                            handleUpdateType(row.id, e.target.value as 'text' | 'number' | 'boolean')
                          }
                          className="text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer"
                        >
                          <option value="text">text</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                        </select>
                      </td>

                      {/* CMS Column Dropdown */}
                      <td className="py-3.5 px-6 align-middle">
                        <div className="space-y-1.5 max-w-sm">
                          <CmsFieldSelect
                            value={row.cmsField || (platform === 'woocommerce' ? row.wooCommerceSource : row.shopifySource)}
                            onChange={(val) => handleUpdateCustomCmsField(row.id, val)}
                            accentColor="emerald"
                          />
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                              <Check className="w-2.5 h-2.5 text-emerald-600" />
                              <span>Mapped to CMS</span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono truncate max-w-[180px]" title={platform === 'woocommerce' ? row.wooCommerceSource : row.shopifySource}>
                              {platform === 'woocommerce' ? row.wooCommerceSource || `pa_${row.name.toLowerCase()}` : row.shopifySource || `option "${row.name}"`}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Sample Value (End Column with Delete) */}
                      <td className="py-3.5 px-6 align-middle">
                        <div className="flex items-center gap-2 max-w-xs">
                          <input
                            type="text"
                            value={row.sample}
                            onChange={(e) => handleUpdateSample(row.id, e.target.value)}
                            placeholder="Sample value..."
                            className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 text-slate-800"
                            title="Edit representative sample value"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomAttribute(row.id, row.acsKey)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                            title={`Delete ${row.acsKey}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredCustom.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-6 text-center text-xs text-slate-400 italic bg-slate-50/50"
                      >
                        No custom attributes defined. Click "+ Add Custom Attribute" to create one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table 2 Footer quick-add prompt */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                Custom attributes automatically append to the product payload under <code className="font-mono text-emerald-800">attributes.&lt;slug&gt;</code>
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsTable2Open(true);
                  setIsAddModalOpen(true);
                }}
                className="text-emerald-700 hover:text-emerald-900 font-bold underline cursor-pointer"
              >
                + Add New Custom Attribute
              </button>
            </div>
          </>
        )}
      </section>

      {/* Global Bottom Confirmation Bar */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-sm font-bold text-slate-900">
              {requiredFields.length} Required + {nativeAttributes.length} Native + {customAttributes.length} Custom Attributes Aligned
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Default Sizing System: <strong className="text-purple-700">{sizingConfig.defaultSystem}</strong>
            {activeOverrideCount > 0 ? ` (${activeOverrideCount} brand overrides)` : ''} · Schema ready for catalog item ingestion
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleResetAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-3 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer shadow-2xs"
            title="Reset all tables to standard ACS schema defaults"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset Defaults</span>
          </button>

          {sizeChartSelection !== 'none' ? (
            <button
              type="button"
              onClick={onNext}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:opacity-95 shadow-md shadow-indigo-500/25 active:scale-98 transition-all cursor-pointer ring-2 ring-indigo-300 ring-offset-1"
              title="Skip steps 2–5 and jump directly to Step 6: Active Overview"
            >
              <FastForward className="w-4 h-4" />
              <span>Skip to Step 6 (Active Overview)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onNext}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] hover:opacity-95 shadow-md shadow-purple-500/25 active:scale-98 transition-all cursor-pointer"
            >
              <span>Confirm Mapping &amp; Continue (Step 2)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Add Custom Attribute Modal */}
      <AddCustomAttributeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddCustomAttribute}
        existingKeys={customAttributes.map((c) => c.acsKey)}
      />
    </div>
  );
}
