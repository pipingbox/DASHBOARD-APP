/**
 * catalogTypes.ts — TypeScript types for the PIDM catalog + adapter functions
 * 
 * Maps Supabase pidm_* tables to frontend-compatible types.
 * Provides adapter functions to convert PidmDimension → FittingEntry / FlangeSpec.
 */

// ─── Database types (mirror Supabase pidm_* tables) ─────────

export interface PidmStandard {
  id: string;
  organization: string;
  code: string;
  title: string;
  edition: string | null;
  status: string;
  scope: string | null;
  roles: string[];
  applicable_families: string[];
  source: Record<string, unknown>;
  updated_at: string;
}

export interface PidmComponent {
  id: string;
  discipline: string;
  category: string;
  family: string;
  subfamily: string | null;
  type: string;
  tags: string[];
  display_name: string;
  short_name: string | null;
  description: string | null;
  slug: string | null;
  status: string;
  version: string;
  geometry: Record<string, unknown>;
  connection_types: string[];
  pressure_ratings: string[];
  materials: string[];
  primary_standard_id: string | null;
  standards: Array<{ standard_id: string; role: string; applicability_note?: string }>;
  dimension_sets: string[];
  assets: { drawing_2d?: string; render_3d?: string };
  localization: Record<string, { name?: string; short_name?: string }>;
  consumers: { modules?: string[]; tools?: string[] };
  validation_status: string;
  confidence: number;
  updated_at: string;
}

export interface PidmDimensionSet {
  id: string;
  component_id: string;
  standard_id: string;
  dataset_type: string;
  system: string;
  selectors: Array<{ key: string; label: string; unit: string; type: string }>;
  fields: Array<{ key: string; label: string; unit: string; type: string; fabrication_priority?: number }>;
  notes: string[];
  confidence: number;
  validation_status: string;
  updated_at: string;
}

export interface PidmDimension {
  id: number;
  dim_set_id: string;
  component_id: string;
  standard_id: string;
  nps: string;
  dn: string | null;
  pressure_class: string | null;
  schedule: string | null;
  dimensions: Record<string, number | string>;
  confidence: number;
  validation_status: string;
  source: string | null;
  updated_at: string;
}

// ─── Catalog snapshot (from RPC get_catalog_snapshot) ────────

export interface CatalogSnapshot {
  standards: PidmStandard[];
  components: PidmComponent[];
  dimension_sets: PidmDimensionSet[];
  dimensions: PidmDimension[];
  snapshot_at: string;
}

// ─── Catalog store (indexed for fast lookups) ───────────────

export interface CatalogStore {
  standards: Map<string, PidmStandard>;
  components: Map<string, PidmComponent>;
  dimensionSets: Map<string, PidmDimensionSet>;
  dimensionsByComponent: Map<string, PidmDimension[]>;
  lastSync: string | null;
}

export function buildCatalogStore(snapshot: CatalogSnapshot): CatalogStore {
  const store: CatalogStore = {
    standards: new Map(),
    components: new Map(),
    dimensionSets: new Map(),
    dimensionsByComponent: new Map(),
    lastSync: snapshot.snapshot_at,
  };

  for (const s of snapshot.standards) store.standards.set(s.id, s);
  for (const c of snapshot.components) store.components.set(c.id, c);
  for (const ds of snapshot.dimension_sets) store.dimensionSets.set(ds.id, ds);

  for (const d of snapshot.dimensions) {
    const existing = store.dimensionsByComponent.get(d.component_id) || [];
    existing.push(d);
    store.dimensionsByComponent.set(d.component_id, existing);
  }

  return store;
}

export function mergeCatalogStore(base: CatalogStore, delta: CatalogSnapshot): CatalogStore {
  // Apply delta updates on top of base
  for (const s of delta.standards) base.standards.set(s.id, s);
  for (const c of delta.components) base.components.set(c.id, c);
  for (const ds of delta.dimension_sets) base.dimensionSets.set(ds.id, ds);

  for (const d of delta.dimensions) {
    const existing = base.dimensionsByComponent.get(d.component_id) || [];
    // Replace if same dim_set_id + nps + class, otherwise append
    const idx = existing.findIndex(
      e => e.dim_set_id === d.dim_set_id && e.nps === d.nps && e.pressure_class === d.pressure_class
    );
    if (idx >= 0) existing[idx] = d;
    else existing.push(d);
    base.dimensionsByComponent.set(d.component_id, existing);
  }

  base.lastSync = delta.snapshot_at;
  return base;
}

// ─── Adapter: PIDM → FittingEntry (AccessoriesLibrary) ──────

import type { FittingCategory, FittingEntry, FittingDimension } from '@/lib/fittingsData/types';

