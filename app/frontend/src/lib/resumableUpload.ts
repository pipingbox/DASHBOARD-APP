/**
 * PB-DOCUMENT-INTAKE-001 — Vía A: shared resumable (TUS) document uploader.
 *
 * Replaces the monolithic XHR transport for certificates and CV with a
 * Supabase TUS resumable upload (https://supabase.com/docs/guides/storage/
 * uploads/resumable-uploads), behind one reusable abstraction designed for
 * future document types (onboarding documents, work documents, ...).
 *
 * Incident context (Aldo, 2026-10-06, build 53ac740): the browser entered
 * the uploading state but never began transferring bytes — no request ever
 * reached Storage, no timeout existed below the XHR layer, and the UI stayed
 * at 0% indefinitely. The physical cause of the File/Blob stall is bounded
 * to the browser side only; it is NOT claimed as demonstrated here.
 *
 * What this module guarantees:
 * - Explicit state machine: IDLE → FILE_SELECTED → PREPARING → UPLOADING →
 *   (PAUSED | RETRYING)* → VERIFYING → SAVED | FAILED | CANCELLED.
 * - "Preparando el archivo…" while 0 bytes have left the browser; a
 *   `no_bytes_started` recoverable failure after 15 s without a single byte.
 * - Cumulative elapsed time that NEVER resets across internal retries or
 *   pauses; slow-connection hint only after 30 s of real accumulated time.
 * - Resume: findPreviousUploads()/resumeFromPreviousUpload() for the same
 *   bucket+objectName, so every retry of the same file selection continues
 *   from the previous offset instead of restarting the whole upload.
 * - The progress percent is capped at 99 until TUS confirms completion;
 *   100% is only shown after the transport (and the verification HEAD)
 *   succeeded. `confirmSaved()` flips the machine to SAVED only after the
 *   caller has confirmed the canonical database write.
 * - Closed-telemetry emission (document_upload_*) with zero PII: no file
 *   name, email, UID, storage path, URL or token ever leaves the app.
 * - Fail-open observability: telemetry problems never break an upload.
 *
 * Credentials: ONLY the public Supabase anon key plus the user's session
 * access token (server-side validated). Never service_role. Paths stay
 * owner-scoped (`${uid}/…`) and existing RLS storage policies are untouched.
 */

import { Upload as TusUpload } from 'tus-js-client';
import type { UploadOptions } from 'tus-js-client';
import { trackEvent, getCorrelationId, mimeToCategory, sizeToBucket } from './observability';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DocumentUploadState =
  | 'IDLE'
  | 'FILE_SELECTED'
  | 'PREPARING'
  | 'UPLOADING'
  | 'PAUSED'
  | 'RETRYING'
  | 'VERIFYING'
  | 'SAVED'
  | 'FAILED'
  | 'CANCELLED';

export type DocumentUploadErrorCategory =
  | 'file_read'
  | 'no_bytes_started'
  | 'network'
  | 'timeout'
  | 'auth'
  | 'storage_4xx'
  | 'storage_5xx'
  | 'database'
  | 'cancelled'
  | 'unknown';

export type DocumentType = 'certificate' | 'cv';

/** i18n-agnostic failure reason; components map this to localized copy. */
export type DocumentUploadFailureReason =
  | 'noBytesStarted'
  | 'timedOut'
  | 'network'
  | 'authExpired'
  | 'storage'
  | 'verifyFailed'
  | 'cancelled'
  | 'database'
  | 'unknown';

export interface DocumentUploadProgress {
  state: DocumentUploadState;
  /** 0–99 while in flight; 100 only after TUS + verification confirm. */
  percent: number;
  bytesUploaded: number;
  bytesTotal: number;
  /** Cumulative wall clock since start — never reset by retries/pauses. */
  elapsedMs: number;
  /** True once ≥30 s accumulated and the upload is still in flight. */
  slowConnection: boolean;
  /** Browser has not produced the first byte yet ("Preparando el archivo…"). */
  preparingFile: boolean;
  attemptNumber: number;
  resumed: boolean;
}

export interface DocumentUploadSuccess {
  ok: true;
  bucket: string;
  path: string;
  durationMs: number;
  attemptNumber: number;
  resumed: boolean;
}

