/**
 * PB-PIPE-COMB-CORRECTION-001 / P3-B (integration review fixes) — local
 * fabrication field state adapter.
 *
 * Review findings H1 + H2: the fabrication section used to rebuild the
 * module inputs from `field.text` with `parseLengthInputToMm`, feeding the
 * PRESENTATION rounding back into the calculation (CLR 84.14 mm became
 * valid after mm -> in because "3.3126" parses to 84.14004 mm; Lin 1000.004
 * was consumed as 1000), and a unit toggle reformatted EMPTY/INVALID fields
 * from a stale last-valid canonical value, resurrecting deleted data.
 *
 * This adapter is LOCAL to P3-B on purpose: `number-input.ts` and
 * `shared.ts` stay frozen (P2 contracts). Differences from
 * `LengthFieldState`:
 *
 *  - `canonicalMm` is non-null ONLY while the CURRENT text parses. Editing
 *    to empty/invalid clears it — there is no stale last-valid value to
 *    resurrect. The module always consumes `canonicalMm` directly, never a
 *    re-parse of the display text.
 *  - Unit toggle reformats ONLY valid fields. Empty stays empty (absence),
 *    invalid text is preserved untouched (explicit review state) until the
 *    user corrects it.
 *
 * Pure module: no React, no DOM, no i18n.
 */

import { parseLengthInputToMm, formatLengthForUnit } from './number-input.ts';
import type { LengthUnit } from '../../core/units/index.ts';

export interface FabFieldState {
  text: string;
  unit: LengthUnit;
  /** Canonical physical mm — non-null only while the current text parses. */
  canonicalMm: number | null;
}

/** Tri-state classification (review H2: absence ≠ invalid ≠ valid). */
export type FabFieldStatus = 'absent' | 'invalid' | 'valid';

export function createFabField(unit: LengthUnit, initialMm?: number): FabFieldState {
  if (initialMm === undefined) return { text: '', unit, canonicalMm: null };
  return { text: formatLengthForUnit(initialMm, unit), unit, canonicalMm: initialMm };
}

export function fabFieldStatus(field: FabFieldState): FabFieldStatus {
  if (field.text.trim() === '') return 'absent';
  return parseLengthInputToMm(field.text, field.unit) === null ? 'invalid' : 'valid';
}

/** User edit: replace the canonical value exactly when the text parses. */
export function fabFieldOnEdit(field: FabFieldState, raw: string): FabFieldState {
  return { text: raw, unit: field.unit, canonicalMm: parseLengthInputToMm(raw, field.unit) };
}

/**
 * Unit toggle: re-render the display text ONLY for a currently-valid field.
 * Empty stays empty; invalid text is carried over unchanged. A toggle never
 * changes the physical value and never resurrects deleted/invalid data.
 */
export function fabFieldOnUnitChange(field: FabFieldState, newUnit: LengthUnit): FabFieldState {
  if (field.unit === newUnit) return field;
  if (fabFieldStatus(field) !== 'valid' || field.canonicalMm === null) {
    return { text: field.text, canonicalMm: null, unit: newUnit };
  }
  return {
    text: formatLengthForUnit(field.canonicalMm, newUnit),
    canonicalMm: field.canonicalMm,
    unit: newUnit,
  };
}
