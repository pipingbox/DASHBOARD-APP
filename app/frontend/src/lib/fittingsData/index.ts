/**
 * Fittings Data — Central re-export and helpers.
 */
export type { FittingCategory, FittingDimension, FittingEntry, CategoryMeta } from './types';
export { FITTING_CATEGORIES } from './types';

// Phase 1
export { ELBOW_ENTRIES, ELBOW_COLUMNS } from './elbows';
export { TEE_ENTRIES, TEE_COLUMNS } from './tees';
export { REDUCER_ENTRIES, REDUCER_COLUMNS, REDUCER_RAW } from './reducers';
export { VALVE_ENTRIES, VALVE_TYPES, VALVE_CLASSES, VALVE_RAW } from './valves';
export { CAP_ENTRIES, CAP_COLUMNS } from './caps';

// Phase 2
export { FLANGE_ENTRIES, FLANGE_TYPES, FLANGE_CLASSES, FLANGE_COLUMNS_WN, FLANGE_COLUMNS_SO } from './flanges';
export { STUD_BOLT_ENTRIES, STUD_BOLT_CLASSES, STUD_BOLT_COLUMNS } from './studBolts';
export { GASKET_ENTRIES, GASKET_TYPES, GASKET_CLASSES, GASKET_COLUMNS } from './gaskets';
export { STUB_END_ENTRIES, STUB_END_COLUMNS } from './stubEnds';

// Phase 3
export { OLET_ENTRIES, OLET_TYPES, OLET_RAW } from './olets';
export { SW_FITTING_ENTRIES, SW_FITTING_TYPES } from './fittingSW';
export { THREADED_FITTING_ENTRIES, THREADED_FITTING_TYPES } from './fittingThreaded';
export { SPECTACLE_BLIND_ENTRIES, SPECTACLE_BLIND_CLASSES, SPECTACLE_BLIND_COLUMNS } from './specials';
export { Y_STRAINER_ENTRIES, Y_STRAINER_COLUMNS } from './specials';

/** Convert mm to inches */
export function mmToInch(mm: number): number {
  return +(mm / 25.4).toFixed(2);
}
