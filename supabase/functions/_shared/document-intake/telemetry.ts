/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: telemetría server-side (Edge Functions)
 * con taxonomía CERRADA y fail-open. Espejo del allowlist de
 * app/frontend/src/lib/observability.ts para los eventos document_email_* /
 * document_* de la Vía B (que se emiten en el servidor, no en el navegador).
 *
 * Propiedades permitidas (GO del PO): document_type, channel, mime_category,
 * size_bucket, provider, status, error_category, extraction_status,
 * confidence_bucket, duration_ms, correlation_id, environment, app_version.
 * NUNCA: email, nombre, asunto, cuerpo, nombre de archivo, UUID de usuario,
 * referencia/token, ruta Storage, URL, contenido, OCR, nº de certificado.
 *
 * Módulo PURO (sin Deno.*): la configuración se inyecta.
 */

import type { InboundErrorCategory, MessageStatus, SizeBucket } from './states.ts';

export const EMAIL_INTAKE_EVENTS = [
  'document_email_reference_created',
  'document_email_received',
  'document_email_rejected',
  'document_quarantined',
  'document_scan_completed',
  'document_extraction_completed',
  'document_awaiting_confirmation',
  'document_promoted',
] as const;
export type EmailIntakeEvent = (typeof EMAIL_INTAKE_EVENTS)[number];

const EVENT_PROPS: Record<EmailIntakeEvent, readonly string[]> = {
  document_email_reference_created: ['document_type', 'channel', 'provider', 'correlation_id'],
  document_email_received: ['document_type', 'channel', 'provider', 'status', 'mime_category', 'size_bucket', 'correlation_id'],
  document_email_rejected: ['document_type', 'channel', 'provider', 'status', 'error_category', 'mime_category', 'size_bucket', 'correlation_id'],
  document_quarantined: ['document_type', 'channel', 'provider', 'mime_category', 'size_bucket', 'correlation_id'],
  document_scan_completed: ['document_type', 'channel', 'provider', 'status', 'mime_category', 'size_bucket', 'duration_ms', 'correlation_id'],
  document_extraction_completed: ['document_type', 'channel', 'provider', 'extraction_status', 'confidence_bucket', 'duration_ms', 'correlation_id'],
  document_awaiting_confirmation: ['document_type', 'channel', 'provider', 'correlation_id'],
  document_promoted: ['document_type', 'channel', 'provider', 'mime_category', 'size_bucket', 'correlation_id'],
};

const DOC_TYPES = ['certificate', 'cv'] as const;
const CHANNELS = ['email'] as const;
const PROVIDERS = ['resend', 'postmark', 'cloudflare'] as const;
const MIME_CATEGORIES = ['pdf', 'image', 'document', 'unknown'] as const;
const CONFIDENCE_BUCKETS = ['high', 'medium', 'low', 'none'] as const;
const ERROR_CATEGORIES: readonly InboundErrorCategory[] = [
  'invalid_signature', 'invalid_payload', 'unknown_reference', 'expired_reference',
  'revoked_reference', 'consumed_reference', 'no_attachment', 'too_many_attachments',
  'oversize', 'mime_mismatch', 'blocked_format', 'download_failed',
  'provider_unavailable', 'duplicate', 'database', 'unknown',
];
// Importados como tipo; redeclarados aquí para validación en runtime sin dep
// circular de valores.
const MESSAGE_STATUSES: readonly MessageStatus[] = [
  'RECEIVED', 'QUARANTINED', 'SCANNING', 'EXTRACTION_PENDING', 'NEEDS_REVIEW',
  'AWAITING_USER_CONFIRMATION', 'APPROVED', 'REJECTED', 'PROMOTED', 'FAILED', 'EXPIRED',
];

export interface EmailIntakeTelemetryProps {
  document_type?: 'certificate' | 'cv';
  channel?: 'email';
  provider?: 'resend' | 'postmark' | 'cloudflare';
  status?: MessageStatus;
  error_category?: InboundErrorCategory;
  mime_category?: 'pdf' | 'image' | 'document' | 'unknown';
  size_bucket?: SizeBucket;
  extraction_status?: 'pending' | 'completed' | 'low_confidence' | 'failed' | 'skipped';
  confidence_bucket?: 'high' | 'medium' | 'low' | 'none';
  duration_ms?: number;
  correlation_id?: string;
}

