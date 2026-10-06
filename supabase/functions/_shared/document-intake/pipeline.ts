/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: núcleo del pipeline de recepción
 * documental por correo. TODAS las dependencias externas (BD, proveedor,
 * storage, reloj, telemetría) se inyectan: el mismo código se prueba en Node
 * con fakes en memoria y se cablea a Supabase/Resend en las Edge Functions.
 *
 * Invariantes de seguridad (GO del PO):
 *   1. El token NUNCA se persiste en claro (solo sha256) ni aparece en logs/telemetría.
 *   2. Asociación SOLO por referencia válida; el remitente es señal, nunca prueba.
 *   3. Contenido bloqueado (ejecutable/activo) NUNCA se persiste: solo metadatos.
 *   4. Claves de cuarentena generadas por nosotros (uuid): path traversal imposible
 *      y el nombre original del archivo jamás se usa ni se almacena.
 *   5. Estado máximo automático: EXTRACTION_PENDING. AWAITING_USER_CONFIRMATION
 *      solo vía acción admin. APPROVED/PROMOTED prohibidos en TEST (guard explícito).
 *   6. CERO escritura canónica: este módulo no conoce app_worker_certifications
 *      ni app_14da0f1941_profiles (no existe adaptador para ellas).
 *   7. Telemetría fail-open y anti-PII (schema cerrado en telemetry.ts).
 *
 * Módulo PURO (sin Deno.*): Web Crypto + fetch inyectable.
 */

import { generateReferenceToken, sha256Hex, timingSafeEqual } from './tokens.ts';
import { verifySvixSignature } from './svix.ts';
import { extractReferenceToken } from './referenceParse.ts';
import { staticScan, mimeToCategory, type DetectedMime } from './mimeSniff.ts';
import {
  DOC_INTAKE_LIMITS,
  FORBIDDEN_TEST_STATUSES,
  MAX_AUTOMATIC_STATUS,
  sizeToBucket,
  type InboundErrorCategory,
  type MessageStatus,
  type ReferenceStatus,
} from './states.ts';
import { emitEmailIntakeEvent, type TelemetryConfig } from './telemetry.ts';

// ---------------------------------------------------------------------------
// Tipos de filas (forma persistida; ver migración sql/021)
// ---------------------------------------------------------------------------
export interface ReferenceRow {
  id: string;
  token_hash: string;
  user_id: string;
  document_type: 'certificate' | 'cv';
  status: ReferenceStatus;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
  correlation_id: string;
}

export interface MessageRow {
  id: string;
  provider: 'resend' | 'postmark' | 'cloudflare';
  provider_message_id: string;
  reference_id: string | null;
  status: MessageStatus;
  sender_match: 'match' | 'mismatch' | 'unknown';
  attachment_count: number;
  received_at: string;
  processed_at: string | null;
  error_category: InboundErrorCategory | null;
  retention_until: string;
  correlation_id: string;
}

export interface AttachmentRow {
  id: string;
  inbound_message_id: string;
  document_type: 'certificate' | 'cv' | null;
  quarantine_bucket: string;
  quarantine_object_key: string;
  detected_mime: string;
  declared_mime: string | null;
  size_bytes: number;
  sha256: string;
  malware_status: 'pending' | 'clean_static_checks' | 'suspicious' | 'rejected';
  extraction_status: 'pending' | 'completed' | 'low_confidence' | 'failed' | 'skipped';
  confidence: number | null;
  canonical_status: 'none' | 'promoted' | 'rejected';
}

