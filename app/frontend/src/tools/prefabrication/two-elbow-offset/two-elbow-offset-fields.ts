/**
 * PB-PIPE-COMB-CORRECTION-001 / P4 — editable length representation for the
 * "Desplazamiento con dos codos" tool.
 *
 * WHY THIS MODULE EXISTS (review finding, 2026-10-22)
 * ---------------------------------------------------
 * The shared pipe-comb helper `formatLengthForUnit` renders a canonical
 * millimetre value with 2 decimals in mm (4 in inches) and only extends
 * precision when the WHOLE value would round to zero. That is correct for
 * read-only presentation, but it is wrong for an EDITABLE field: with
 * Df = 400.004 mm a unit round trip (mm -> in -> mm) redisplayed the field
 * as "400" while the calculation kept using 400.004 mm. The result
 * (0.004 mm / displaced) therefore disagreed with the visible input, and
 * retyping the visible "400" silently changed the geometry to tangent
 * elbows.
 *
 * ADOPTED CONTRACT
 * ----------------
 * The editable text is the SHORTEST decimal string, in the active unit,
 * that parses back to the canonical millimetre value within
 * `ROUND_TRIP_TOLERANCE_MM`. Precision is searched upwards from the
 * conventional base (2 decimals in mm, 4 in inches) so that ordinary values
 * stay readable ("200", "400", "152.4", "6") and extra digits appear only
 * when they carry information the calculation actually uses.
 *
 * The tolerance is 1e-6 mm (one nanometre): nine orders of magnitude below
 * any pipe-fabrication tolerance, and below the smallest figure the results
 * table can express in practice. Differences under it cannot change a
 * fabrication decision.
 *
 * Imperial precision is a consequence of the same rule, not a separate
 * convention: an exact millimetre value is not an exact inch value, so a
 * metric-origin value needs up to `MAX_DECIMALS.in` digits to stay faithful
 * (400 mm -> "15.7480315" in). Values the user typed in inches, and every
 * catalog CLR (inch-derived), stay short (16 -> "16", 152.4 mm -> "6").
 *
 * SCOPE: P4 only. `pipe-comb/number-input.ts`, the geometry engine and P3
 * are untouched — this module composes the frozen parser instead of
 * modifying it.
 *
 * Pure module: no React, no DOM, no i18n. Covered by
 * scripts/test-two-elbow-offset-fields.ts.
 */

import { fromMm, type LengthUnit } from '../../core/units/index.ts';
import { parseLengthInputToMm, type LengthFieldState } from '../pipe-comb/number-input.ts';

/** Largest difference (mm) allowed between the visible text and the canonical value. */
export const ROUND_TRIP_TOLERANCE_MM = 1e-6;

/** First precision tried per unit: the conventional reading of each system. */
export const BASE_DECIMALS: Record<'mm' | 'in', number> = { mm: 2, in: 4 };

/** Upper bound of the precision search per unit. */
export const MAX_DECIMALS: Record<'mm' | 'in', number> = { mm: 9, in: 9 };

function trimTrailingZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}

/**
 * Shortest faithful editable representation of `canonicalMm` in `unit`.
 *
 * Guarantees, in this order:
 *   1. The returned string always parses under the frozen decimal policy.
 *   2. Re-entering it reproduces the canonical value within
 *      ROUND_TRIP_TOLERANCE_MM — no fraction that the calculation uses is
 *      hidden from the user.
 *   3. A positive quantity never renders as "0" (the earlier guarantee is
 *      implied by 2: "0" cannot be within 1e-6 mm of a larger value).
 */
export function formatEditableLengthForUnit(canonicalMm: number, unit: 'mm' | 'in'): string {
  if (!Number.isFinite(canonicalMm)) return '';
  if (canonicalMm === 0) return '0';

  const value = unit === 'mm' ? canonicalMm : fromMm(canonicalMm, unit);

  for (let decimals = BASE_DECIMALS[unit]; decimals <= MAX_DECIMALS[unit]; decimals++) {
    const text = trimTrailingZeros(value.toFixed(decimals));
    const roundTripMm = parseLengthInputToMm(text, unit);
    if (roundTripMm !== null && Math.abs(roundTripMm - canonicalMm) <= ROUND_TRIP_TOLERANCE_MM) {
      return text;
    }
  }

  // Precision cap reached (pathological magnitudes only): keep the most
  // precise fixed-point string rather than a shorter, misleading one.
  return trimTrailingZeros(value.toFixed(MAX_DECIMALS[unit]));
}

/** Field seeded from a canonical millimetre value (defaults, catalog CLR). */
export function createEditableLengthField(initialMm: number, unit: 'mm' | 'in'): LengthFieldState {
  return {
    text: formatEditableLengthForUnit(initialMm, unit),
    canonicalMm: initialMm,
    unit,
  };
}

/**
 * Unit toggle for a P4 length field.
 *
 * The canonical value is never rewritten by a toggle. Only the display text
 * is re-rendered, and only when the current text is itself valid: empty
 * stays empty and invalid text stays invalid, so a toggle can never
 * resurrect the last valid value (P4 GO policy). Valid text is re-rendered
 * with the faithful representation above.
 */
/**
 * P4 user edit (review residual, 2026-10-22).
 *
 * Two distinct outcomes, without any generic fuzzy tolerance:
 *
 * 1. REPRESENTATIONAL-ONLY EDIT — the text changes but parses back to the
 *    existing canonical value within ROUND_TRIP_TOLERANCE_MM (adding a
 *    trailing zero, reformatting the same number). The canonical value is
 *    kept, so a borderline geometry (e.g. tangent elbows at CLR = 100 mm
 *    displayed as "3.9370079" in) is never tipped over the boundary by the
 *    decimal representation alone. The tolerance is 1e-6 mm = 1 nm, the
 *    same ida-y-vuelta bound the formatter itself guarantees: the visible
 *    text still agrees with the value fed to the engine within that bound.
 *
 * 2. REAL NUMERIC EDIT — the parsed value differs from the canonical value
 *    by more than the tolerance: the canonical value is replaced once
 *    (single conversion) and the engine recalculates, exactly as before.
 *
 * Empty/invalid text keeps the frozen contracts: the text is kept as typed
 * and the canonical value is untouched, so a toggle never resurrects a
 * stale value.
 */
export function editableLengthFieldOnEdit(
  field: LengthFieldState,
  raw: string,
  unit: 'mm' | 'in',
): LengthFieldState {
  const parsed = parseLengthInputToMm(raw, unit);
  if (parsed === null) {
    return { text: raw, canonicalMm: field.canonicalMm, unit };
  }
  if (
    field.canonicalMm !== null &&
    field.unit === unit &&
    Math.abs(parsed - field.canonicalMm) <= ROUND_TRIP_TOLERANCE_MM
  ) {
    return { text: raw, canonicalMm: field.canonicalMm, unit };
  }
  return { text: raw, canonicalMm: parsed, unit };
}

export function editableLengthFieldOnUnitChange(
  field: LengthFieldState,
  newUnit: 'mm' | 'in',
): LengthFieldState {
  if (field.unit === newUnit) return field;

  const textIsValid = parseLengthInputToMm(field.text, field.unit as 'mm' | 'in') !== null;
  if (!textIsValid || field.canonicalMm === null) {
    return { text: field.text, canonicalMm: field.canonicalMm, unit: newUnit };
  }

  return {
    text: formatEditableLengthForUnit(field.canonicalMm, newUnit),
    canonicalMm: field.canonicalMm,
    unit: newUnit,
  };
}
