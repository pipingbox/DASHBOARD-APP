/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: estados cerrados del pipeline y
 * tamaños. Espejo del CHECK de la migración 021 (fuente única de verdad: la
 * BD). Módulo PURO (sin Deno.*).
 */

export const REFERENCE_STATUSES = ['REFERENCE_CREATED', 'CONSUMED', 'EXPIRED', 'REVOKED'] as const;
export type ReferenceStatus = (typeof REFERENCE_STATUSES)[number];

export const MESSAGE_STATUSES = [
  'RECEIVED',
  'QUARANTINED',
  'SCANNING',
  'EXTRACTION_PENDING',
  'NEEDS_REVIEW',
  'AWAITING_USER_CONFIRMATION',
  'APPROVED',
  'REJECTED',
  'PROMOTED',
  'FAILED',
  'EXPIRED',
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/**
 * Estado máximo alcanzable automáticamente por el pipeline en la Entrega B
 * (TEST). AWAITING_USER_CONFIRMATION solo lo alcanza una acción administrativa
 * explícita; PROMOTED está PROHIBIDO en esta fase (invariante de seguridad).
 */
export const MAX_AUTOMATIC_STATUS: MessageStatus = 'EXTRACTION_PENDING';
export const MAX_TEST_STATUS: MessageStatus = 'AWAITING_USER_CONFIRMATION';
export const FORBIDDEN_TEST_STATUSES: readonly MessageStatus[] = ['APPROVED', 'PROMOTED'];

export const INBOUND_ERROR_CATEGORIES = [
  'invalid_signature',
  'invalid_payload',
  'unknown_reference',
  'expired_reference',
  'revoked_reference',
  'consumed_reference',
  'no_attachment',
  'too_many_attachments',
  'oversize',
  'mime_mismatch',
  'blocked_format',
  'download_failed',
  'provider_unavailable',
  'duplicate',
  'database',
  'unknown',
] as const;
export type InboundErrorCategory = (typeof INBOUND_ERROR_CATEGORIES)[number];

export type SizeBucket = '<=100kb' | '100kb-1mb' | '1mb-5mb' | '5mb-10mb';

export function sizeToBucket(bytes: number): SizeBucket {
  if (bytes <= 100 * 1024) return '<=100kb';
  if (bytes <= 1024 * 1024) return '100kb-1mb';
  if (bytes <= 5 * 1024 * 1024) return '1mb-5mb';
  return '5mb-10mb';
}

export const DOC_INTAKE_LIMITS = {
  /** Tamaño máximo por adjunto (alineado con la app y el bucket). */
  maxAttachmentBytes: 10 * 1024 * 1024,
  /** Máximo de adjuntos procesados por mensaje. */
  maxAttachmentsPerMessage: 3,
  /** Caducidad por defecto de una referencia (horas). */
  referenceTtlHours: 72,
  /** Rate limit de creación de referencias por usuario y hora. */
  maxReferencesPerUserPerHour: 5,
  /** Retención de metadatos del mensaje (días). */
  messageRetentionDays: 30,
} as const;
