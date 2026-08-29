/**
 * PIDM catalog access layer
 * Ticket: PB-TOOLS-CATALOG-001
 *
 * Typed accessors over `catalog.generated.json`, which is produced by
 * `scripts/build-catalog.mjs` from PIPINGBOX-BRAIN/brain/08-CATALOG and
 * committed. Do not read the JSON directly from components: everything goes
 * through here so the shape is validated in one place.
 */

import raw from './catalog.generated.json';

/* ── types ───────────────────────────────────────────────────────────────── */

export interface CatalogDrawing {
  /** NPS designation, e.g. `4`, `8x6`, `1-2` (half inch). Null for legacy assets. */
  size: string | null;
  src: string;
}

export interface CatalogStandardRef {
  standardId: string;
  role: string | null;
  note: string | null;
}

export interface CatalogCompatibility {
  target: string | null;
  relation: string | null;
  /**
   * Structured qualifiers, e.g. `{ connection: 'BW', nominal_size_match: true }`.
   * This is an object in every record, never a string — rendering it directly
   * as a React child would throw.
   */
  conditions: Record<string, unknown> | null;
}

/**
 * Level 1 REFERENTIAL brand mention (PB-PARTNER-CATALOG-001).
 *
 * Trademarks of third parties, cited under art. 14(1)(c) of Regulation (EU)
 * 2017/1001 solely to indicate the intended purpose of a standardised
 * component. This type deliberately has NO field able to hold a manufacturer
 * dimension, pressure or model reference: Level 1 is names + the standard that
 * defines the interface + prose, nothing else. Manufacturer product data is
 * Level 2 and requires a signed agreement.
 */
export interface CatalogReferenceCompatibility {
  level: string;
  /** Cited legal basis, e.g. `Art. 14(1)(c) Regulation (EU) 2017/1001`. */
  legalBasis: string | null;
  /** The standard that defines the interface. This — not a brand — is the claim. */
  basisStandardId: string | null;
  basisLabel: string | null;
  /** Brand names only. Never logos, never product references. */
  brands: string[];
  note: string | null;
}

export interface CatalogComponent {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  description: string | null;
  status: string;
  version: string | null;
  category: string | null;
  family: string | null;
  type: string | null;
  tags: string[];
  connectionTypes: string[];
  materials: string[];
  pressureRatings: string[];
  /**
   * How the component is rated. `wall_thickness` means the component is NOT
   * designated by pressure class (ASME B16.9 butt-weld fittings, MSS SP-97
   * butt-weld olets) and an empty `pressureRatings` is the correct answer
   * rather than a missing value.
   */
  ratingBasis: 'pressure_class' | 'wall_thickness' | 'working_pressure' | 'not_applicable' | null;
  ratingNote: string | null;
  standards: CatalogStandardRef[];
  dimensionSets: string[];
  drawings: CatalogDrawing[];
  drawingStem: string | null;
  render: string | null;
  fabricationNotes: string[];
  compatibleWith: CatalogCompatibility[];
  /** Null for every Level 0 record. Only present where brands are cited. */
  referenceCompatibility: CatalogReferenceCompatibility | null;
  /** True only when a real 2D drawing and a real 3D render both resolved. */
  publishable: boolean;
}

export interface CatalogStandard {
  id: string;
  organization: string | null;
  code: string | null;
  title: string | null;
  edition: string | null;
  status: string | null;
  scope: string | null;
  roles: string[];
  applicableFamilies: string[];
}

export interface DimensionField {
  key: string;
  label: string;
  unit: string | null;
  type: string;
  priority: number;
}

export interface DimensionSet {
  id: string;
  componentId: string | null;
  standardId: string | null;
  system: string | null;
  selectors: { key: string; label: string; unit: string | null; type: string }[];
  fields: DimensionField[];
  rows: Record<string, string | number | null>[];
}

interface CatalogPayload {
  stats: Record<string, number>;
  components: CatalogComponent[];
  standards: Record<string, CatalogStandard>;
  dimensionSets: Record<string, DimensionSet>;
}

const catalog = raw as unknown as CatalogPayload;

/* ── core accessors ──────────────────────────────────────────────────────── */

export const catalogStats = catalog.stats;

/**
 * Only publishable components are exposed to the UI. A record without both a
 * drawing and a render is real catalog data but not something to present in a
 * library we describe as professional.
 */
export const components: CatalogComponent[] = catalog.components.filter((c) => c.publishable);

/** Every component including unpublishable ones — for governance reporting. */
export const allComponents: CatalogComponent[] = catalog.components;

export const standards: Record<string, CatalogStandard> = catalog.standards;
export const dimensionSets: Record<string, DimensionSet> = catalog.dimensionSets;

export function getComponent(idOrSlug: string): CatalogComponent | undefined {
  return components.find((c) => c.id === idOrSlug || c.slug === idOrSlug);
}