// ---------------------------------------------------------------------------
// Dependencias inyectadas
// ---------------------------------------------------------------------------
export interface DbAdapter {
  countRecentReferences(userId: string, sinceIso: string): Promise<number>;
  insertReference(row: {
    token_hash: string;
    user_id: string;
    document_type: 'certificate' | 'cv';
    expires_at: string;
    correlation_id: string;
  }): Promise<{ id: string }>;
  findReferenceByHash(tokenHash: string): Promise<ReferenceRow | null>;
  getReference(id: string): Promise<ReferenceRow | null>;
  markReferenceConsumed(id: string, consumedAtIso: string): Promise<void>;
  /** Inserta el mensaje; devuelve conflict=true si ya existe (idempotencia). */
  insertMessage(row: {
    provider: MessageRow['provider'];
    provider_message_id: string;
    reference_id: string | null;
    status: MessageStatus;
    sender_match: MessageRow['sender_match'];
    attachment_count: number;
    error_category: InboundErrorCategory | null;
    retention_until: string;
    correlation_id: string;
  }): Promise<{ id: string; conflict: boolean }>;
  getMessage(id: string): Promise<MessageRow | null>;
  updateMessage(id: string, patch: Partial<Pick<MessageRow,
    'status' | 'processed_at' | 'error_category' | 'reference_id' | 'sender_match' | 'attachment_count'
  >>): Promise<void>;
  insertAttachment(row: Omit<AttachmentRow, 'id'>): Promise<{ id: string; conflict: boolean }>;
  listAttachments(messageId: string): Promise<AttachmentRow[]>;
  insertExtractionFields(rows: {
    attachment_id: string;
    field_name: string;
    status: 'draft';
    source: string;
  }[]): Promise<void>;
  /** Email del usuario propietario de la referencia (solo para la señal sender_match). */
  getUserEmail(userId: string): Promise<string | null>;
  listMessages(filter: { status?: MessageStatus; limit: number }): Promise<MessageRow[]>;
  updateExtractionField(id: string, patch: {
    corrected_value: string;
    status: 'corrected_admin' | 'rejected';
  }): Promise<void>;
}

export interface ProviderAttachmentMeta {
  id: string;
  size: number;
  contentType: string | null;
  downloadUrl: string;
}

export class ProviderUnavailableError extends Error {}
export class DownloadFailedError extends Error {}
export class OversizeAttachmentError extends Error {}

export interface ProviderAdapter {
  /** Metadatos de adjuntos del mensaje (Resend Attachments API). */
  listAttachments(providerMessageId: string): Promise<ProviderAttachmentMeta[]>;
  /** Descarga con límite duro de bytes. Lanza OversizeAttachmentError/DownloadFailedError. */
  download(downloadUrl: string, maxBytes: number): Promise<Uint8Array>;
}

export interface StorageAdapter {
  putQuarantine(objectKey: string, bytes: Uint8Array, mime: DetectedMime): Promise<void>;
  /** URL firmada de CORTA duración (<= 60 s) para revisión admin. */
  createSignedQuarantineUrl(objectKey: string, expiresSeconds: number): Promise<string>;
}

export interface PipelineDeps {
  db: DbAdapter;
  provider: ProviderAdapter;
  storage: StorageAdapter;
  telemetry: TelemetryConfig;
  now: () => Date;
  randomUuid: () => string;
  /** Encola el procesamiento asíncrono (prod: fetch al processor con secreto interno). */
  enqueueProcessing: (messageId: string) => void;
  webhookSecret: string;
  providerName: MessageRow['provider'];
  intakeAddress: string;
}

