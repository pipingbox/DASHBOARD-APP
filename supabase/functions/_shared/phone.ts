// _shared/phone.ts
// Normalizacion E.164 con prefijos de pais y trunk prefix nacional.
// PB-PHONE-VERIFICATION-001

export interface CountryPhoneMetadata {
  code: string;
  prefix: string;
  trunkPrefix?: string;
  minLength: number;
  maxLength: number;
}

export const COUNTRY_PHONE_METADATA: Record<string, CountryPhoneMetadata> = {
  ES: { code: "ES", prefix: "34", minLength: 9, maxLength: 9 },
  BE: { code: "BE", prefix: "32", minLength: 9, maxLength: 9 },
  NL: { code: "NL", prefix: "31", minLength: 9, maxLength: 9 },
  DE: { code: "DE", prefix: "49", minLength: 10, maxLength: 11 },
  FR: { code: "FR", prefix: "33", minLength: 9, maxLength: 9 },
  PT: { code: "PT", prefix: "351", minLength: 9, maxLength: 9 },
  IT: { code: "IT", prefix: "39", minLength: 9, maxLength: 10 },
  GB: { code: "GB", prefix: "44", trunkPrefix: "0", minLength: 10, maxLength: 10 },
  PL: { code: "PL", prefix: "48", minLength: 9, maxLength: 9 },
  RO: { code: "RO", prefix: "40", minLength: 9, maxLength: 9 },
};

export interface NormalizeResult {
  valid: boolean;
  e164?: string;
  countryCode?: string;
  error?: string;
}

/**
 * Normaliza un numero nacional a E.164.
 * - Elimina todo lo que no sea digito.
 * - Si ya empieza con el prefijo internacional, lo conserva.
 * - Si empieza con el trunk prefix nacional (ej. 0 en UK), lo elimina.
 * - Valida longitud minima/maxima para el pais.
 */
export function normalizeToE164(
  countryCode: string,
  nationalNumber: string,
): NormalizeResult {
  const meta = COUNTRY_PHONE_METADATA[countryCode.toUpperCase()];
  if (!meta) {
    return { valid: false, error: `unsupported_country: ${countryCode}` };
  }

  let digits = nationalNumber.replace(/\D/g, "");

  // Si ya incluye prefijo internacional, quitarlo para tratar como nacional
  if (digits.startsWith(meta.prefix)) {
    digits = digits.slice(meta.prefix.length);
  }

  // Quitar trunk prefix nacional si existe
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