export interface DocumentUploadFailure {
  ok: false;
  category: DocumentUploadErrorCategory;
  reason: DocumentUploadFailureReason;
  durationMs: number;
  attemptNumber: number;
  resumed: boolean;
}

export type DocumentUploadResult = DocumentUploadSuccess | DocumentUploadFailure;

export interface DocumentUploadController {
  /** Resolves when the transport finishes (verified) or fails. */
  promise: Promise<DocumentUploadResult>;
  /** User-initiated pause: aborts the in-flight request, keeps the offset. */
  pause(): void;
  /** Continues a paused upload from the last confirmed offset. */
  resume(): void;
  /** User-initiated cancellation: terminates the partial upload. */
  cancel(): void;
  /** Call after the canonical DB write succeeds → SAVED (+ completed event). */
  confirmSaved(): void;
  /** Call if the canonical DB write fails → FAILED (database). */
  failCanonical(): void;
}

export interface ResumableUploadConfig {
  documentType: DocumentType;
  /** Logical bucket id (e.g. STORAGE_BUCKETS.certificates). */
  bucket: string;
  /** Owner-scoped object path. MUST be stable across retries of the same
   *  file selection so TUS can resume from the previous offset. */
  path: string;
  /** Resolved, validated MIME type (resolveFileMime). */
  contentType: string;
  route: string;
  cacheControl?: string;
  onProgress?: (p: DocumentUploadProgress) => void;
  onStateChange?: (s: DocumentUploadState) => void;
  /** Test seams. Production defaults use the real TUS client + session. */
  deps?: ResumableUploadDeps;
  /** Watchdog tuning (tests). Production defaults: 15 s / 60 s / 600 s. */
  noBytesTimeoutMs?: number;
  stallTimeoutMs?: number;
  totalTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Dependency injection (keeps the module importable by unit tests without
// Supabase env vars; see tests/resumable-upload.spec.ts)
// ---------------------------------------------------------------------------

export interface TusPreviousUpload {
  metadata?: Record<string, string | undefined>;
}

export interface TusLikeUpload {
  findPreviousUploads(): Promise<TusPreviousUpload[]>;
  resumeFromPreviousUpload(previousUpload: TusPreviousUpload): void;
  start(): void;
  abort(shouldTerminate?: boolean): Promise<unknown> | unknown;
}

export type TusUploadFactory = (file: File, options: UploadOptions) => TusLikeUpload;

export interface ResumableUploadDeps {
  createUpload?: TusUploadFactory;
  getSession?: () => Promise<{ accessToken: string | null }>;
  /** Endpoint + public anon key (server-validated; never service_role). */
  getUploadContext?: () => Promise<{ endpoint: string; anonKey: string }>;
  verifyObject?: (bucket: string, path: string, accessToken: string) => Promise<'ok' | 'missing' | 'unknown'>;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
  now?: () => number;
}

/** Storage-domain TUS endpoint (docs: use the direct storage hostname). */
export function storageTusEndpoint(supabaseUrl: string): string {
  return `${supabaseUrl.replace('.supabase.co', '.storage.supabase.co')}/storage/v1/upload/resumable`;
}

const defaultGetSession = async (): Promise<{ accessToken: string | null }> => {
  const { supabase } = await import('./supabase');
  const { data } = await supabase.auth.getSession();
  return { accessToken: data?.session?.access_token ?? null };
};

const defaultGetUploadContext = async (): Promise<{ endpoint: string; anonKey: string }> => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('./supabase');
  return { endpoint: storageTusEndpoint(SUPABASE_URL), anonKey: SUPABASE_ANON_KEY };
};

const defaultVerifyObject = async (
  bucket: string,
  path: string,
  accessToken: string,
): Promise<'ok' | 'missing' | 'unknown'> => {
  try {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('./supabase');
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${encoded}`,
      {
        method: 'HEAD',
        headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY },
      },
    );
    if (res.ok) return 'ok';
    if (res.status === 404 || res.status === 410) return 'missing';
    return 'unknown';
  } catch {
    return 'unknown';
  }
};

// ---------------------------------------------------------------------------
// Telemetry (fail-open by construction: trackEvent never throws)
// ---------------------------------------------------------------------------

function emitBase(
  config: ResumableUploadConfig,
  contentType: string,
  fileSize: number,
): Record<string, unknown> {
  return {
    route: config.route,
    correlation_id: getCorrelationId(),
    document_type: config.documentType,
    channel: 'direct' as const,
    transport: 'tus' as const,
    mime_category: mimeToCategory(contentType),
    size_bucket: sizeToBucket(fileSize),
  };
}

// ---------------------------------------------------------------------------
// UI helpers shared by document upload consumers
// ---------------------------------------------------------------------------

/** i18n keys for recoverable failure messages (no PII possible by design). */
export const UPLOAD_FAILURE_I18N: Record<DocumentUploadFailureReason, string> = {
  noBytesStarted: 'common.upload.noBytesStarted',
  timedOut: 'common.upload.timedOut',
  network: 'common.upload.networkError',
  authExpired: 'common.upload.authExpired',
  storage: 'common.upload.storageError',
  verifyFailed: 'common.upload.verifyFailed',
  cancelled: 'common.upload.cancelled',
  database: 'common.upload.databaseError',
  unknown: 'common.upload.failed',
};

/** Human-readable byte counter for the progress line. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

interface TusErrorLike {
  message?: string;
  originalResponse?: { getStatus?: () => number; status?: number } | null;
  originalRequest?: unknown;
  causingError?: { name?: string; message?: string } | null;
}

function tusStatus(err: TusErrorLike): number {
  const r = err?.originalResponse;
  if (!r) return 0;
  if (typeof r.getStatus === 'function') {
    try {
      return r.getStatus();
    } catch {
      /* fall through */
    }
  }
  return typeof r.status === 'number' ? r.status : 0;
}

function classifyTusError(err: TusErrorLike): {
  category: DocumentUploadErrorCategory;
  reason: DocumentUploadFailureReason;
} {
  const status = tusStatus(err);
  const msg = `${err?.message ?? ''} ${err?.causingError?.name ?? ''} ${err?.causingError?.message ?? ''}`;
  if (/NotReadableError|cannot (?:fetch|read|open|access)/i.test(msg)) {
    return { category: 'file_read', reason: 'unknown' };
  }
  if (status === 401) return { category: 'auth', reason: 'authExpired' };
  if (status >= 400 && status < 500) return { category: 'storage_4xx', reason: 'storage' };
  if (status >= 500) return { category: 'storage_5xx', reason: 'storage' };
  return { category: 'network', reason: 'network' };
}

// ---------------------------------------------------------------------------
// Uploader
// ---------------------------------------------------------------------------

const DEFAULT_NO_BYTES_MS = 15_000;
const DEFAULT_STALL_MS = 60_000;
const DEFAULT_TOTAL_MS = 600_000;
const SLOW_HINT_MS = 30_000;

export function startResumableUpload(
  file: File,
  config: ResumableUploadConfig,
): DocumentUploadController {
  const {
    documentType,
    bucket,
    path,
    contentType,
    route,
    cacheControl = '3600',
    onProgress,
    onStateChange,
  } = config;

  const noBytesTimeoutMs = config.noBytesTimeoutMs ?? DEFAULT_NO_BYTES_MS;
  const stallTimeoutMs = config.stallTimeoutMs ?? DEFAULT_STALL_MS;
  const totalTimeoutMs = config.totalTimeoutMs ?? DEFAULT_TOTAL_MS;

  const deps: Required<ResumableUploadDeps> = {
    createUpload:
      config.deps?.createUpload ??
      ((f, options) => new TusUpload(f, options)),
    getSession: config.deps?.getSession ?? defaultGetSession,
    getUploadContext: config.deps?.getUploadContext ?? defaultGetUploadContext,
    verifyObject: config.deps?.verifyObject ?? defaultVerifyObject,
    setTimeoutFn: config.deps?.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms)),
    clearTimeoutFn: config.deps?.clearTimeoutFn ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>)),
    now: config.deps?.now ?? (() => Date.now()),
  };

  let state: DocumentUploadState = 'IDLE';
  let settled = false;          // transport promise resolved/failed
  let finishing = false;        // we initiated the terminal transition
  let paused = false;
  let cancelled = false;
  let resumedFromPrevious = false;
  let attemptNumber = 1;
  let bytesUploaded = 0;
  let bytesTotal = file.size;
  let percent = 0;
  const startedAt = deps.now();

  // Watchdog handles + bookkeeping
  let noBytesTimer: unknown = null;
  let stallTimer: unknown = null;
  let totalTimer: unknown = null;
  let tickerTimer: unknown = null;
  const emittedCheckpoints = new Set<number>();

  let upload: TusLikeUpload | null = null;
  let accessToken = '';
  let resolveFn: ((r: DocumentUploadResult) => void) | null = null;

  const promise = new Promise<DocumentUploadResult>((resolve) => {
    resolveFn = resolve;
  });

  const setState = (s: DocumentUploadState) => {
    state = s;
    try {
      onStateChange?.(s);
    } catch {
      /* UI callbacks must never break the transport */
    }
  };

  const emitProgress = () => {
    const elapsedMs = deps.now() - startedAt;
    const active = state === 'UPLOADING' || state === 'RETRYING' || state === 'PREPARING' || state === 'VERIFYING' || state === 'PAUSED';
    const p: DocumentUploadProgress = {
      state,
      percent,
      bytesUploaded,
      bytesTotal,
      elapsedMs,
      slowConnection: elapsedMs >= SLOW_HINT_MS && active,
      preparingFile: bytesUploaded === 0 && (state === 'UPLOADING' || state === 'RETRYING'),
      attemptNumber,
      resumed: resumedFromPrevious,
    };
    try {
      onProgress?.(p);
    } catch {
      /* ignore */
    }
  };

  const clearWatchdogs = () => {
    if (noBytesTimer !== null) deps.clearTimeoutFn(noBytesTimer);
    if (stallTimer !== null) deps.clearTimeoutFn(stallTimer);
    if (totalTimer !== null) deps.clearTimeoutFn(totalTimer);
    noBytesTimer = null;
    stallTimer = null;
    totalTimer = null;
  };

  const stopTicker = () => {
    if (tickerTimer !== null) deps.clearTimeoutFn(tickerTimer);
    tickerTimer = null;
  };

  const startTicker = () => {
    stopTicker();
    tickerTimer = deps.setTimeoutFn(() => {
      emitProgress();
      if (!settled && !finishing) startTicker();
    }, 1000);
  };

  const armNoBytesWatchdog = () => {
    if (noBytesTimer !== null) deps.clearTimeoutFn(noBytesTimer);
    noBytesTimer = deps.setTimeoutFn(() => {
      if (settled || finishing || paused || cancelled) return;
      if (bytesUploaded > 0) return;
      // 15 s without a single byte leaving the browser — the exact class of
      // the Aldo incident. Recoverable failure; the caller keeps the form.
      finishing = true;
      clearWatchdogs();
      void Promise.resolve(upload?.abort(true)).catch(() => undefined).then(() => {
        finishFailure('no_bytes_started', 'noBytesStarted');
      });
    }, noBytesTimeoutMs);
  };

  const armStallWatchdog = () => {
    if (stallTimer !== null) deps.clearTimeoutFn(stallTimer);
    stallTimer = deps.setTimeoutFn(() => {
      if (settled || finishing || paused || cancelled) return;
      finishing = true;
      clearWatchdogs();
      void Promise.resolve(upload?.abort(true)).catch(() => undefined).then(() => {
        finishFailure('timeout', 'timedOut');
      });
    }, stallTimeoutMs);
  };

  const armTotalWatchdog = () => {
    if (totalTimer !== null) deps.clearTimeoutFn(totalTimer);
    totalTimer = deps.setTimeoutFn(() => {
      if (settled || finishing || paused || cancelled) return;
      finishing = true;
      clearWatchdogs();
      void Promise.resolve(upload?.abort(true)).catch(() => undefined).then(() => {
        finishFailure('timeout', 'timedOut');
      });
    }, totalTimeoutMs);
  };

  const finishFailure = (
    category: DocumentUploadErrorCategory,
    reason: DocumentUploadFailureReason,
  ) => {
    if (settled) return;
    settled = true;
    finishing = true;
    clearWatchdogs();
    stopTicker();
    setState('FAILED');
    const durationMs = deps.now() - startedAt;
    trackEvent('document_upload_failed', {
      ...emitBase(config, contentType, file.size),
      duration_ms: durationMs,
      attempt_number: attemptNumber,
      error_category: category,
      resumed: resumedFromPrevious,
    });
    resolveFn?.({
      ok: false,
      category,
      reason,
      durationMs,
      attemptNumber,
      resumed: resumedFromPrevious,
    });
  };

  const finishCancel = () => {
    if (settled) return;
    settled = true;
    finishing = true;
    clearWatchdogs();
    stopTicker();
    setState('CANCELLED');
    const durationMs = deps.now() - startedAt;
    trackEvent('document_upload_cancelled', {
      ...emitBase(config, contentType, file.size),
      duration_ms: durationMs,
      attempt_number: attemptNumber,
      resumed: resumedFromPrevious,
    });
    resolveFn?.({
      ok: false,
      category: 'cancelled',
      reason: 'cancelled',
      durationMs,
      attemptNumber,
      resumed: resumedFromPrevious,
    });
  };

  // ------------------------------------------------------------------
  // Drive
  // ------------------------------------------------------------------

  const drive = async () => {
    setState('FILE_SELECTED');
    emitProgress();

    setState('PREPARING');
    emitProgress();

    let session: { accessToken: string | null };
    try {
      session = await deps.getSession();
    } catch {
      finishFailure('auth', 'authExpired');
      return;
    }
    if (!session.accessToken) {
      finishFailure('auth', 'authExpired');
      return;
    }
    accessToken = session.accessToken;

    trackEvent('document_upload_started', emitBase(config, contentType, file.size));

    const uploadCtx = await deps.getUploadContext();

    const tusOptions: UploadOptions = {
      // Supabase TUS endpoint with the direct storage hostname.
      endpoint: uploadCtx.endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        // Public anon key + user session only — never service_role.
        apikey: uploadCtx.anonKey,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024, // NOTE: must stay 6MB for Supabase.
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType,
        cacheControl,
      },
      onProgress: (bytesSent: number, bytesTotalSent: number) => {
        if (settled || finishing || cancelled) return;
        bytesUploaded = Math.max(bytesUploaded, bytesSent);
        bytesTotal = bytesTotalSent || bytesTotal;
        percent = Math.min(99, Math.floor((bytesUploaded / Math.max(1, bytesTotal)) * 100));
        // First byte observed → the no-bytes watchdog has done its job.
        if (noBytesTimer !== null && bytesUploaded > 0) {
          deps.clearTimeoutFn(noBytesTimer);
          noBytesTimer = null;
        }
        // Stall watchdog resets on every progress event.
        armStallWatchdog();
        for (const cp of [25, 50, 75]) {
          if (percent >= cp && !emittedCheckpoints.has(cp)) {
            emittedCheckpoints.add(cp);
            trackEvent('document_upload_progress_checkpoint', {
              ...emitBase(config, contentType, file.size),
              progress_checkpoint: cp,
              resumed: resumedFromPrevious,
            });
          }
        }
        if (state === 'RETRYING' || state === 'PREPARING') setState('UPLOADING');
        emitProgress();
      },
      onShouldRetry: (err: unknown, retryAttempt: number) => {
        if (settled || finishing || cancelled) return false;
        // Mirror tus-js-client's defaultOnShouldRetry exactly (4xx except
        // 409/423 → no retry; otherwise retry while online), instrumenting
        // the retry for the state machine + telemetry.
        const status = tusStatus(err as TusErrorLike);
        const isOnline = () => {
          try {
            return typeof navigator === 'undefined' || navigator.onLine !== false;
          } catch {
            return true;
          }
        };
        const should = (!(status >= 400 && status < 500) || status === 409 || status === 423) && isOnline();
        if (should) {
          attemptNumber = retryAttempt + 2;
          setState('RETRYING');
          trackEvent('document_upload_retrying', {
            ...emitBase(config, contentType, file.size),
            attempt_number: attemptNumber,
            resumed: resumedFromPrevious,
          });
          emitProgress();
        }
        return should;
      },
      onError: (err: unknown) => {
        if (settled || finishing || cancelled || paused) return;
        finishing = true;
        clearWatchdogs();
        const { category, reason } = classifyTusError(err as TusErrorLike);
        finishFailure(category, reason);
      },
      onSuccess: () => {
        if (settled || finishing || cancelled) return;
        finishing = true;
        clearWatchdogs();
        percent = 100;
        bytesUploaded = bytesTotal;
        setState('VERIFYING');
        emitProgress();
        // "Comprobando archivo…" — confirm the object is really there before
        // letting the caller write the canonical row/profile columns.
        void deps
          .verifyObject(bucket, path, accessToken)
          .then((verdict) => {
            if (verdict === 'missing') {
              finishFailure('storage_4xx', 'verifyFailed');
              return;
            }
            // 'ok' or 'unknown' (network blip on the HEAD): the TUS 204
            // success is the authoritative server-side finalization.
            settled = true;
            stopTicker();
            emitProgress();
            resolveFn?.({
              ok: true,
              bucket,
              path,
              durationMs: deps.now() - startedAt,
              attemptNumber,
              resumed: resumedFromPrevious,
            });
          })
          .catch(() => {
            finishFailure('unknown', 'unknown');
          });
      },
    };

    try {
      upload = deps.createUpload(file, tusOptions);
    } catch {
      finishFailure('file_read', 'unknown');
      return;
    }

    try {
      const previous = await upload.findPreviousUploads();
      const match = previous.find(
        (p) => p.metadata?.bucketName === bucket && p.metadata?.objectName === path,
      );
      if (match) {
        resumedFromPrevious = true;
        upload.resumeFromPreviousUpload(match);
      }
    } catch {
      /* resume is best-effort; a fresh upload is always valid */
    }

    setState('UPLOADING');
    startTicker();
    armNoBytesWatchdog();
    armStallWatchdog();
    armTotalWatchdog();
    emitProgress();
    upload.start();
  };

  void drive().catch(() => finishFailure('unknown', 'unknown'));

  return {
    promise,
    pause() {
      if (settled || finishing || paused || cancelled) return;
      paused = true;
      clearWatchdogs();
      const durationMs = deps.now() - startedAt;
      trackEvent('document_upload_paused', {
        ...emitBase(config, contentType, file.size),
        attempt_number: attemptNumber,
        duration_ms: durationMs,
        resumed: resumedFromPrevious,
      });
      setState('PAUSED');
      emitProgress();
      void Promise.resolve(upload?.abort(false)).catch(() => undefined);
    },
    resume() {
      if (settled || finishing || cancelled || !paused) return;
      paused = false;
      setState('UPLOADING');
      trackEvent('document_upload_resumed', {
        ...emitBase(config, contentType, file.size),
        attempt_number: attemptNumber,
        duration_ms: deps.now() - startedAt,
        resumed: resumedFromPrevious,
      });
      startTicker();
      armStallWatchdog();
      armTotalWatchdog();
      if (bytesUploaded === 0) armNoBytesWatchdog();
      emitProgress();
      try {
        upload?.start();
      } catch {
        finishFailure('unknown', 'unknown');
      }
    },
    cancel() {
      if (settled || cancelled) return;
      cancelled = true;
      finishing = true;
      clearWatchdogs();
      void Promise.resolve(upload?.abort(true)).catch(() => undefined).then(() => {
        finishCancel();
      });
    },
    confirmSaved() {
      if (state !== 'VERIFYING' || !settled) return;
      stopTicker();
      setState('SAVED');
      trackEvent('document_upload_completed', {
        ...emitBase(config, contentType, file.size),
        duration_ms: deps.now() - startedAt,
        attempt_number: attemptNumber,
        resumed: resumedFromPrevious,
      });
      emitProgress();
    },
    failCanonical() {
      if (state !== 'VERIFYING' || !settled) return;
      stopTicker();
      setState('FAILED');
      trackEvent('document_upload_failed', {
        ...emitBase(config, contentType, file.size),
        duration_ms: deps.now() - startedAt,
        attempt_number: attemptNumber,
        error_category: 'database',
        resumed: resumedFromPrevious,
      });
      emitProgress();
    },
  };
}
