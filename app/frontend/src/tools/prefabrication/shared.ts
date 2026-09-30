import { useEffect, useRef } from 'react';
import type { TFunction } from 'i18next';
import { toMm, fromMm } from '@/tools/core/units';

export type UnitSystem = 'metric' | 'imperial';

/** Failure shape shared by pure geometry engines (code + params + English fallback). */
export interface EngineFailure {
  reason: string;
  code?: string;
  params?: Record<string, string | number>;
}

/**
 * Map an engine failure to a localized message.
 * Engines never contain localized copy; the UI translates `code` with
 * `params`, falling back to the technical English `reason` only when no
 * translation exists.
 */
export function mapEngineError(t: TFunction, failure: EngineFailure): string {
  if (!failure.code) return failure.reason;
  return t(`tools.prefab.errors.${failure.code}`, {
    ...failure.params,
    defaultValue: failure.reason,
  });
}

/**
 * Convert a length input string between unit systems, preserving the
 * physical dimension. Non-numeric/empty values pass through unchanged.
 */
export function convertLengthInput(value: string, from: UnitSystem, to: UnitSystem): string {
  if (from === to) return value;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return value;
  const mm = toMm(n, from === 'metric' ? 'mm' : 'in');
  const out = fromMm(mm, to === 'metric' ? 'mm' : 'in');
  return to === 'metric' ? String(Number(out.toFixed(1))) : String(Number(out.toFixed(4)));
}

/**
 * Convert a set of length input fields when the unit system toggles, so the
 * physical geometry stays constant (values change, dimensions do not).
 */
export function useUnitFieldConversion(
  unitSystem: UnitSystem,
  fields: Array<[string, (v: string) => void]>
): void {
  const prevRef = useRef(unitSystem);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  useEffect(() => {
    const prev = prevRef.current;
    if (prev === unitSystem) return;
    for (const [value, setter] of fieldsRef.current) {
      setter(convertLengthInput(value, prev, unitSystem));
    }
    prevRef.current = unitSystem;
  }, [unitSystem]);
}
