"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { MEASUREMENTS, type Measurement, type SizingGroup } from '@/lib/sizing/measurements';
import { SIZING_TARGETS, type SizingTarget } from '@/lib/sizing/sizing-target';
import { formatPersonaSegments } from '@/modules/store/mapping/persona-taxonomy';
import type {
  MultiSystemRow,
  SizingTesterOptionsResponse,
  TesterBrand,
} from '@/modules/store/sizing/tester/options';
import {
  assignChart,
  brandCategoriesFor,
  categoryFilterPreview,
  chartRowFits,
  fittingRowIndexes,
  groupBySubcategory,
  measurementRole,
  rowBounds,
  summarizeChart,
  testerSearchParams,
  type AssignedProduct,
  type TesterMeasurements,
  type TesterSearchResponse,
} from '@/modules/store/sizing/tester/acs-result';

type SizingSystemMode = 'us' | 'eu' | 'uk';

/** What Found Sizes got back for one category: the request it was for and ACS's answer (or failure). */
interface CategoryRun {
  key: string;
  data?: TesterSearchResponse;
  error?: string;
}

const ALL_SUBCATEGORIES = '__all__';
const OTHER_SUBCATEGORY = '__other__';

const TARGET_OPTIONS: Record<SizingTarget, { label: string; hint: string; icon: LucideIcon }> = {
  men: { label: 'Men', hint: 'Men + Unisex', icon: User },
  women: { label: 'Women', hint: 'Women + Unisex', icon: Users },
  kid: { label: 'Kid', hint: 'Boys, Girls, Kids', icon: Baby },
};

const CATEGORY_ICONS: Record<SizingGroup, LucideIcon> = {
  tops: Shirt,
  bottoms: Scissors,
  footwear: Footprints,
  outerwear: Shield,
  dresses: Sparkles,
};

const SHORT_CATEGORY_LABELS: Record<SizingGroup, string> = {
  tops: 'Tops',
  outerwear: 'Outerwear',
  bottoms: 'Bottoms',
  dresses: 'Dresses',
  footwear: 'Footwear',
};

/** The body columns each category's chart table shows, filtering measurement first. */
const BODY_COLUMNS: Record<SizingGroup, Array<{ label: string; measurement: Measurement }>> = {
  tops: [{ label: 'Chest', measurement: 'chest' }, { label: 'Waist', measurement: 'waist' }],
  outerwear: [{ label: 'Chest', measurement: 'chest' }, { label: 'Waist', measurement: 'waist' }],
  bottoms: [{ label: 'Waist', measurement: 'waist' }, { label: 'Hips', measurement: 'hip' }],
  dresses: [
    { label: 'Bust', measurement: 'chest' },
    { label: 'Waist', measurement: 'waist' },
    { label: 'Hips', measurement: 'hip' },
  ],
  footwear: [{ label: 'Foot length', measurement: 'foot_length' }],
};

const ADULT_DEFAULTS = {
  men: { chest: 98, waist: 84, hips: 99, height: 178, weight: 75, foot: 27.0 },
  women: { chest: 88, waist: 70, hips: 95, height: 166, weight: 61, foot: 24.2 },
} as const;
const KID_DEFAULTS = { age: 7, height: 124, chest: 63, waist: 58, hips: 66, foot: 19.8 } as const;

function leafIdOf(leafKey: string | null): string {
  return leafKey ?? OTHER_SUBCATEGORY;
}

function listCategories(groups: readonly SizingGroup[]): string {
  return groups.map((group) => SHORT_CATEGORY_LABELS[group]).join(', ');
}

function formatRange(bounds: [number | null, number | null] | null): string {
  if (!bounds) return '—';
  const [min, max] = bounds;
  if (min !== null && max !== null) return min === max ? `${min}` : `${min}–${max}`;
  if (min !== null) return `${min}+`;
  if (max !== null) return `≤ ${max}`;
  return '—';
}

function formatSizeForMode(row: MultiSystemRow, mode: SizingSystemMode): string {
  if (mode === 'us') return row.usSize || row.sizeLabel;
  if (mode === 'eu') return row.euSize || row.sizeLabel;
  return row.ukSize || row.sizeLabel;
}

function ageDisplay(row: MultiSystemRow): string {
  if (row.ageLabel) return row.ageLabel;
  if (row.ageMin && row.ageMax) return row.ageMin === row.ageMax ? `${row.ageMin} Yrs` : `${row.ageMin}–${row.ageMax} Yrs`;
  return row.sizeLabel.match(/\d+-\d+Y|\d+Y/i)?.[0] ?? '—';
}

type NoteTone = 'filter' | 'rank' | 'unused';

interface MeasurementFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  note?: { text: string; tone: NoteTone };
}

function MeasurementField({ label, value, onChange, min, max, step = 1, unit, note }: MeasurementFieldProps) {
  const toneClass = note?.tone === 'filter'
    ? 'text-purple-700'
    : note?.tone === 'rank'
      ? 'text-slate-500'
      : 'text-slate-400';
  return (
    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label={label}
            onChange={(event) => onChange(Number(event.target.value))}
            className="w-24 accent-purple-600 cursor-pointer"
          />
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
            <input
              type="number"
              step={step}
              value={value}
              aria-label={`${label} value`}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (event.target.value !== '' && Number.isFinite(next) && next > 0) onChange(next);
              }}
              className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
            />
            <span className="text-[10px] text-slate-400 font-semibold ml-0.5">{unit}</span>
          </div>
        </div>
      </div>
      {note && (
        <p className={`mt-1 text-[10px] font-semibold ${toneClass}`}>
          {note.tone === 'filter' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500 mr-1 align-middle" />}
          {note.text}
        </p>
      )}
    </div>
  );
}

