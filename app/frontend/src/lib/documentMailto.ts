/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: construcción del mailto del canal
 * documental por correo. Módulo PURO (sin import.meta.env): importable desde
 * tests.
 */

export interface DocumentMailtoParts {
  address: string;
  subject: string;
  body: string;
}

/** mailto: con asunto y cuerpo URL-encoded; la dirección nunca se reescribe. */
export function buildDocumentMailto(parts: DocumentMailtoParts): string {
  const subject = encodeURIComponent(parts.subject);
  const body = encodeURIComponent(parts.body);
  return `mailto:${parts.address}?subject=${subject}&body=${body}`;
}
