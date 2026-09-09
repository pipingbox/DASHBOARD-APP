/**
 * Inch fraction helpers for workshop output.
 *
 * Returns the nearest fraction with a given denominator (default 16ths)
 * and a compact string representation.
 */

export interface FractionResult {
  /** Original decimal value in inches. */
  decimal: number;
  /** Nearest whole number part. */
  whole: number;
  /** Numerator of the fractional remainder (0 if exact whole). */
  numerator: number;
  /** Denominator used (e.g. 16). */
  denominator: number;
  /** Signed error = decimal - roundedValue. */
  error: number;
}

/**
 * Round a decimal inch value to the nearest fraction.
 * @param value value in inches
 * @param denominator max denominator (default 16)
 */
export function decimalToFraction(value: number, denominator = 16): FractionResult {
  const sign = value < 0 ? -1 : 1;
  const absValue = Math.abs(value);
  const whole = Math.floor(absValue);
  const remainder = absValue - whole;

  const scaled = Math.round(remainder * denominator);
  const roundedRemainder = scaled / denominator;
  const roundedValue = sign * (whole + roundedRemainder);

  // Simplify
  const g = gcd(scaled, denominator);
  const numerator = scaled / g;
  const simplifiedDenominator = denominator / g;

  return {
    decimal: value,
    whole: sign * whole,
    numerator: sign * numerator,
    denominator: simplifiedDenominator,
    error: value - roundedValue,
  };
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a || 1;
}

/**
 * Format a decimal inch value as "1-3/4" or "1/2" or "2".
 * Returns empty string for NaN/Infinity.
 */
export function formatFraction(value: number, denominator = 16): string {
  if (!Number.isFinite(value)) return '';
  const f = decimalToFraction(value, denominator);

  const absWhole = Math.abs(f.whole);
  const absNum = Math.abs(f.numerator);

  if (absNum === 0) return `${f.whole}`;
  if (absWhole === 0) return `${f.numerator}/${f.denominator}`;
  return `${f.whole} ${absNum}/${f.denominator}`;
}

/**
 * Convert a decimal inch to feet+inches string, e.g. "2' 3-1/2\"".
 */
export function formatFeetInches(valueInches: number, denominator = 16): string {
  if (!Number.isFinite(valueInches)) return '';
  const sign = valueInches < 0 ? '-' : '';
  const abs = Math.abs(valueInches);
  const feet = Math.floor(abs / 12);
  const inches = abs - feet * 12;
  const inchFrac = formatFraction(inches, denominator);
  if (feet === 0) return `${sign}${inchFrac}"`;
  return `${sign}${feet}' ${inchFrac}"`;
}
