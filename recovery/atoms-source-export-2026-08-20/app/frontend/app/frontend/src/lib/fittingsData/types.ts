/**
 * Fittings Data — Type definitions for the Accessories Library.
 * All dimensional values are stored in mm (base unit).
 * Conversion to inches is handled at the UI layer.
 */

export type FittingCategory =
  | 'elbow-bw'
  | 'tee-bw'
  | 'reducer-bw'
  | 'cap-bw'
  | 'valve'
  | 'flange'
  | 'stud-bolt'
  | 'gasket'
  | 'stub-end'
  | 'olet'
  | 'fitting-sw'
  | 'fitting-threaded'
  | 'spectacle-blind'
  | 'y-strainer';

export interface FittingDimension {
  key: string;
  value_mm: number;
  /** If true, this is the primary "advance" dimension for prefabrication */
  isPrimaryAdvance?: boolean;
}

export interface FittingEntry {
  category: FittingCategory;
  standard: string;
  type?: string;
  class_rating?: number;
  nps: string;
  schedule?: string;
  dimensions: FittingDimension[];
  weight_kg?: number;
  notes?: string;
}

export interface CategoryMeta {
  id: FittingCategory;
  nameKey: string;
  descKey: string;
  standard: string;
  phase: 1 | 2 | 3;
  available: boolean;
}

export const FITTING_CATEGORIES: CategoryMeta[] = [
  { id: 'elbow-bw', nameKey: 'tools.accessories.cat.elbowBW', descKey: 'tools.accessories.cat.elbowBWDesc', standard: 'ASME B16.9', phase: 1, available: true },
  { id: 'tee-bw', nameKey: 'tools.accessories.cat.teeBW', descKey: 'tools.accessories.cat.teeBWDesc', standard: 'ASME B16.9', phase: 1, available: true },
  { id: 'reducer-bw', nameKey: 'tools.accessories.cat.reducerBW', descKey: 'tools.accessories.cat.reducerBWDesc', standard: 'ASME B16.9', phase: 1, available: true },
  { id: 'cap-bw', nameKey: 'tools.accessories.cat.capBW', descKey: 'tools.accessories.cat.capBWDesc', standard: 'ASME B16.9', phase: 1, available: true },
  { id: 'valve', nameKey: 'tools.accessories.cat.valve', descKey: 'tools.accessories.cat.valveDesc', standard: 'ASME B16.10', phase: 1, available: true },
  { id: 'flange', nameKey: 'tools.accessories.cat.flange', descKey: 'tools.accessories.cat.flangeDesc', standard: 'ASME B16.5', phase: 2, available: true },
  { id: 'stud-bolt', nameKey: 'tools.accessories.cat.studBolt', descKey: 'tools.accessories.cat.studBoltDesc', standard: 'ASME B16.5', phase: 2, available: true },
  { id: 'gasket', nameKey: 'tools.accessories.cat.gasket', descKey: 'tools.accessories.cat.gasketDesc', standard: 'ASME B16.20', phase: 2, available: true },
  { id: 'stub-end', nameKey: 'tools.accessories.cat.stubEnd', descKey: 'tools.accessories.cat.stubEndDesc', standard: 'ASME B16.9', phase: 2, available: true },
  { id: 'olet', nameKey: 'tools.accessories.cat.olet', descKey: 'tools.accessories.cat.oletDesc', standard: 'MSS SP-97', phase: 3, available: true },
  { id: 'fitting-sw', nameKey: 'tools.accessories.cat.fittingSW', descKey: 'tools.accessories.cat.fittingSWDesc', standard: 'ASME B16.11', phase: 3, available: true },
  { id: 'fitting-threaded', nameKey: 'tools.accessories.cat.fittingThreaded', descKey: 'tools.accessories.cat.fittingThreadedDesc', standard: 'ASME B16.11', phase: 3, available: true },
  { id: 'spectacle-blind', nameKey: 'tools.accessories.cat.spectacleBlind', descKey: 'tools.accessories.cat.spectacleBlindDesc', standard: 'ASME B16.48', phase: 3, available: true },
  { id: 'y-strainer', nameKey: 'tools.accessories.cat.yStrainer', descKey: 'tools.accessories.cat.yStrainerDesc', standard: 'MSS SP-59', phase: 3, available: true },
];
