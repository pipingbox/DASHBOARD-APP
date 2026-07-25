/**
 * useFittingsProvider.ts — Hybrid data provider for AccessoriesLibrary
 *
 * Strategy: PIDM data from Supabase when available, hardcoded fallback otherwise.
 * Each category is independently switchable.
 */

import { useMemo } from 'react';
import { useCatalog } from '@/hooks/useCatalog';
import { pidmToFittingEntries, pidmToFittingCategory } from '@/lib/catalogTypes';
import type { PidmComponent, PidmDimension, PidmDimensionSet } from '@/lib/catalogTypes';
import type { FittingCategory, FittingEntry } from '@/lib/fittingsData/types';

// Hardcoded fallback imports
import {
  ELBOW_ENTRIES, TEE_ENTRIES, CAP_ENTRIES, STUB_END_ENTRIES,
  FLANGE_ENTRIES, STUD_BOLT_ENTRIES, GASKET_ENTRIES,
  SW_FITTING_ENTRIES, THREADED_FITTING_ENTRIES,
  SPECTACLE_BLIND_ENTRIES, Y_STRAINER_ENTRIES,
  OLET_ENTRIES,
  VALVE_RAW, REDUCER_RAW, OLET_RAW,
} from '@/lib/fittingsData';

/** Categories that use GenericTable/ClassFilteredTable/TypeFilteredTable and can be served from PIDM */
const PIDM_ELIGIBLE: Set<FittingCategory> = new Set([
  'elbow-bw', 'tee-bw', 'cap-bw', 'stub-end',
  'flange', 'stud-bolt', 'gasket',
  'fitting-sw', 'fitting-threaded',
  'spectacle-blind', 'y-strainer',
  'olet',
]);

/** Map category → hardcoded entries (for fallback) */
const HARDCODED: Partial<Record<FittingCategory, FittingEntry[]>> = {
  'elbow-bw': ELBOW_ENTRIES,
  'tee-bw': TEE_ENTRIES,
  'cap-bw': CAP_ENTRIES,
  'stub-end': STUB_END_ENTRIES,
  flange: FLANGE_ENTRIES,
  'stud-bolt': STUD_BOLT_ENTRIES,
  gasket: GASKET_ENTRIES,
  'fitting-sw': SW_FITTING_ENTRIES,
  'fitting-threaded': THREADED_FITTING_ENTRIES,
  'spectacle-blind': SPECTACLE_BLIND_ENTRIES,
  'y-strainer': Y_STRAINER_ENTRIES,
  olet: OLET_ENTRIES,
};

export interface FittingsProviderResult {
  /** Get FittingEntry[] for a category — PIDM-backed if available, hardcoded otherwise */
  getEntries: (category: FittingCategory) => FittingEntry[];
  /** Specialized raw data (not yet migrated to PIDM) */
  valveRaw: typeof VALVE_RAW;
  reducerRaw: typeof REDUCER_RAW;
  oletRaw: typeof OLET_RAW;
  /** Data source info */
  source: 'pidm' | 'hardcoded' | 'loading';
  pidmComponentCount: number;
  pidmDimensionCount: number;
  lastSync: string | null;
  isLoading: boolean;
}

export function useFittingsProvider(): FittingsProviderResult {
  const { store, isLoading, lastSync, componentCount, dimensionCount } = useCatalog();

  // Build PIDM entries by category (memoized)
  const pidmByCategory = useMemo(() => {
    if (!store || store.components.size === 0) return null;

    const map = new Map<FittingCategory, FittingEntry[]>();

    for (const [compId, comp] of store.components) {
      const cat = pidmToFittingCategory(comp);
      if (!cat || !PIDM_ELIGIBLE.has(cat)) continue;

      const dims = store.dimensionsByComponent.get(compId) || [];
      if (dims.length === 0) continue;

      const dimSet = comp.dimension_sets[0]
        ? store.dimensionSets.get(comp.dimension_sets[0])
        : undefined;

      const entries = pidmToFittingEntries(comp, dims, dimSet);
      const existing = map.get(cat) || [];
      existing.push(...entries);
      map.set(cat, existing);
    }

    return map;
  }, [store]);

  const hasPidm = pidmByCategory !== null && pidmByCategory.size > 0;

  const getEntries = (category: FittingCategory): FittingEntry[] => {
    // Try PIDM first
    if (hasPidm && PIDM_ELIGIBLE.has(category)) {
      const pidmEntries = pidmByCategory!.get(category);
      if (pidmEntries && pidmEntries.length > 0) {
        return pidmEntries;
      }
    }
    // Fallback to hardcoded
    return HARDCODED[category] || [];
  };

  return {
    getEntries,
    // Specialized raw data — these stay hardcoded until PIDM adapters are built
    valveRaw: VALVE_RAW,
    reducerRaw: REDUCER_RAW,
    oletRaw: OLET_RAW,
    source: isLoading ? 'loading' : hasPidm ? 'pidm' : 'hardcoded',
    pidmComponentCount: componentCount,
    pidmDimensionCount: dimensionCount,
    lastSync,
    isLoading,
  };
}
