import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library, ChevronRight, Search, X, SearchX } from 'lucide-react';
import AccessoryDetailPage from '@/tools/accessory-library/AccessoryDetailPage';
import { trackEvent, LIBRARY_COMPONENT_ID_RE } from '@/lib/observability';
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

  // ── PB-LIBRARY-COMPLETE-001 — usage analytics (closed taxonomy, no PII) ──
  const viewedRef = useRef(false);
  const lastSearchEmittedRef = useRef('');
  const resultsCount = results.length;

  // library_viewed — once per Library mount, with the rendered catalog size.
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    trackEvent('library_viewed', { results_count: allPublishable.length });
  }, []);

  // library_search_performed — debounced, deduped per committed query; the
  // payload carries only the LENGTH of the query, never the free text
  // (search terms may contain PII). library_empty_result on zero matches.
  const activeFilterCount =
    Number(Boolean(family)) +
    Number(Boolean(connection)) +
    Number(Boolean(standardId)) +
    Number(Boolean(pressureClass));
  useEffect(() => {
    if (!query) {
      lastSearchEmittedRef.current = '';
      return;
    }
    if (query === lastSearchEmittedRef.current) return;
    const handle = window.setTimeout(() => {
      if (query === lastSearchEmittedRef.current) return;
      lastSearchEmittedRef.current = query;
      trackEvent('library_search_performed', {
        query_length: query.length,
        results_count: resultsCount,
      });
      if (resultsCount === 0) {
        trackEvent('library_empty_result', {
          query_length: query.length,
          filter_count: activeFilterCount,
        });
      }
    }, 600);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs guard dedupe; state snapshots are read at fire time
  }, [query, resultsCount, activeFilterCount]);

  const trackFilter = (
    filterType: 'family' | 'connection_type' | 'standard' | 'pressure_class',
    filterValue: string | null,
  ) => {
    if (!filterValue) return;
    // results_count reflects the state BEFORE this selection renders; it is a
    // coarse scope signal, not a funnel metric.
    trackEvent('library_filter_selected', {
      filter_type: filterType,
      filter_value: filterValue,
      results_count: resultsCount,
    });
  };

  const selectFamily = (key: string | null) => {
    setFamily(key);
    trackFilter('family', key);
  };
  const selectConnection = (key: string | null) => {
    setConnection(key);
    trackFilter('connection_type', key);
  };
  const selectStandard = (key: string | null) => {
    setStandardId(key);
    trackFilter('standard', key);
  };
  const selectPressureClass = (key: string | null) => {
    setPressureClass(key);
    trackFilter('pressure_class', key);
  };

  const openComponent = (id: string) => {
    setSelectedAccessory(id);
    // Closed PB-COMP-* id only — cards come from the typed catalog, never
    // from user input, but keep the guard explicit for future sources.
    if (LIBRARY_COMPONENT_ID_RE.test(id)) {
      trackEvent('library_item_opened', { component_id: id });
    }
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
              {t('tools.accessoriesLibrary.title', { defaultValue: 'Accessories Library' })}
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
          onClick={() => selectFamily(null)}
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
            onClick={() => selectFamily(fam.key === family ? null : fam.key)}
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
            onChange={(e) => selectConnection(e.target.value || null)}
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
            onChange={(e) => selectStandard(e.target.value || null)}
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
            onChange={(e) => selectPressureClass(e.target.value || null)}
            className="min-w-[140px] rounded-md border border-zinc-800 bg-[#111] px-3 py-2 text-xs text-zinc-300 focus:border-amber-500/40 focus:outline-none"
          >
            <option value="">
              {t('tools.accessoriesLibrary.anyPressureClass', { defaultValue: 'Any class' })}
            </option>
            {pressureClassList.map((pc) => (
              <option key={pc} value={pc}>
                {t('tools.accessoriesLibrary.classValue', {
                  defaultValue: 'Class {{value}}',
                  value: pc,
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

      {/* Grid */}
      {results.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 bg-[#0a0a0a] px-4 py-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-zinc-700" />
          <p className="mt-3 text-sm text-zinc-400">
            {t('tools.accessoriesLibrary.emptyTitle', { defaultValue: 'No components match' })}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            {t('tools.accessoriesLibrary.emptyHint', {
              defaultValue: 'Try another search term or clear the active filters.',
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((comp) => (
            <button
              key={comp.id}
              onClick={() => openComponent(comp.id)}
              className="group rounded-lg border border-zinc-800/80 bg-[#111] p-4 text-left transition-all hover:border-amber-500/30 hover:bg-[#151515]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100 group-hover:text-amber-500">
                    {comp.shortName || comp.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {titleCase(comp.family)}
                    {comp.type ? ` · ${titleCase(comp.type)}` : ''}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-700 transition-colors group-hover:text-amber-500" />
              </div>

              {/* Render thumbnail — 3D asset as-is on dark ground. */}
              {comp.render && (
                <div className="mt-3 flex h-28 items-center justify-center overflow-hidden rounded-md border border-zinc-800/60 bg-[#151515]">
                  <img
                    src={comp.render}
                    alt={comp.name}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                </div>
              )}

              <div className="mt-3 space-y-1.5 text-[11px] text-zinc-500">
                {comp.connectionTypes.length > 0 && (
                  <p className="truncate">
                    <span className="text-zinc-600">
                      {t('tools.accessoriesLibrary.connection', { defaultValue: 'Connection' })}:{' '}
                    </span>
                    {comp.connectionTypes.map(titleCase).join(', ')}
                  </p>
                )}
                {comp.standards.length > 0 && (
                  <p className="truncate">
                    <span className="text-zinc-600">
                      {t('tools.accessoriesLibrary.standard', { defaultValue: 'Standard' })}:{' '}
                    </span>
                    {standardCodes(comp).join(' · ')}
                  </p>
                )}
                {comp.pressureRatings.length > 0 && (
                  <p className="truncate">
                    {t('tools.accessoriesLibrary.cardClasses', {
                      defaultValue: 'Class {{list}}',
                      list: comp.pressureRatings.join(', '),
                    })}
                  </p>
                )}
                <p>
                  {t('tools.accessoriesLibrary.sizesDrawn', {
                    defaultValue: '{{count}} sizes drawn',
                    count: comp.drawings.length,
                  })}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
