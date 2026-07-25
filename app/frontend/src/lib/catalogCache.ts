/**
 * catalogCache.ts — IndexedDB offline-first cache for the PIDM catalog
 * 
 * Uses native IndexedDB API (no external dependencies).
 * Stores catalog data with lastSync timestamp for delta sync.
 */

import type { CatalogSnapshot, PidmStandard, PidmComponent, PidmDimensionSet, PidmDimension } from './catalogTypes';

const DB_NAME = 'pipingbox_catalog';
const DB_VERSION = 1;

// Store names
const STORES = {
  standards: 'standards',
  components: 'components',
  dimensionSets: 'dimension_sets',
  dimensions: 'dimensions',
  meta: 'meta',
} as const;

// ─── DB initialization ─────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      // Standards: keyed by id
      if (!db.objectStoreNames.contains(STORES.standards)) {
        db.createObjectStore(STORES.standards, { keyPath: 'id' });
      }
      // Components: keyed by id, indexed by family and category
      if (!db.objectStoreNames.contains(STORES.components)) {
        const store = db.createObjectStore(STORES.components, { keyPath: 'id' });
        store.createIndex('family', 'family', { unique: false });
        store.createIndex('category', 'category', { unique: false });
      }
      // Dimension sets: keyed by id
      if (!db.objectStoreNames.contains(STORES.dimensionSets)) {
        db.createObjectStore(STORES.dimensionSets, { keyPath: 'id' });
      }
      // Dimensions: keyed by auto-increment, indexed by component_id and dim_set_id
      if (!db.objectStoreNames.contains(STORES.dimensions)) {
        const store = db.createObjectStore(STORES.dimensions, { keyPath: 'id' });
        store.createIndex('component_id', 'component_id', { unique: false });
        store.createIndex('dim_set_id', 'dim_set_id', { unique: false });
        store.createIndex('nps', 'nps', { unique: false });
      }
      // Meta: keyed by key name
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Generic store operations ───────────────────────────────

async function putAll<T>(storeName: string, items: T[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const item of items) store.put(item);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result as T[]); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function getAllByIndex<T>(storeName: string, indexName: string, value: IDBValidKey): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const index = tx.objectStore(storeName).index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => { db.close(); resolve(req.result as T[]); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

// ─── Public API ─────────────────────────────────────────────

export async function getLastSync(): Promise<string | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.meta, 'readonly');
      const req = tx.objectStore(STORES.meta).get('lastSync');
      req.onsuccess = () => {
        db.close();
        resolve(req.result?.value || null);
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

export async function setLastSync(timestamp: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.meta, 'readwrite');
    tx.objectStore(STORES.meta).put({ key: 'lastSync', value: timestamp });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Save a full or delta snapshot to IndexedDB */
export async function saveCatalogSnapshot(snapshot: CatalogSnapshot): Promise<void> {
  await putAll(STORES.standards, snapshot.standards);
  await putAll(STORES.components, snapshot.components);
  await putAll(STORES.dimensionSets, snapshot.dimension_sets);
  await putAll(STORES.dimensions, snapshot.dimensions);
  await setLastSync(snapshot.snapshot_at);
}

/** Load the full catalog from IndexedDB */
export async function loadCatalogFromCache(): Promise<CatalogSnapshot | null> {
  try {
    const lastSync = await getLastSync();
    if (!lastSync) return null;

    const [standards, components, dimension_sets, dimensions] = await Promise.all([
      getAll<PidmStandard>(STORES.standards),
      getAll<PidmComponent>(STORES.components),
      getAll<PidmDimensionSet>(STORES.dimensionSets),
      getAll<PidmDimension>(STORES.dimensions),
    ]);

    if (components.length === 0) return null;

    return { standards, components, dimension_sets, dimensions, snapshot_at: lastSync };
  } catch {
    return null;
  }
}

/** Get dimensions for a specific component from IndexedDB */
export async function getDimensionsByComponent(componentId: string): Promise<PidmDimension[]> {
  return getAllByIndex<PidmDimension>(STORES.dimensions, 'component_id', componentId);
}

/** Get components by family from IndexedDB */
export async function getComponentsByFamily(family: string): Promise<PidmComponent[]> {
  return getAllByIndex<PidmComponent>(STORES.components, 'family', family);
}

/** Get components by category from IndexedDB */
export async function getComponentsByCategory(category: string): Promise<PidmComponent[]> {
  return getAllByIndex<PidmComponent>(STORES.components, 'category', category);
}

/** Check if cache has data */
export async function hasCachedCatalog(): Promise<boolean> {
  const lastSync = await getLastSync();
  return lastSync !== null;
}

/** Clear all catalog data from IndexedDB */
export async function clearCatalogCache(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const storeNames = [STORES.standards, STORES.components, STORES.dimensionSets, STORES.dimensions, STORES.meta];
    const tx = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) tx.objectStore(name).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
