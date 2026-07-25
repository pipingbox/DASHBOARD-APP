/**
 * useCatalog.ts — TanStack Query hooks for the PIDM catalog
 * 
 * Offline-first strategy:
 * 1. On mount → load from IndexedDB (instant)
 * 2. Background → fetch delta from Supabase RPC
 * 3. Merge delta → update IndexedDB + React Query cache
 * 4. No connection → serve from IndexedDB silently
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  loadCatalogFromCache,
  saveCatalogSnapshot,
  getLastSync,
} from '@/lib/catalogCache';
import {
  buildCatalogStore,
  mergeCatalogStore,
  pidmToFittingEntries,
  pidmToFittingCategory,
  pidmToFlangeSpecs,
} from '@/lib/catalogTypes';
import type {
  CatalogSnapshot,
  CatalogStore,
  PidmComponent,
  PidmDimension,
} from '@/lib/catalogTypes';
import type { FittingCategory, FittingEntry } from '@/lib/fittingsData/types';
import type { FlangeSpec } from '@/tools/flange-library/flange-data';

// ─── Query keys ─────────────────────────────────────────────

const CATALOG_KEY = ['pidm', 'catalog'] as const;

// ─── Fetch helpers ──────────────────────────────────────────

async function fetchSnapshot(since?: string): Promise<CatalogSnapshot | null> {
  try {
    const { data, error } = await supabase.rpc('get_catalog_snapshot', {
      since: since || '1970-01-01T00:00:00Z',
    });
    if (error) {
      console.warn('[PIDM] Supabase RPC error:', error.message);
      return null;
    }
    return data as CatalogSnapshot;
  } catch (err) {
    console.warn('[PIDM] Network error, using offline cache');
    return null;
  }
}

async function loadCatalog(): Promise<CatalogStore> {
  // 1. Try IndexedDB first
  const cached = await loadCatalogFromCache();
  if (cached) {
    return buildCatalogStore(cached);
  }

  // 2. No cache → full fetch from Supabase
  const snapshot = await fetchSnapshot();
  if (snapshot) {
    await saveCatalogSnapshot(snapshot);
    return buildCatalogStore(snapshot);
  }

  // 3. No cache, no network → empty store
  return {
    standards: new Map(),
    components: new Map(),
    dimensionSets: new Map(),
    dimensionsByComponent: new Map(),
    lastSync: null,
  };
}

// ─── Main hook ──────────────────────────────────────────────

export function useCatalog() {
  const queryClient = useQueryClient();
  const syncInProgress = useRef(false);

  const query = useQuery<CatalogStore>({
    queryKey: CATALOG_KEY,
    queryFn: loadCatalog,
    staleTime: Infinity,    // Dimensional data doesn't change at runtime
    gcTime: Infinity,       // Keep in cache forever
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Background delta sync
  useEffect(() => {
    if (!query.data || syncInProgress.current) return;

    const doSync = async () => {
      syncInProgress.current = true;
      try {
        const lastSync = await getLastSync();
        if (!lastSync) return; // First load already did full fetch

        const delta = await fetchSnapshot(lastSync);
        if (!delta) return; // No network or no changes

        // Check if delta has any data
        const hasData =
          (delta.standards?.length || 0) > 0 ||
          (delta.components?.length || 0) > 0 ||
          (delta.dimension_sets?.length || 0) > 0 ||
          (delta.dimensions?.length || 0) > 0;

        if (!hasData) return; // No updates

        // Merge into cache
        await saveCatalogSnapshot(delta);

        // Update React Query cache
        queryClient.setQueryData<CatalogStore>(CATALOG_KEY, (old) => {
          if (!old) return old;
          return mergeCatalogStore(old, delta);
        });
      } catch (err) {
        console.warn('[PIDM] Background sync failed:', err);
      } finally {
        syncInProgress.current = false;
      }
    };

    // Delay sync to not block initial render
    const timer = setTimeout(doSync, 2000);
    return () => clearTimeout(timer);
  }, [query.data, queryClient]);

  return {
    store: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    lastSync: query.data?.lastSync || null,
    /** Total component count */
    componentCount: query.data?.components.size || 0,
    /** Total dimension row count */
    dimensionCount: query.data ? Array.from(query.data.dimensionsByComponent.values()).reduce((n, arr) => n + arr.length, 0) : 0,
  };
}

// ─── Derived hooks ──────────────────────────────────────────

/** Get all fitting entries for the AccessoriesLibrary */
export function useCatalogFittings(): {
  entries: FittingEntry[];
  isLoading: boolean;
  categories: FittingCategory[];
} {
  const { store, isLoading } = useCatalog();

  if (!store || store.components.size === 0) {
    return { entries: [], isLoading, categories: [] };
  }

  const entries: FittingEntry[] = [];
  const categorySet = new Set<FittingCategory>();

  for (const [compId, comp] of store.components) {
    const cat = pidmToFittingCategory(comp);
    if (!cat) continue;

    const dims = store.dimensionsByComponent.get(compId) || [];
    const dimSet = comp.dimension_sets[0]
      ? store.dimensionSets.get(comp.dimension_sets[0])
      : undefined;

    const fittings = pidmToFittingEntries(comp, dims, dimSet);
    entries.push(...fittings);
    if (fittings.length > 0) categorySet.add(cat);
  }

  return {
    entries,
    isLoading,
    categories: Array.from(categorySet),
  };
}

/** Get flange specs for the FlangeLibrary */
export function useCatalogFlanges(): {
  specs: FlangeSpec[];
  isLoading: boolean;
} {
  const { store, isLoading } = useCatalog();

  if (!store || store.components.size === 0) {
    return { specs: [], isLoading };
  }

  const specs: FlangeSpec[] = [];

  for (const [compId, comp] of store.components) {
    if (comp.category !== 'flanges') continue;
    const dims = store.dimensionsByComponent.get(compId) || [];
    specs.push(...pidmToFlangeSpecs(comp, dims));
  }

  return { specs, isLoading };
}

/** Get dimensions for a specific component */
export function useCatalogDimensions(componentId: string | null) {
  const { store, isLoading } = useCatalog();

  if (!componentId || !store) {
    return { component: null, dimensions: [], dimSet: null, isLoading };
  }

  const component = store.components.get(componentId) || null;
  const dimensions = store.dimensionsByComponent.get(componentId) || [];
  const dimSetId = component?.dimension_sets[0];
  const dimSet = dimSetId ? store.dimensionSets.get(dimSetId) || null : null;

  return { component, dimensions, dimSet, isLoading };
}

/** Search components by family */
export function useCatalogByFamily(family: string) {
  const { store, isLoading } = useCatalog();

  if (!store) return { components: [], isLoading };

  const components: PidmComponent[] = [];
  for (const comp of store.components.values()) {
    if (comp.family === family) components.push(comp);
  }

  return { components, isLoading };
}

/** Force refresh the catalog (clear cache + refetch) */
export function useRefreshCatalog() {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    const { clearCatalogCache } = await import('@/lib/catalogCache');
    await clearCatalogCache();
    await queryClient.invalidateQueries({ queryKey: CATALOG_KEY });
  }, [queryClient]);
}
