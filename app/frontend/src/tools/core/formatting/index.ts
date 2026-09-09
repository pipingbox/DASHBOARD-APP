/**
 * Number and result formatting for workshop output.
 *
 * No i18n here — only presentation helpers. UI labels live in i18n files.
 */

export interface FormatOptions {
  /** Number of decimal places to keep (default 2). */
  decimals?: number;
  /** Strip trailing zeros (default true). */
  stripZeros?: boolean;
  /** Use grouping separator for thousands (default false). */
  thousands?: boolean;
  /** Suffix such as " mm" or "\""; keep separate from value in result cards. */
  suffix?: string;
}

const DEFAULT_OPTIONS: Required<FormatOptions> = {
  decimals: 2,
  stripZeros: true,
  thousands: false,
  suffix: '',
};

/**
 * Format a number for display.
 */
export function formatNumber(value: number, options?: FormatOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!Number.isFinite(value)) return '';

  let formatted: string;
  if (opts.decimals <= 0) {
    formatted = Math.round(value).toString();
  } else {
    const fixed = value.toFixed(opts.decimals);
    formatted = opts.stripZeros ? fixed.replace(/\.?0+$/, '') : fixed;
  }

  if (opts.thousands) {
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    formatted = parts.join('.');
  }

  return formatted + opts.suffix;
}

/**
 * Format an angle in degrees with the degree symbol.
 */
export function formatAngleDeg(value: number, options?: Omit<FormatOptions, 'suffix'>): string {
  return `${formatNumber(value, { ...options, suffix: '' })}°`;
}

/**
 * Clamp a number to [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Round to a given number of decimals without trailing zeros.
 */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Compare two floats within a tolerance.
 */
export function near(a: number, b: number, tolerance = 0.001): boolean {
  return Math.abs(a - b) <= tolerance;
}
