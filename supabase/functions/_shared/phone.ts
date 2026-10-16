// _shared/phone.ts
// Normalizacion E.164 canonica (CON '+' inicial), masking para auditoria y
// generacion segura de codigos OTP.
// PB-PHONE-VERIFICATION-001 / PB-WHATSAPP-FOUNDATION-001
//
// Debe mantenerse sincronizado con app/frontend/src/lib/phone.ts.
// Modulo puro (sin dependencias): testeable fuera de Deno.

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
  /** Canonico E.164 CON '+' inicial (ej. "+34612345678"). */
  e164?: string;
  countryCode?: string;
  error?: string;
}

/**
 * Normaliza un numero nacional o internacional a E.164 canonico con '+'.
 * - Elimina todo lo que no sea digito.
 * - Si ya incluye prefijo internacional, lo conserva.
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
    e164: `+${meta.prefix}${digits}`,
    countryCode: meta.code,
  };
}

/**
 * Enmascara un E.164 para auditoria/logs: conserva '+' y el prefijo de pais
 * (2-3 digitos) y los 3 ultimos digitos; el resto se sustituye por '*'.
 * Ej.: "+34612345678" -> "+34******678". NUNCA devuelve el numero completo.
 */
export function maskE164(e164: string): string {
  if (!e164 || e164.length < 7) return "***";
  // Prefijo de pais conocido si es posible; si no, 2 digitos tras el '+'.
  const digits = e164.replace(/\D/g, "");
  let prefixLen = 2;
  for (const meta of Object.values(COUNTRY_PHONE_METADATA)) {
    if (digits.startsWith(meta.prefix)) {
      prefixLen = meta.prefix.length;
      break;
    }
  }
  const head = `+${digits.slice(0, prefixLen)}`;
  const tail = digits.slice(-3);
  return `${head}******${tail}`;
}

/**
 * Genera un codigo OTP de 6 digitos con CSPRNG (crypto.getRandomValues).
 * Nunca usar Math.random para secretos.
 */
export function generateOtpCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (100000 + (buf[0] % 900000)).toString();
}

export function formatE164ForDisplay(e164: string, countryCode: string): string {
  const meta = COUNTRY_PHONE_METADATA[countryCode.toUpperCase()];
  const digits = e164.replace(/\D/g, "");
  if (!meta || !digits.startsWith(meta.prefix)) return e164;
  const national = digits.slice(meta.prefix.length);
  return `+${meta.prefix} ${national}`;
}
