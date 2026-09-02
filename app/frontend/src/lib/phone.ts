// Frontend E.164 phone normalization.
// PB-PHONE-VERIFICATION-001
// Debe mantenerse sincronizado con supabase/functions/_shared/phone.ts.

export interface CountryPhoneMetadata {
  code: string;
  prefix: string;
  trunkPrefix?: string;
  minLength: number;
  maxLength: number;
}

export const COUNTRY_PHONE_OPTIONS: CountryPhoneMetadata[] = [
  { code: 'ES', prefix: '34', minLength: 9, maxLength: 9 },
  { code: 'BE', prefix: '32', minLength: 9, maxLength: 9 },
  { code: 'NL', prefix: '31', minLength: 9, maxLength: 9 },
  { code: 'DE', prefix: '49', minLength: 10, maxLength: 11 },
  { code: 'FR', prefix: '33', minLength: 9, maxLength: 9 },
  { code: 'PT', prefix: '351', minLength: 9, maxLength: 9 },
  { code: 'IT', prefix: '39', minLength: 9, maxLength: 10 },
  { code: 'GB', prefix: '44', trunkPrefix: '0', minLength: 10, maxLength: 10 },
  { code: 'PL', prefix: '48', minLength: 9, maxLength: 9 },
  { code: 'RO', prefix: '40', minLength: 9, maxLength: 9 },
];

export const COUNTRY_PHONE_METADATA: Record<string, CountryPhoneMetadata> =
  Object.fromEntries(COUNTRY_PHONE_OPTIONS.map((c) => [c.code, c]));

export interface NormalizeResult {
  valid: boolean;
  e164?: string;
  countryCode?: string;
  error?: string;
}

export function normalizeToE164(
  countryCode: string,
  nationalNumber: string,
): NormalizeResult {
  const meta = COUNTRY_PHONE_METADATA[countryCode.toUpperCase()];
  if (!meta) {
    return { valid: false, error: `unsupported_country: ${countryCode}` };
  }

  let digits = nationalNumber.replace(/\D/g, '');

  if (digits.startsWith(meta.prefix)) {
    digits = digits.slice(meta.prefix.length);
  }

  if (meta.trunkPrefix && digits.startsWith(meta.trunkPrefix)) {
    digits = digits.slice(meta.trunkPrefix.length);
  }

  if (digits.length < meta.minLength || digits.length > meta.maxLength) {
    return {
      valid: false,
      error: `invalid_length: expected ${meta.minLength}-${meta.maxLength}, got ${digits.length}`,
    };
  }

  return {
    valid: true,
    e164: `${meta.prefix}${digits}`,
    countryCode: meta.code,
  };
}

export function formatE164ForDisplay(e164: string, countryCode: string): string {
  const meta = COUNTRY_PHONE_METADATA[countryCode.toUpperCase()];
  if (!meta || !e164.startsWith(meta.prefix)) return e164;
  const national = e164.slice(meta.prefix.length);
  return `+${meta.prefix} ${national}`;
}