// ---------------------------------------------------------------------------
// Guard de estados prohibidos en TEST (defensa en profundidad)
// ---------------------------------------------------------------------------
export function assertStatusAllowedInTest(status: MessageStatus): void {
  if ((FORBIDDEN_TEST_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`forbidden_status_in_test_phase:${status}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Creación de referencia (document-email-reference)
// ---------------------------------------------------------------------------
export interface CreateReferenceResult {
  ok: boolean;
  httpStatus: number;
  body: Record<string, unknown>;
}

export async function createReference(
  deps: Pick<PipelineDeps, 'db' | 'telemetry' | 'now' | 'randomUuid' | 'intakeAddress'>,
  input: { userId: string; documentType: string },
): Promise<CreateReferenceResult> {
  if (input.documentType !== 'certificate' && input.documentType !== 'cv') {
    return { ok: false, httpStatus: 400, body: { error: 'invalid_document_type' } };
  }
  const now = deps.now();
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = await deps.db.countRecentReferences(input.userId, since);
  if (recent >= DOC_INTAKE_LIMITS.maxReferencesPerUserPerHour) {
    return { ok: false, httpStatus: 429, body: { error: 'rate_limited' } };
  }
  const token = generateReferenceToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(now.getTime() + DOC_INTAKE_LIMITS.referenceTtlHours * 3600_000).toISOString();
  const correlationId = deps.randomUuid();
  const { id } = await deps.db.insertReference({
    token_hash: tokenHash,
    user_id: input.userId,
    document_type: input.documentType,
    expires_at: expiresAt,
    correlation_id: correlationId,
  });
  const subject = `PB-DOC-${token} — ${input.documentType === 'cv' ? 'CV' : 'Certificado'}`;
  await emitEmailIntakeEvent(deps.telemetry, 'document_email_reference_created', {
    document_type: input.documentType,
    channel: 'email',
    correlation_id: correlationId,
  });
  return {
    ok: true,
    httpStatus: 200,
    body: {
      reference_id: id,
      address: deps.intakeAddress,
      subject,
      expires_at: expiresAt,
      correlation_id: correlationId,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Webhook entrante (document-email-inbound)
// ---------------------------------------------------------------------------
export interface WebhookResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

export async function handleInboundWebhook(
  deps: PipelineDeps,
  input: {
    headers: { id: string | null; timestamp: string | null; signature: string | null };
    rawBody: string;
  },
): Promise<WebhookResult> {
  const nowSeconds = Math.floor(deps.now().getTime() / 1000);
  const verify = await verifySvixSignature(input.headers, input.rawBody, deps.webhookSecret, nowSeconds);
  if (!verify.ok) {
    await emitEmailIntakeEvent(deps.telemetry, 'document_email_rejected', {
      channel: 'email',
      provider: deps.providerName,
      status: 'REJECTED',
      error_category: 'invalid_signature',
    });
    return { httpStatus: 401, body: { error: 'invalid_signature' } };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(input.rawBody) as Record<string, unknown>;
  } catch {
    return { httpStatus: 400, body: { error: 'invalid_payload' } };
  }
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const providerMessageId = typeof data.email_id === 'string' ? data.email_id : null;
  if (payload.type !== 'email.received' || !providerMessageId) {
    return { httpStatus: 400, body: { error: 'invalid_payload' } };
  }
  const attachmentsMeta = Array.isArray(data.attachments) ? data.attachments : [];
  const fromAddress = typeof data.from === 'string' ? data.from : null;

  // Idempotencia estructural: UNIQUE(provider, provider_message_id).
  const retentionUntil = new Date(
    deps.now().getTime() + DOC_INTAKE_LIMITS.messageRetentionDays * 86_400_000,
  ).toISOString();

  // Resolución de la referencia (token en asunto o plus-address).
  const token = extractReferenceToken({ subject: data.subject, to: data.to });
  let reference: ReferenceRow | null = null;
  let referenceError: InboundErrorCategory | null = null;
  if (token) {
    const tokenHash = await sha256Hex(token);
    const candidate = await deps.db.findReferenceByHash(tokenHash);
    if (!candidate) {
      referenceError = 'unknown_reference';
    } else if (candidate.status === 'REVOKED') {
      referenceError = 'revoked_reference';
    } else if (candidate.status === 'CONSUMED') {
      referenceError = 'consumed_reference';
    } else if (candidate.status === 'EXPIRED' || new Date(candidate.expires_at).getTime() < deps.now().getTime()) {
      referenceError = 'expired_reference';
    } else {
      reference = candidate;
    }
  }

  // Señal sender_match (NUNCA prueba de identidad).
  let senderMatch: MessageRow['sender_match'] = 'unknown';
  if (reference && fromAddress) {
    const ownerEmail = await deps.db.getUserEmail(reference.user_id);
    if (ownerEmail) {
      senderMatch = fromAddress.toLowerCase().includes(ownerEmail.toLowerCase()) ? 'match' : 'mismatch';
    }
  }

  const baseRow = {
    provider: deps.providerName,
    provider_message_id: providerMessageId,
    attachment_count: attachmentsMeta.length,
    retention_until: retentionUntil,
    correlation_id: reference?.correlation_id ?? deps.randomUuid(),
  };

  if (!token || referenceError) {
    // Sin referencia válida: NEEDS_REVIEW si no traía referencia; REJECTED si
    // traía una inválida. No se asocia a ningún usuario. Respuesta genérica.
    const status: MessageStatus = referenceError ? 'REJECTED' : 'NEEDS_REVIEW';
    const inserted = await deps.db.insertMessage({
      ...baseRow,
      reference_id: null,
      status,
      sender_match: 'unknown',
      error_category: referenceError,
    });
    if (inserted.conflict) return { httpStatus: 200, body: { status: 'duplicate' } };
    await emitEmailIntakeEvent(deps.telemetry, referenceError ? 'document_email_rejected' : 'document_email_received', {
      channel: 'email',
      provider: deps.providerName,
      status,
      error_category: referenceError ?? undefined,
      correlation_id: baseRow.correlation_id,
    });
    return { httpStatus: 200, body: { status: 'accepted' } };
  }

  const inserted = await deps.db.insertMessage({
    ...baseRow,
    reference_id: reference!.id,
    status: 'RECEIVED',
    sender_match: senderMatch,
    error_category: null,
  });
  if (inserted.conflict) return { httpStatus: 200, body: { status: 'duplicate' } };

  await emitEmailIntakeEvent(deps.telemetry, 'document_email_received', {
    document_type: reference!.document_type,
    channel: 'email',
    provider: deps.providerName,
    status: 'RECEIVED',
    correlation_id: baseRow.correlation_id,
  });
  // Respuesta rápida; el procesamiento pesado va fuera de la petición.
  deps.enqueueProcessing(inserted.id);
  return { httpStatus: 200, body: { status: 'received' } };
}

// ---------------------------------------------------------------------------
// 3. Procesador asíncrono (document-email-processor)
// ---------------------------------------------------------------------------
const EXTRACTION_FIELDS_BY_TYPE: Record<'certificate' | 'cv', string[]> = {
  certificate: ['certificate_name', 'issuing_org', 'issue_date', 'expiry_date', 'credential_number', 'language'],
  cv: ['specialties', 'work_experience', 'language'],
};

export async function processInboundMessage(
  deps: Omit<PipelineDeps, 'enqueueProcessing' | 'webhookSecret' | 'intakeAddress'>,
  messageId: string,
): Promise<void> {
  const message = await deps.db.getMessage(messageId);
  if (!message || message.status !== 'RECEIVED' || !message.reference_id) return;
  const ref = await deps.db.getReference(message.reference_id);
  const nowIso = deps.now().toISOString();

  const rejectMessage = async (category: InboundErrorCategory, status: MessageStatus = 'REJECTED') => {
    assertStatusAllowedInTest(status);
    await deps.db.updateMessage(messageId, { status, error_category: category, processed_at: nowIso });
    await deps.db.markReferenceConsumed(message.reference_id!, nowIso);
    await emitEmailIntakeEvent(deps.telemetry, 'document_email_rejected', {
      channel: 'email',
      provider: deps.providerName,
      status,
      error_category: category,
      correlation_id: message.correlation_id,
    });
  };

  // Re-validación de la referencia en el momento del procesamiento.
  if (!ref || ref.status !== 'REFERENCE_CREATED' || new Date(ref.expires_at).getTime() < deps.now().getTime()) {
    await rejectMessage(!ref ? 'unknown_reference' : ref.status !== 'REFERENCE_CREATED' ? 'consumed_reference' : 'expired_reference');
    return;
  }

  let attachmentsMeta: ProviderAttachmentMeta[];
  try {
    attachmentsMeta = await deps.provider.listAttachments(message.provider_message_id);
  } catch (err) {
    const category: InboundErrorCategory = err instanceof ProviderUnavailableError ? 'provider_unavailable' : 'download_failed';
    // Fallo recuperable: el mensaje queda FAILED y la referencia NO se consume
    // (el usuario puede reenviar el correo con la misma referencia).
    await deps.db.updateMessage(messageId, { status: 'FAILED', error_category: category });
    await emitEmailIntakeEvent(deps.telemetry, 'document_email_rejected', {
      channel: 'email',
      provider: deps.providerName,
      status: 'FAILED',
      error_category: category,
      correlation_id: message.correlation_id,
    });
    return;
  }

  if (attachmentsMeta.length === 0) {
    await rejectMessage('no_attachment');
    return;
  }
  if (attachmentsMeta.length > DOC_INTAKE_LIMITS.maxAttachmentsPerMessage) {
    await rejectMessage('too_many_attachments');
    return;
  }

  await deps.db.updateMessage(messageId, { status: 'SCANNING' });
  const scanStart = deps.now().getTime();
  const seenHashes = new Set<string>();
  let largestBytes = 0;
  let lastMimeCategory: 'pdf' | 'image' | 'document' | 'unknown' = 'unknown';
  let quarantinedCount = 0;

  for (const meta of attachmentsMeta) {
    // Límite declarado por el proveedor antes de descargar (defensa 1).
    if (meta.size > DOC_INTAKE_LIMITS.maxAttachmentBytes) {
      await rejectMessage('oversize');
      return;
    }
    let bytes: Uint8Array;
    try {
      bytes = await deps.provider.download(meta.downloadUrl, DOC_INTAKE_LIMITS.maxAttachmentBytes);
    } catch (err) {
      if (err instanceof OversizeAttachmentError) {
        await rejectMessage('oversize');
        return;
      }
      await deps.db.updateMessage(messageId, { status: 'FAILED', error_category: 'download_failed' });
      return;
    }
    largestBytes = Math.max(largestBytes, bytes.byteLength);
    const sha256 = await sha256Hex(bytes);
    const scan = staticScan(bytes, meta.contentType);
    if (scan.verdict === 'rejected') {
      // Contenido bloqueado: NUNCA se persiste; solo metadatos forenses.
      await deps.db.insertAttachment({
        inbound_message_id: messageId,
        document_type: ref.document_type,
        quarantine_bucket: 'document-quarantine',
        quarantine_object_key: '',
        detected_mime: scan.detectedMime ?? 'application/octet-stream',
        declared_mime: meta.contentType,
        size_bytes: bytes.byteLength,
        sha256,
        malware_status: 'rejected',
        extraction_status: 'skipped',
        confidence: null,
        canonical_status: 'none',
      });
      await rejectMessage(scan.blockReason ?? 'blocked_format');
      return;
    }
    // Dedupe por hash dentro del mismo mensaje.
    if (seenHashes.has(sha256)) continue;
    seenHashes.add(sha256);

    // Clave de cuarentena generada por nosotros: path traversal imposible y el
    // nombre original del archivo nunca se usa.
    const ext = scan.detectedMime === 'application/pdf' ? '.pdf' : scan.detectedMime === 'image/png' ? '.png' : '.jpg';
    const objectKey = `${messageId}/${deps.randomUuid()}${ext}`;
    const inserted = await deps.db.insertAttachment({
      inbound_message_id: messageId,
      document_type: ref.document_type,
      quarantine_bucket: 'document-quarantine',
      quarantine_object_key: objectKey,
      detected_mime: scan.detectedMime!,
      declared_mime: meta.contentType,
      size_bytes: bytes.byteLength,
      sha256,
      malware_status: scan.blockReason === 'mime_mismatch' ? 'suspicious' : 'clean_static_checks',
      extraction_status: 'pending',
      confidence: null,
      canonical_status: 'none',
    });
    if (inserted.conflict) {
      // Ya existía (re-drive tras un fallo parcial): nada nuevo que revisar.
      continue;
    }
    await deps.storage.putQuarantine(objectKey, bytes, scan.detectedMime);
    lastMimeCategory = mimeToCategory(scan.detectedMime);
    quarantinedCount++;
    // Borrador de extracción: campos estructurados vacíos (motor no
    // autorizado en TEST → 'pending'; NUNCA se inventan valores).
    await deps.db.insertExtractionFields(
      EXTRACTION_FIELDS_BY_TYPE[ref.document_type].map((field) => ({
        attachment_id: inserted.id,
        field_name: field,
        status: 'draft' as const,
        source: 'not_extracted_test_phase',
      })),
    );
  }

  if (quarantinedCount === 0) {
    // Todos duplicados por hash: nada nuevo que revisar.
    await rejectMessage('duplicate');
    return;
  }

  const scanDuration = deps.now().getTime() - scanStart;
  await emitEmailIntakeEvent(deps.telemetry, 'document_quarantined', {
    document_type: ref.document_type,
    channel: 'email',
    provider: deps.providerName,
    mime_category: lastMimeCategory,
    size_bucket: sizeToBucket(largestBytes),
    correlation_id: message.correlation_id,
  });
  await emitEmailIntakeEvent(deps.telemetry, 'document_scan_completed', {
    document_type: ref.document_type,
    channel: 'email',
    provider: deps.providerName,
    status: 'QUARANTINED',
    mime_category: lastMimeCategory,
    size_bucket: sizeToBucket(largestBytes),
    duration_ms: scanDuration,
    correlation_id: message.correlation_id,
  });

  // Estado máximo automático: EXTRACTION_PENDING.
  assertStatusAllowedInTest(MAX_AUTOMATIC_STATUS);
  await deps.db.updateMessage(messageId, { status: MAX_AUTOMATIC_STATUS, processed_at: nowIso });
  await deps.db.markReferenceConsumed(message.reference_id, nowIso);
  await emitEmailIntakeEvent(deps.telemetry, 'document_extraction_completed', {
    document_type: ref.document_type,
    channel: 'email',
    provider: deps.providerName,
    extraction_status: 'pending',
    confidence_bucket: 'none',
    duration_ms: scanDuration,
    correlation_id: message.correlation_id,
  });
}

// ---------------------------------------------------------------------------
// 4. Acciones administrativas (document-email-admin)
// ---------------------------------------------------------------------------
export type AdminAction =
  | { action: 'send_for_confirmation'; messageId: string }
  | { action: 'reject'; messageId: string }
  | { action: 'correct_extraction'; extractionFieldId: string; correctedValue: string }
  | { action: 'promote'; messageId: string };

export interface AdminActionResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

export async function runAdminAction(
  deps: Pick<PipelineDeps, 'db' | 'telemetry' | 'now'>,
  input: AdminAction,
): Promise<AdminActionResult> {
  // INVARIANTE: la promoción al perfil canónico está DESACTIVADA en esta fase.
  if (input.action === 'promote') {
    return { httpStatus: 403, body: { error: 'promotion_disabled_test_phase' } };
  }
  if (input.action === 'correct_extraction') {
    await deps.db.updateExtractionField(input.extractionFieldId, {
      corrected_value: input.correctedValue,
      status: 'corrected_admin',
    });
    return { httpStatus: 200, body: { status: 'corrected' } };
  }
  const message = await deps.db.getMessage(input.messageId);
  if (!message) return { httpStatus: 404, body: { error: 'not_found' } };

  if (input.action === 'reject') {
    if (message.status === 'PROMOTED' || message.status === 'APPROVED') {
      return { httpStatus: 409, body: { error: 'terminal_state' } };
    }
    await deps.db.updateMessage(input.messageId, {
      status: 'REJECTED',
      error_category: message.error_category ?? 'unknown',
      processed_at: deps.now().toISOString(),
    });
    await emitEmailIntakeEvent(deps.telemetry, 'document_email_rejected', {
      channel: 'email',
      provider: message.provider,
      status: 'REJECTED',
      error_category: message.error_category ?? 'unknown',
      correlation_id: message.correlation_id,
    });
    return { httpStatus: 200, body: { status: 'rejected' } };
  }

  // send_for_confirmation: solo desde EXTRACTION_PENDING (hay adjuntos en
  // cuarentena revisables). Estado máximo de la fase TEST.
  if (message.status !== 'EXTRACTION_PENDING') {
    return { httpStatus: 409, body: { error: 'invalid_state', current: message.status } };
  }
  assertStatusAllowedInTest('AWAITING_USER_CONFIRMATION');
  await deps.db.updateMessage(input.messageId, { status: 'AWAITING_USER_CONFIRMATION' });
  await emitEmailIntakeEvent(deps.telemetry, 'document_awaiting_confirmation', {
    channel: 'email',
    provider: message.provider,
    correlation_id: message.correlation_id,
  });
  return { httpStatus: 200, body: { status: 'awaiting_user_confirmation' } };
}

/** Comparación timing-safe para el secreto interno del processor. */
export function verifyInternalSecret(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}
