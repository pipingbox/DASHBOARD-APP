/**
 * Imperial fraction formatting helpers.
 *
 * Used to display inch dimensions as fractions (e.g. 5/8") instead of decimals,
 * which is the conventional format for bolting and piping dimensions.
 */

const FRACTION_MAP: Readonly<Record<number, string>> = {
  0.5: '1/2"',
  0.625: '5/8"',
  0.75: '3/4"',
  0.875: '7/8"',
  1: '1"',
  1.125: '1-1/8"',
  1.25: '1-1/4"',
  1.375: '1-3/8"',
  1.5: '1-1/2"',
  1.625: '1-5/8"',
  1.75: '1-3/4"',
  1.875: '1-7/8"',
  2: '2"',
  2.25: '2-1/4"',
  2.5: '2-1/2"',
  2.75: '2-3/4"',
  3: '3"',
  3.25: '3-1/4"',
  3.5: '3-1/2"',
  3.75: '3-3/4"',
  4: '4"',
  4.25: '4-1/4"',
  4.5: '4-1/2"',
};

/** Format a decimal inch value as a conventional fractional string. */
export function formatInchFraction(inches: number): string {
  const exact = FRACTION_MAP[inches];
  if (exact) return exact;

  const whole = Math.floor(inches);
  const remainder = inches - whole;
  const sixteenths = Math.round(remainder * 16);

  if (sixteenths === 0) return `${whole}"`;

  let num = sixteenths;
  let den = 16;
  // Reduce fraction
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(num, den);
  num /= divisor;
  den /= divisor;

  if (whole === 0) return `${num}/${den}"`;
  return `${whole}-${num}/${den}"`;
}

/** Format a millimetre value with reasonable precision. */
export function formatMm(mm: number): string {
  return Number(mm.toFixed(1)).toString();
}

/** Convert mm to inches and format as a fraction. */
export function mmToInchFraction(mm: number): string {
  return formatInchFraction(mm / 25.4);
}

/** Format a combined imperial + metric display for lengths. */
export function formatLengthDisplay(mm: number): string {
  return `${mmToInchFraction(mm)} (${formatMm(mm)} mm)`;
}

/** Format a combined imperial + metric display for diameters. */
export function formatDiameterDisplay(inches: number): string {
  return `${formatInchFraction(inches)} (${(inches * 25.4).toFixed(3)} mm)`;
}
