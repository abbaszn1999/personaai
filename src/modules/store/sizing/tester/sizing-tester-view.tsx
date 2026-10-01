/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  User,
  Users,
  Baby,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  Shirt,
  Scissors,
  Footprints,
  Shield,
  ArrowRight,
  Info,
  Globe,
  Building2,
  ChevronDown,
  Check,
  Layers,
  Tag,
  Loader2,
  Eye,
  X,
} from 'lucide-react';
import type {
  MultiSystemRow,
  SizingTesterOptionsResponse,
  TesterBrand,
} from '@/modules/store/sizing/tester/options';
import {
  productFitsSize,
  summarizeSearch,
  testerSearchParams,
  type TesterSearchResponse,
} from '@/modules/store/sizing/tester/acs-result';

export type PersonaTarget = 'men' | 'women' | 'kid';
export type UnitSystem = 'metric' | 'imperial';
export type ParentCategoryKey = 'tops' | 'bottoms' | 'footwear' | 'outerwear' | 'dresses';
type SizingSystemMode = 'us' | 'eu' | 'uk';

/** One Found Sizes run: the request it was for and ACS's answer to it. */
interface SearchRun {
  key: string;
  data: TesterSearchResponse;
}

export function SizingTesterView() {
  const searchRequestId = useRef(0);
  const [testerBrands, setTesterBrands] = useState<TesterBrand[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // Target Persona
  const [persona, setPersona] = useState<PersonaTarget>('men');

  // Units
  const [unit, setUnit] = useState<UnitSystem>('metric');

  // Adult Inputs (Men / Women) in Metric base
  const [adultChest, setAdultChest] = useState<number>(98);
  const [adultWaist, setAdultWaist] = useState<number>(84);
  const [adultHips, setAdultHips] = useState<number>(99);
  const [adultLength, setAdultLength] = useState<number>(178);
  const [adultWeight, setAdultWeight] = useState<number>(75);
  const [adultFootLength, setAdultFootLength] = useState<number>(27.0);

  // Kid Inputs in Metric base
  const [kidAge, setKidAge] = useState<number>(7);
  const [kidHeight, setKidHeight] = useState<number>(124);
  const [kidChest, setKidChest] = useState<number>(63);
  const [kidWaist, setKidWaist] = useState<number>(58);
  const [kidHips, setKidHips] = useState<number>(66);
  const [kidFootLength, setKidFootLength] = useState<number>(19.8);

  // Selected Brand on right
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');

  // Selected Category on right
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<ParentCategoryKey>('tops');

  // Selected Subcategory on right
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>('');

  // Sizing standard mode: US, EU, UK
  const [sizingMode, setSizingMode] = useState<SizingSystemMode>('us');

  // The last Found Sizes run: the request it sent and what ACS answered
  const [searchRun, setSearchRun] = useState<SearchRun | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<{ key: string; message: string } | null>(null);

  // Popup Modal for the ACS products of one size (row) or of the whole answer (row = null)
  const [activeSizeItemsModal, setActiveSizeItemsModal] = useState<{
    sizeLabel: string | null;
    formattedSize: string;
    row: MultiSystemRow | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOptions() {
      setOptionsLoading(true);
      setOptionsError(null);
      try {
        const response = await fetch('/api/store-connection/sizing/tester/options', {
          signal: controller.signal,
        });
        const body = await response.json() as SizingTesterOptionsResponse & { error?: string };
        if (!response.ok) throw new Error(body.error || 'Could not load Sizing Tester options.');
        if (!Array.isArray(body.brands)) throw new Error('Sizing Tester options were invalid.');
        setTesterBrands(body.brands);
      } catch (error) {
        if (controller.signal.aborted) return;
        setOptionsError(error instanceof Error ? error.message : 'Could not load Sizing Tester options.');
      } finally {
        if (!controller.signal.aborted) setOptionsLoading(false);
      }
    }

    void loadOptions();
    return () => controller.abort();
  }, []);

  // Filter brands that support the current persona (or all brands if they have at least 1 category)
  const availableBrands = useMemo(() => {
    return testerBrands.filter((brand) =>
      brand.categories.some((cat) =>
        cat.subcategories.some((sub) => (sub.rowsByPersona[persona]?.length ?? 0) > 0)
      )
    );
  }, [persona, testerBrands]);

  // Current active brand
  const currentBrand = useMemo(() => {
    return availableBrands.find((b) => b.id === selectedBrandId) || availableBrands[0] || testerBrands[0];
  }, [availableBrands, selectedBrandId, testerBrands]);

  // Ensure selected brand is in available brands
  React.useEffect(() => {
    if (!availableBrands.some((b) => b.id === selectedBrandId)) {
      if (availableBrands[0]) {
        setSelectedBrandId(availableBrands[0].id);
      }
    }
  }, [availableBrands, selectedBrandId]);

  // Available categories for current brand and persona
  const brandCategories = useMemo(() => {
    if (!currentBrand) return [];
    return currentBrand.categories.filter((cat) =>
      cat.subcategories.some((sub) => (sub.rowsByPersona[persona]?.length ?? 0) > 0)
    );
  }, [currentBrand, persona]);

  // Ensure selected category is valid for this brand & persona
  React.useEffect(() => {
    if (!brandCategories.some((c) => c.key === selectedCategoryKey)) {
      if (brandCategories[0]) {
        setSelectedCategoryKey(brandCategories[0].key);
      }
    }
  }, [brandCategories, selectedCategoryKey]);

  // Active category object
  const currentCategory = useMemo(() => {
    return (
      brandCategories.find((c) => c.key === selectedCategoryKey) ||
      brandCategories[0]
    );
  }, [brandCategories, selectedCategoryKey]);

  // Available subcategories under the active category for current persona
  const availableSubcategories = useMemo(() => {
    if (!currentCategory) return [];
    return currentCategory.subcategories.filter(
      (sub) => (sub.rowsByPersona[persona]?.length ?? 0) > 0
    );
  }, [currentCategory, persona]);

  // Ensure selected subcategory is valid
  React.useEffect(() => {
    if (!availableSubcategories.some((s) => s.id === selectedSubcategoryId)) {
      if (availableSubcategories[0]) {
        setSelectedSubcategoryId(availableSubcategories[0].id);
      }
    }
  }, [availableSubcategories, selectedSubcategoryId]);

  // Active subcategory object
  const currentSubcategory = useMemo(() => {
    return (
      availableSubcategories.find((s) => s.id === selectedSubcategoryId) ||
      availableSubcategories[0]
    );
  }, [availableSubcategories, selectedSubcategoryId]);

  // Rows for the active subcategory
  const activeRows: MultiSystemRow[] = useMemo(() => {
    if (!currentSubcategory) return [];
    return currentSubcategory.rowsByPersona[persona] || [];
  }, [currentSubcategory, persona]);

  // Helper conversions
  const cmToIn = (cm: number) => Number((cm / 2.54).toFixed(1));
  const inToCm = (inches: number) => Number((inches * 2.54).toFixed(1));
  const kgToLbs = (kg: number) => Math.round(kg * 2.20462);
  const lbsToKg = (lbs: number) => Math.round(lbs / 2.20462);

  // Category Icon Resolver
  const getCategoryIcon = (key: ParentCategoryKey) => {
    switch (key) {
      case 'tops':
        return Shirt;
      case 'bottoms':
        return Scissors;
      case 'footwear':
        return Footprints;
      case 'outerwear':
        return Shield;
      case 'dresses':
        return Sparkles;
      default:
        return Shirt;
    }
  };

  // Sizing System Display Formatter
  const formatSizeForMode = (row: MultiSystemRow, mode: SizingSystemMode): string => {
    if (!row) return '—';
    if (mode === 'us') return row.usSize || row.sizeLabel;
    if (mode === 'eu') return row.euSize || row.sizeLabel;
    if (mode === 'uk') return row.ukSize || row.sizeLabel;
    return row.sizeLabel;
  };

  const testerMeasurements = useMemo(() => ({
    adultChest,
    adultWaist,
    adultHips,
    adultFootLength,
    kidHeight,
    kidChest,
    kidWaist,
    kidHips,
    kidFootLength,
  }), [
    adultChest,
    adultWaist,
    adultHips,
    adultFootLength,
    kidHeight,
    kidChest,
    kidWaist,
    kidHips,
    kidFootLength,
  ]);

  // The request Found Sizes sends for the inputs on screen. It holds exactly what reaches ACS, so
  // a slider that does not change it (weight, an adult's height) never makes an answer stale.
  const searchParams = useMemo(() => {
    if (!currentBrand || !currentCategory || !currentSubcategory) return null;
    return testerSearchParams({
      brand: currentBrand,
      group: currentCategory.key,
      audience: currentSubcategory.audience,
      chartVariant: currentSubcategory.name,
      persona,
      measurements: testerMeasurements,
    });
  }, [currentBrand, currentCategory, currentSubcategory, persona, testerMeasurements]);
  const searchKey = searchParams?.toString() ?? '';

  // Only ACS's answer to the request currently on screen is shown.
  const freshRun = searchRun && searchRun.key === searchKey ? searchRun : null;
  const shownSearchError = searchError && searchError.key === searchKey ? searchError.message : null;
  const acsProducts = useMemo(() => freshRun?.data.products ?? [], [freshRun]);

  const searchSummary = useMemo(() => {
    if (!freshRun || !currentCategory || !currentSubcategory) {
      return { counts: activeRows.map(() => 0), bestIndex: -1 };
    }
    const deciding = Object.fromEntries(freshRun.data.tolerances.map((entry) => [entry.measurement, entry.value]));
    return summarizeSearch(activeRows, currentCategory.key, currentSubcategory.audience, deciding, acsProducts);
  }, [freshRun, currentCategory, currentSubcategory, activeRows, acsProducts]);

  const bestRow = searchSummary.bestIndex >= 0 ? activeRows[searchSummary.bestIndex] ?? null : null;
  const productsWithFit = acsProducts.filter((product) => product.fitSizes.length > 0).length;

  const handleRunTest = async () => {
    if (!searchParams) return;
    const key = searchKey;
    const requestId = ++searchRequestId.current;
    setIsSearching(true);
    setSearchError(null);
    try {
      const response = await fetch(`/api/store-connection/sizing/tester/products?${key}`);
      const body = await response.json() as TesterSearchResponse;
      if (!response.ok) throw new Error(body.error || 'ACS did not answer the fit search.');
      if (!Array.isArray(body.products)) throw new Error('The ACS answer was invalid.');
      if (requestId === searchRequestId.current) setSearchRun({ key, data: body });
    } catch (error) {
      if (requestId === searchRequestId.current) {
        setSearchRun(null);
        setSearchError({ key, message: error instanceof Error ? error.message : 'ACS did not answer the fit search.' });
      }
    } finally {
      if (requestId === searchRequestId.current) setIsSearching(false);
    }
  };

  const handleResetDefaults = () => {
    if (persona === 'men') {
      setAdultChest(98);
      setAdultWaist(84);
      setAdultHips(99);
      setAdultLength(178);
      setAdultWeight(75);
      setAdultFootLength(27.0);
    } else if (persona === 'women') {
      setAdultChest(88);
      setAdultWaist(70);
      setAdultHips(95);
      setAdultLength(166);
      setAdultWeight(61);
      setAdultFootLength(24.2);
    } else {
      setKidAge(7);
      setKidHeight(124);
      setKidChest(63);
      setKidWaist(58);
      setKidHips(66);
      setKidFootLength(19.8);
    }
  };

  // The products one chart row stands for in the ACS answer, or all of them for row = null.
  const modalProducts = useMemo(() => {
    const label = activeSizeItemsModal?.sizeLabel;
    return label ? acsProducts.filter((product) => productFitsSize(product, label)) : acsProducts;
  }, [acsProducts, activeSizeItemsModal]);
  if (optionsLoading || optionsError || !currentBrand) {
    const message = optionsLoading
      ? 'Loading available size charts...'
      : optionsError || 'No published size charts are available for this sizing target.';
    return (
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs min-h-[620px] flex items-center justify-center p-8 text-center">
          <div>
            {optionsLoading && <Loader2 className="w-7 h-7 animate-spin text-purple-600 mx-auto mb-3" />}
            <p className="text-sm font-semibold text-slate-700">{message}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Top Banner & Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-800 bg-purple-100/90 px-2.5 py-0.5 rounded-full border border-purple-200">
              <Sparkles className="w-3 h-3 text-purple-600" />
              Interactive Sizing Engine
            </span>
            <span className="text-slate-400 text-xs">•</span>
            <span className="text-xs text-slate-500 font-medium">Smart Fit Matcher</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Sizing Tester &amp; Fit Simulator
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Send body measurements to ACS as the real fit filter and see exactly what it returns for a brand&apos;s size chart.
          </p>
        </div>

        {/* Global Controls: Metric Standard & Reset */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 text-slate-700 border border-slate-200 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-purple-600" />
            <span>Metric (cm / kg)</span>
          </span>

          <button
            type="button"
            onClick={handleResetDefaults}
            title="Reset to sample body dimensions"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Reset
          </button>
        </div>
      </div>

      {/* Main Grid: Left Side Controls | Right Side Size Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: Persona Selection & Dimension Inputs                         */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5">
            {/* Step 1: Who is sizing for? */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                1. Sizing Target
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {/* Men */}
                <button
                  type="button"
                  onClick={() => setPersona('men')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    persona === 'men'
                      ? 'bg-purple-50/80 border-purple-400 text-purple-950 shadow-2xs ring-2 ring-purple-200'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <User className={`w-5 h-5 mb-1.5 ${persona === 'men' ? 'text-purple-600' : 'text-slate-500'}`} />
                  <span className="text-xs font-bold">Men</span>
                  <span className="text-[10px] text-slate-400">Adult Menswear</span>
                </button>

                {/* Women */}
                <button
                  type="button"
                  onClick={() => setPersona('women')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    persona === 'women'
                      ? 'bg-purple-50/80 border-purple-400 text-purple-950 shadow-2xs ring-2 ring-purple-200'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Users className={`w-5 h-5 mb-1.5 ${persona === 'women' ? 'text-purple-600' : 'text-slate-500'}`} />
                  <span className="text-xs font-bold">Women</span>
                  <span className="text-[10px] text-slate-400">Adult Fashion</span>
                </button>

                {/* Kid */}
                <button
                  type="button"
                  onClick={() => setPersona('kid')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    persona === 'kid'
                      ? 'bg-purple-50/80 border-purple-400 text-purple-950 shadow-2xs ring-2 ring-purple-200'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Baby className={`w-5 h-5 mb-1.5 ${persona === 'kid' ? 'text-purple-600' : 'text-slate-500'}`} />
                  <span className="text-xs font-bold">Kid</span>
                  <span className="text-[10px] text-slate-400">Junior &amp; Toddler</span>
                </button>
              </div>
            </div>

            {/* Step 2: Input Dimensions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  2. Body Dimensions (Metric cm, kg)
                </label>
                <span className="text-[11px] text-slate-400 font-medium">Sent to ACS on Found Sizes</span>
              </div>

              {persona === 'kid' ? (
                /* KID INPUTS: Age, Height, Chest, Waist, Hip, Foot Length */
                <div className="space-y-3.5">
                  {/* Age */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Child Age</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="2"
                        max="16"
                        step="1"
                        value={kidAge}
                        onChange={(e) => setKidAge(Number(e.target.value))}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          min="2"
                          max="16"
                          value={kidAge}
                          onChange={(e) => setKidAge(Math.max(2, Math.min(16, Number(e.target.value))))}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">yr</span>
                      </div>
                    </div>
                  </div>

                  {/* Height */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Child Height</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 85 : 33}
                        max={unit === 'metric' ? 170 : 67}
                        step="1"
                        value={unit === 'metric' ? kidHeight : cmToIn(kidHeight)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setKidHeight(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? kidHeight : cmToIn(kidHeight)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setKidHeight(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Chest */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Chest Circumference</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 48 : 19}
                        max={unit === 'metric' ? 88 : 35}
                        step="1"
                        value={unit === 'metric' ? kidChest : cmToIn(kidChest)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setKidChest(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? kidChest : cmToIn(kidChest)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setKidChest(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Waist */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Waist</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 46 : 18}
                        max={unit === 'metric' ? 76 : 30}
                        step="1"
                        value={unit === 'metric' ? kidWaist : cmToIn(kidWaist)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setKidWaist(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? kidWaist : cmToIn(kidWaist)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setKidWaist(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Hip */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Hips</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 50 : 20}
                        max={unit === 'metric' ? 88 : 35}
                        step="1"
                        value={unit === 'metric' ? kidHips : cmToIn(kidHips)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setKidHips(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? kidHips : cmToIn(kidHips)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setKidHips(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Foot Length */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Foot Length</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 14 : 5.5}
                        max={unit === 'metric' ? 24 : 9.5}
                        step="0.5"
                        value={unit === 'metric' ? kidFootLength : cmToIn(kidFootLength)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setKidFootLength(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          step="0.1"
                          value={unit === 'metric' ? kidFootLength : cmToIn(kidFootLength)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setKidFootLength(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* MEN / WOMEN INPUTS: Chest, Waist, Hips, Length, Weight, Foot Length */
                <div className="space-y-3.5">
                  {/* Chest / Bust */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">
                      {persona === 'women' ? 'Bust / Chest' : 'Chest Circumference'}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 75 : 30}
                        max={unit === 'metric' ? 135 : 54}
                        step="1"
                        value={unit === 'metric' ? adultChest : cmToIn(adultChest)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAdultChest(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? adultChest : cmToIn(adultChest)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAdultChest(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Waist */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Natural Waist</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 58 : 23}
                        max={unit === 'metric' ? 120 : 48}
                        step="1"
                        value={unit === 'metric' ? adultWaist : cmToIn(adultWaist)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAdultWaist(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? adultWaist : cmToIn(adultWaist)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAdultWaist(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Hips */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Hips / Seat</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 80 : 31}
                        max={unit === 'metric' ? 135 : 53}
                        step="1"
                        value={unit === 'metric' ? adultHips : cmToIn(adultHips)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAdultHips(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? adultHips : cmToIn(adultHips)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAdultHips(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Body Length / Height */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Body Height / Length</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 150 : 59}
                        max={unit === 'metric' ? 205 : 81}
                        step="1"
                        value={unit === 'metric' ? adultLength : cmToIn(adultLength)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAdultLength(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? adultLength : cmToIn(adultLength)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAdultLength(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Weight */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Body Weight</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 45 : 99}
                        max={unit === 'metric' ? 130 : 286}
                        step="1"
                        value={unit === 'metric' ? adultWeight : kgToLbs(adultWeight)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAdultWeight(unit === 'metric' ? val : lbsToKg(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? adultWeight : kgToLbs(adultWeight)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAdultWeight(unit === 'metric' ? val : lbsToKg(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'kg' : 'lbs'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Foot Length */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Foot Length</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 21.0 : 8.2}
                        max={unit === 'metric' ? 31.0 : 12.2}
                        step="0.2"
                        value={unit === 'metric' ? adultFootLength : cmToIn(adultFootLength)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAdultFootLength(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          step="0.1"
                          value={unit === 'metric' ? adultFootLength : cmToIn(adultFootLength)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAdultFootLength(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button: Found Sizes */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => void handleRunTest()}
                  disabled={isSearching || !searchParams}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-sm shadow-md shadow-purple-600/20 transition-all cursor-pointer transform active:scale-[0.99] disabled:opacity-85"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
                      <span>Asking ACS...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Found Sizes</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Brand > Horizontal Categories > Subcategory & Size Chart   */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden relative min-h-[620px]">
            {isSearching ? (
              <div className="py-32 px-6 flex flex-col items-center justify-center text-center bg-white min-h-[620px]">
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-purple-50 border border-purple-200/90 flex items-center justify-center text-purple-600 shadow-sm">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                  </div>
                  <div className="absolute -inset-2 rounded-3xl bg-purple-500/15 blur-lg -z-10 animate-pulse" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-600 animate-bounce" />
                  <h3 className="text-base font-black text-slate-900">
                    Sending the fit filter to ACS...
                  </h3>
                </div>
                <p className="text-xs text-slate-500 max-w-md mb-6 leading-relaxed">
                  Searching the published catalog for <strong className="text-purple-700">{currentCategory?.label}</strong> from {currentBrand.name} ({currentSubcategory?.name}) that fit your measurements. The answer below is exactly what ACS returns.
                </p>
                {/* Animated progress bar */}
                <div className="w-72 h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200 mb-4">
                  <div className="h-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 rounded-full animate-pulse w-5/6" />
                </div>
                <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-400">
                  <span className="flex items-center gap-1 text-purple-700 font-bold"><CheckCircle2 className="w-3.5 h-3.5 text-purple-600" /> Fit filter</span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-purple-700 font-bold"><CheckCircle2 className="w-3.5 h-3.5 text-purple-600" /> Brand &amp; chart scope</span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-purple-700 font-bold"><CheckCircle2 className="w-3.5 h-3.5 text-purple-600" /> ACS answer</span>
                </div>
              </div>
            ) : (
              <>
                {/* Header Control Panel: Brand & Sizing Mode */}
                <div className="p-4 bg-slate-50/90 border-b border-slate-200/80 space-y-3">
                  {/* Top Row: Brand Picker & Mode Switcher */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    {/* Brand Selector */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Building2 className="w-3 h-3 text-purple-600" />
                          <span>Brand Size Chart</span>
                        </label>
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          {currentBrand.confidence}% Verified • {currentBrand.skuCount} Patterns
                        </span>
                      </div>
                      <div className="relative">
                        <select
                          value={selectedBrandId}
                          onChange={(e) => setSelectedBrandId(e.target.value)}
                          className="w-full appearance-none bg-white border border-slate-300 hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 rounded-xl px-3.5 py-2 pr-9 text-xs font-bold text-slate-900 shadow-2xs transition-all cursor-pointer"
                        >
                          {availableBrands.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} ({b.type === 'global' ? 'Global Brand' : 'Private Label'})
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    {/* Sizing Standard Mode: US, EU, UK */}
                    <div className="sm:w-auto">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Globe className="w-3 h-3 text-purple-600" />
                        <span>Sizing Standard</span>
                      </label>
                      <div className="inline-flex items-center bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs">
                        {(['us', 'eu', 'uk'] as SizingSystemMode[]).map((mode) => {
                          const isActive = sizingMode === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setSizingMode(mode)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-purple-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                              }`}
                            >
                              {mode.toUpperCase()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Quick Brand Badges for fast 1-click preview */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-0.5 scrollbar-none">
                    <span className="text-[10px] font-bold uppercase text-slate-400 whitespace-nowrap mr-1">
                      Popular:
                    </span>
                    {availableBrands.slice(0, 8).map((b) => {
                      const isSelected = b.id === selectedBrandId;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBrandId(b.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                            isSelected
                              ? 'bg-purple-100 text-purple-900 border border-purple-300 font-bold shadow-2xs'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <span className="w-4 h-4 rounded-full bg-slate-100 text-[9px] font-black flex items-center justify-center text-slate-700">
                            {b.logoInitials}
                          </span>
                          <span>{b.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* HORIZONTAL CATEGORIES BAR - Smart, Mature, Clean Layout */}
                <div className="bg-slate-50/80 border-b border-slate-200/80 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-600" />
                      <span>Garment Category</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {brandCategories.length} categories available
                    </span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {brandCategories.map((cat) => {
                      const Icon = getCategoryIcon(cat.key);
                      const isSelected = selectedCategoryKey === cat.key;

                      return (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => setSelectedCategoryKey(cat.key)}
                          className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                            isSelected
                              ? 'bg-white text-purple-950 border border-purple-300 shadow-xs ring-2 ring-purple-400/20'
                              : 'bg-white/80 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/80 shadow-2xs'
                          }`}
                        >
                          <Icon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-purple-600' : 'text-slate-400'}`} />
                          <span className="font-semibold">{cat.label}</span>

                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Subcategory Silhouette & Recommendation Bar */}
                <div className="px-5 py-3.5 bg-slate-50/50 border-b border-slate-200/70 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  {/* Subcategory selector */}
                  <div className="flex-1 min-w-0 max-w-sm">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Tag className="w-3 h-3 text-purple-600" />
                      <span>Subcategory Silhouette</span>
                    </label>
                    {availableSubcategories.length > 0 ? (
                      <div className="relative">
                        <select
                          value={selectedSubcategoryId}
                          onChange={(e) => setSelectedSubcategoryId(e.target.value)}
                          className="w-full appearance-none bg-white border border-slate-300 hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 rounded-xl px-3.5 py-2 pr-8 text-xs font-bold text-slate-800 shadow-2xs transition-all cursor-pointer"
                        >
                          {availableSubcategories.map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              {sub.name} ({sub.fitType})
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 font-medium">Standard Fit Profile</div>
                    )}
                  </div>

                  {/* ACS answer callout */}
                  {(() => {
                    const tone = shownSearchError
                      ? 'rose'
                      : !freshRun
                        ? 'slate'
                        : bestRow
                          ? 'emerald'
                          : 'amber';
                    const toneClasses = {
                      rose: { box: 'bg-rose-50/95 border-rose-200/90', icon: 'bg-rose-600', title: 'text-rose-950', text: 'text-rose-800' },
                      slate: { box: 'bg-slate-50 border-slate-200', icon: 'bg-slate-500', title: 'text-slate-800', text: 'text-slate-500' },
                      emerald: { box: 'bg-emerald-50/95 border-emerald-200/90', icon: 'bg-emerald-600', title: 'text-emerald-950', text: 'text-emerald-800' },
                      amber: { box: 'bg-amber-50/95 border-amber-200/90', icon: 'bg-amber-600', title: 'text-amber-950', text: 'text-amber-800' },
                    }[tone];
                    return (
                      <div className={`flex items-center gap-3 border rounded-xl px-4 py-2.5 shadow-2xs self-stretch md:self-auto ${toneClasses.box}`}>
                        <div className={`w-9 h-9 rounded-xl text-white flex items-center justify-center shadow-xs flex-shrink-0 ${toneClasses.icon}`}>
                          {tone === 'emerald'
                            ? <CheckCircle2 className="w-5 h-5 text-white" />
                            : <Info className="w-5 h-5 text-white" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-extrabold ${toneClasses.title}`}>
                              {shownSearchError
                                ? 'ACS search failed'
                                : !freshRun
                                  ? 'Not sent to ACS yet'
                                  : bestRow
                                    ? 'Best Fit:'
                                    : 'No fitting size in stock'}
                            </span>
                            {bestRow && (
                              <>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-700 text-white text-xs font-black tracking-wide shadow-2xs">
                                  {formatSizeForMode(bestRow, sizingMode)}
                                </span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200/90 text-emerald-950 border border-emerald-300">
                                  {searchSummary.counts[searchSummary.bestIndex]} ACS items
                                </span>
                              </>
                            )}
                          </div>
                          <p className={`text-[11px] font-medium truncate max-w-sm mt-0.5 ${toneClasses.text}`}>
                            {shownSearchError
                              ? shownSearchError
                              : !freshRun
                                ? 'Press Found Sizes to send these measurements to ACS.'
                                : bestRow
                                  ? `ACS returned ${acsProducts.length} products; ${productsWithFit} have a fitting size in stock.`
                                  : acsProducts.length === 0
                                    ? 'ACS returned no products for this filter.'
                                    : `ACS returned ${acsProducts.length} products but none has a stocked size within tolerance.`}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                {/* Subcategory Description Bar */}
                {currentSubcategory?.fitDescription && (
                  <div className="px-5 py-2 bg-slate-50/70 border-b border-slate-200/60 flex items-center gap-2 text-xs text-slate-600">
                    <Info className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                    <span className="font-medium">
                      <strong className="text-slate-800">{currentSubcategory.name}:</strong> {currentSubcategory.fitDescription}
                    </span>
                  </div>
                )}

                {/* What was sent to ACS and what it answered */}
                {(freshRun || shownSearchError) && (
                  <div className="px-5 py-3 bg-white border-b border-slate-200/70 space-y-2 text-xs">
                    {freshRun && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
                          <span className="font-bold text-slate-900">ACS answered</span>
                          <span><strong>{acsProducts.length}</strong> products</span>
                          <span><strong>{productsWithFit}</strong> with a fitting size in stock</span>
                          {acsProducts.length - productsWithFit > 0 && (
                            <span className="text-amber-700">
                              <strong>{acsProducts.length - productsWithFit}</strong> returned on their all-sizes range only
                            </span>
                          )}
                          <span className="text-slate-400">
                            {freshRun.data.hitCount} hits{freshRun.data.totalSize !== null ? ` · ACS total ${freshRun.data.totalSize}` : ''}
                            {freshRun.data.truncated ? ' · more pages not read' : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveSizeItemsModal({ sizeLabel: null, formattedSize: 'all sizes', row: null })}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-purple-50 hover:border-purple-300 text-slate-700 font-semibold cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View all {acsProducts.length}
                        </button>
                      </div>
                    )}
                    {freshRun && (
                      <p className="text-slate-500">
                        Tolerance:{' '}
                        {freshRun.data.tolerances.map((entry, index) => (
                          <span key={entry.measurement}>
                            {index > 0 && ', '}
                            {entry.measurement.replace('_', ' ')} {entry.value} ± {entry.tolerance} cm
                          </span>
                        ))}
                        {freshRun.data.outOfScope > 0 && ` · ${freshRun.data.outOfScope} branded hits left out of "No brand"`}
                      </p>
                    )}
                    {freshRun && (
                      <details>
                        <summary className="cursor-pointer text-slate-500 font-semibold">Filter sent to ACS</summary>
                        <code className="mt-1.5 block whitespace-pre-wrap break-all rounded-lg bg-slate-900 text-slate-100 p-3 text-[11px] leading-relaxed">
                          {freshRun.data.filter}
                        </code>
                        <p className="mt-1 text-[11px] text-slate-400">
                          The merchant isolation and category scope clauses are always added in front of this by the search client.
                        </p>
                      </details>
                    )}
                  </div>
                )}

                {/* Size Chart Table with Sizing Standard & Highlighted Match Row */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    {/* Primary Size Column based on selected sizing standard */}
                    <th className="px-4 py-3 whitespace-nowrap text-purple-950 bg-purple-50/70 font-black">
                      {sizingMode.toUpperCase()} Size
                    </th>

                    {/* Age Column (Displayed specifically for kids persona) */}
                    {persona === 'kid' && (
                      <th className="px-4 py-3 whitespace-nowrap text-purple-900 bg-purple-50/30">
                        Age
                      </th>
                    )}

                    {/* Dimension Columns depending on category */}
                    {selectedCategoryKey === 'footwear' ? (
                      <>
                        <th className="px-4 py-3 whitespace-nowrap">Foot Length ({unit === 'metric' ? 'cm' : 'in'})</th>
                        <th className="px-4 py-3 whitespace-nowrap">Dual Dimension</th>
                      </>
                    ) : selectedCategoryKey === 'bottoms' ? (
                      <>
                        <th className="px-4 py-3 whitespace-nowrap">Waist ({unit === 'metric' ? 'cm' : 'in'})</th>
                        <th className="px-4 py-3 whitespace-nowrap">Hips ({unit === 'metric' ? 'cm' : 'in'})</th>
                        <th className="px-4 py-3 whitespace-nowrap">Inseam</th>
                      </>
                    ) : selectedCategoryKey === 'dresses' ? (
                      <>
                        <th className="px-4 py-3 whitespace-nowrap">Bust ({unit === 'metric' ? 'cm' : 'in'})</th>
                        <th className="px-4 py-3 whitespace-nowrap">Waist ({unit === 'metric' ? 'cm' : 'in'})</th>
                        <th className="px-4 py-3 whitespace-nowrap">Hips ({unit === 'metric' ? 'cm' : 'in'})</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 whitespace-nowrap">Chest ({unit === 'metric' ? 'cm' : 'in'})</th>
                        <th className="px-4 py-3 whitespace-nowrap">Waist ({unit === 'metric' ? 'cm' : 'in'})</th>
                        <th className="px-4 py-3 whitespace-nowrap">Garment Length</th>
                      </>
                    )}

                    {/* Status Badge */}
                    <th className="px-4 py-3 text-right">Status</th>

                    {/* Action: View Suitable Items */}
                    <th className="px-4 py-3 text-center w-24">Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeRows.map((row, idx) => {
                    const isHighlighted = idx === searchSummary.bestIndex;

                    // Formatted age label for kids
                    const ageDisplay = row.ageLabel
                      ? row.ageLabel
                      : row.ageMin && row.ageMax
                      ? row.ageMin === row.ageMax
                        ? `${row.ageMin} Yrs`
                        : `${row.ageMin}–${row.ageMax} Yrs`
                      : row.sizeLabel.match(/\d+-\d+Y|\d+Y/i)
                      ? row.sizeLabel.match(/\d+-\d+Y|\d+Y/i)?.[0]
                      : '—';

                    return (
                      <tr
                        key={row.sizeLabel + idx}
                        className={`transition-all duration-300 ${
                          isHighlighted
                            ? 'bg-emerald-50/95 hover:bg-emerald-100/90 font-semibold ring-2 ring-emerald-500 ring-inset shadow-xs'
                            : 'hover:bg-slate-50/70 text-slate-700'
                        }`}
                      >
                        {/* Primary Size Column (Formatted strictly for selected sizingMode) */}
                        <td
                          className={`px-4 py-3.5 whitespace-nowrap ${
                            isHighlighted
                              ? 'font-black text-emerald-950 text-sm bg-emerald-100/60'
                              : 'font-bold text-slate-900 bg-slate-50/40'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isHighlighted && (
                              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                            )}
                            <span>{formatSizeForMode(row, sizingMode)}</span>
                          </div>
                        </td>

                        {/* Age Column for Kids */}
                        {persona === 'kid' && (
                          <td className={`px-4 py-3.5 whitespace-nowrap font-medium ${isHighlighted ? 'text-emerald-950 font-bold' : 'text-slate-700'}`}>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                              isHighlighted ? 'bg-emerald-200/70 text-emerald-950' : 'bg-purple-50 text-purple-900'
                            }`}>
                              {ageDisplay}
                            </span>
                          </td>
                        )}

                        {/* Dimension Columns */}
                        {selectedCategoryKey === 'footwear' ? (
                          <>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {unit === 'metric' ? `${row.footLengthCm || '—'} cm` : `${row.footLengthIn || '—'}"`}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                              {row.footLengthCm} cm / {row.footLengthIn}&quot;
                            </td>
                          </>
                        ) : selectedCategoryKey === 'bottoms' ? (
                          <>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {unit === 'metric' ? `${row.waistCm || '—'} cm` : `${row.waistIn || '—'}"`}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {unit === 'metric' ? `${row.hipsCm || '—'} cm` : `${row.hipsIn || '—'}"`}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">
                              {row.inseamCm ? `${row.inseamCm} cm (${row.inseamIn}")` : 'Standard Inseam'}
                            </td>
                          </>
                        ) : selectedCategoryKey === 'dresses' ? (
                          <>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {unit === 'metric' ? `${row.chestCm || '—'} cm` : `${row.chestIn || '—'}"`}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {unit === 'metric' ? `${row.waistCm || '—'} cm` : `${row.waistIn || '—'}"`}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {unit === 'metric' ? `${row.hipsCm || '—'} cm` : `${row.hipsIn || '—'}"`}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {unit === 'metric' ? `${row.chestCm || '—'} cm` : `${row.chestIn || '—'}"`}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {row.waistCm ? (unit === 'metric' ? `${row.waistCm} cm` : `${row.waistIn}"`) : '—'}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">
                              {row.lengthCm ? `${row.lengthCm} cm (${row.lengthIn}")` : 'Regular Cut'}
                            </td>
                          </>
                        )}

                        {/* Status Column */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          {isHighlighted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-emerald-600 text-white shadow-2xs">
                              <Sparkles className="w-3 h-3" />
                              Best Fit
                            </span>
                          ) : (
                            <span className={`text-[11px] font-medium ${
                              freshRun && searchSummary.counts[idx] > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'
                            }`}>
                              {!freshRun
                                ? '—'
                                : searchSummary.counts[idx] > 0
                                  ? 'ACS match'
                                  : 'No ACS items'}
                            </span>
                          )}
                        </td>

                        {/* Action Column: Eye icon to view suitable products */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            id={`btn-view-items-${idx}`}
                            disabled={!freshRun}
                            onClick={() => {
                              setActiveSizeItemsModal({
                                sizeLabel: row.sizeLabel,
                                formattedSize: formatSizeForMode(row, sizingMode),
                                row: row,
                              });
                            }}
                            title={freshRun
                              ? `View the ACS products with size ${formatSizeForMode(row, sizingMode)}`
                              : 'Press Found Sizes first'}
                            className={`inline-flex items-center justify-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1 rounded-md border text-xs font-semibold transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              isHighlighted
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-xs'
                                : 'bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-700 border-slate-200 hover:border-purple-300'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Items</span>
                            {freshRun && <span className="font-mono">{searchSummary.counts[idx]}</span>}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer: Brand Fit Philosophy & Multi-System Note */}
            <div className="p-4 bg-slate-50/90 border-t border-slate-200/80 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-purple-600 flex-shrink-0" />
                  <span>
                    <strong className="text-slate-800">{currentBrand.name} Fit Philosophy:</strong> {currentBrand.fitPhilosophy}
                  </span>
                </div>
                <div className="flex items-center gap-3 self-end sm:self-auto font-mono text-[11px] whitespace-nowrap">
                  <span className={`flex items-center gap-1 font-bold ${
                    bestRow ? 'text-emerald-700' : 'text-slate-500'
                  }`}>
                    <span className={`w-2.5 h-2.5 rounded-full inline-block ${
                      bestRow ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}></span>
                    {bestRow ? 'Best Fit (from the ACS answer)' : 'No ACS answer yet'}
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block"></span>
                    Other Sizes
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-400 pt-1 border-t border-slate-200/60">
                <span>
                  Source: <strong className="text-slate-600">{currentBrand.sourceNote}</strong> • Confidence Index: <strong className="text-emerald-700">{currentBrand.confidence}%</strong>
                </span>
                <span className="text-slate-500 font-medium">
                  Switching sizing standards (US, EU, UK) only changes how sizes are labelled; ACS is asked in chart sizes.
                </span>
              </div>
            </div>
          </>
        )}
          </div>
        </div>
      </div>

      {/* Popup Modal: Suitable Items Found for Clicked Size */}
      {activeSizeItemsModal && (
        <div
          id="modal-size-items-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setActiveSizeItemsModal(null)}
        >
          <div
            id="modal-size-items-content"
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-purple-50 via-white to-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 shadow-2xs">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      {activeSizeItemsModal.sizeLabel
                        ? <>ACS products for size: <span className="text-purple-700 font-extrabold">{activeSizeItemsModal.formattedSize}</span></>
                        : <>Everything ACS returned</>}
                    </h3>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold border border-purple-200">
                      {sizingMode.toUpperCase()} Standard
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {currentBrand.name} • {currentCategory?.label || selectedCategoryKey} • {currentSubcategory?.name || 'Garments'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-size-items-modal"
                onClick={() => setActiveSizeItemsModal(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                title="Close popup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Subheader: Size Dimensions & Fit Spec */}
            <div className="px-6 py-2.5 bg-slate-50/80 border-b border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 font-medium">
                <span className="text-slate-500">Size Spec:</span>
                {activeSizeItemsModal.row?.chestCm && (
                  <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                    Chest: <strong>{activeSizeItemsModal.row?.chestCm} cm</strong>
                  </span>
                )}
                {activeSizeItemsModal.row?.waistCm && (
                  <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                    Waist: <strong>{activeSizeItemsModal.row?.waistCm} cm</strong>
                  </span>
                )}
                {activeSizeItemsModal.row?.footLengthCm && (
                  <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                    Foot: <strong>{activeSizeItemsModal.row?.footLengthCm} cm</strong>
                  </span>
                )}
                {activeSizeItemsModal.row?.fitNote && (
                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                    {activeSizeItemsModal.row?.fitNote}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-purple-700 font-medium">
                {modalProducts.length} products from ACS
              </span>
            </div>

            {/* Modal Body: List of Suitable Items */}
            <div className="p-6 overflow-y-auto space-y-3 divide-y divide-slate-100">
              {(() => {
                if (modalProducts.length === 0) {
                  return (
                    <div className="text-center py-10">
                      <p className="text-sm font-semibold text-slate-700">
                        {activeSizeItemsModal.sizeLabel
                          ? `ACS returned no product with size ${activeSizeItemsModal.formattedSize} in stock.`
                          : 'ACS returned no products for this filter.'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">This is the answer to the filter shown above the size table.</p>
                    </div>
                  );
                }

                return modalProducts.map((product) => {
                  const isCurrentBrand = currentBrand.coverageType === 'none'
                    ? product.brand === null
                    : product.brand?.toLowerCase() === currentBrand.name.toLowerCase();
                  const price = product.price === null
                    ? 'Price unavailable'
                    : `${product.currency ? `${product.currency} ` : ''}${product.price.toFixed(2)}`;
                  const availability = product.availability.replaceAll('_', ' ').toLowerCase();
                  return (
                    <div
                      key={product.id}
                      className="pt-3 first:pt-0 flex items-center justify-between gap-4 group hover:bg-slate-50/80 p-2.5 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.title}
                            className="w-14 h-14 object-cover rounded-lg border border-slate-200 shrink-0 bg-slate-100"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg border border-slate-200 shrink-0 bg-slate-100" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isCurrentBrand
                                ? 'bg-purple-100 text-purple-800 font-extrabold'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {product.brand || 'No brand'}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">{product.sku || 'SKU unavailable'}</span>
                          </div>
                          <h4 className="text-sm font-semibold text-slate-900 truncate mt-0.5 group-hover:text-purple-700 transition-colors">
                            {product.title}
                          </h4>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {product.category || 'Category unavailable'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-black text-slate-900">{price}</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-[11px] text-slate-500">
                              Available Sizes: {product.sizes.length > 0 ? product.sizes.join(', ') : 'Not listed'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0 gap-1.5">
                        {product.fitSizes.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            <Check className="w-3 h-3 text-emerald-600" />
                            Fits: {product.fitSizes.join(', ')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                            <Info className="w-3 h-3 text-amber-600" />
                            No stocked size fits
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 font-mono">
                          {availability}
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {activeSizeItemsModal.sizeLabel
                  ? <>Products ACS returned that have <strong>{activeSizeItemsModal.formattedSize}</strong> ({activeSizeItemsModal.sizeLabel}) in stock within tolerance</>
                  : <>Exactly the products ACS returned for the filter above</>}
              </span>
              <button
                type="button"
                onClick={() => setActiveSizeItemsModal(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
