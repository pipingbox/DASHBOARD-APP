import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library, ChevronRight, Search, X, SearchX } from 'lucide-react';
import AccessoryDetailPage from '@/tools/accessory-library/AccessoryDetailPage';
import {
  components as allPublishable,
  families,
  filterComponents,
  connectionTypes,
  pressureClasses,
  standardsInUse,
  getStandard,
  type CatalogComponent,
} from '@/tools/catalog';

/* ─────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────── */

function titleCase(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Standard codes for a component, resolved through the catalog. */
function standardCodes(component: CatalogComponent): string[] {
  return component.standards
    .map((ref) => {
      const std = getStandard(ref.standardId);
      if (!std) return null;
      return [std.organization, std.code].filter(Boolean).join(' ');
    })
    .filter((code): code is string => Boolean(code));
}

/* ─────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────── */

export default function AccessoriesLibrary() {
  const { t } = useTranslation();
  // The open component lives in the URL so a datasheet can be linked to a
  // designer directly, and so Back returns to the list instead of leaving the
  // page. `t` is owned by Tools.tsx and must survive untouched.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAccessory = searchParams.get('c');
  const setSelectedAccessory = (id: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('c', id);
      else next.delete('c');
      return next;
    });
  };
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<string | null>(null);
  const [connection, setConnection] = useState<string | null>(null);
  const [standardId, setStandardId] = useState<string | null>(null);
  const [pressureClass, setPressureClass] = useState<string | null>(null);

  // Every value below is derived from the catalog — no literals.
  const familyList = useMemo(() => families(), []);
  const connectionList = useMemo(() => connectionTypes(), []);
  const standardList = useMemo(() => standardsInUse(), []);
  const pressureClassList = useMemo(() => pressureClasses(), []);

  const results = useMemo(
    () => filterComponents({ query, family, connection, standardId, pressureClass }),
    [query, family, connection, standardId, pressureClass],
  );

  const totalDrawings = useMemo(
    () => allPublishable.reduce((sum, c) => sum + c.drawings.length, 0),
    [],
  );

  const hasFilters = Boolean(query || family || connection || standardId || pressureClass);

  const clearFilters = () => {
    setQuery('');
    setFamily(null);
    setConnection(null);
    setStandardId(null);
    setPressureClass(null);
  };

  if (selectedAccessory) {
    return (
      <AccessoryDetailPage
        accessoryId={selectedAccessory}
        onBack={() => setSelectedAccessory(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-zinc-800/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
            <Library className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">
              {t('tools.accessoriesLibrary', { defaultValue: 'Accessories Library' })}
            </h3>
            {/* Counts come from the catalog, never from a literal. */}
            <p className="text-xs text-zinc-400">
              {t('tools.accessoriesLibrary.totals', {
                defaultValue: '{{components}} components · {{drawings}} drawings',
                components: allPublishable.length,
                drawings: totalDrawings,
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('tools.accessoriesLibrary.searchPlaceholder', {
            defaultValue: 'Search by name, type, material or standard…',
          })}
          className="w-full rounded-lg border border-zinc-800/80 bg-[#0d0d0d] py-2.5 pl-9 pr-9 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label={t('common.clear', { defaultValue: 'Clear' })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Family filter chips — real derived counts */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFamily(null)}
          className={`rounded-full border px-3 py-1.5 text-xs transition-all ${
            family === null
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
              : 'border-zinc-800/80 bg-[#0d0d0d] text-zinc-400 hover:border-amber-500/30 hover:text-zinc-200'
          }`}
        >
          {t('tools.accessoriesLibrary.allFamilies', { defaultValue: 'All' })}
          <span className="ml-1.5 text-zinc-500">{allPublishable.length}</span>
        </button>
        {familyList.map((fam) => (
          <button
            key={fam.key}
            onClick={() => setFamily(fam.key === family ? null : fam.key)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-all ${
              family === fam.key
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                : 'border-zinc-800/80 bg-[#0d0d0d] text-zinc-400 hover:border-amber-500/30 hover:text-zinc-200'
            }`}
          >
            {fam.label}
            <span className="ml-1.5 text-zinc-500">{fam.count}</span>
          </button>
        ))}
      </div>

      {/* Connection + standard selects */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
            {t('tools.accessoriesLibrary.connection', { defaultValue: 'Connection' })}
          </label>
          <select
            value={connection ?? ''}
            onChange={(e) => setConnection(e.target.value || null)}
            className="min-w-[140px] rounded-md border border-zinc-800 bg-[#111] px-3 py-2 text-xs text-zinc-300 focus:border-amber-500/40 focus:outline-none"
          >
            <option value="">
              {t('tools.accessoriesLibrary.anyConnection', { defaultValue: 'Any connection' })}
            </option>
            {connectionList.map((conn) => (
              <option key={conn} value={conn}>
                {titleCase(conn)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
            {t('tools.accessoriesLibrary.standard', { defaultValue: 'Standard' })}
          </label>
          <select
            value={standardId ?? ''}
            onChange={(e) => setStandardId(e.target.value || null)}
            className="min-w-[180px] rounded-md border border-zinc-800 bg-[#111] px-3 py-2 text-xs text-zinc-300 focus:border-amber-500/40 focus:outline-none"
          >
            <option value="">
              {t('tools.accessoriesLibrary.anyStandard', { defaultValue: 'Any standard' })}
            </option>
            {standardList.map((std) => (
              <option key={std.id} value={std.id}>
                {[std.organization, std.code].filter(Boolean).join(' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
            {t('tools.accessoriesLibrary.pressureClass', { defaultValue: 'Pressure class' })}
          </label>
          <select
            value={pressureClass ?? ''}
            onChange={(e) => setPressureClass(e.target.value || null)}
            className="min-w-[140px] rounded-md border border-zinc-800 bg-[#111] px-3 py-2 text-xs text-zinc-300 focus:border-amber-500/40 focus:outline-none"
          >
            <option value="">
              {t('tools.accessoriesLibrary.anyPressureClass', { defaultValue: 'Any class' })}
            </option>
            {pressureClassList.map((cls) => (
              <option key={cls} value={cls}>
                {t('tools.accessoriesLibrary.classValue', {
                  defaultValue: 'Class {{value}}',
                  value: cls,
                })}
              </option>
            ))}
          </select>
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 rounded-md border border-zinc-800/80 bg-[#111] px-3 py-2 text-xs text-zinc-400 transition-all hover:border-amber-500/30 hover:text-amber-500"
          >
            <X className="h-3.5 w-3.5" />
            {t('tools.accessoriesLibrary.clearFilters', { defaultValue: 'Clear filters' })}
          </button>
        )}
      </div>

      {/* Result count */}
      <p className="text-xs text-zinc-500">
        {t('tools.accessoriesLibrary.resultCount', {
          defaultValue: '{{count}} of {{total}} components',
          count: results.length,
          total: allPublishable.length,
        })}
      </p>

      {/* Results grid */}
      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-[#0d0d0d] px-6 py-14 text-center">
          <div className="mb-3 rounded-full bg-zinc-800/50 p-3">
            <SearchX className="h-6 w-6 text-zinc-600" />
          </div>
          <p className="text-sm text-zinc-300">
            {t('tools.accessoriesLibrary.emptyTitle', { defaultValue: 'No components match' })}
          </p>
          <p className="mt-1 max-w-sm text-xs text-zinc-500">
            {t('tools.accessoriesLibrary.emptyHint', {
              defaultValue: 'Try a different search term or clear the active filters.',
            })}
          </p>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/20"
            >
              {t('tools.accessoriesLibrary.clearFilters', { defaultValue: 'Clear filters' })}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((component) => (
            <ComponentCard
              key={component.id}
              component={component}
              // The routing defect: previously every entry opened the same
              // hardcoded elbow. Each card now opens its own component.
              onSelect={() => setSelectedAccessory(component.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Result card
   ───────────────────────────────────────────── */

function ComponentCard({
  component,
  onSelect,
}: {
  component: CatalogComponent;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const codes = standardCodes(component);

  return (
    <button
      onClick={onSelect}
      className="group flex flex-col overflow-hidden rounded-lg border border-zinc-800/80 bg-[#0d0d0d] text-left transition-all hover:border-amber-500/30 hover:bg-[#111]"
    >
      {/* 3D render — the asset has a #303131 studio background baked in, so the
          frame uses the same tone and the render reads as one continuous
          surface instead of a lighter box on a darker card. */}
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-[#303131]">
        {component.render ? (
          <img
            src={component.render}
            alt={component.name}
            loading="lazy"
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="text-xs text-zinc-600">—</span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug text-zinc-100">{component.name}</p>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600 transition-colors group-hover:text-amber-500" />
        </div>

        {component.type && (
          <p className="text-xs text-zinc-500">{titleCase(component.type)}</p>
        )}

        {/* Connection types */}
        {component.connectionTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {component.connectionTypes.map((conn) => (
              <span
                key={conn}
                className="rounded border border-zinc-800/60 bg-[#0a0a0a] px-1.5 py-0.5 text-[10px] text-zinc-400"
              >
                {titleCase(conn)}
              </span>
            ))}
          </div>
        )}

        {/* Standard codes */}
        {codes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {codes.map((code) => (
              <span
                key={code}
                className="rounded border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 font-mono text-[10px] text-amber-500/90"
              >
                {code}
              </span>
            ))}
          </div>
        )}

        {/* Pressure classes, or the reason there are none. */}
        <p className="text-[11px] text-zinc-500">
          {component.pressureRatings.length > 0
            ? t('tools.accessoriesLibrary.cardClasses', {
                defaultValue: 'Class {{list}}',
                list: component.pressureRatings.join(' · '),
              })
            : component.ratingBasis === 'wall_thickness'
              ? t('tools.accessoriesLibrary.cardBySchedule', {
                  defaultValue: 'Rating by schedule',
                })
              : ''}
        </p>

        {/* Number of sizes actually drawn */}
        <p className="mt-auto pt-1 text-[11px] text-zinc-500">
          {t('tools.accessoriesLibrary.sizesDrawn', {
            defaultValue: '{{count}} sizes drawn',
            count: component.drawings.length,
          })}
        </p>
      </div>
    </button>
  );
}
