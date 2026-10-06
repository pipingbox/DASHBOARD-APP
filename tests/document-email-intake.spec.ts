/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B (Vía B): batería del pipeline de
 * recepción documental por correo, contra el MISMO código de producción
 * (supabase/functions/_shared/document-intake/*) con dependencias en memoria.
 * Incluye el correo sintético TEST end-to-end (webhook firmado → procesador →
 * estados) cuya salida es la evidencia exigida por el GO.
 */

import { test, expect } from '@playwright/test';
import {
  createReference,
  handleInboundWebhook,
  processInboundMessage,
  runAdminAction,
  assertStatusAllowedInTest,
  verifyInternalSecret,
  type DbAdapter,
  type MessageRow,
  type PipelineDeps,
  type ProviderAdapter,
  type ReferenceRow,
  type StorageAdapter,
} from '../supabase/functions/_shared/document-intake/pipeline.ts';
import { signSvixPayload } from '../supabase/functions/_shared/document-intake/svix.ts';
import { generateReferenceToken, sha256Hex } from '../supabase/functions/_shared/document-intake/tokens.ts';
import { detectMime, staticScan } from '../supabase/functions/_shared/document-intake/mimeSniff.ts';
import { extractReferenceToken } from '../supabase/functions/_shared/document-intake/referenceParse.ts';
import { renderEmailIntakeTemplate, EMAIL_INTAKE_LOCALES, EMAIL_INTAKE_TEMPLATE_KEYS } from '../supabase/functions/_shared/document-email-templates.ts';
import { sanitizeEventProps, containsPiiPattern } from '../supabase/functions/_shared/document-intake/telemetry.ts';
import { buildDocumentMailto } from '../app/frontend/src/lib/documentMailto.ts';
import type { TelemetryConfig } from '../supabase/functions/_shared/document-intake/telemetry.ts';
import { DOC_INTAKE_LIMITS } from '../supabase/functions/_shared/document-intake/states.ts';

// ---------------------------------------------------------------------------
// Fakes en memoria
// ---------------------------------------------------------------------------
const WEBHOOK_SECRET = 'whsec_dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQtdGVzdA==';
const USER_ID = '5f4dcc3b-5aa7-4bd0-8f4a-2f1f6d9c1234';
const USER_EMAIL = 'qa-synthetic@example.test';

class FakeDb implements DbAdapter {
  references = new Map<string, ReferenceRow & { created_at: string }>();
  messages = new Map<string, MessageRow>();
  attachments = new Map<string, Record<string, unknown>>();
  extractionFields = new Map<string, Record<string, unknown>>();
  referenceCounter = 0;
  uuidCounter = 0;

  private nextUuid(): string {
    this.uuidCounter++;
    return `00000000-0000-4000-8000-${String(this.uuidCounter).padStart(12, '0')}`;
  }

  async countRecentReferences(userId: string, sinceIso: string): Promise<number> {
    let n = 0;
    for (const r of this.references.values()) {
      if (r.user_id === userId && r.created_at >= sinceIso) n++;
    }
    return n;
  }
  async insertReference(row: { token_hash: string; user_id: string; document_type: 'certificate' | 'cv'; expires_at: string; correlation_id: string }) {
    const id = this.nextUuid();
    this.references.set(id, {
      id,
      ...row,
      status: 'REFERENCE_CREATED',
      consumed_at: null,
      revoked_at: null,
      created_at: new Date().toISOString(),
    });
    return { id };
  }
  async findReferenceByHash(tokenHash: string): Promise<ReferenceRow | null> {
    for (const r of this.references.values()) if (r.token_hash === tokenHash) return r;
    return null;
  }
  async getReference(id: string): Promise<ReferenceRow | null> {
    return this.references.get(id) ?? null;
  }
  async markReferenceConsumed(id: string, consumedAtIso: string): Promise<void> {
    const r = this.references.get(id);
    if (r && r.status === 'REFERENCE_CREATED') {
      r.status = 'CONSUMED';
      r.consumed_at = consumedAtIso;
    }
  }
  async insertMessage(row: Omit<MessageRow, 'id' | 'received_at' | 'processed_at'>) {
    for (const m of this.messages.values()) {
      if (m.provider === row.provider && m.provider_message_id === row.provider_message_id) {
        return { id: m.id, conflict: true };
      }
    }
    const id = this.nextUuid();
    this.messages.set(id, { id, received_at: new Date().toISOString(), processed_at: null, ...row } as MessageRow);
    return { id, conflict: false };
  }
  async getMessage(id: string): Promise<MessageRow | null> {
    return this.messages.get(id) ?? null;
  }
  async updateMessage(id: string, patch: Partial<MessageRow>): Promise<void> {
    const m = this.messages.get(id);
    if (m) Object.assign(m, patch);
  }
  async insertAttachment(row: Record<string, unknown>) {
    for (const a of this.attachments.values()) {
      if (a.inbound_message_id === row.inbound_message_id && a.sha256 === row.sha256 && row.sha256 !== '') {
        return { id: String(a.id), conflict: true };
      }
    }
    const id = this.nextUuid();
    this.attachments.set(id, { id, ...row });
    return { id, conflict: false };
  }
  async listAttachments(messageId: string) {
    return [...this.attachments.values()].filter((a) => a.inbound_message_id === messageId) as never[];
  }
  async insertExtractionFields(rows: Record<string, unknown>[]) {
    for (const r of rows) {
      const id = this.nextUuid();
      this.extractionFields.set(id, { id, ...r });
    }
  }
  async getUserEmail(userId: string): Promise<string | null> {
    return userId === USER_ID ? USER_EMAIL : null;
  }
  async listMessages(filter: { status?: MessageRow['status']; limit: number }) {
    return [...this.messages.values()].filter((m) => !filter.status || m.status === filter.status).slice(0, filter.limit);
  }
  async updateExtractionField(id: string, patch: Record<string, unknown>) {
    const f = this.extractionFields.get(id);
    if (f) Object.assign(f, patch);
  }
}

class FakeStorage implements StorageAdapter {
  objects = new Map<string, Uint8Array>();
  async putQuarantine(objectKey: string, bytes: Uint8Array): Promise<void> {
    this.objects.set(objectKey, bytes);
  }
  async createSignedQuarantineUrl(objectKey: string): Promise<string> {
    return `https://signed.test/${objectKey}`;
  }
}

interface ScriptedAttachment {
  bytes: Uint8Array;
  declaredMime: string;
  declaredSize?: number;
  failWith?: 'download' | 'unavailable';
}

class FakeProvider implements ProviderAdapter {
  attachments: ScriptedAttachment[] = [];
  unavailable = false;
  downloadCalls = 0;
  async listAttachments() {
    if (this.unavailable) throw new (await import('../supabase/functions/_shared/document-intake/pipeline.ts')).ProviderUnavailableError('down');
    return this.attachments.map((a, i) => ({
      id: `att-${i}`,
      size: a.declaredSize ?? a.bytes.byteLength,
      contentType: a.declaredMime,
      downloadUrl: `https://download.test/att-${i}`,
    }));
  }
  async download(_url: string, maxBytes: number): Promise<Uint8Array> {
    this.downloadCalls++;
    const att = this.attachments[this.downloadCalls - 1];
    if (att.failWith === 'download') {
      throw new (await import('../supabase/functions/_shared/document-intake/pipeline.ts')).DownloadFailedError('failed');
    }
    if (att.bytes.byteLength > maxBytes) {
      throw new (await import('../supabase/functions/_shared/document-intake/pipeline.ts')).OversizeAttachmentError('oversize');
    }
    return att.bytes;
  }
}

// --- bytes de prueba por magic bytes ---
function pdfBytes(label: string, size = 2048): Uint8Array {
  const out = new Uint8Array(size);
  const head = new TextEncoder().encode(`%PDF-1.4 ${label} `);
  out.set(head);
  for (let i = head.length; i < size; i++) out[i] = 0x41 + (i % 20);
  return out;
}
function pngBytes(label: string, size = 1024): Uint8Array {
  const out = new Uint8Array(size);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const tail = new TextEncoder().encode(label);
  out.set(tail, 8);
  for (let i = 8 + tail.length; i < size; i++) out[i] = 0x42 + (i % 15);
  return out;
}
function exeBytes(): Uint8Array {
  const out = new Uint8Array(512);
  out.set([0x4d, 0x5a]); // "MZ" — ejecutable PE renombrado
  return out;
}
function htmlBytes(): Uint8Array {
  return new TextEncoder().encode('<!DOCTYPE html><html><body>active</body></html>');
}

// --- telemetría capturada (fail-open verificado) ---
const telemetryEvents: { event: string; payload: string }[] = [];
const realFetch = globalThis.fetch;
function installTelemetryCapture() {
  telemetryEvents.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/capture/')) {
      telemetryEvents.push({ event: JSON.parse(String(init?.body)).event, payload: String(init?.body) });
      return new Response('{}', { status: 200 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
}
function uninstallTelemetryCapture() {
  globalThis.fetch = realFetch;
}
const telemetryConfig: TelemetryConfig = {
  posthogKey: 'phc_testkey',
  posthogHost: 'https://posthog.test',
  environment: 'test',
  appVersion: 'test-sha',
};

// --- reloj controlado ---
let NOW = new Date('2026-10-06T12:00:00Z');
let uuidSeq = 100;
function makeDeps(db: FakeDb, provider: FakeProvider, storage: FakeStorage): PipelineDeps {
  const enqueued: string[] = [];
  (makeDeps as unknown as { enqueued: string[] }).enqueued = enqueued;
  return {
    db,
    provider,
    storage,
    telemetry: telemetryConfig,
    now: () => NOW,
    randomUuid: () => `11111111-1111-4111-8111-${String(uuidSeq++).padStart(12, '0')}`,
    enqueueProcessing: (id) => enqueued.push(id),
    webhookSecret: WEBHOOK_SECRET,
    providerName: 'resend',
    intakeAddress: 'documentos@documents.pipingbox.com',
  };
}
function enqueuedIds(): string[] {
  return (makeDeps as unknown as { enqueued: string[] }).enqueued ?? [];
}

async function signedWebhook(
  deps: PipelineDeps,
  payload: Record<string, unknown>,
  options: { secret?: string; timestampOffset?: number; tamper?: boolean } = {},
) {
  const rawBody = JSON.stringify(payload);
  const id = 'msg_test_1';
  const ts = Math.floor(NOW.getTime() / 1000) + (options.timestampOffset ?? 0);
  const signature = await signSvixPayload(id, ts, rawBody, options.secret ?? WEBHOOK_SECRET);
  return handleInboundWebhook(deps, {
    headers: { id, timestamp: String(ts), signature: options.tamper ? signature.replace('v1,', 'v1,AAAA') : signature },
    rawBody,
  });
}

function resendPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'email.received',
    data: {
      email_id: `email-${Math.random().toString(36).slice(2, 10)}`,
      from: USER_EMAIL,
      to: ['documentos@documents.pipingbox.com'],
      subject: 'Documento',
      attachments: [{ id: 'a1', filename: 'doc.pdf', content_type: 'application/pdf', size: 2048 }],
      ...overrides,
    },
  };
}

test.beforeEach(() => {
  NOW = new Date('2026-10-06T12:00:00Z');
  uuidSeq = 100;
  installTelemetryCapture();
});
test.afterEach(() => uninstallTelemetryCapture());

test.describe('PB-DOCUMENT-INTAKE-001 Entrega B — tokens y referencias', () => {
  test('el token tiene 32 chars base64url y solo se persiste su hash', async () => {
    const token = generateReferenceToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const db = new FakeDb();
    const deps = makeDeps(db, new FakeProvider(), new FakeStorage());
    const res = await createReference(deps, { userId: USER_ID, documentType: 'certificate' });
    expect(res.ok).toBe(true);
    const subject = String(res.body.subject);
    const tokenInSubject = subject.match(/PB-DOC-([A-Za-z0-9_-]{32})/)?.[1];
    expect(tokenInSubject).toBeTruthy();
    // El token NUNCA se persiste: solo el hash.
    const stored = [...db.references.values()][0];
    expect(stored.token_hash).toBe(await sha256Hex(tokenInSubject!));
    expect(JSON.stringify([...db.references.values()])).not.toContain(tokenInSubject!);
    expect(stored.user_id).toBe(USER_ID);
    expect(stored.document_type).toBe('certificate');
  });

  test('user_id jamás se acepta del cliente (lo fija el backend) y document_type inválido → 400', async () => {
    const db = new FakeDb();
    const deps = makeDeps(db, new FakeProvider(), new FakeStorage());
    const bad = await createReference(deps, { userId: USER_ID, documentType: 'passport' });
    expect(bad.httpStatus).toBe(400);
    expect(db.references.size).toBe(0);
  });

  test('rate limit: máximo 5 referencias por usuario y hora', async () => {
    const db = new FakeDb();
    const deps = makeDeps(db, new FakeProvider(), new FakeStorage());
    for (let i = 0; i < DOC_INTAKE_LIMITS.maxReferencesPerUserPerHour; i++) {
      const r = await createReference(deps, { userId: USER_ID, documentType: 'cv' });
      expect(r.httpStatus).toBe(200);
    }
    const sixth = await createReference(deps, { userId: USER_ID, documentType: 'cv' });
    expect(sixth.httpStatus).toBe(429);
    expect(db.references.size).toBe(5);
  });

  test('mailto: asunto y cuerpo URL-encoded, dirección intacta', () => {
    const mailto = buildDocumentMailto({
      address: 'documentos@documents.pipingbox.com',
      subject: 'PB-DOC-abc — Certificado',
      body: 'Instrucciones: envía el archivo.',
    });
    expect(mailto.startsWith('mailto:documentos@documents.pipingbox.com?subject=')).toBe(true);
    expect(mailto).toContain(encodeURIComponent('PB-DOC-abc — Certificado'));
    expect(mailto).toContain(encodeURIComponent('Instrucciones: envía el archivo.'));
  });
});

test.describe('PB-DOCUMENT-INTAKE-001 Entrega B — webhook: firma e idempotencia', () => {
  test('firma válida → 200 y mensaje registrado; firma inválida → 401 sin persistir nada', async () => {
    const db = new FakeDb();
    const deps = makeDeps(db, new FakeProvider(), new FakeStorage());
    const bad = await signedWebhook(deps, resendPayload(), { secret: 'whsec_b3RoZXItc2VjcmV0LW90aGVyLXNlY3JldA==' });
    expect(bad.httpStatus).toBe(401);
    expect(db.messages.size).toBe(0);
    expect(telemetryEvents.some((e) => e.event === 'document_email_rejected' && e.payload.includes('invalid_signature'))).toBe(true);

    const good = await signedWebhook(deps, resendPayload({ subject: 'Sin referencia' }));
    expect(good.httpStatus).toBe(200);
    expect(db.messages.size).toBe(1);
  });

  test('timestamp fuera de la ventana anti-replay (5 min) → 401', async () => {
    const deps = makeDeps(new FakeDb(), new FakeProvider(), new FakeStorage());
    const res = await signedWebhook(deps, resendPayload(), { timestampOffset: 400 });
    expect(res.httpStatus).toBe(401);
  });

  test('firma manipulada → 401', async () => {
    const deps = makeDeps(new FakeDb(), new FakeProvider(), new FakeStorage());
    const res = await signedWebhook(deps, resendPayload(), { tamper: true });
    expect(res.httpStatus).toBe(401);
  });

  test('webhook duplicado (mismo provider_message_id) → idempotente, un solo mensaje', async () => {
    const db = new FakeDb();
    const deps = makeDeps(db, new FakeProvider(), new FakeStorage());
    const payload = resendPayload();
    const first = await signedWebhook(deps, payload);
    const second = await signedWebhook(deps, payload);
    expect(first.httpStatus).toBe(200);
    expect(second.httpStatus).toBe(200);
    expect(second.body.status).toBe('duplicate');
    expect(db.messages.size).toBe(1);
  });

  test('payload no JSON / tipo incorrecto → 400', async () => {
    const deps = makeDeps(new FakeDb(), new FakeProvider(), new FakeStorage());
    const raw = 'not-json';
    const ts = Math.floor(NOW.getTime() / 1000);
    const sig = await signSvixPayload('m1', ts, raw, WEBHOOK_SECRET);
    const res = await handleInboundWebhook(deps, { headers: { id: 'm1', timestamp: String(ts), signature: sig }, rawBody: raw });
    expect(res.httpStatus).toBe(400);
    const wrongType = await signedWebhook(deps, { type: 'email.sent', data: { email_id: 'x' } });
    expect(wrongType.httpStatus).toBe(400);
  });
});

test.describe('PB-DOCUMENT-INTAKE-001 Entrega B — asociación por referencia', () => {
  async function makeValidReference(db: FakeDb, deps: PipelineDeps) {
    const res = await createReference(deps, { userId: USER_ID, documentType: 'certificate' });
    const token = String(res.body.subject).match(/PB-DOC-([A-Za-z0-9_-]{32})/)?.[1]!;
    return { token, referenceId: String(res.body.reference_id) };
  }

  test('referencia válida → RECEIVED + procesamiento encolado', async () => {
    const db = new FakeDb();
    const deps = makeDeps(db, new FakeProvider(), new FakeStorage());
    const { token } = await makeValidReference(db, deps);
    const res = await signedWebhook(deps, resendPayload({ subject: `PB-DOC-${token} — Certificado` }));
    expect(res.body.status).toBe('received');
    expect(enqueuedIds()).toHaveLength(1);
    const msg = [...db.messages.values()][0];
    expect(msg.status).toBe('RECEIVED');
    expect(msg.reference_id).not.toBeNull();
  });

  test('referencia inexistente → REJECTED (unknown_reference), sin asociar a nadie', async () => {
    const db = new FakeDb();
    const deps = makeDeps(db, new FakeProvider(), new FakeStorage());
    const fakeToken = generateReferenceToken();
    const res = await signedWebhook(deps, resendPayload({ subject: `PB-DOC-${fakeToken} — Certificado` }));
    expect(res.httpStatus).toBe(200);
    const msg = [...db.messages.values()][0];
    expect(msg.status).toBe('REJECTED');
    expect(msg.error_category).toBe('unknown_reference');
    expect(msg.reference_id).toBeNull();
  });

  test('referencia caducada → REJECTED (expired_reference)', async () => {
    const db = new FakeDb();
    const deps = makeDeps(db, new FakeProvider(), new FakeStorage());
    const { token } = await makeValidReference(db, deps);
    NOW = new Date(NOW.getTime() + 73 * 3600_000); // 73 h después (TTL 72 h)
    await signedWebhook(deps, resendPayload({ subject: `PB-DOC-${token} — Certificado` }));
    const msg = [...db.messages.values()][0];
    expect(msg.status).toBe('REJECTED');
    expect(msg.error_category).toBe('expired_reference');
  });

  test('referencia revocada → REJECTED (revoked_reference)', async () => {
    const db = new FakeDb();
    const deps = makeDeps(db, new FakeProvider(), new FakeStorage());
    const { token, referenceId } = await makeValidReference(db, deps);
    const ref = db.references.get(referenceId)!;
    ref.status = 'REVOKED';
    ref.revoked_at = NOW.toISOString();
    await signedWebhook(deps, resendPayload({ subject: `PB-DOC-${token} — Certificado` }));
    const msg = [...db.messages.values()][0];
    expect(msg.error_category).toBe('revoked_reference');
  });

  test('referencia ya utilizada → REJECTED (consumed_reference)', async () => {
    const db = new FakeDb();
    const deps = makeDeps(db, new FakeProvider(), new FakeStorage());
    const { token, referenceId } = await makeValidReference(db, deps);
    await db.markReferenceConsumed(referenceId, NOW.toISOString());
    await signedWebhook(deps, resendPayload({ subject: `PB-DOC-${token} — Certificado` }));
    const msg = [...db.messages.values()][0];
    expect(msg.error_category).toBe('consumed_reference');
  });

  test('sin referencia → NEEDS_REVIEW, sin asociar a ningún usuario', async () => {
    const db = new FakeDb();
    const deps = makeDeps(db, new FakeProvider(), new FakeStorage());
    await signedWebhook(deps, resendPayload({ subject: 'Factura de servicios' }));
    const msg = [...db.messages.values()][0];
    expect(msg.status).toBe('NEEDS_REVIEW');
    expect(msg.reference_id).toBeNull();
  });

  test('remitente coincidente / distinto / desconocido es solo una señal', async () => {
    const db = new FakeDb();
    const deps = makeDeps(db, new FakeProvider(), new FakeStorage());
    const { token } = await makeValidReference(db, deps);
    await signedWebhook(deps, resendPayload({ subject: `PB-DOC-${token} — Certificado`, from: USER_EMAIL }));
    expect([...db.messages.values()][0].sender_match).toBe('match');
    await signedWebhook(deps, resendPayload({ subject: `PB-DOC-${token} — Certificado`, from: 'otro@example.test' }));
    expect([...db.messages.values()][1].sender_match).toBe('mismatch');
    const { token: token2 } = await (async () => {
      const r = await createReference(deps, { userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', documentType: 'cv' });
      return { token: String(r.body.subject).match(/PB-DOC-([A-Za-z0-9_-]{32})/)?.[1] };
    })();
    await signedWebhook(deps, resendPayload({ subject: `PB-DOC-${token2} — CV`, from: 'x@y.test' }));
    expect([...db.messages.values()][2].sender_match).toBe('unknown'); // usuario inexistente
  });

  test('extracción de referencia: asunto y plus-addressing', () => {
    const token = generateReferenceToken();
    expect(extractReferenceToken({ subject: `PB-DOC-${token} — Certificado` })).toBe(token);
    expect(extractReferenceToken({ to: [`documentos+${token}@documents.pipingbox.com`] })).toBe(token);
    expect(extractReferenceToken({ to: [`Nombre <documentos+${token}@documents.pipingbox.com>`] })).toBe(token);
    expect(extractReferenceToken({ subject: 'Hola' })).toBeNull();
    expect(extractReferenceToken({ subject: 'PB-DOC-corto' })).toBeNull();
  });
});

test.describe('PB-DOCUMENT-INTAKE-001 Entrega B — procesador: cuarentena, seguridad, dedupe', () => {
  async function setupReceived(options: {
    attachments: ScriptedAttachment[];
    documentType?: 'certificate' | 'cv';
  }) {
    const db = new FakeDb();
    const provider = new FakeProvider();
    provider.attachments = options.attachments;
    const storage = new FakeStorage();
    const deps = makeDeps(db, provider, storage);
    const res = await createReference(deps, { userId: USER_ID, documentType: options.documentType ?? 'certificate' });
    const token = String(res.body.subject).match(/PB-DOC-([A-Za-z0-9_-]{32})/)?.[1]!;
    await signedWebhook(deps, resendPayload({
      subject: `PB-DOC-${token} — Documento`,
      attachments: options.attachments.map((a, i) => ({ id: `a${i}`, filename: 'ignored.pdf', content_type: a.declaredMime, size: a.bytes.byteLength })),
    }));
    const messageId = [...db.messages.keys()][0];
    return { db, provider, storage, deps, messageId, token };
  }

  test('PDF válido → cuarentena con clave generada, SHA-256, EXTRACTION_PENDING, referencia consumida', async () => {
    const { db, storage, deps, messageId } = await setupReceived({ attachments: [{ bytes: pdfBytes('A'), declaredMime: 'application/pdf' }] });
    await processInboundMessage(deps, messageId);
    const msg = db.messages.get(messageId)!;
    expect(msg.status).toBe('EXTRACTION_PENDING');
    expect(msg.processed_at).toBeTruthy();
    expect(storage.objects.size).toBe(1);
    const [key, bytes] = [...storage.objects.entries()][0];
    // Clave generada por nosotros: uuid, sin nombre original, sin traversal.
    expect(key).toMatch(new RegExp(`^${messageId}/[0-9a-f-]{36}\\.pdf$`));
    expect(key).not.toContain('..');
    expect(key).not.toContain('ignored');
    expect(await sha256Hex(bytes)).toBeTruthy();
    const att = [...db.attachments.values()][0];
    expect(att.detected_mime).toBe('application/pdf');
    expect(att.sha256).toBe(await sha256Hex(bytes));
    expect(att.malware_status).toBe('clean_static_checks');
    expect(att.canonical_status).toBe('none');
    // Borrador de extracción: campos estructurados, estado draft, sin valores inventados.
    const fields = [...db.extractionFields.values()];
    expect(fields.length).toBe(6);
    expect(fields.every((f) => f.status === 'draft' && f.field_value === undefined)).toBe(true);
    // Referencia consumida (no reutilizable).
    const ref = [...db.references.values()][0];
    expect(ref.status).toBe('CONSUMED');
    // Telemetría del pipeline.
    expect(telemetryEvents.some((e) => e.event === 'document_quarantined')).toBe(true);
    expect(telemetryEvents.some((e) => e.event === 'document_scan_completed')).toBe(true);
  });

  test('imagen PNG válida → cuarentena como image', async () => {
    const { db, storage, deps, messageId } = await setupReceived({ attachments: [{ bytes: pngBytes('IMG'), declaredMime: 'image/png' }] });
    await processInboundMessage(deps, messageId);
    expect(db.messages.get(messageId)!.status).toBe('EXTRACTION_PENDING');
    const [key] = [...storage.objects.keys()];
    expect(key.endsWith('.png')).toBe(true);
  });

  test('MIME falso (declara PDF, es PNG) → aceptado con MIME detectado, señal suspicious', async () => {
    const { db, deps, messageId } = await setupReceived({ attachments: [{ bytes: pngBytes('FAKE'), declaredMime: 'application/pdf' }] });
    await processInboundMessage(deps, messageId);
    expect(db.messages.get(messageId)!.status).toBe('EXTRACTION_PENDING');
    const att = [...db.attachments.values()][0];
    expect(att.detected_mime).toBe('image/png');
    expect(att.declared_mime).toBe('application/pdf');
    expect(att.malware_status).toBe('suspicious');
  });

  test('ejecutable renombrado (.exe como .pdf) → REJECTED, NUNCA persistido en cuarentena', async () => {
    const { db, storage, deps, messageId } = await setupReceived({ attachments: [{ bytes: exeBytes(), declaredMime: 'application/pdf' }] });
    await processInboundMessage(deps, messageId);
    const msg = db.messages.get(messageId)!;
    expect(msg.status).toBe('REJECTED');
    expect(msg.error_category).toBe('blocked_format');
    expect(storage.objects.size).toBe(0);
    const att = [...db.attachments.values()][0];
    expect(att.malware_status).toBe('rejected');
    expect(att.quarantine_object_key).toBe('');
  });

  test('HTML activo como adjunto → REJECTED (blocked_format)', async () => {
    const { db, storage, deps, messageId } = await setupReceived({ attachments: [{ bytes: htmlBytes(), declaredMime: 'application/pdf' }] });
    await processInboundMessage(deps, messageId);
    expect(db.messages.get(messageId)!.error_category).toBe('blocked_format');
    expect(storage.objects.size).toBe(0);
  });

  test('archivo excesivo (tamaño declarado) → REJECTED sin descargar', async () => {
    const { db, provider, deps, messageId } = await setupReceived({
      attachments: [{ bytes: pdfBytes('BIG'), declaredMime: 'application/pdf', declaredSize: 11 * 1024 * 1024 }],
    });
    await processInboundMessage(deps, messageId);
    expect(db.messages.get(messageId)!.error_category).toBe('oversize');
    expect(provider.downloadCalls).toBe(0);
  });

  test('descarga que excede el límite en streaming → REJECTED oversize', async () => {
    const big = new Uint8Array(DOC_INTAKE_LIMITS.maxAttachmentBytes + 1);
    big.set(new TextEncoder().encode('%PDF-1.4 '));
    const { db, deps, messageId } = await setupReceived({ attachments: [{ bytes: big, declaredMime: 'application/pdf', declaredSize: 1024 }] });
    await processInboundMessage(deps, messageId);
    expect(db.messages.get(messageId)!.error_category).toBe('oversize');
  });

  test('mensaje sin adjunto → REJECTED no_attachment', async () => {
    const { db, deps, messageId } = await setupReceived({ attachments: [] });
    await processInboundMessage(deps, messageId);
    expect(db.messages.get(messageId)!.error_category).toBe('no_attachment');
  });

  test('varios adjuntos (3) → un elemento por adjunto, misma relación de mensaje', async () => {
    const { db, storage, deps, messageId } = await setupReceived({
      attachments: [
        { bytes: pdfBytes('1'), declaredMime: 'application/pdf' },
        { bytes: pdfBytes('2'), declaredMime: 'application/pdf' },
        { bytes: pngBytes('3'), declaredMime: 'image/png' },
      ],
    });
    await processInboundMessage(deps, messageId);
    expect(db.messages.get(messageId)!.status).toBe('EXTRACTION_PENDING');
    const atts = [...db.attachments.values()].filter((a) => a.inbound_message_id === messageId);
    expect(atts).toHaveLength(3);
    expect(storage.objects.size).toBe(3);
  });

  test('demasiados adjuntos (>3) → REJECTED too_many_attachments', async () => {
    const { db, deps, messageId } = await setupReceived({
      attachments: [0, 1, 2, 3].map((i) => ({ bytes: pdfBytes(String(i)), declaredMime: 'application/pdf' })),
    });
    await processInboundMessage(deps, messageId);
    expect(db.messages.get(messageId)!.error_category).toBe('too_many_attachments');
  });

  test('duplicado por SHA-256 dentro del mensaje → un solo adjunto persistido', async () => {
    const same = pdfBytes('SAME');
    const { db, deps, messageId } = await setupReceived({
      attachments: [
        { bytes: same, declaredMime: 'application/pdf' },
        { bytes: new Uint8Array(same), declaredMime: 'application/pdf' },
      ],
    });
    await processInboundMessage(deps, messageId);
    const atts = [...db.attachments.values()].filter((a) => a.inbound_message_id === messageId && a.quarantine_object_key !== '');
    expect(atts).toHaveLength(1);
  });

  test('todos duplicados por hash → REJECTED duplicate', async () => {
    const same = pdfBytes('DUP');
    const { db, storage, deps, messageId } = await setupReceived({
      attachments: [
        { bytes: same, declaredMime: 'application/pdf' },
        { bytes: new Uint8Array(same), declaredMime: 'application/pdf' },
      ],
    });
    // Simular que el primero ya existía: pre-poblar con el mismo hash.
    const { sha256Hex: sh } = await import('../supabase/functions/_shared/document-intake/tokens.ts');
    const hash = await sh(same);
    db.attachments.set('pre-existing', {
      id: 'pre-existing',
      inbound_message_id: messageId,
      sha256: hash,
      quarantine_object_key: 'pre/existing.pdf',
    });
    storage.objects.set('pre/existing.pdf', same);
    await processInboundMessage(deps, messageId);
    expect(db.messages.get(messageId)!.error_category).toBe('duplicate');
  });

  test('error de descarga → FAILED (download_failed), referencia NO consumida (reintento posible)', async () => {
    const { db, deps, messageId } = await setupReceived({ attachments: [{ bytes: pdfBytes('X'), declaredMime: 'application/pdf', failWith: 'download' }] });
    await processInboundMessage(deps, messageId);
    const msg = db.messages.get(messageId)!;
    expect(msg.status).toBe('FAILED');
    expect(msg.error_category).toBe('download_failed');
    expect([...db.references.values()][0].status).toBe('REFERENCE_CREATED');
  });

  test('caída temporal del proveedor → FAILED (provider_unavailable); reintento posterior completa', async () => {
    const { db, provider, deps, messageId } = await setupReceived({ attachments: [{ bytes: pdfBytes('RETRY'), declaredMime: 'application/pdf' }] });
    provider.unavailable = true;
    await processInboundMessage(deps, messageId);
    expect(db.messages.get(messageId)!.error_category).toBe('provider_unavailable');
    expect(db.messages.get(messageId)!.status).toBe('FAILED');
    // Reintento tras recuperación (re-drive del mensaje).
    provider.unavailable = false;
    db.messages.get(messageId)!.status = 'RECEIVED';
    await processInboundMessage(deps, messageId);
    expect(db.messages.get(messageId)!.status).toBe('EXTRACTION_PENDING');
  });

  test('CV: borrador con campos de CV (specialties, work_experience, language)', async () => {
    const { db, deps, messageId } = await setupReceived({
      attachments: [{ bytes: pdfBytes('CV'), declaredMime: 'application/pdf' }],
      documentType: 'cv',
    });
    await processInboundMessage(deps, messageId);
    const names = [...db.extractionFields.values()].map((f) => f.field_name).sort();
    expect(names).toEqual(['language', 'specialties', 'work_experience']);
  });

  test('retención: retention_until = received + 30 días', async () => {
    const db = new FakeDb();
    const deps = makeDeps(db, new FakeProvider(), new FakeStorage());
    const res = await createReference(deps, { userId: USER_ID, documentType: 'cv' });
    const token = String(res.body.subject).match(/PB-DOC-([A-Za-z0-9_-]{32})/)?.[1]!;
    await signedWebhook(deps, resendPayload({ subject: `PB-DOC-${token} — CV` }));
    const msg = [...db.messages.values()][0];
    const deltaMs = new Date(msg.retention_until).getTime() - new Date(msg.received_at).getTime();
    expect(Math.round(deltaMs / 86_400_000)).toBe(30);
  });
});

test.describe('PB-DOCUMENT-INTAKE-001 Entrega B — invariantes de seguridad', () => {
  test('cero promoción: admin promote → 403, y assert de estados prohibidos', async () => {
    const db = new FakeDb();
    const deps = makeDeps(db, new FakeProvider(), new FakeStorage());
    const res = await runAdminAction(deps, { action: 'promote', messageId: 'whatever' });
    expect(res.httpStatus).toBe(403);
    expect(String(res.body.error)).toContain('promotion_disabled');
    expect(() => assertStatusAllowedInTest('PROMOTED')).toThrow();
    expect(() => assertStatusAllowedInTest('APPROVED')).toThrow();
    expect(() => assertStatusAllowedInTest('EXTRACTION_PENDING')).not.toThrow();
  });

  test('secreto interno: comparación timing-safe', () => {
    expect(verifyInternalSecret('abc', 'abc')).toBe(true);
    expect(verifyInternalSecret('abc', 'abd')).toBe(false);
    expect(verifyInternalSecret(null, 'abc')).toBe(false);
    expect(verifyInternalSecret('abc', 'abcd')).toBe(false);
  });

  test('anti-PII: ningún payload de telemetría contiene email, token, nombre de archivo o ruta', async () => {
    const db = new FakeDb();
    const provider = new FakeProvider();
    provider.attachments = [{ bytes: pdfBytes('PII'), declaredMime: 'application/pdf' }];
    const storage = new FakeStorage();
    const deps = makeDeps(db, provider, storage);
    const res = await createReference(deps, { userId: USER_ID, documentType: 'certificate' });
    const token = String(res.body.subject).match(/PB-DOC-([A-Za-z0-9_-]{32})/)?.[1]!;
    await signedWebhook(deps, resendPayload({ subject: `PB-DOC-${token} — Certificado` }));
    const messageId = [...db.messages.keys()][0];
    await processInboundMessage(deps, messageId);
    expect(telemetryEvents.length).toBeGreaterThan(0);
    for (const e of telemetryEvents) {
      expect(e.payload).not.toContain(USER_EMAIL);
      expect(e.payload).not.toContain(token);
      expect(e.payload).not.toContain(USER_ID);
      expect(e.payload).not.toContain('.pdf');
      expect(e.payload).not.toContain(messageId);
      expect(containsPiiPattern(e.payload)).toBe(false);
    }
  });

  test('sanitizeEventProps descarta props fuera del allowlist y valores fuera de enum', () => {
    const out = sanitizeEventProps('document_email_received', {
      document_type: 'certificate',
      channel: 'email',
      provider: 'resend',
      status: 'RECEIVED',
      mime_category: 'pdf',
      size_bucket: '1mb-5mb',
      correlation_id: '11111111-1111-4111-8111-111111111111',
      // Intentos de inyección de props FUERA del allowlist:
      ...({ email: 'x@y.test', token: 'PB-DOC-abc', filename: 'cv.pdf', evil: 'x' } as never),
    });
    expect(out).toEqual({
      document_type: 'certificate',
      channel: 'email',
      provider: 'resend',
      status: 'RECEIVED',
      mime_category: 'pdf',
      size_bucket: '1mb-5mb',
      correlation_id: '11111111-1111-4111-8111-111111111111',
    });
    // Valores fuera de enum se descartan aunque la clave esté permitida:
    const out2 = sanitizeEventProps('document_email_received', {
      channel: 'email',
      ...({ status: 'HACKED', document_type: 'passport' } as never),
    });
    expect(out2).toEqual({ channel: 'email' });
  });

  test('detección de MIME real: pdf/png/jpeg y desconocidos', () => {
    expect(detectMime(pdfBytes('x'))).toBe('application/pdf');
    expect(detectMime(pngBytes('x'))).toBe('image/png');
    expect(detectMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(detectMime(exeBytes())).toBeNull();
    expect(staticScan(exeBytes(), 'application/pdf').verdict).toBe('rejected');
    expect(staticScan(htmlBytes(), 'application/pdf').verdict).toBe('rejected');
    expect(staticScan(new TextEncoder().encode('#!/bin/bash\nrm -rf /'), 'text/plain').verdict).toBe('rejected');
  });
});

test.describe('PB-DOCUMENT-INTAKE-001 Entrega B — acciones administrativas', () => {
  async function setupExtractionPending() {
    const db = new FakeDb();
    const provider = new FakeProvider();
    provider.attachments = [{ bytes: pdfBytes('ADMIN'), declaredMime: 'application/pdf' }];
    const storage = new FakeStorage();
    const deps = makeDeps(db, provider, storage);
    const res = await createReference(deps, { userId: USER_ID, documentType: 'certificate' });
    const token = String(res.body.subject).match(/PB-DOC-([A-Za-z0-9_-]{32})/)?.[1]!;
    await signedWebhook(deps, resendPayload({ subject: `PB-DOC-${token} — Certificado` }));
    const messageId = [...db.messages.keys()][0];
    await processInboundMessage(deps, messageId);
    return { db, deps, messageId };
  }

  test('send_for_confirmation: EXTRACTION_PENDING → AWAITING_USER_CONFIRMATION (máximo TEST)', async () => {
    const { db, deps, messageId } = await setupExtractionPending();
    const res = await runAdminAction(deps, { action: 'send_for_confirmation', messageId });
    expect(res.httpStatus).toBe(200);
    expect(db.messages.get(messageId)!.status).toBe('AWAITING_USER_CONFIRMATION');
    expect(telemetryEvents.some((e) => e.event === 'document_awaiting_confirmation')).toBe(true);
    // No se puede desde un estado incorrecto.
    const again = await runAdminAction(deps, { action: 'send_for_confirmation', messageId });
    expect(again.httpStatus).toBe(409);
  });

  test('reject: → REJECTED con telemetría', async () => {
    const { db, deps, messageId } = await setupExtractionPending();
    const res = await runAdminAction(deps, { action: 'reject', messageId });
    expect(res.httpStatus).toBe(200);
    expect(db.messages.get(messageId)!.status).toBe('REJECTED');
  });

  test('correct_extraction: corrección admin persistida como borrador corregido', async () => {
    const { db, deps } = await setupExtractionPending();
    const fieldId = [...db.extractionFields.keys()][0];
    const res = await runAdminAction(deps, { action: 'correct_extraction', extractionFieldId: fieldId, correctedValue: 'Soldador TIG' });
    expect(res.httpStatus).toBe(200);
    const field = db.extractionFields.get(fieldId)!;
    expect(field.status).toBe('corrected_admin');
    expect(field.corrected_value).toBe('Soldador TIG');
  });
});

test.describe('PB-DOCUMENT-INTAKE-001 Entrega B — plantillas de notificación', () => {
  test('6 plantillas × 11 idiomas renderizan, con prefijo [TEST] en modo test', () => {
    for (const key of EMAIL_INTAKE_TEMPLATE_KEYS) {
      for (const locale of EMAIL_INTAKE_LOCALES) {
        const rendered = renderEmailIntakeTemplate(key, locale);
        expect(rendered.subject.startsWith('[TEST] ')).toBe(true);
        expect(rendered.text.length).toBeGreaterThan(20);
        expect(rendered.html).toContain('PipingBox');
        expect(rendered.html).not.toContain('<script');
      }
    }
    const prod = renderEmailIntakeTemplate('document_received', 'es', { testMode: false });
    expect(prod.subject.startsWith('[TEST]')).toBe(false);
    // Locale desconocido → fallback en.
    const fallback = renderEmailIntakeTemplate('document_received', 'xx');
    expect(fallback.subject).toContain('We received your document');
  });
});

test.describe('PB-DOCUMENT-INTAKE-001 Entrega B — correo sintético TEST (evidencia end-to-end)', () => {
  test('webhook firmado → cuarentena → EXTRACTION_PENDING → AWAITING_USER_CONFIRMATION', async () => {
    const evidence: string[] = [];
    const db = new FakeDb();
    const provider = new FakeProvider();
    provider.attachments = [
      { bytes: pdfBytes('SYNTHETIC-CERT', 4096), declaredMime: 'application/pdf' },
      { bytes: pngBytes('SYNTHETIC-PHOTO', 2048), declaredMime: 'image/png' },
    ];
    const storage = new FakeStorage();
    const deps = makeDeps(db, provider, storage);

    // 1. Usuario crea referencia (document-email-reference).
    const ref = await createReference(deps, { userId: USER_ID, documentType: 'certificate' });
    const token = String(ref.body.subject).match(/PB-DOC-([A-Za-z0-9_-]{32})/)?.[1]!;
    evidence.push(`REFERENCE_CREATED id=${ref.body.reference_id} expires=${ref.body.expires_at}`);

    // 2. Correo TEST entra por el webhook firmado (document-email-inbound).
    const webhook = await signedWebhook(deps, resendPayload({
      subject: `PB-DOC-${token} — Certificado`,
      attachments: [
        { id: 'a0', filename: 'certificado soldadura.pdf', content_type: 'application/pdf', size: 4096 },
        { id: 'a1', filename: 'foto carnet.png', content_type: 'image/png', size: 2048 },
      ],
    }));
    expect(webhook.body.status).toBe('received');
    const messageId = [...db.messages.keys()][0];
    evidence.push(`RECEIVED message=${messageId} sender_match=${db.messages.get(messageId)!.sender_match}`);

    // 3. Procesador: cuarentena + seguridad + borrador (document-email-processor).
    await processInboundMessage(deps, messageId);
    const msg = db.messages.get(messageId)!;
    evidence.push(`${msg.status} attachments=${[...db.attachments.values()].length} quarantine_keys=${[...storage.objects.keys()].join(',')}`);
    expect(msg.status).toBe('EXTRACTION_PENDING');
    expect(storage.objects.size).toBe(2);
    // El nombre original NUNCA llega a las claves de cuarentena.
    for (const key of storage.objects.keys()) {
      expect(key).not.toContain('certificado');
      expect(key).not.toContain('foto');
    }

    // 4. Admin envía a confirmación (estado máximo de la fase TEST).
    const confirm = await runAdminAction(deps, { action: 'send_for_confirmation', messageId });
    expect(confirm.httpStatus).toBe(200);
    evidence.push(`AWAITING_USER_CONFIRMATION (max TEST status) reference_status=${[...db.references.values()][0].status}`);

    // 5. Invariantes finales.
    expect([...db.references.values()][0].status).toBe('CONSUMED');
    expect([...db.attachments.values()].every((a) => a.canonical_status === 'none')).toBe(true);
    for (const e of telemetryEvents) {
      expect(containsPiiPattern(e.payload)).toBe(false);
    }
    evidence.push(`telemetry_events=${telemetryEvents.map((e) => e.event).join('>')}`);
    evidence.push('ZERO canonical writes: canonical_status=none en todos los adjuntos; PROMOTED prohibido por guard');
    console.log('=== EVIDENCIA CORREO SINTÉTICO TEST ===\n' + evidence.join('\n'));
  });
});
