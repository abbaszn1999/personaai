import { useState, FormEvent } from 'react';
import { X, Plus, Sliders, Database, ChevronDown } from 'lucide-react';
import { AcsCustomAttribute } from '../types';
import { AVAILABLE_CMS_FIELDS } from '../data/acsMappingData';

interface AddCustomAttributeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (attribute: AcsCustomAttribute) => void;
  existingKeys: string[];
}

export function AddCustomAttributeModal({
  isOpen,
  onClose,
  onAdd,
  existingKeys,
}: AddCustomAttributeModalProps) {
  const [name, setName] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [type, setType] = useState<'text' | 'number' | 'boolean'>('text');
  const [sample, setSample] = useState('');
  const [cmsField, setCmsField] = useState('options.Fit');
  const [isCustomCmsInput, setIsCustomCmsInput] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Auto-slugify name into attributes.<slug>
  const handleNameChange = (val: string) => {
    setName(val);
    const slug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    setCustomKey(slug ? `attributes.${slug}` : '');
    if (!isCustomCmsInput) {
      setCmsField(val.trim() ? `options.${val.trim()}` : 'options.Fit');
    }
    setError(null);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const finalKey = customKey.trim();

    if (!finalKey) {
      setError('ACS Key is required');
      return;
    }

    if (!finalKey.startsWith('attributes.')) {
      setError('ACS Key must start with "attributes." (e.g. attributes.fit)');
      return;
    }

    if (existingKeys.includes(finalKey)) {
      setError(`Key "${finalKey}" already exists in Table 3`);
      return;
    }

    if (!sample.trim()) {
      setError('Please provide a representative sample value');
      return;
    }

    const finalCmsField = cmsField.trim() || `options.${name.trim() || 'Custom'}`;

    const newAttr: AcsCustomAttribute = {
      id: `cust-${Date.now()}`,
      acsKey: finalKey,
      name: name.trim() || finalKey.replace('attributes.', ''),
      type,
      indexable: true,
      searchable: true,
      sample: sample.trim(),
      cmsField: finalCmsField,
      shopifySource: finalCmsField,
      wooCommerceSource: `pa_${finalKey.replace('attributes.', '')}`,
    };

    onAdd(newAttr);
    // Reset form
    setName('');
    setCustomKey('');
    setType('text');
    setSample('');
    setCmsField('options.Fit');
    setIsCustomCmsInput(false);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-purple-50 via-pink-50/40 to-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs shadow-purple-500/20">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Add Custom Attribute</h3>
              <p className="text-xs text-slate-500">Map un-resolved store options into ACS attributes</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
              {error}
            </div>
          )}

          {/* Attribute Label & Slug */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Attribute Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Closure Type, Rise, Fit"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                autoFocus
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Human-readable option title</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ACS Key <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="attributes.<name>"
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 text-purple-900"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Prefixed with attributes.</span>
            </div>
          </div>

          {/* Type Selection & Sample */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Data Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'text' | 'number' | 'boolean')}
                className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer"
              >
                <option value="text">text (String)</option>
                <option value="number">number (Decimal/Int)</option>
                <option value="boolean">boolean (True/False)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Sample Value <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={sample}
                onChange={(e) => setSample(e.target.value)}
                placeholder="e.g. zipper, button-down, 7.5"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
          </div>

          {/* CMS Field Mapping Dropdown */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                CMS Field Mapping
              </label>
              <button
                type="button"
                onClick={() => setIsCustomCmsInput(!isCustomCmsInput)}
                className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 underline cursor-pointer"
              >
                {isCustomCmsInput ? 'Choose from list' : '+ Enter custom key'}
              </button>
            </div>

            {isCustomCmsInput ? (
              <input
                type="text"
                value={cmsField}
                onChange={(e) => setCmsField(e.target.value)}
                placeholder="e.g. options.Closure, metafield.custom.neck"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 text-slate-800"
              />
            ) : (
              <div className="relative">
                <select
                  value={cmsField}
                  onChange={(e) => setCmsField(e.target.value)}
                  className="w-full appearance-none pl-3 pr-8 py-2 text-xs font-mono font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer"
                >
                  {name && !AVAILABLE_CMS_FIELDS.flatMap((g) => g.options).some((o) => o.value === `options.${name}`) && (
                    <option value={`options.${name}`}>options.{name} (Generated from name)</option>
                  )}
                  {AVAILABLE_CMS_FIELDS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
            <span className="text-[10px] text-slate-400 block">
              The store/CMS attribute or metafield mapped to this ACS custom property
            </span>
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md shadow-purple-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add to Table 3</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
