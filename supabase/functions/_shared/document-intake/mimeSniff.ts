/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: detección de MIME real por magic bytes
 * y controles estáticos de seguridad de adjuntos.
 *
 * Política (GO del PO):
 *   - Permitidos: application/pdf, image/png, image/jpeg (alineado con la app).
 *   - El MIME REAL manda sobre el declarado: un ".pdf" que es PE/ELF/HTML se
 *     rechaza; un adjunto declarado incorrectamente pero realmente PDF/imagen
 *     se acepta con el MIME detectado (mislabel benigno frecuente).
 *   - Contenido activo (HTML, SVG, scripts, ejecutables, archivos comprimidos
 *     no documentales) se rechaza siempre.
 *   - NUNCA se envían documentos a VirusTotal ni servicios públicos: solo
 *     comprobaciones estáticas locales. Un AV externo requeriría DPA +
 *     autorización del PO (documentado en el ticket).
 *
 * Módulo PURO (sin Deno.*).
 */

export type DetectedMime = 'application/pdf' | 'image/png' | 'image/jpeg' | null;
export type MimeCategory = 'pdf' | 'image' | 'document' | 'unknown';

export const ALLOWED_MIMES = ['application/pdf', 'image/png', 'image/jpeg'] as const;

/** Cabeceras de formatos bloqueados (activos o ejecutables). */
const BLOCKED_SIGNATURES: { name: string; test: (b: Uint8Array) => boolean }[] = [
  { name: 'pe/mz', test: (b) => b[0] === 0x4d && b[1] === 0x5a }, // "MZ" (exe/dll renombrado)
  { name: 'elf', test: (b) => b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46 },
  {
    name: 'mach-o',
    test: (b) =>
      (b[0] === 0xfe && b[1] === 0xed && b[2] === 0xfa && (b[3] === 0xce || b[3] === 0xcf)) ||
      (b[0] === 0xce && b[1] === 0xfa && b[2] === 0xed && b[3] === 0xfe) ||
      (b[0] === 0xcf && b[1] === 0xfa && b[2] === 0xed && b[3] === 0xfe) ||
      (b[0] === 0xca && b[1] === 0xfe && b[2] === 0xba && b[3] === 0xbe),
  },
  { name: 'zip/jar/apk', test: (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) },
  { name: 'rar', test: (b) => b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21 },
  { name: '7z', test: (b) => b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf },
  { name: 'gzip', test: (b) => b[0] === 0x1f && b[1] === 0x8b },
];

function startsWithAscii(bytes: Uint8Array, text: string): boolean {
  if (bytes.length < text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** Detecta contenido HTML/XML activo (ignora whitespace/BOM iniciales). */
function looksLikeActiveMarkup(bytes: Uint8Array): boolean {
  let i = 0;
  // Saltar BOM UTF-8 y whitespace.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  const head = String.fromCharCode(...bytes.slice(i, i + 16)).toLowerCase();
  return (
    head.startsWith('<!doctype') ||
    head.startsWith('<html') ||
    head.startsWith('<script') ||
    head.startsWith('<svg') ||
    head.startsWith('<?xml')
  );
}

/** Shebang (script de shell). */
function looksLikeScript(bytes: Uint8Array): boolean {
  return bytes[0] === 0x23 && bytes[1] === 0x21; // "#!"
}

/** MIME real por magic bytes. null = no reconocido. */
export function detectMime(bytes: Uint8Array): DetectedMime {
  if (bytes.length >= 5 && startsWithAscii(bytes, '%PDF-')) return 'application/pdf';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

export interface StaticScanResult {
  verdict: 'clean' | 'rejected';
  detectedMime: DetectedMime;
  /** Razón cerrada para error_category/telemetría (sin datos del archivo). */
  blockReason?: 'blocked_format' | 'mime_mismatch';
  /** Nombre cerrado de la firma bloqueada (p. ej. 'pe/mz'); nunca contenido. */
  blockedSignature?: string;
}

/**
 * Comprobaciones estáticas del adjunto. `declaredMime` es lo que afirma el
 * remitente; NO se confía en él, solo se registra para detectar mismatch.
 */
export function staticScan(bytes: Uint8Array, declaredMime: string | null): StaticScanResult {
  for (const sig of BLOCKED_SIGNATURES) {
    if (sig.test(bytes)) {
      return { verdict: 'rejected', detectedMime: null, blockReason: 'blocked_format', blockedSignature: sig.name };
    }
  }
  if (looksLikeActiveMarkup(bytes) || looksLikeScript(bytes)) {
    return { verdict: 'rejected', detectedMime: null, blockReason: 'blocked_format', blockedSignature: 'active-markup' };
  }
  const detected = detectMime(bytes);
  if (!detected) {
    // No reconocido → no es un documento permitido.
    return { verdict: 'rejected', detectedMime: null, blockReason: 'blocked_format', blockedSignature: 'unrecognized' };
  }
  // Mismatch: declarado como documento/imagen pero realmente otro permitido →
  // mislabel benigno (se acepta con el MIME detectado). Declarado como
  // documento pero detectado distinto NO permitido ya habría salido arriba.
  if (declaredMime && declaredMime !== detected) {
    const declaredAllowed = (ALLOWED_MIMES as readonly string[]).includes(declaredMime);
    if (declaredAllowed) {
      // p. ej. declara PDF pero es PNG: aceptar como PNG, señal de mismatch.
      return { verdict: 'clean', detectedMime: detected, blockReason: 'mime_mismatch' };
    }
    // Declarado no permitido (p. ej. application/x-msdownload) pero bytes de
    // documento real: aceptar con MIME detectado (el adjunto es lo que es).
  }
  return { verdict: 'clean', detectedMime: detected };
}

export function mimeToCategory(mime: string | null): MimeCategory {
  if (!mime) return 'unknown';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  return 'document';
}
