// PB-CV-AUTO-PROFILE-001 — Extracción de texto del binario del CV (Deno).
//
// Estrategia (ticket §9):
//   * PDF: texto nativo SIEMPRE primero (pdfjs-dist legacy build). Un PDF con
//     texto NUNCA pasa por OCR.
//   * DOCX: XML word/document.xml descomprimido (jszip) + strip de etiquetas.
//   * DOC binario legacy, imágenes y PDFs escaneados sin capa de texto:
//     fase 1 sin OCR (no hay proveedor de visión autorizado). Resultado:
//     { error: 'no_extractable_text' | 'unsupported_legacy_doc' | ... } y el
//     llamador marca el draft extraction_failed — el CV se conserva y el
//     usuario puede completar su perfil manualmente (ticket §14).
//
// PRIVACIDAD (ticket §12): ni el texto ni fragmentos del CV se loguean; este
// módulo solo devuelve longitudes y códigos de error en sus resultados.

export type TextExtractOk =
  | { ok: true; text: string; method: 'native_text' | 'docx_xml'; pages?: number }
  | { ok: false; error: 'no_extractable_text' | 'unsupported_legacy_doc' | 'unsupported_mime' | 'text_extraction_error' };

const MAX_PDF_PAGES = 30;
const MAX_TEXT_CHARS = 200_000;

function isPdf(mime: string | null | undefined, bytes: Uint8Array): boolean {
  if (mime === 'application/pdf') return true;
  // %PDF- magic number.
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function isZipDocx(mime: string | null | undefined, bytes: Uint8Array, fileName: string): boolean {
  const nameOk = /\.docx$/i.test(fileName);
  const mimeOk = mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  // PK\x03\x04 magic number.
  const zipMagic = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  return (nameOk || mimeOk) && zipMagic;
}

function isLegacyDoc(mime: string | null | undefined, fileName: string): boolean {
  if (mime === 'application/msword') return true;
  return /\.doc$/i.test(fileName);
}

/** Extrae texto del binario. Determinista, sin OCR, sin servicios externos. */
export async function extractText(
  bytes: Uint8Array,
  mime: string | null | undefined,
  fileName: string,
): Promise<TextExtractOk> {
  try {
    if (isPdf(mime, bytes)) {
      return await extractPdfText(bytes);
    }
    if (isZipDocx(mime, bytes, fileName)) {
      return await extractDocxText(bytes);
    }
    if (isLegacyDoc(mime, fileName)) {
      return { ok: false, error: 'unsupported_legacy_doc' };
    }
    return { ok: false, error: 'unsupported_mime' };
  } catch {
    // Sin detalles del documento en el error (privacidad).
    return { ok: false, error: 'text_extraction_error' };
  }
}

async function extractPdfText(bytes: Uint8Array): Promise<TextExtractOk> {
  // pdfjs-dist legacy build: compatible con runtimes sin DOM completo.
  // Import dinámico para que el bundle de la función no cargue pdfjs cuando
  // el archivo no es PDF.
  const { getDocument } = await import('npm:pdfjs-dist@4.2.67/legacy/build/pdf.mjs');
  const pdf = await getDocument({
    data: bytes,
    useSystemFonts: true,
    // Sin worker: runtime edge sin Web Worker disponible.
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const pageTexts: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Reconstruir saltos de línea a partir de los items con EOL.
    let line = '';
    const lines: string[] = [];
    for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
      if (typeof item.str !== 'string') continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
      }
    }
    if (line) lines.push(line);
    pageTexts.push(lines.join('\n'));
  }

  const text = pageTexts.join('\n').slice(0, MAX_TEXT_CHARS);
  // PDF escaneado: páginas sin texto útil → fallback seguro (fase 1 sin OCR).
  if (text.replace(/\s/g, '').length < 40) {
    return { ok: false, error: 'no_extractable_text' };
  }
  return { ok: true, text, method: 'native_text', pages: pageCount };
}

async function extractDocxText(bytes: Uint8Array): Promise<TextExtractOk> {
  const JSZip = (await import('npm:jszip@3.10.1')).default;
  const zip = await JSZip.loadAsync(bytes);
  const doc = zip.file('word/document.xml');
  if (!doc) return { ok: false, error: 'no_extractable_text' };
  const xml: string = await doc.async('string');

  // Conservar saltos de párrafo (<w:p>) y de línea (<w:br/>), extraer solo el
  // texto corrido (<w:t>). Es una lectura estructural mínima, no un render.
  const text = xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS);

  if (text.replace(/\s/g, '').length < 40) {
    return { ok: false, error: 'no_extractable_text' };
  }
  return { ok: true, text, method: 'docx_xml' };
}

/** SHA-256 del binario (idempotencia por contenido, ticket §15). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