export function getStandard(id: string): CatalogStandard | undefined {
  return standards[id];
}

export function getDimensionSets(component: CatalogComponent): DimensionSet[] {
  return component.dimensionSets
    .map((id) => dimensionSets[id])
    .filter((d): d is DimensionSet => Boolean(d) && d.rows.length > 0);
}

/** Standards actually referenced by at least one published component. */
export function standardsInUse(): CatalogStandard[] {
  const ids = new Set(components.flatMap((c) => c.standards.map((s) => s.standardId)));
  return [...ids]
    .map((id) => standards[id])
    .filter((s): s is CatalogStandard => Boolean(s))
    .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));
}

/* ── families ────────────────────────────────────────────────────────────── */

export interface CatalogFamily {
  key: string;
  label: string;
  count: number;
  components: CatalogComponent[];
}

const FAMILY_LABELS: Record<string, string> = {
  fitting: 'Fittings',
  flange: 'Flanges',
  valve: 'Valves',
  gasket: 'Gaskets',
  bolting: 'Bolting',
  branch: 'Branch connections',
  blind: 'Blinds & spades',
  strainer: 'Strainers',
  pipe: 'Pipe',
  support: 'Supports',
};

function titleCase(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * Families are DERIVED from the data. The previous implementation hardcoded a
 * family list with literal counts that did not correspond to anything, and
 * every entry opened the same component. Counts here cannot drift from reality
 * because they are computed from the same array the UI renders.
 */
export function families(): CatalogFamily[] {
  const map = new Map<string, CatalogComponent[]>();
  for (const c of components) {
    const key = c.category ?? c.family ?? 'other';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return [...map.entries()]
    .map(([key, list]) => ({
      key,
      label: FAMILY_LABELS[key] ?? titleCase(key),
      count: list.length,
      components: list,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/* ── filtering ───────────────────────────────────────────────────────────── */

export interface CatalogFilters {
  query?: string;
  family?: string | null;
  connection?: string | null;
  standardId?: string | null;
  pressureClass?: string | null;
}

export function filterComponents(filters: CatalogFilters): CatalogComponent[] {
  const q = filters.query?.trim().toLowerCase() ?? '';
  return components.filter((c) => {
    if (filters.family && (c.category ?? c.family ?? 'other') !== filters.family) return false;
    if (filters.connection && !c.connectionTypes.includes(filters.connection)) return false;
    if (filters.standardId && !c.standards.some((s) => s.standardId === filters.standardId)) return false;
    if (filters.pressureClass && !c.pressureRatings.includes(filters.pressureClass)) return false;
    if (!q) return true;
    const haystack = [
      c.name, c.shortName, c.description, c.type, c.family, c.category,
      ...c.tags, ...c.connectionTypes, ...c.materials,
      ...c.standards.map((s) => standards[s.standardId]?.code ?? ''),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function connectionTypes(): string[] {
  return [...new Set(components.flatMap((c) => c.connectionTypes))].sort();
}

/**
 * Pressure classes actually present in the catalog, ordered numerically.
 * Classes come from several standards with different scales (B16.5 flange
 * classes and B16.11 forged classes are not the same thing), so they are
 * merged but never treated as equivalent.
 */
export function pressureClasses(): string[] {
  return [...new Set(components.flatMap((c) => c.pressureRatings))].sort(
    (a, b) => Number(a) - Number(b),
  );
}

/* ── size handling ───────────────────────────────────────────────────────── */

/**
 * Asset filenames encode NPS with `-` for fractions and `x` for reducing
 * sizes: `1-2` is 1/2", `11-2` is 1 1/2", `8x6` is 8" x 6". Rendering those
 * raw would show "11-2" to a fitter, so they are formatted for display.
 */
export function formatSize(size: string | null): string {
  if (!size) return '—';
  return size
    .split('x')
    .map((part) => {
      const m = part.match(/^(\d+)-(\d+)$/);
      if (!m) return `${part}"`;
      const [, a, b] = m;
      // `1-2` -> 1/2" ; `11-2` -> 1 1/2" ; `21-2` -> 2 1/2"
      if (a === '1' && b === '2') return '1/2"';
      if (a === '3' && b === '4') return '3/4"';
      if (a === '1' && b === '4') return '1/4"';
      if (a.length > 1) return `${a.slice(0, -1)} ${a.slice(-1)}/${b}"`;
      return `${a}/${b}"`;
    })
    .join(' × ');
}

export function sizeRank(size: string | null): number {
  if (!size) return Number.POSITIVE_INFINITY;
  const first = size.split('x')[0];
  const m = first.match(/^(\d+)-(\d+)$/);
  if (m) {
    const [, a, b] = m;
    if (a.length > 1) return Number(a.slice(0, -1)) + Number(a.slice(-1)) / Number(b);
    return Number(a) / Number(b);
  }
  const n = Number.parseFloat(first);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}
