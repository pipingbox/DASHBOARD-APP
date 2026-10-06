/**
 * PB-PIPE-COMB-CORRECTION-001 / P2 (final review fixes) — numeric input
 * policy and canonical physical field state for the pipe comb tool.
 *
 * Two explicit contracts:
 *
 * 1. DECIMAL SEPARATOR POLICY (`parseDecimalInput`)
 *    A field may use EITHER one point OR one comma as decimal separator.
 *    Strings containing both separators, or a repeated separator, are
 *    ambiguous (thousands grouping vs decimal) and are REJECTED instead of
 *    being silently reinterpreted. Non-numeric text is rejected as well.
 *
 * 2. CANONICAL PHYSICAL VALUE (`LengthFieldState`)
 *    The physical length is stored in millimetres at full precision and is
 *    NEVER rewritten by a unit toggle. Toggling units only re-renders the
 *    display text from the canonical value; editing parses the text once
 *    and replaces the canonical value. This removes the P2 round-trip
 *    precision loss (e.g. 200.04 mm -> in -> mm used to become 200 mm and
 *    could flip the stagger direction to "aligned").
 *
 * Pure module: no React, no DOM, no i18n. Consumed by PipeCombTool.tsx and
 * by scripts/test-pipe-comb-stagger-input.ts.
 */

import { toMm, fromMm, type LengthUnit } from '../../core/units/index.ts';

/**
 * Parse a user-typed decimal number under the explicit separator policy.
 * Returns null for empty, non-numeric or ambiguous input.
 */
export function parseDecimalInput(raw: string): number | null {
  const s = raw.trim();
  if (s === '') return null;
  const hasPoint = s.includes('.');
  const hasComma = s.includes(',');
  // Ambiguous grouping/decimal mixes are rejected, never guessed.
  if (hasPoint && hasComma) return null;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots > 1 || commas > 1) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Parse a length text in the given unit to millimetres (null = invalid). */
export function parseLengthInputToMm(raw: string, unit: LengthUnit): number | null {
  const n = parseDecimalInput(raw);
  return n === null ? null : toMm(n, unit);
}

function trimTrailingZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}

/**
 * Human-readable display text for a canonical millimetre value.
 * Metric shows up to 2 decimals, imperial up to 4 (matching the existing
 * tool conventions), but precision is automatically extended so a valid
 * small value never displays as zero. Display-only: the canonical value is
 * unaffected by this rounding.
 */
export function formatLengthForUnit(canonicalMm: number, unit: LengthUnit): string {
  const v = unit === 'mm' ? canonicalMm : fromMm(canonicalMm, unit);
  if (v === 0) return '0';
  const base = unit === 'mm' ? 2 : 4;
  for (let p = base; p <= 8; p++) {
    const s = trimTrailingZeros(v.toFixed(p));
    if (Number(s) !== 0) return s;
  }
  return v.toExponential(2);
}

/**
 * Canonical length field: `canonicalMm` is the single physical source of
 * truth; `text` is only its display/editing representation in `unit`.
 * `canonicalMm` is null only when nothing valid has ever been entered.
 */
export interface LengthFieldState {
  text: string;
  canonicalMm: number | null;
  unit: LengthUnit;
}

export function createLengthField(initialMm: number, unit: LengthUnit): LengthFieldState {
  return { text: formatLengthForUnit(initialMm, unit), canonicalMm: initialMm, unit };
}

/**
 * Unit toggle: re-render the display text from the canonical value.
 * The canonical physical value is returned untouched — toggling units
 * alone can never change the geometry.
 */
export function lengthFieldOnUnitChange(field: LengthFieldState, newUnit: LengthUnit): LengthFieldState {
  if (field.unit === newUnit) return field;
  return {
    text: field.canonicalMm === null ? field.text : formatLengthForUnit(field.canonicalMm, newUnit),
    canonicalMm: field.canonicalMm,
    unit: newUnit,
  };
}

/**
 * User edit: keep the raw text and, when it parses under the decimal
 * policy, replace the canonical value exactly once (single conversion, no
 * round-trip). Invalid text leaves the canonical value untouched; validity
 * is re-derived from the text by the caller.
 */
export function lengthFieldOnEdit(field: LengthFieldState, raw: string, unit: LengthUnit): LengthFieldState {
  const parsed = parseLengthInputToMm(raw, unit);
  return {
    text: raw,
    canonicalMm: parsed === null ? field.canonicalMm : parsed,
    unit,
  };
}

/** Validity check used by the solver memo: the visible text must parse. */
export function lengthFieldIsValid(field: LengthFieldState): boolean {
  return parseLengthInputToMm(field.text, field.unit) !== null;
}
