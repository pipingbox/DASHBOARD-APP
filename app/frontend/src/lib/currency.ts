// Currency helpers for salary formatting.
// Keeping this file minimal so multi-currency support can be added later
// without touching every call site.

export type CurrencyCode = 'EUR' | 'USD' | 'GBP';

export const DEFAULT_CURRENCY: CurrencyCode = 'EUR';

export const SUPPORTED_CURRENCIES: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
];

export function formatCurrency(
  value: number | null | undefined,
  currency: CurrencyCode = DEFAULT_CURRENCY,
  options: Intl.NumberFormatOptions = {},
): string {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function getCurrencySymbol(currency: CurrencyCode = DEFAULT_CURRENCY): string {
  return SUPPORTED_CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;
}