export interface TelemetryConfig {
  posthogKey?: string;
  posthogHost?: string;
  environment?: string;
  appVersion?: string;
}

/**
 * Filtra las props contra el schema cerrado del evento y los enums cerrados.
 * Cualquier prop fuera del allowlist o con valor fuera de enum se DESCARTA.
 */
export function sanitizeEventProps(
  event: EmailIntakeEvent,
  props: EmailIntakeTelemetryProps,
): Record<string, unknown> {
  const allowed = EVENT_PROPS[event];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    const value = (props as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    switch (key) {
      case 'document_type':
        if ((DOC_TYPES as readonly string[]).includes(String(value))) out[key] = value;
        break;
      case 'channel':
        if ((CHANNELS as readonly string[]).includes(String(value))) out[key] = value;
        break;
      case 'provider':
        if ((PROVIDERS as readonly string[]).includes(String(value))) out[key] = value;
        break;
      case 'status':
        if ((MESSAGE_STATUSES as readonly string[]).includes(String(value))) out[key] = value;
        break;
      case 'error_category':
        if ((ERROR_CATEGORIES as readonly string[]).includes(String(value))) out[key] = value;
        break;
      case 'mime_category':
        if ((MIME_CATEGORIES as readonly string[]).includes(String(value))) out[key] = value;
        break;
      case 'size_bucket':
        if (['<=100kb', '100kb-1mb', '1mb-5mb', '5mb-10mb'].includes(String(value))) out[key] = value;
        break;
      case 'extraction_status':
        if (['pending', 'completed', 'low_confidence', 'failed', 'skipped'].includes(String(value))) out[key] = value;
        break;
      case 'confidence_bucket':
        if ((CONFIDENCE_BUCKETS as readonly string[]).includes(String(value))) out[key] = value;
        break;
      case 'duration_ms':
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) out[key] = Math.round(value);
        break;
      case 'correlation_id':
        // UUID generado por nosotros (no de usuario); formato estricto.
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value))) out[key] = value;
        break;
    }
  }
  return out;
}

/** Guard anti-PII defensivo: rechaza payloads que contengan patrones de PII. */
export function containsPiiPattern(payload: string): boolean {
  return (
    /@/.test(payload) || // emails
    /PB-DOC-[A-Za-z0-9_-]{8,}/.test(payload) || // referencia/token
    /whsec_[A-Za-z0-9]/.test(payload) || // secreto webhook
    /re_[A-Za-z0-9]{8,}/.test(payload) || // API key Resend
    /\.pdf|\.png|\.jpe?g/i.test(payload) // nombres de archivo
  );
}

/**
 * Emite un evento a PostHog (capture API pública). FAIL-OPEN: nunca lanza,
 * timeout 2 s, ausencia de clave = no-op (mismo contrato que el frontend).
 */
export async function emitEmailIntakeEvent(
  config: TelemetryConfig,
  event: EmailIntakeEvent,
  props: EmailIntakeTelemetryProps,
): Promise<void> {
  try {
    if (!config.posthogKey || !config.posthogHost) return;
    const properties: Record<string, unknown> = {
      ...sanitizeEventProps(event, props),
      environment: config.environment ?? 'production',
      app_version: config.appVersion ?? 'unknown',
    };
    const payload = JSON.stringify({
      api_key: config.posthogKey,
      event,
      // distinct_id sintético y constante por entorno: los eventos de pipeline
      // no pertenecen a una persona identificable (el usuario NUNCA se vincula).
      distinct_id: `document-email-pipeline-${config.environment ?? 'production'}`,
      properties,
    });
    if (containsPiiPattern(payload)) return; // defensa en profundidad: no emitir
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      await fetch(`${config.posthogHost.replace(/\/$/, '')}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // fail-open: la telemetría nunca rompe el pipeline documental.
  }
}
