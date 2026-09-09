import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Sparkles,
  Plus,
  Trash2,
  Check,
  PackageCheck,
  FolderTree,
  ChevronDown,
  Code2,
  Table as TableIcon,
  Sliders,
} from 'lucide-react';
import {
  GapItem,
  SizingSystemOption,
  StoreSizingSystemConfig,
  ParentCategoryType,
  MultiSystemSizingData,
} from '../types';
import {
  STANDARD_CATEGORY_SIZING_TEMPLATES,
  CATEGORY_TEMPLATE_METADATA,
  normalizeToParentCategory,
} from '../utils/sizingStandards';

interface GapFillModalProps {
  item: GapItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedItem: GapItem) => void;
  sizingConfig?: StoreSizingSystemConfig;
}

export function GapFillModal({
  item,
  isOpen,
  onClose,
  onSave,
  sizingConfig,
}: GapFillModalProps) {
  if (!isOpen || !item) return null;

  // Determine parent category
  const parentCategory: ParentCategoryType = useMemo(() => {
    if (item.parentCategory) return item.parentCategory;
    return normalizeToParentCategory(item.categoryPath || item.title || '');
  }, [item]);

  // Determine what sizing system was chosen in Tab 1 for this brand/store
  const brandName = item.brandName || '';
  const storeSelectedSystem: SizingSystemOption = useMemo(() => {
    if (!sizingConfig) return 'US';
    if (brandName && sizingConfig.brandOverrides[brandName]) {
      return sizingConfig.brandOverrides[brandName];
    }
    return sizingConfig.defaultSystem || 'US';
  }, [sizingConfig, brandName]);

  // Active sizing system dropdown state in modal
  const [activeSystem, setActiveSystem] = useState<SizingSystemOption>(storeSelectedSystem);

  // Sub-view toggle (Table vs JSON)
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');

  // Multi-system data state for this template
  const [multiSystemData, setMultiSystemData] = useState<MultiSystemSizingData>(() => {
    return JSON.parse(
      JSON.stringify(
        item.multiSystemData || STANDARD_CATEGORY_SIZING_TEMPLATES[parentCategory]
      )
    );
  });

  const [isAutoFilledNotification, setIsAutoFilledNotification] = useState(false);

  useEffect(() => {
    if (item) {
      setActiveSystem(storeSelectedSystem);
      const initialMulti = item.multiSystemData
        ? JSON.parse(JSON.stringify(item.multiSystemData))
        : JSON.parse(JSON.stringify(STANDARD_CATEGORY_SIZING_TEMPLATES[parentCategory]));

      // If initial item had columns/rows, seed them into the storeSelectedSystem
      if (item.columns && item.columns.length > 0 && item.rows && item.rows.length > 0) {
        initialMulti[storeSelectedSystem] = {
          headers: [...item.columns],
          rows: JSON.parse(JSON.stringify(item.rows)),
        };
      }

      setMultiSystemData(initialMulti);
    }
  }, [item, parentCategory, storeSelectedSystem]);

  const currentTable = multiSystemData[activeSystem] ||
    STANDARD_CATEGORY_SIZING_TEMPLATES[parentCategory][activeSystem];

  const handleCellChange = (
    system: SizingSystemOption,
    rowIndex: number,
    columnKey: string,
    value: string
  ) => {
    setMultiSystemData((prev) => {
      const copy = { ...prev };
      const currentSys = { ...copy[system] };
      const currentRows = [...currentSys.rows];
      currentRows[rowIndex] = { ...currentRows[rowIndex], [columnKey]: value };
      currentSys.rows = currentRows;
      copy[system] = currentSys;
      return copy;
    });
  };

  const handleAddRow = (system: SizingSystemOption) => {
    setMultiSystemData((prev) => {
      const copy = { ...prev };
      const currentSys = { ...copy[system] };
      const newRow: Record<string, string> = {};
      currentSys.headers.forEach((h, idx) => {
        newRow[h] = idx === 0 ? 'Custom' : '';
      });
      currentSys.rows = [...currentSys.rows, newRow];
      copy[system] = currentSys;
      return copy;
    });
  };

  const handleDeleteRow = (system: SizingSystemOption, rowIndex: number) => {
    setMultiSystemData((prev) => {
      const copy = { ...prev };
      const currentSys = { ...copy[system] };
      if (currentSys.rows.length <= 1) return prev;
      currentSys.rows = currentSys.rows.filter((_, idx) => idx !== rowIndex);
      copy[system] = currentSys;
      return copy;
    });
  };

  const handleSmartAutoFill = () => {
    const template = JSON.parse(
      JSON.stringify(STANDARD_CATEGORY_SIZING_TEMPLATES[parentCategory])
    );
    setMultiSystemData(template);
    setIsAutoFilledNotification(true);
    setTimeout(() => setIsAutoFilledNotification(false), 3000);
  };

  const handleSave = () => {
    onSave({
      ...item,
      parentCategory,
      columns: currentTable.headers,
      rows: currentTable.rows,
      multiSystemData,
      status: 'complete',
    });
    onClose();
  };

  const currentJsonString = JSON.stringify(
    {
      template_id: item.id,
      brand_name: item.brandName,
      parent_category: parentCategory,
      category_path: item.categoryPath,
      selected_sizing_system: activeSystem,
      is_store_mapped_system: activeSystem === storeSelectedSystem,
      sku_count: item.skuCount,
      headers: currentTable.headers,
      size_chart_matrix: currentTable.rows,
    },
    null,
    2
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="relative bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-slate-200 bg-slate-50/70 flex items-start justify-between flex-shrink-0">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-xl font-bold text-slate-900">{item.brandName}</h3>
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                <FolderTree className="w-3.5 h-3.5 text-purple-500" />
                {item.categoryPath || parentCategory}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 font-mono">
                {item.skuCount} SKUs
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Provide size dimension template for this brand/category across US, UK, and EU sizing standards.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sizing System Indicator Toolbar */}
        <div className="px-6 py-3 bg-purple-50/70 border-b border-purple-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-semibold">Store Size Type:</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-white text-purple-900 border border-purple-200 shadow-xs">
              <Sliders className="w-3.5 h-3.5 text-purple-600" />
              {storeSelectedSystem} Sizing
              <span className="text-[10px] text-purple-600/80 font-normal">(from Column Mapping)</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex p-0.5 rounded-lg bg-slate-200/80 border border-slate-300 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-purple-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TableIcon className="w-3 h-3 text-purple-600" />
                <span>Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('json')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  viewMode === 'json'
                    ? 'bg-slate-900 text-pink-300 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Code2 className="w-3 h-3 text-pink-400" />
                <span>JSON</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Sample Affected Products */}
          {item.sampleProducts && item.sampleProducts.length > 0 && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-purple-600" />
                  Matched Products in Catalog ({item.sampleProducts.length} shown)
                </span>
                <span className="text-[11px] text-slate-500">Parent Category: <strong>{parentCategory}</strong></span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {item.sampleProducts.map((prod) => (
                  <div
                    key={prod.sku}
                    className="flex items-center gap-2.5 p-2 bg-white border border-slate-200 rounded-lg shadow-xs"
                  >
                    <img
                      src={prod.imageUrl}
                      alt={prod.title}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-md object-cover flex-shrink-0 bg-slate-100 border border-slate-100"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 truncate">{prod.title}</p>
                      <span className="text-[10px] font-mono text-purple-600 font-bold">{prod.sku}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isAutoFilledNotification && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Standard {parentCategory} sizing metrics populated successfully across US/UK/EU.</span>
            </div>
          )}

          {viewMode === 'table' ? (
            /* Editable Table */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900">
                  {parentCategory} — {activeSystem} Sizing Matrix Table
                </h4>
                <button
                  type="button"
                  onClick={() => handleAddRow(activeSystem)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Size Row
                </button>
              </div>

              {CATEGORY_TEMPLATE_METADATA[parentCategory]?.notes && (
                <div className="p-2 rounded-lg bg-purple-50/60 border border-purple-200/70 text-[11px] text-purple-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                  <span>{CATEGORY_TEMPLATE_METADATA[parentCategory].notes}</span>
                </div>
              )}

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      {currentTable.headers.map((header) => {
                        const isReq =
                          header.toLowerCase().includes('size') ||
                          (parentCategory === 'Tops' && header.toLowerCase().includes('chest')) ||
                          (parentCategory === 'Outerwear / Jackets' && header.toLowerCase().includes('chest')) ||
                          (parentCategory === 'Bottoms' && header.toLowerCase().includes('waist')) ||
                          (parentCategory === 'Dresses / Full-body' && header.toLowerCase().includes('chest')) ||
                          (parentCategory === 'Footwear');

                        return (
                          <th key={header} className="px-3 py-2.5 font-bold">
                            <div className="flex items-center gap-1">
                              <span>{header}</span>
                              {isReq ? (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-purple-100 text-purple-800 font-mono font-bold">
                                  Req
                                </span>
                              ) : (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200/80 text-slate-600 font-mono font-normal">
                                  Opt
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                      <th className="px-3 py-2.5 w-12 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {currentTable.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/80 transition-colors">
                        {currentTable.headers.map((header, cIdx) => (
                          <td key={header} className="p-1.5">
                            <input
                              type="text"
                              value={row[header] || ''}
                              onChange={(e) =>
                                handleCellChange(activeSystem, rIdx, header, e.target.value)
                              }
                              className={`w-full px-2.5 py-1 text-xs rounded-md border border-slate-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-hidden ${
                                cIdx === 0
                                  ? 'font-bold text-slate-900 bg-slate-50/60'
                                  : 'text-slate-700 bg-white'
                              }`}
                            />
                          </td>
                        ))}
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(activeSystem, rIdx)}
                            disabled={currentTable.rows.length <= 1}
                            className={`p-1 rounded-md transition-colors ${
                              currentTable.rows.length <= 1
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer'
                            }`}
                            title="Delete size row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* JSON View */
            <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-[#0b0f19] shadow-inner text-xs font-mono">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400">
                <span className="text-pink-400 font-semibold flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-purple-400" />
                  {item.brandName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_
                  {parentCategory.toLowerCase().replace(/[^a-z0-9]/g, '_')}_
                  {activeSystem.toLowerCase()}_template.json
                </span>
                <span className="text-slate-500">application/json</span>
              </div>
              <pre className="p-4 text-emerald-400 overflow-x-auto max-h-[360px] overflow-y-auto scrollbar-thin text-xs leading-relaxed font-mono selection:bg-purple-800 selection:text-white">
                <code>{currentJsonString}</code>
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-slate-500">
            Edits applied to <strong>{activeSystem}</strong> will be saved to this size template.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Save Size Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