export function SizingTesterView() {
  const searchRequestId = useRef(0);
  const [testerBrands, setTesterBrands] = useState<TesterBrand[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [target, setTarget] = useState<SizingTarget>('men');

  const [adultChest, setAdultChest] = useState<number>(ADULT_DEFAULTS.men.chest);
  const [adultWaist, setAdultWaist] = useState<number>(ADULT_DEFAULTS.men.waist);
  const [adultHips, setAdultHips] = useState<number>(ADULT_DEFAULTS.men.hips);
  const [adultHeight, setAdultHeight] = useState<number>(ADULT_DEFAULTS.men.height);
  const [adultWeight, setAdultWeight] = useState<number>(ADULT_DEFAULTS.men.weight);
  const [adultFootLength, setAdultFootLength] = useState<number>(ADULT_DEFAULTS.men.foot);

  const [kidAge, setKidAge] = useState<number>(KID_DEFAULTS.age);
  const [kidHeight, setKidHeight] = useState<number>(KID_DEFAULTS.height);
  const [kidChest, setKidChest] = useState<number>(KID_DEFAULTS.chest);
  const [kidWaist, setKidWaist] = useState<number>(KID_DEFAULTS.waist);
  const [kidHips, setKidHips] = useState<number>(KID_DEFAULTS.hips);
  const [kidFootLength, setKidFootLength] = useState<number>(KID_DEFAULTS.foot);

  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<SizingGroup | null>(null);
  const [selectedLeaf, setSelectedLeaf] = useState<string>(ALL_SUBCATEGORIES);
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const [sizingMode, setSizingMode] = useState<SizingSystemMode>('us');

  // The last Found Sizes run: one answer per garment category of the brand.
  const [runs, setRuns] = useState<Partial<Record<SizingGroup, CategoryRun>>>({});
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // The ACS products of one chart row (rowIndex) or of the whole subcategory selection (null).
  const [itemsModal, setItemsModal] = useState<{ rowIndex: number | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadOptions() {
      try {
        const response = await fetch('/api/store-connection/sizing/tester/options', { signal: controller.signal });
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

  useEffect(() => {
    if (!itemsModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setItemsModal(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [itemsModal]);

  // Targets with at least one brand chart; the others cannot be tested and are disabled.
  const testableTargets = useMemo(
    () => new Set(SIZING_TARGETS.filter((item) => testerBrands.some((brand) => brandCategoriesFor(brand, item).length > 0))),
    [testerBrands],
  );
  const activeTarget: SizingTarget = testableTargets.has(target)
    ? target
    : SIZING_TARGETS.find((item) => testableTargets.has(item)) ?? target;

  const availableBrands = useMemo(
    () => testerBrands.filter((brand) => brandCategoriesFor(brand, activeTarget).length > 0),
    [testerBrands, activeTarget],
  );
  const currentBrand = availableBrands.find((brand) => brand.id === selectedBrandId) ?? availableBrands[0] ?? null;

  const measurements: TesterMeasurements = useMemo(() => ({
    adultChest,
    adultWaist,
    adultHips,
    adultFootLength,
    kidHeight,
    kidChest,
    kidWaist,
    kidHips,
    kidFootLength,
  }), [adultChest, adultWaist, adultHips, adultFootLength, kidHeight, kidChest, kidWaist, kidHips, kidFootLength]);

  // One request per garment category the brand has charts in for this target. The key is exactly
  // what reaches ACS, so an input that does not change it (weight, an adult's height) never makes
  // an answer stale.
  const requests = useMemo(() => {
    if (!currentBrand) return [];
    return brandCategoriesFor(currentBrand, activeTarget).map((plan) => ({
      ...plan,
      key: testerSearchParams({ brand: currentBrand, group: plan.category.key, target: activeTarget, measurements }).toString(),
    }));
  }, [currentBrand, activeTarget, measurements]);

  const results = useMemo(
    () => requests.map((request) => {
      const run = runs[request.category.key];
      return { ...request, run: run && run.key === request.key ? run : undefined };
    }),
    [requests, runs],
  );
  const brandGroups = useMemo(() => requests.map((request) => request.category.key), [requests]);
  const answeredCount = results.filter((result) => result.run).length;
  const hadRun = Object.keys(runs).length > 0;
  const current = results.find((result) => result.category.key === selectedCategoryKey) ?? results[0] ?? null;

  const detail = useMemo(() => {
    const data = current?.run?.data;
    if (!current || !data) return null;
    const assigned: AssignedProduct[] = data.products.map((product) => ({
      product,
      assignment: assignChart(product, current.charts, activeTarget),
    }));
    return { data, assigned, subcategories: groupBySubcategory(data.products) };
  }, [current, activeTarget]);

  const leaf = detail && detail.subcategories.some((group) => leafIdOf(group.leafKey) === selectedLeaf)
    ? selectedLeaf
    : ALL_SUBCATEGORIES;

  const visible = useMemo(
    () => detail?.assigned.filter((item) => leaf === ALL_SUBCATEGORIES || leafIdOf(item.product.leafKey) === leaf) ?? [],
    [detail, leaf],
  );

  // The category's charts, the one holding most of the shown products first. With a subcategory
  // picked, only the charts its products were sized on (or that cover it) are offered.
  const chartOptions = useMemo(() => {
    if (!current) return [];
    const counts = new Map<string, number>();
    for (const item of visible) {
      if (item.assignment) counts.set(item.assignment.chartId, (counts.get(item.assignment.chartId) ?? 0) + 1);
    }
    const ranked = current.charts
      .map((chart, order) => ({
        chart,
        count: counts.get(chart.id) ?? 0,
        covers: leaf !== ALL_SUBCATEGORIES && chart.coversLeaves.includes(leaf),
        order,
      }))
      .sort((left, right) => right.count - left.count || Number(right.covers) - Number(left.covers) || left.order - right.order);
    if (leaf === ALL_SUBCATEGORIES) return ranked;
    const relevant = ranked.filter((option) => option.count > 0 || option.covers);
    return relevant.length > 0 ? relevant : ranked;
  }, [current, visible, leaf]);

  const currentChart = chartOptions.find((option) => option.chart.id === selectedChartId)?.chart ?? chartOptions[0]?.chart ?? null;
  const activeRows = useMemo<MultiSystemRow[]>(
    () => currentChart?.rowsByPersona[activeTarget] ?? [],
    [currentChart, activeTarget],
  );
  const chartProducts = useMemo(
    () => (currentChart ? visible.filter((item) => item.assignment?.chartId === currentChart.id) : []),
    [visible, currentChart],
  );
  const currentGroup = current?.category.key ?? null;

  const summary = useMemo(() => {
    if (!detail || !currentChart || !currentGroup) return { counts: activeRows.map(() => 0), bestIndex: -1 };
    return summarizeChart(activeRows, currentGroup, currentChart.audience, detail.data.measurements, chartProducts);
  }, [detail, currentChart, currentGroup, activeRows, chartProducts]);

  const rowFits = useMemo(() => {
    if (!detail || !currentChart || !currentGroup) return activeRows.map(() => null);
    return chartRowFits(activeRows, currentGroup, currentChart.audience, detail.data.tolerances);
  }, [detail, currentChart, currentGroup, activeRows]);

  const bestRow = summary.bestIndex >= 0 ? activeRows[summary.bestIndex] ?? null : null;
  const visibleWithFit = visible.filter((item) => item.product.fitSizes.length > 0).length;
  const unassigned = visible.filter((item) => !item.assignment).length;

  const modalItems = useMemo(() => {
    if (!itemsModal) return [];
    const items = itemsModal.rowIndex === null
      ? visible
      : chartProducts.filter((item) => fittingRowIndexes(item).has(itemsModal.rowIndex!));
    return [...items].sort((left, right) => Number(right.product.fitSizes.length > 0) - Number(left.product.fitSizes.length > 0));
  }, [itemsModal, visible, chartProducts]);

  const chartNameById = useMemo(
    () => new Map((current?.charts ?? []).map((chart) => [chart.id, chart.name])),
    [current],
  );

  const resetSelection = () => {
    setSelectedCategoryKey(null);
    setSelectedLeaf(ALL_SUBCATEGORIES);
    setSelectedChartId(null);
    setItemsModal(null);
  };

  const chooseTarget = (next: SizingTarget) => {
    setTarget(next);
    resetSelection();
  };

  const chooseBrand = (brandId: string) => {
    setSelectedBrandId(brandId);
    resetSelection();
  };

  const chooseCategory = (group: SizingGroup) => {
    setSelectedCategoryKey(group);
    setSelectedLeaf(ALL_SUBCATEGORIES);
    setSelectedChartId(null);
  };

  const chooseLeaf = (leafId: string) => {
    setSelectedLeaf(leafId);
    setSelectedChartId(null);
  };

  const handleFoundSizes = async () => {
    if (requests.length === 0) return;
    const batch = requests;
    const requestId = ++searchRequestId.current;
    setIsSearching(true);
    setRuns({});
    setItemsModal(null);

    await Promise.all(batch.map(async (request) => {
      let run: CategoryRun;
      try {
        const response = await fetch(`/api/store-connection/sizing/tester/products?${request.key}`);
        const body = await response.json() as TesterSearchResponse;
        if (!response.ok) run = { key: request.key, error: body.error || 'ACS did not answer the fit search.' };
        else if (!Array.isArray(body.products)) run = { key: request.key, error: 'The ACS answer was invalid.' };
        else run = { key: request.key, data: body };
      } catch {
        run = { key: request.key, error: 'ACS did not answer the fit search.' };
      }
      // A newer run replaced this one: drop its answers.
      if (requestId !== searchRequestId.current) return;
      setRuns((existing) => ({ ...existing, [request.category.key]: run }));
    }));
    if (requestId === searchRequestId.current) setIsSearching(false);
  };

  const handleResetDefaults = () => {
    if (activeTarget === 'kid') {
      setKidAge(KID_DEFAULTS.age);
      setKidHeight(KID_DEFAULTS.height);
      setKidChest(KID_DEFAULTS.chest);
      setKidWaist(KID_DEFAULTS.waist);
      setKidHips(KID_DEFAULTS.hips);
      setKidFootLength(KID_DEFAULTS.foot);
      return;
    }
    const defaults = ADULT_DEFAULTS[activeTarget];
    setAdultChest(defaults.chest);
    setAdultWaist(defaults.waist);
    setAdultHips(defaults.hips);
    setAdultHeight(defaults.height);
    setAdultWeight(defaults.weight);
    setAdultFootLength(defaults.foot);
  };

  const noteFor = (measurement: Measurement): { text: string; tone: NoteTone } => {
    const { filters, ranks } = measurementRole(measurement, activeTarget, brandGroups);
    if (filters.length > 0) return { text: `Filters ${listCategories(filters)}`, tone: 'filter' };
    if (ranks.length > 0) return { text: `Only ranks sizes in ${listCategories(ranks)}`, tone: 'rank' };
    return { text: `Not used by ${currentBrand?.name ?? 'this brand'}'s categories`, tone: 'unused' };
  };
  const unusedNote = { text: 'Not used for size matching', tone: 'unused' as const };

  if (optionsLoading || optionsError || !currentBrand) {
    const message = optionsLoading
      ? 'Loading available size charts...'
      : optionsError || 'No published size charts are available yet. Publish sizing first.';
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

  const brandTypeLabel = (brand: TesterBrand) =>
    brand.coverageType === 'none' ? 'No brand' : brand.coverageType === 'global' ? 'Global brand' : 'Private label';

  const filterColumn = currentGroup
    ? (activeTarget === 'kid' && currentGroup !== 'footwear' ? 'height' : BODY_COLUMNS[currentGroup][0]?.measurement)
    : undefined;
  const tableColumns: Array<{ label: string; measurement: Measurement }> = currentGroup
    ? [
        ...(activeTarget === 'kid' && currentGroup !== 'footwear' ? [{ label: 'Height', measurement: 'height' as const }] : []),
        ...BODY_COLUMNS[currentGroup],
      ]
    : [];

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Header */}
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
            Pick who it is for, their body and a brand. Found Sizes sends one fit filter per garment category to ACS and shows exactly what it returns.
          </p>
        </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: sizing target, body, brand, Found Sizes */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5">
            {/* 1. Sizing target */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                1. Sizing Target
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {SIZING_TARGETS.map((item) => {
                  const option = TARGET_OPTIONS[item];
                  const Icon = option.icon;
                  const selected = activeTarget === item;
                  const testable = testableTargets.has(item);
                  return (
                <button
                      key={item}
                  type="button"
                      onClick={() => chooseTarget(item)}
                      disabled={!testable}
                      aria-pressed={selected}
                      title={testable ? undefined : `No published size chart for ${option.label.toLowerCase()} yet`}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 ${
                        selected
                      ? 'bg-purple-50/80 border-purple-400 text-purple-950 shadow-2xs ring-2 ring-purple-200'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                      <Icon className={`w-5 h-5 mb-1.5 ${selected ? 'text-purple-600' : 'text-slate-500'}`} />
                      <span className="text-xs font-bold">{option.label}</span>
                      <span className="text-[10px] text-slate-400">{option.hint}</span>
                </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Body dimensions */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  2. Body Dimensions (cm, kg)
                </label>
                <span className="text-[11px] text-slate-400 font-medium">Sent to ACS on Found Sizes</span>
              </div>

              {activeTarget === 'kid' ? (
                <div className="space-y-2.5">
                  <MeasurementField label="Child Height" value={kidHeight} onChange={setKidHeight} min={50} max={175} unit="cm" note={noteFor('height')} />
                  <MeasurementField label="Chest" value={kidChest} onChange={setKidChest} min={40} max={95} unit="cm" note={noteFor('chest')} />
                  <MeasurementField label="Waist" value={kidWaist} onChange={setKidWaist} min={40} max={85} unit="cm" note={noteFor('waist')} />
                  <MeasurementField label="Hips" value={kidHips} onChange={setKidHips} min={40} max={95} unit="cm" note={noteFor('hip')} />
                  <MeasurementField label="Foot Length" value={kidFootLength} onChange={setKidFootLength} min={8} max={26} step={0.1} unit="cm" note={noteFor('foot_length')} />
                  <MeasurementField
                    label="Child Age"
                        value={kidAge}
                    onChange={(next) => setKidAge(Math.max(0, Math.min(16, Math.round(next))))}
                    min={0}
                    max={16}
                    unit="yr"
                    note={unusedNote}
                  />
                </div>
              ) : (
                <div className="space-y-2.5">
                  <MeasurementField
                    label={activeTarget === 'women' ? 'Bust / Chest' : 'Chest'}
                    value={adultChest}
                    onChange={setAdultChest}
                    min={70}
                    max={150}
                    unit="cm"
                    note={noteFor('chest')}
                  />
                  <MeasurementField label="Natural Waist" value={adultWaist} onChange={setAdultWaist} min={50} max={140} unit="cm" note={noteFor('waist')} />
                  <MeasurementField label="Hips / Seat" value={adultHips} onChange={setAdultHips} min={70} max={150} unit="cm" note={noteFor('hip')} />
                  <MeasurementField label="Foot Length" value={adultFootLength} onChange={setAdultFootLength} min={20} max={32} step={0.1} unit="cm" note={noteFor('foot_length')} />
                  <MeasurementField label="Body Height" value={adultHeight} onChange={setAdultHeight} min={140} max={210} unit="cm" note={unusedNote} />
                  <MeasurementField label="Body Weight" value={adultWeight} onChange={setAdultWeight} min={35} max={160} unit="kg" note={unusedNote} />
                      </div>
              )}
                  </div>

            {/* 3. Brand */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="tester-brand" className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-purple-600" />
                  3. Brand
                </label>
                <span className="text-[11px] text-slate-400 font-medium">
                  {availableBrands.length} {availableBrands.length === 1 ? 'brand' : 'brands'} in this store
                        </span>
                      </div>
              <div className="relative">
                <select
                  id="tester-brand"
                  value={currentBrand.id}
                  onChange={(event) => chooseBrand(event.target.value)}
                  className="w-full appearance-none bg-white border border-slate-300 hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 rounded-xl px-3.5 py-2.5 pr-9 text-xs font-bold text-slate-900 shadow-2xs transition-all cursor-pointer"
                >
                  {availableBrands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name} ({brandTypeLabel(brand)})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
              <div className="mt-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Found Sizes will ask ACS about
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {requests.map(({ category, charts }) => {
                    const Icon = CATEGORY_ICONS[category.key];
                    return (
                      <span
                        key={category.key}
                        title={`${charts.length} size ${charts.length === 1 ? 'chart' : 'charts'} · ${category.skuCount} SKUs`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-[11px] font-semibold text-purple-900"
                      >
                        <Icon className="w-3.5 h-3.5 text-purple-600" />
                        {SHORT_CATEGORY_LABELS[category.key]}
                        </span>
                    );
                  })}
                      </div>
                    </div>
                  </div>

            {/* Found Sizes */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                onClick={() => void handleFoundSizes()}
                disabled={isSearching || requests.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-sm shadow-md shadow-purple-600/20 transition-all cursor-pointer transform active:scale-[0.99] disabled:opacity-85 disabled:cursor-not-allowed"
              >
                {isSearching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
                    <span>Asking ACS... {answeredCount}/{requests.length}</span>
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

        {/* RIGHT: what will be sent, the loading state, then ACS's answer per category */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden relative min-h-[620px]">
            {isSearching ? (
              <div className="py-24 px-6 flex flex-col items-center justify-center text-center bg-white min-h-[620px]">
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-purple-50 border border-purple-200/90 flex items-center justify-center text-purple-600 shadow-sm">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                  </div>
                  <div className="absolute -inset-2 rounded-3xl bg-purple-500/15 blur-lg -z-10 animate-pulse" />
                </div>
                <h3 className="text-base font-black text-slate-900 mb-1">Sending the fit filters to ACS...</h3>
                <p className="text-xs text-slate-500 max-w-md mb-6 leading-relaxed">
                  One request per garment category of {currentBrand.name}, all at once. The answers are exactly what ACS returns.
                </p>
                <div className="w-full max-w-sm space-y-2 text-left">
                  {results.map(({ category, run }) => {
                    const Icon = CATEGORY_ICONS[category.key];
                    const preview = categoryFilterPreview(category.key, activeTarget, measurements);
                    return (
                      <div key={category.key} className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60">
                        <span className="flex items-center gap-2 text-xs font-bold text-slate-800">
                          <Icon className="w-4 h-4 text-purple-600" />
                          {SHORT_CATEGORY_LABELS[category.key]}
                          <span className="font-medium text-slate-400">
                            {preview.map((entry) => `${MEASUREMENTS[entry.measurement].label.toLowerCase()} ${entry.value} ± ${entry.tolerance}`).join(', ')}
                          </span>
                        </span>
                        {!run ? (
                          <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                        ) : run.error ? (
                          <AlertTriangle className="w-4 h-4 text-rose-500" />
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                            <CheckCircle2 className="w-4 h-4" />
                            {run.data?.products.length ?? 0}
                          </span>
                        )}
                </div>
                    );
                  })}
                </div>
              </div>
            ) : answeredCount === 0 ? (
              <div className="p-6 min-h-[620px] flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="w-4 h-4 text-purple-600" />
                  <h3 className="text-sm font-black text-slate-900">What Found Sizes will ask ACS</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  {currentBrand.name} ({brandTypeLabel(currentBrand)}) for {TARGET_OPTIONS[activeTarget].label.toLowerCase()}: one request per category, each with its own fit measurement.
                </p>
                {hadRun && (
                  <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                    <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
                    <span>The inputs changed since the last search. Press Found Sizes to ask ACS again.</span>
                  </div>
                )}
                <div className="space-y-2.5">
                  {requests.map(({ category, charts }) => {
                    const Icon = CATEGORY_ICONS[category.key];
                    const preview = categoryFilterPreview(category.key, activeTarget, measurements);
                    return (
                      <div key={category.key} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/60">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-4 h-4 text-purple-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900">{category.label}</p>
                            <p className="text-[11px] text-slate-500">
                              {charts.length} size {charts.length === 1 ? 'chart' : 'charts'} · {category.skuCount} SKUs
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono font-semibold text-purple-800 bg-purple-50 border border-purple-200 px-2 py-1 rounded-lg whitespace-nowrap">
                          {preview.map((entry) => `${MEASUREMENTS[entry.measurement].label} ${entry.value} ± ${entry.tolerance} cm`).join(' · ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-auto pt-6 text-[11px] text-slate-400">
                  Each request also carries the brand, the {TARGET_OPTIONS[activeTarget].hint} departments and in stock only. Other measurements never remove a product; they only rank sizes.
                </p>
              </div>
            ) : (
              <>
                {/* Brand + sizing standard */}
                <div className="p-4 bg-slate-50/90 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Building2 className="w-3 h-3 text-purple-600" />
                      ACS answer
                    </p>
                    <p className="text-sm font-black text-slate-900 truncate">
                      {currentBrand.name}
                      <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 align-middle">
                        {brandTypeLabel(currentBrand)}
                        </span>
                      <span className="ml-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 border border-purple-200 text-purple-800 align-middle">
                        {TARGET_OPTIONS[activeTarget].label}
                      </span>
                    </p>
                      </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Globe className="w-3 h-3 text-purple-600" />
                      Sizing Standard
                    </span>
                      <div className="inline-flex items-center bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs">
                      {(['us', 'eu', 'uk'] as SizingSystemMode[]).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setSizingMode(mode)}
                          aria-pressed={sizingMode === mode}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                            sizingMode === mode ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                              }`}
                            >
                              {mode.toUpperCase()}
                            </button>
                      ))}
                      </div>
                    </div>
                  </div>

                {/* Garment categories */}
                <div className="bg-slate-50/80 border-b border-slate-200/80 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-600" />
                      Garment Category
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">{results.length} asked</span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {results.map(({ category, run }) => {
                      const Icon = CATEGORY_ICONS[category.key];
                      const selected = current?.category.key === category.key;
                      const fitting = run?.data?.products.filter((product) => product.fitSizes.length > 0).length ?? 0;
                      const badge = !run
                        ? { text: '—', title: 'Inputs changed: press Found Sizes', tone: 'bg-slate-100 text-slate-500 border-slate-200' }
                        : run.error
                          ? { text: '!', title: run.error, tone: 'bg-rose-50 text-rose-700 border-rose-200' }
                          : fitting > 0
                            ? { text: String(fitting), title: `${fitting} products with a fitting size in stock`, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                            : { text: '0', title: 'No product with a fitting size in stock', tone: 'bg-amber-50 text-amber-700 border-amber-200' };
                      return (
                        <button
                          key={category.key}
                          type="button"
                          onClick={() => chooseCategory(category.key)}
                          aria-pressed={selected}
                          className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                            selected
                              ? 'bg-white text-purple-950 border border-purple-300 shadow-xs ring-2 ring-purple-400/20'
                              : 'bg-white/80 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/80 shadow-2xs'
                          }`}
                        >
                          <Icon className={`w-4 h-4 flex-shrink-0 ${selected ? 'text-purple-600' : 'text-slate-400'}`} />
                          <span className="font-semibold">{category.label}</span>
                          <span title={badge.title} className={`px-1.5 py-0.5 rounded-full text-[10px] font-black border ${badge.tone}`}>
                            {badge.text}
                            </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {!current?.run ? (
                  <div className="p-10 text-center">
                    <Info className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-700">The inputs for this category changed since the last search.</p>
                    <p className="text-xs text-slate-500 mt-1">Press Found Sizes to ask ACS again.</p>
                  </div>
                ) : current.run.error ? (
                  <div className="m-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-extrabold text-rose-950">ACS search failed for {current.category.label}</p>
                      <p className="text-[11px] text-rose-800 mt-0.5">{current.run.error}</p>
                    </div>
                  </div>
                ) : detail && currentGroup ? (
                  <>
                    {/* Subcategories found in the answer */}
                    <div className="px-5 py-3 border-b border-slate-200/70 bg-white">
                      <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <Tag className="w-3 h-3 text-purple-600" />
                        Subcategory
                      </span>
                      {detail.subcategories.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {[{ id: ALL_SUBCATEGORIES, label: 'All', count: detail.data.products.length }, ...detail.subcategories.map((group) => ({
                            id: leafIdOf(group.leafKey),
                            label: group.label,
                            count: group.products.length,
                          }))].map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => chooseLeaf(option.id)}
                              aria-pressed={leaf === option.id}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                                leaf === option.id
                                  ? 'bg-purple-100 text-purple-900 border-purple-300 font-bold'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {option.label}
                              <span className="font-mono text-[10px] text-slate-500">{option.count}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 font-medium">ACS returned no products for this category.</p>
                      )}
                    </div>

                    {/* Chart picker + ACS answer callout */}
                <div className="px-5 py-3.5 bg-slate-50/50 border-b border-slate-200/70 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex-1 min-w-0 max-w-sm">
                        <label
                          htmlFor={chartOptions.length > 1 ? 'tester-chart' : undefined}
                          className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5"
                        >
                          <Layers className="w-3 h-3 text-purple-600" />
                          Size chart
                    </label>
                        {chartOptions.length > 1 ? (
                      <div className="relative">
                        <select
                              id="tester-chart"
                              value={currentChart?.id ?? ''}
                              onChange={(event) => setSelectedChartId(event.target.value)}
                          className="w-full appearance-none bg-white border border-slate-300 hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 rounded-xl px-3.5 py-2 pr-8 text-xs font-bold text-slate-800 shadow-2xs transition-all cursor-pointer"
                        >
                              {chartOptions.map((option) => (
                                <option key={option.chart.id} value={option.chart.id}>
                                  {option.chart.name} ({option.chart.fitType}) — {option.count} {option.count === 1 ? 'product' : 'products'}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    ) : (
                          <p className="text-xs font-bold text-slate-800">{currentChart?.name ?? 'No chart'}</p>
                    )}
                  </div>

                      {(() => {
                        const tone = bestRow ? 'emerald' : 'amber';
                        const toneClasses = {
                          emerald: { box: 'bg-emerald-50/95 border-emerald-200/90', icon: 'bg-emerald-600', title: 'text-emerald-950', text: 'text-emerald-800' },
                          amber: { box: 'bg-amber-50/95 border-amber-200/90', icon: 'bg-amber-600', title: 'text-amber-950', text: 'text-amber-800' },
                        }[tone];
                        const insideIndex = rowFits.indexOf('inside');
                        return (
                          <div className={`flex items-center gap-3 border rounded-xl px-4 py-2.5 shadow-2xs self-stretch md:self-auto ${toneClasses.box}`}>
                            <div className={`w-9 h-9 rounded-xl text-white flex items-center justify-center shadow-xs flex-shrink-0 ${toneClasses.icon}`}>
                              {bestRow ? <CheckCircle2 className="w-5 h-5 text-white" /> : <Info className="w-5 h-5 text-white" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-extrabold ${toneClasses.title}`}>
                                  {bestRow
                                    ? 'Best Fit:'
                                    : detail.data.products.length === 0 && detail.data.categoryProducts === 0
                                      ? 'Nothing in this category'
                                      : 'No fitting size in stock'}
                        </span>
                                {bestRow && (
                          <>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-700 text-white text-xs font-black tracking-wide shadow-2xs">
                                      {formatSizeForMode(bestRow, sizingMode)}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200/90 text-emerald-950 border border-emerald-300">
                                      {summary.counts[summary.bestIndex]} ACS items
                            </span>
                          </>
                        )}
                      </div>
                              <p className={`text-[11px] font-medium max-w-sm mt-0.5 ${toneClasses.text}`}>
                                {bestRow
                                  ? `ACS returned ${visible.length} products here; ${visibleWithFit} have a fitting size in stock.`
                                  : detail.data.products.length === 0
                                    ? detail.data.categoryProducts === 0
                                      ? `${currentBrand.name} has no sized, in-stock ${SHORT_CATEGORY_LABELS[currentGroup].toLowerCase()} for ${TARGET_OPTIONS[activeTarget].label.toLowerCase()}, with or without your measurements.`
                                      : `ACS has ${detail.data.categoryProducts ?? 'some'} in-stock products here, none within tolerance.${
                                          insideIndex >= 0 ? ` By the chart your size is ${formatSizeForMode(activeRows[insideIndex]!, sizingMode)}.` : ''
                                        }`
                                    : chartProducts.length === 0
                                      ? 'None of the products ACS returned here were sized on this chart. Pick another chart or subcategory.'
                                      : `ACS returned ${chartProducts.length} products on this chart but none has a stocked size within tolerance.`}
                      </p>
                    </div>
                  </div>
                        );
                      })()}
                </div>

                    {currentChart?.fitDescription && (
                  <div className="px-5 py-2 bg-slate-50/70 border-b border-slate-200/60 flex items-center gap-2 text-xs text-slate-600">
                    <Info className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                    <span className="font-medium">
                          <strong className="text-slate-800">{currentChart.name}:</strong> {currentChart.fitDescription}
                    </span>
                  </div>
                )}

                    {/* What was sent and what ACS answered */}
                    <div className="px-5 py-3 bg-white border-b border-slate-200/70 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
                          <span className="font-bold text-slate-900">ACS answered</span>
                          <span><strong>{visible.length}</strong> products</span>
                          <span><strong>{visibleWithFit}</strong> with a fitting size in stock</span>
                          {visible.length - visibleWithFit > 0 && (
                            <span className="text-amber-700" title="ACS returned these, but no single stocked size row is within tolerance. Usually a product whose sizing index is out of date: republish sizing.">
                              <strong>{visible.length - visibleWithFit}</strong> with no fitting size row
                            </span>
                          )}
                          {unassigned > 0 && (
                            <span className="text-slate-500" title="Their indexed size rows match none of this brand's charts for this target.">
                              <strong>{unassigned}</strong> on no listed chart
                            </span>
                          )}
                          <span className="text-slate-400">
                            {detail.data.hitCount} hits{detail.data.totalSize !== null ? ` · ACS total ${detail.data.totalSize}` : ''}
                            {detail.data.truncated ? ' · more pages not read' : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setItemsModal({ rowIndex: null })}
                          disabled={visible.length === 0}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-purple-50 hover:border-purple-300 text-slate-700 font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View all {visible.length}
                        </button>
                      </div>
                      <p className="text-slate-500">
                        Filter:{' '}
                        {detail.data.tolerances.map((entry, index) => (
                          <span key={entry.measurement}>
                            {index > 0 && ', '}
                            {MEASUREMENTS[entry.measurement].label.toLowerCase()} {entry.value} ± {entry.tolerance} cm
                          </span>
                        ))}
                        {detail.data.outOfScope > 0 && ` · ${detail.data.outOfScope} branded hits left out of "No brand"`}
                      </p>
                      <details>
                        <summary className="cursor-pointer text-slate-500 font-semibold">Filter sent to ACS</summary>
                        <code className="mt-1.5 block whitespace-pre-wrap break-all rounded-lg bg-slate-900 text-slate-100 p-3 text-[11px] leading-relaxed">
                          {detail.data.filter}
                        </code>
                        <p className="mt-1 text-[11px] text-slate-400">
                          The merchant isolation and category scope clauses are always added in front of this by the search client.
                        </p>
                      </details>
                    </div>

                    {/* The chart with ACS's answer on each size */}
                    {currentChart && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap text-purple-950 bg-purple-50/70 font-black">
                      {sizingMode.toUpperCase()} Size
                    </th>
                              {activeTarget === 'kid' && <th className="px-4 py-3 whitespace-nowrap text-purple-900 bg-purple-50/30">Age</th>}
                              {tableColumns.map((column) => (
                                <th key={column.measurement} className="px-4 py-3 whitespace-nowrap">
                                  {column.label} (cm)
                                  {column.measurement === filterColumn && (
                                    <span className="ml-1 normal-case text-[9px] font-black text-purple-700 bg-purple-100 border border-purple-200 px-1 py-0.5 rounded">filter</span>
                                  )}
                                </th>
                              ))}
                              {(currentGroup === 'tops' || currentGroup === 'outerwear') && <th className="px-4 py-3 whitespace-nowrap">Garment Length</th>}
                              {currentGroup === 'bottoms' && <th className="px-4 py-3 whitespace-nowrap">Inseam</th>}
                    <th className="px-4 py-3 text-right">Status</th>
                    <th className="px-4 py-3 text-center w-24">Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                            {activeRows.map((row, index) => {
                              const isBest = index === summary.bestIndex;
                              const count = summary.counts[index] ?? 0;
                              // The chart says this is the shopper's size, but ACS has no stocked product in it.
                              const chartOnly = !isBest && count === 0 ? rowFits[index] : null;
                    return (
                      <tr
                                  key={`${row.sizeLabel}-${index}`}
                        className={`transition-all duration-300 ${
                                    isBest
                            ? 'bg-emerald-50/95 hover:bg-emerald-100/90 font-semibold ring-2 ring-emerald-500 ring-inset shadow-xs'
                                      : chartOnly === 'inside'
                                        ? 'bg-amber-50/70 hover:bg-amber-50 text-slate-800 ring-1 ring-amber-300 ring-inset'
                            : 'hover:bg-slate-50/70 text-slate-700'
                        }`}
                      >
                                  <td className={`px-4 py-3.5 whitespace-nowrap ${isBest ? 'font-black text-emerald-950 text-sm bg-emerald-100/60' : 'font-bold text-slate-900 bg-slate-50/40'}`}>
                          <div className="flex items-center gap-2">
                                      {isBest && <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />}
                            <span>{formatSizeForMode(row, sizingMode)}</span>
                          </div>
                        </td>
                                  {activeTarget === 'kid' && (
                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${isBest ? 'bg-emerald-200/70 text-emerald-950' : 'bg-purple-50 text-purple-900'}`}>
                                        {ageDisplay(row)}
                            </span>
                          </td>
                        )}
                                  {tableColumns.map((column) => (
                                    <td
                                      key={column.measurement}
                                      className={`px-4 py-3.5 whitespace-nowrap ${column.measurement === filterColumn ? 'font-bold' : 'font-medium'}`}
                                    >
                                      {formatRange(rowBounds(row, column.measurement))}
                            </td>
                                  ))}
                                  {(currentGroup === 'tops' || currentGroup === 'outerwear') && (
                                    <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">{row.lengthCm ? `${row.lengthCm} cm` : '—'}</td>
                                  )}
                                  {currentGroup === 'bottoms' && (
                                    <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">{row.inseamCm ? `${row.inseamCm} cm` : '—'}</td>
                                  )}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                    {isBest ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-emerald-600 text-white shadow-2xs">
                              <Sparkles className="w-3 h-3" />
                              Best Fit
                            </span>
                                    ) : chartOnly ? (
                                      <span
                                        title="This chart row fits your measurement, but ACS returned no in-stock product in this size."
                                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                          chartOnly === 'inside' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white text-amber-700 border-amber-200'
                                        }`}
                                      >
                                        {chartOnly === 'inside' ? 'Your size · no stock' : 'Near · no stock'}
                            </span>
                          ) : (
                                      <span className={`text-[11px] font-medium ${count > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
                                        {count > 0 ? 'ACS match' : 'No ACS items'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                                      disabled={count === 0}
                                      onClick={() => setItemsModal({ rowIndex: index })}
                                      title={count > 0 ? `View the ACS products with size ${formatSizeForMode(row, sizingMode)}` : 'ACS returned no product in this size'}
                                      className={`inline-flex items-center justify-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1 rounded-md border text-xs font-semibold transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                        isBest
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-xs'
                                : 'bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-700 border-slate-200 hover:border-purple-300'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Items</span>
                                      <span className="font-mono">{count}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
                    )}

                    {currentChart && (
                      <div className="p-4 bg-slate-50/90 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>
                          Source: <strong className="text-slate-700">{currentChart.sourceTitle || 'Connection chart'}</strong>
                          {currentChart.confidence > 0 && <> • Confidence <strong className="text-emerald-700">{currentChart.confidence}%</strong></>}
                  </span>
                        <span className="font-medium">
                          US / EU / UK only relabel sizes; ACS is asked in body measurements.
                  </span>
                </div>
                    )}
                  </>
                ) : null}
          </>
        )}
          </div>
        </div>
      </div>

      {/* ACS products for one size, or everything in the subcategory selection */}
      {itemsModal && current && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setItemsModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tester-items-title"
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-purple-50 via-white to-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 shadow-2xs">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="tester-items-title" className="text-base font-bold text-slate-900">
                    {itemsModal.rowIndex !== null && activeRows[itemsModal.rowIndex]
                      ? <>ACS products for size <span className="text-purple-700 font-extrabold">{formatSizeForMode(activeRows[itemsModal.rowIndex]!, sizingMode)}</span></>
                      : <>Everything ACS returned</>}
                    </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {currentBrand.name} • {current.category.label}
                    {itemsModal.rowIndex !== null && currentChart ? ` • ${currentChart.name}` : ''}
                    {leaf !== ALL_SUBCATEGORIES
                      ? ` • ${detail?.subcategories.find((group) => leafIdOf(group.leafKey) === leaf)?.label ?? ''}`
                      : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setItemsModal(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 divide-y divide-slate-100">
              {modalItems.length === 0 ? (
                    <div className="text-center py-10">
                  <p className="text-sm font-semibold text-slate-700">ACS returned no products here.</p>
                  <p className="text-xs text-slate-400 mt-1">This is the answer to the filter shown above the size table.</p>
                    </div>
              ) : modalItems.map(({ product, assignment }) => {
                  const price = product.price === null
                    ? 'Price unavailable'
                    : `${product.currency ? `${product.currency} ` : ''}${product.price.toFixed(2)}`;
                const path = product.personaPath ? formatPersonaSegments(product.personaPath.split(' > ')) : 'Category unavailable';
                const chartName = assignment ? chartNameById.get(assignment.chartId) : null;
                  return (
                  <div key={product.id} className="pt-3 first:pt-0 flex items-center justify-between gap-4 group hover:bg-slate-50/80 p-2.5 rounded-xl transition-colors">
                      <div className="flex items-center gap-3.5 min-w-0">
                        {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
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
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">
                              {product.brand || 'No brand'}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">{product.sku || 'SKU unavailable'}</span>
                          </div>
                        {product.uri ? (
                          <a
                            href={product.uri}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-sm font-semibold text-slate-900 truncate mt-0.5 hover:text-purple-700 transition-colors"
                          >
                            {product.title}
                          </a>
                        ) : (
                          <h4 className="text-sm font-semibold text-slate-900 truncate mt-0.5">{product.title}</h4>
                        )}
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                          {path}
                          {chartName ? ` • Chart: ${chartName}` : ''}
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
                        <span
                          title="ACS matched it on the range of all its sizes together, but no single stocked size fits."
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md"
                        >
                          <Info className="w-3 h-3 text-amber-600" />
                          No stocked size fits
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 font-mono">in stock</span>
                      </div>
                    </div>
                  );
              })}
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {itemsModal.rowIndex !== null
                  ? 'Products ACS returned that have this size in stock within tolerance'
                  : 'Exactly the products ACS returned for the filter above'}
              </span>
              <button
                type="button"
                onClick={() => setItemsModal(null)}
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