/** Map PIDM component categories to FittingCategory IDs */
const CATEGORY_MAP: Record<string, FittingCategory> = {
  // BW fittings
  'fittings:elbow:BW': 'elbow-bw',
  'fittings:tee:BW': 'tee-bw',
  'fittings:reducer:BW': 'reducer-bw',
  'fittings:cap:BW': 'cap-bw',
  'fittings:stub_end:BW': 'stub-end',
  // SW fittings
  'fittings:elbow:SW': 'fitting-sw',
  'fittings:tee:SW': 'fitting-sw',
  'fittings:coupling:SW': 'fitting-sw',
  'fittings:half_coupling:SW': 'fitting-sw',
  'fittings:cap:SW': 'fitting-sw',
  'fittings:union:SW': 'fitting-sw',
  // THD fittings
  'fittings:elbow:THD': 'fitting-threaded',
  'fittings:tee:THD': 'fitting-threaded',
  'fittings:coupling:THD': 'fitting-threaded',
  'fittings:union:THD': 'fitting-threaded',
  'fittings:bushing:THD': 'fitting-threaded',
  'fittings:cap:THD': 'fitting-threaded',
  // Flanges
  'flanges:flange:BW': 'flange',
  'flanges:flange:SW': 'flange',
  'flanges:flange:THD': 'flange',
  'flanges:flange:SLIP_ON': 'flange',
  'flanges:flange:LAP_JOINT': 'flange',
  'flanges:flange:PLAIN_END': 'flange',
  // Valves
  'valves:gate:BW': 'valve',
  'valves:globe:BW': 'valve',
  'valves:ball:BW': 'valve',
  'valves:check:BW': 'valve',
  'valves:butterfly:BW': 'valve',
  // Olets
  'olets:weldolet:BW': 'olet',
  'olets:sockolet:SW': 'olet',
  'olets:thredolet:THD': 'olet',
  'olets:elbolet:BW': 'olet',
  'olets:latrolet:BW': 'olet',
  'olets:nipolet:BW': 'olet',
  // Specials
  'gaskets:gasket:PLAIN_END': 'gasket',
  'bolting:stud_bolt:PLAIN_END': 'stud-bolt',
  'specials:spectacle_blind:BW': 'spectacle-blind',
  'specials:y_strainer:BW': 'y-strainer',
};

function getCategoryKey(comp: PidmComponent): string {
  const conn = comp.connection_types[0] || 'BW';
  return `${comp.category}:${comp.family}:${conn}`;
}

export function pidmToFittingCategory(comp: PidmComponent): FittingCategory | null {
  return CATEGORY_MAP[getCategoryKey(comp)] || null;
}

export function pidmToFittingEntries(
  comp: PidmComponent,
  dims: PidmDimension[],
  dimSet: PidmDimensionSet | undefined,
): FittingEntry[] {
  const cat = pidmToFittingCategory(comp);
  if (!cat) return [];

  const fields = dimSet?.fields || [];
  const standard = comp.primary_standard_id?.replace('PB-STD-', '').replace(/-/g, ' ') || '';

  return dims.map(dim => {
    // Convert dimensions object to FittingDimension[]
    const fittingDims: FittingDimension[] = [];
    for (const field of fields) {
      const val = dim.dimensions[field.key];
      if (val == null || typeof val !== 'number') continue;

      // Determine if this is an mm value
      const isMm = field.unit === 'mm';
      const value_mm = isMm ? val : val * 25.4;

      fittingDims.push({
        key: field.key,
        value_mm,
        isPrimaryAdvance: field.fabrication_priority === 1,
      });
    }

    return {
      category: cat,
      standard,
      type: comp.subfamily || comp.type,
      class_rating: dim.pressure_class ? parseInt(dim.pressure_class) : undefined,
      nps: dim.nps,
      schedule: dim.schedule || undefined,
      dimensions: fittingDims,
      weight_kg: typeof dim.dimensions.weight_kg === 'number' ? dim.dimensions.weight_kg : undefined,
    };
  });
}

// ─── Adapter: PIDM → FlangeSpec (FlangeLibrary) ─────────────

import type { FlangeSpec, FlangeType, PressureClass } from '@/tools/flange-library/flange-data';

const FLANGE_TYPE_MAP: Record<string, FlangeType> = {
  weld_neck: 'WN',
  slip_on: 'SO',
  blind: 'BL',
  socket_weld: 'SO', // SW flanges shown as SO variant in UI
  threaded: 'SO',     // THD flanges shown as SO variant in UI
  lap_joint: 'SO',    // LJ shown as SO variant in UI
};

export function pidmToFlangeSpecs(
  comp: PidmComponent,
  dims: PidmDimension[],
): FlangeSpec[] {
  const flangeType = FLANGE_TYPE_MAP[comp.type] || 'SO';

  return dims.map(dim => {
    const d = dim.dimensions;
    const classStr = dim.pressure_class ? `${dim.pressure_class}#` : '150#';

    return {
      type: flangeType,
      typeLabel: comp.display_name || comp.type,
      pressureClass: classStr as PressureClass,
      facing: 'RF' as const,
      nps: `${dim.nps}"`,
      pipeOD: (d.od_pipe_in as number) || (d.bore_in as number) || 0,
      od: (d.od_flange_in as number) || 0,
      flangeThickness: (d.thickness_in as number) || 0,
      boltCircleDiameter: (d.bolt_circle_in as number) || 0,
      numBolts: (d.num_bolts as number) || 0,
      boltHoleDiameter: (d.bolt_dia_in as number) || 0,
      boltSize: `${d.bolt_dia_in || 0}"`,
      studLength: 0,
      boreDiameter: (d.bore_in as number) || 0,
      weight: 0,
      gasketOD: 0,
      gasketID: 0,
      gasketType: 'SW-CGI',
    };
  });
}
