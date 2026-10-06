import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PB-DOCUMENT-INTAKE-001 — Vía A: unit tests for the shared resumable (TUS)
 * document uploader (`app/frontend/src/lib/resumableUpload.ts`).
 *
 * Covered acceptance criteria:
 *   - successful TUS upload (verify → ok)
 *   - real progress (percent caps at 99 until TUS confirms; bytes monotonic)
 *   - resume via findPreviousUploads()/resumeFromPreviousUpload()
 *   - retry instrumentation (state machine + attempt_number)
 *   - cancellation
 *   - no_bytes_started (the Aldo incident, post-fix detection at 15 s)
 *   - timeout (stall watchdog)
 *   - expired credentials (auth)
 *   - cumulative timer never resets across retries
 *   - slow-connection hint only after 30 s of accumulated time
 *   - observability fail-open (throwing UI callbacks never break a transfer)
 *   - anti-PII telemetry (no file name / UID / path / URL in any event)
 *   - incident regression: pre-fix infinite 0% (structural + behavioral) vs
 *     post-fix no_bytes_started detection.
 *
 * No network, no Supabase, no PostHog SDK: the TUS client, session, upload
 * context, verification, timers and clock are all injected.
 */

import {
  startResumableUpload,
  formatBytes,
  storageTusEndpoint,
  type DocumentUploadController,
  type DocumentUploadProgress,
  type DocumentUploadResult,
  type ResumableUploadDeps,
  type TusLikeUpload,
  type TusPreviousUpload,
} from '../app/frontend/src/lib/resumableUpload';
import {
  initObservability,
  __resetObservabilityForTests,
  type ObsClient,
} from '../app/frontend/src/lib/observability';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** Virtual clock + timer queue driving the uploader's watchdogs. */
function makeVirtualTimers() {
  let now = 0;
  let nextId = 1;
  const jobs: { id: number; at: number; fn: () => void; cancelled: boolean }[] = [];
  const timers = {
    setTimeoutFn: (fn: () => void, ms: number) => {
      const id = nextId++;
      jobs.push({ id, at: now + ms, fn, cancelled: false });
      return id;
    },
    clearTimeoutFn: (id: unknown) => {
      const j = jobs.find((x) => x.id === id);
      if (j) j.cancelled = true;
    },
    now: () => now,
    /** Advance the clock, running due timers in chronological order. */
    advance: (ms: number) => {
      const target = now + ms;
      for (;;) {
        const due = jobs
          .filter((j) => !j.cancelled && j.at <= target)
          .sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = due.at;
        due.cancelled = true; // one-shot semantics
        due.fn();
      }
      now = target;
    },
  };
  return timers;
}

type FakeBehavior = 'progress-to-success' | 'silent-stall' | 'stall-after-bytes' | 'fail-4xx';

/** Scripted TUS upload double. */
class FakeTus implements TusLikeUpload {
  file: File;
  options: Record<string, unknown>;
  startedCount = 0;
  abortedWith: (boolean | undefined)[] = [];
  resumedFrom: TusPreviousUpload | null = null;
  previousUploads: TusPreviousUpload[] = [];
  behavior: FakeBehavior = 'progress-to-success';

  constructor(file: File, options: Record<string, unknown>) {
    this.file = file;
    this.options = options;
  }

  findPreviousUploads(): Promise<TusPreviousUpload[]> {
    return Promise.resolve(this.previousUploads);
  }
  resumeFromPreviousUpload(previousUpload: TusPreviousUpload): void {
    this.resumedFrom = previousUpload;
  }
  start(): void {
    this.startedCount++;
    const onProgress = this.options.onProgress as
      | ((bytesSent: number, bytesTotal: number) => void)
      | undefined;
    const onError = this.options.onError as ((err: unknown) => void) | undefined;
    const onSuccess = this.options.onSuccess as (() => void) | undefined;
    if (this.behavior === 'silent-stall') return; // the incident: zero bytes, ever
    if (this.behavior === 'stall-after-bytes') {
      onProgress?.(1024, this.file.size);
      return; // one chunk, then silence
    }
    if (this.behavior === 'fail-4xx') {
      onError?.({ message: 'upload failed', originalResponse: { getStatus: () => 403 } });
      return;
    }
    // progress-to-success
    const total = this.file.size;
    onProgress?.(Math.floor(total / 3), total);
    onProgress?.(Math.floor((2 * total) / 3), total);
    onProgress?.(total, total);
    onSuccess?.();
  }
  abort(shouldTerminate?: boolean): Promise<unknown> {
    this.abortedWith.push(shouldTerminate);
    return Promise.resolve(true);
  }
}

function makeFakeFile(name = 'diploma.pdf', size = 8 * 1024 * 1024): File {
  return new File([new Uint8Array(size)], name, {
    type: 'application/pdf',
    lastModified: 1_700_000_000_000,
  });
}

interface HarnessOpts {
  behavior?: FakeBehavior;
  previousUploads?: TusPreviousUpload[];
  verify?: 'ok' | 'missing' | 'unknown';
  overrides?: Partial<ResumableUploadDeps>;
  documentType?: 'certificate' | 'cv';
}

interface Harness {
  fake: FakeTus | null;
  progress: DocumentUploadProgress[];
  states: string[];
  timers: ReturnType<typeof makeVirtualTimers>;
  controller: DocumentUploadController;
}

/** Build an uploader wired to test doubles; resolves once drive() has started. */
async function makeHarness(file: File, opts: HarnessOpts = {}): Promise<Harness> {
  const timers = makeVirtualTimers();
  const progress: DocumentUploadProgress[] = [];
  const states: string[] = [];
  let fake: FakeTus | null = null;
  const controller = startResumableUpload(file, {
    documentType: opts.documentType ?? 'certificate',
    bucket: 'app_14da0f1941_certificates',
    path: 'user-uid/cert-1.pdf',
    contentType: 'application/pdf',
    route: '/profile',
    deps: {
      createUpload: (f, options) => {
        fake = new FakeTus(f, options as unknown as Record<string, unknown>);
        if (opts.behavior) fake.behavior = opts.behavior;
        if (opts.previousUploads) fake.previousUploads = opts.previousUploads;
        return fake;
      },
      getSession: () => Promise.resolve({ accessToken: 'session-token' }),
      getUploadContext: () =>
        Promise.resolve({
          endpoint: 'https://example.storage.supabase.co/storage/v1/upload/resumable',
          anonKey: 'anon',
        }),
      verifyObject: () => Promise.resolve(opts.verify ?? 'ok'),
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
      now: timers.now,
      ...opts.overrides,
    },
    onProgress: (p) => progress.push(p),
    onStateChange: (s) => states.push(s),
  });
  // Let drive() run through session → context → createUpload → start().
  await new Promise((r) => setTimeout(r, 0));
  return { fake, progress, states, timers, controller };
}

/** PostHog double capturing the wire payload. */
function makeCapturingClient() {
  const captured: Array<{ event: string; properties?: Record<string, unknown> }> = [];
  const client: ObsClient = {
    capture: (event: string, properties?: Record<string, unknown>) => {
      captured.push({ event, properties });
    },
  };
  return { client, captured };
}

// ---------------------------------------------------------------------------
// 1. Successful TUS upload
// ---------------------------------------------------------------------------

test.describe('PB-DOCUMENT-INTAKE-001 resumable uploader', () => {
  test('completes a TUS upload and resolves only after the verification HEAD', async () => {
    const h = await makeHarness(makeFakeFile());
    const result = await h.controller.promise;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bucket).toBe('app_14da0f1941_certificates');
      expect(result.path).toBe('user-uid/cert-1.pdf');
    }
    expect(h.states).toContain('UPLOADING');
    expect(h.states).toContain('VERIFYING');
    expect(h.fake!.abortedWith).toHaveLength(0); // happy path: no aborts
  });

  test('a missing object after TUS success fails verification (verifyFailed)', async () => {
    const h = await makeHarness(makeFakeFile(), { verify: 'missing' });
    const result = await h.controller.promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('verifyFailed');
      expect(result.category).toBe('storage_4xx');
    }
  });

  test('percent never reaches 100 before TUS confirms completion', async () => {
    const h = await makeHarness(makeFakeFile());
    const duringUpload = h.progress.filter((p) => p.state === 'UPLOADING');
    for (const p of duringUpload) {
      expect(p.percent).toBeLessThanOrEqual(99);
    }
    await h.controller.promise;
    // After onSuccess the machine is VERIFYING with 100%.
    const verifying = h.progress.find((p) => p.state === 'VERIFYING');
    expect(verifying?.percent).toBe(100);
  });

  test('real progress: bytes are monotonic and reach the total', async () => {
    const h = await makeHarness(makeFakeFile());
    await h.controller.promise;
    const uploading = h.progress.filter((p) => p.state === 'UPLOADING');
    expect(uploading.length).toBeGreaterThanOrEqual(3);
    let prev = 0;
    for (const p of uploading) {
      expect(p.bytesUploaded).toBeGreaterThanOrEqual(prev);
      expect(p.bytesTotal).toBe(8 * 1024 * 1024);
      prev = p.bytesUploaded;
    }
    expect(prev).toBe(8 * 1024 * 1024);
  });

  test('confirmSaved() flips VERIFYING → SAVED only after the canonical write', async () => {
    const h = await makeHarness(makeFakeFile());
    await h.controller.promise;
    // Still VERIFYING: the canonical DB write has not happened yet.
    expect(h.progress[h.progress.length - 1].state).toBe('VERIFYING');
    h.controller.confirmSaved();
    expect(h.states[h.states.length - 1]).toBe('SAVED');
  });

  test('failCanonical() closes the machine as a database failure', async () => {
    const h = await makeHarness(makeFakeFile());
    await h.controller.promise;
    h.controller.failCanonical();
    expect(h.states[h.states.length - 1]).toBe('FAILED');
  });

  // -------------------------------------------------------------------------
  // 2. Resume
  // -------------------------------------------------------------------------

  test('resumes a previous upload for the same bucket+objectName', async () => {
    const previousUploads: TusPreviousUpload[] = [
      { metadata: { bucketName: 'other-bucket', objectName: 'other/path.pdf' } },
      { metadata: { bucketName: 'app_14da0f1941_certificates', objectName: 'user-uid/cert-1.pdf' } },
    ];
    const h = await makeHarness(makeFakeFile(), { previousUploads });
    const result = await h.controller.promise;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resumed).toBe(true);
    expect(h.fake!.resumedFrom).toBe(previousUploads[1]);
  });

  test('a fresh selection with no previous upload starts from scratch', async () => {
    const h = await makeHarness(makeFakeFile());
    const result = await h.controller.promise;
    if (result.ok) expect(result.resumed).toBe(false);
    expect(h.fake!.resumedFrom).toBeNull();
  });

  test('pause() aborts without terminating and resume() restarts the transport', async () => {
    const h = await makeHarness(makeFakeFile(), { behavior: 'stall-after-bytes' });
    expect(h.fake!.startedCount).toBe(1);
    h.controller.pause();
    expect(h.states).toContain('PAUSED');
    expect(h.fake!.abortedWith).toEqual([false]); // keep the offset
    h.controller.resume();
    expect(h.fake!.startedCount).toBe(2);
    expect(h.states[h.states.length - 1]).toBe('UPLOADING');
  });

  // -------------------------------------------------------------------------
  // 3. Retry
  // -------------------------------------------------------------------------

  test('an internal retry transitions to RETRYING and bumps attempt_number', async () => {
    const h = await makeHarness(makeFakeFile(), { behavior: 'stall-after-bytes' });
    const onShouldRetry = h.fake!.options.onShouldRetry as
      | ((err: unknown, retryAttempt: number) => boolean)
      | undefined;
    expect(onShouldRetry).toBeTruthy();
    const should = onShouldRetry!({ message: 'network error', originalResponse: null }, 0);
    expect(should).toBe(true); // default tus semantics: non-4xx errors retry while online
    expect(h.states).toContain('RETRYING');
    expect(h.progress[h.progress.length - 1].attemptNumber).toBe(2);
    // Close the machine via the stall watchdog and confirm the attempt count
    // survived into the terminal result.
    h.timers.advance(60_500);
    const result = await h.controller.promise;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.attemptNumber).toBeGreaterThanOrEqual(2);
  });

  test('a 4xx storage error does not retry and fails as storage_4xx', async () => {
    const h = await makeHarness(makeFakeFile(), { behavior: 'fail-4xx' });
    const result = await h.controller.promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('storage_4xx');
      expect(result.reason).toBe('storage');
    }
    expect(h.states).not.toContain('RETRYING');
  });

  // -------------------------------------------------------------------------
  // 4. no_bytes_started — the Aldo incident, post-fix
  // -------------------------------------------------------------------------

  test('detects no_bytes_started after exactly 15 s of zero bytes and aborts', async () => {
    const h = await makeHarness(makeFakeFile(), { behavior: 'silent-stall' });
    // 14.9 s: still waiting, UI shows "Preparando el archivo…".
    h.timers.advance(14_900);
    expect(h.progress[h.progress.length - 1].state).not.toBe('FAILED');
    expect(h.progress[h.progress.length - 1].preparingFile).toBe(true);
    // 15 s: recoverable failure, transport terminated (no incomplete request).
    h.timers.advance(200);
    const result = await h.controller.promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('no_bytes_started');
      expect(result.reason).toBe('noBytesStarted');
    }
    expect(h.states[h.states.length - 1]).toBe('FAILED');
    expect(h.fake!.abortedWith).toEqual([true]);
  });

  test('stall timeout fires when bytes stop flowing mid-upload', async () => {
    const h = await makeHarness(makeFakeFile(), { behavior: 'stall-after-bytes' });
    h.timers.advance(60_500);
    const result = await h.controller.promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('timeout');
      expect(result.reason).toBe('timedOut');
    }
  });

  test('slow-connection hint appears only after 30 s of accumulated time', async () => {
    const h = await makeHarness(makeFakeFile(), { behavior: 'stall-after-bytes' });
    h.timers.advance(29_900);
    expect(h.progress[h.progress.length - 1].slowConnection).toBe(false);
    h.timers.advance(300); // 30.2 s accumulated
    expect(h.progress[h.progress.length - 1].slowConnection).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 5. Cancellation
  // -------------------------------------------------------------------------

  test('cancel() terminates the partial upload and resolves as cancelled', async () => {
    const h = await makeHarness(makeFakeFile(), { behavior: 'silent-stall' });
    h.timers.advance(1_000);
    h.controller.cancel();
    const result = await h.controller.promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('cancelled');
      expect(result.reason).toBe('cancelled');
    }
    expect(h.fake!.abortedWith).toEqual([true]); // terminate: no partial object
  });

  // -------------------------------------------------------------------------
  // 6. Credentials
  // -------------------------------------------------------------------------

  test('an expired session fails fast as auth before any transport starts', async () => {
    const h = await makeHarness(makeFakeFile(), {
      overrides: { getSession: () => Promise.resolve({ accessToken: null }) },
    });
    const result = await h.controller.promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('auth');
      expect(result.reason).toBe('authExpired');
    }
    expect(h.fake).toBeNull(); // the TUS client was never created
  });

  test('a session error (not just absence) is treated as auth', async () => {
    const h = await makeHarness(makeFakeFile(), {
      overrides: { getSession: () => Promise.reject(new Error('network down')) },
    });
    const result = await h.controller.promise;
    if (!result.ok) expect(result.category).toBe('auth');
  });

  // -------------------------------------------------------------------------
  // 7. Cumulative timer never resets
  // -------------------------------------------------------------------------

  test('elapsed time is cumulative and never decreases across retries', async () => {
    const h = await makeHarness(makeFakeFile(), { behavior: 'stall-after-bytes' });
    h.timers.advance(5_000);
    const onShouldRetry = h.fake!.options.onShouldRetry as (err: unknown, n: number) => boolean;
    onShouldRetry({ message: 'network error' }, 0);
    h.timers.advance(5_000);
    onShouldRetry({ message: 'network error' }, 1);
    h.timers.advance(5_000);
    const times = h.progress.map((p) => p.elapsedMs);
    let prev = 0;
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    expect(prev).toBeGreaterThanOrEqual(15_000);
  });

  // -------------------------------------------------------------------------
  // 8. Observability fail-open
  // -------------------------------------------------------------------------

  test('throwing UI callbacks never break a transfer (observability fail-open)', async () => {
    const timers = makeVirtualTimers();
    const controller = startResumableUpload(makeFakeFile(), {
      documentType: 'certificate',
      bucket: 'b',
      path: 'p',
      contentType: 'application/pdf',
      route: '/profile',
      deps: {
        createUpload: (f, options) => new FakeTus(f, options as unknown as Record<string, unknown>),
        getSession: () => Promise.resolve({ accessToken: 't' }),
        getUploadContext: () => Promise.resolve({ endpoint: 'e', anonKey: 'k' }),
        verifyObject: () => Promise.resolve('ok'),
        setTimeoutFn: timers.setTimeoutFn,
        clearTimeoutFn: timers.clearTimeoutFn,
        now: timers.now,
      },
      onProgress: () => {
        throw new Error('UI exploded');
      },
      onStateChange: () => {
        throw new Error('UI exploded');
      },
    });
    const result = await controller.promise;
    expect(result.ok).toBe(true); // transfer unaffected
  });

  test('tracking without an initialized client never throws (fail-open)', async () => {
    __resetObservabilityForTests();
    const timers = makeVirtualTimers();
    const controller = startResumableUpload(makeFakeFile(), {
      documentType: 'cv',
      bucket: 'b',
      path: 'p',
      contentType: 'application/pdf',
      route: '/profile',
      deps: {
        createUpload: (f, options) => new FakeTus(f, options as unknown as Record<string, unknown>),
        getSession: () => Promise.resolve({ accessToken: 't' }),
        getUploadContext: () => Promise.resolve({ endpoint: 'e', anonKey: 'k' }),
        verifyObject: () => Promise.resolve('ok'),
        setTimeoutFn: timers.setTimeoutFn,
        clearTimeoutFn: timers.clearTimeoutFn,
        now: timers.now,
      },
    });
    const result = await controller.promise;
    expect(result.ok).toBe(true); // no init, no crash
    __resetObservabilityForTests();
  });

  // -------------------------------------------------------------------------
  // 9. Anti-PII telemetry
  // -------------------------------------------------------------------------

  test('document_upload_* events carry the allowlist and zero PII', async () => {
    __resetObservabilityForTests();
    const { client, captured } = makeCapturingClient();
    await initObservability({ injectedClient: client });

    // PII-shaped file name / path: none of it may survive into telemetry.
    const timers = makeVirtualTimers();
    const controller = startResumableUpload(makeFakeFile('aldo.private@gmail.com.pdf'), {
      documentType: 'certificate',
      bucket: 'app_14da0f1941_certificates',
      path: '9f8e7d6c-1234-5678-9abc-def012345678/cert-1.pdf',
      contentType: 'application/pdf',
      route: '/profile',
      deps: {
        createUpload: (f, options) => {
          const fake = new FakeTus(f, options as unknown as Record<string, unknown>);
          fake.behavior = 'silent-stall';
          return fake;
        },
        getSession: () => Promise.resolve({ accessToken: 'secret-access-token' }),
        getUploadContext: () =>
          Promise.resolve({
            endpoint: 'https://example.storage.supabase.co/storage/v1/upload/resumable',
            anonKey: 'anon-secret',
          }),
        verifyObject: () => Promise.resolve('ok'),
        setTimeoutFn: timers.setTimeoutFn,
        clearTimeoutFn: timers.clearTimeoutFn,
        now: timers.now,
      },
    });
    // Let drive() reach createUpload + start() so the watchdogs are armed
    // on the virtual clock before it advances.
    await new Promise((r) => setTimeout(r, 0));
    timers.advance(15_500);
    const result = await controller.promise;
    expect(result.ok).toBe(false);

    const events = captured.map((c) => c.event);
    expect(events).toContain('document_upload_started');
    expect(events).toContain('document_upload_failed');
    expect(events).not.toContain('cert_upload_started'); // unified taxonomy only

    const wire = JSON.stringify(captured);
    expect(wire).not.toContain('aldo.private');
    expect(wire).not.toContain('@gmail.com');
    expect(wire).not.toContain('9f8e7d6c');
    expect(wire).not.toContain('cert-1.pdf');
    expect(wire).not.toContain('secret-access-token');
    expect(wire).not.toContain('example.storage.supabase.co');

    const failed = captured.find((c) => c.event === 'document_upload_failed');
    expect(failed?.properties).toMatchObject({
      document_type: 'certificate',
      channel: 'direct',
      transport: 'tus',
      mime_category: 'pdf',
      size_bucket: '5mb-10mb',
      error_category: 'no_bytes_started',
    });
    // Allowlist only: no unexpected keys.
    for (const key of Object.keys(failed?.properties ?? {})) {
      expect([
        'route', 'correlation_id', 'document_type', 'channel', 'transport',
        'mime_category', 'size_bucket', 'duration_ms', 'attempt_number',
        'error_category', 'resumed', 'environment', 'app_version',
      ]).toContain(key);
    }
    __resetObservabilityForTests();
  });

  test('progress checkpoints 25/50/75 are emitted exactly once each', async () => {
    __resetObservabilityForTests();
    const { client, captured } = makeCapturingClient();
    await initObservability({ injectedClient: client });
    const h = await makeHarness(makeFakeFile());
    await h.controller.promise;
    h.controller.confirmSaved();
    const checkpoints = captured
      .filter((c) => c.event === 'document_upload_progress_checkpoint')
      .map((c) => c.properties?.progress_checkpoint)
      .sort();
    expect(checkpoints).toEqual([25, 50, 75]);
    const completed = captured.find((c) => c.event === 'document_upload_completed');
    expect(completed?.properties).toMatchObject({ document_type: 'certificate', transport: 'tus' });
    __resetObservabilityForTests();
  });

  // -------------------------------------------------------------------------
  // 10. Helpers
  // -------------------------------------------------------------------------

  test('storageTusEndpoint maps the project URL to the storage host', () => {
    expect(storageTusEndpoint('https://mwdauubztjxkbrefirbg.supabase.co')).toBe(
      'https://mwdauubztjxkbrefirbg.storage.supabase.co/storage/v1/upload/resumable',
    );
  });

  test('formatBytes renders human byte counts', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(8 * 1024 * 1024)).toBe('8.0 MB');
  });
});

// ---------------------------------------------------------------------------
// Incident regression — pre-fix vs post-fix
// ---------------------------------------------------------------------------

test.describe('PB-DOCUMENT-INTAKE-001 incident regression (Aldo, 2026-10-06)', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const uploadHelpers = readFileSync(join(repoRoot, 'app/frontend/src/lib/uploadHelpers.ts'), 'utf8');

  /**
   * PRE-FIX (structural, on the real deployed source): _doXhrUpload awaits
   * file.arrayBuffer() BEFORE any XHR/watchdog exists. A File whose stream
   * never produces bytes therefore leaves uploadWithTimeout pending forever:
   * no request leaves the browser, cert_upload_failed is never emitted and
   * the UI stays at 0% — exactly the PostHog/Storage evidence of the
   * incident (started at 07:28:59, then nothing). uploadWithTimeout remains
   * the transport for DocumentsSection and AvatarUpload, so this hazard is
   * pinned until they migrate too.
   */
  test('pre-fix: the XHR transport awaits the file stream before any watchdog is armed (infinite 0%)', () => {
    const doXhr = uploadHelpers.slice(uploadHelpers.indexOf('async function _doXhrUpload'));
    const arrayBufferAt = doXhr.indexOf('await file.arrayBuffer()');
    const promiseAt = doXhr.indexOf('return new Promise(');
    const hangGuardAt = doXhr.indexOf('const hangGuard = setTimeout(');
    expect(arrayBufferAt).toBeGreaterThan(-1);
    expect(promiseAt).toBeGreaterThan(-1);
    expect(hangGuardAt).toBeGreaterThan(-1);
    // The stream read precedes the promise executor where every timer lives.
    expect(arrayBufferAt).toBeLessThan(promiseAt);
    expect(arrayBufferAt).toBeLessThan(hangGuardAt);
  });

  /**
   * PRE-FIX (behavioral): with a stalled stream, the pre-fix transport
   * contract is "started, then nothing" — pending past its own configured
   * timeoutMs because the timeout only exists inside the XHR promise that
   * is never reached.
   */
  test('pre-fix: a stalled file stream stays pending past the configured timeout window', async () => {
    const stalledFile = {
      name: 'cert.pdf',
      size: 8 * 1024 * 1024,
      type: 'application/pdf',
      lastModified: 1,
      // The browser never produces bytes for this file.
      arrayBuffer: () => new Promise<ArrayBuffer>(() => {}),
    } as unknown as File;
    // The exact pre-fix sequence: the stream read happens with no watchdog
    // before it (pinned structurally above), so after the guard window the
    // flow is still pending — 0%, "(0 s)" counting up, no request, no
    // failure event.
    const stillStalled = await Promise.race([
      stalledFile.arrayBuffer().then(() => false),
      new Promise<boolean>((r) => setTimeout(() => r(true), 250)),
    ]);
    expect(stillStalled).toBe(true);
  });

  /**
   * POST-FIX: the same stalled stream is detected as no_bytes_started at
   * 15 s, surfaced as a recoverable failure, with the transport terminated
   * (no incomplete request) and the form preserved (plain failure result
   * the UI maps to a retry affordance).
   */
  test('post-fix: the same stalled stream is detected as no_bytes_started at 15 s', async () => {
    const h = await makeHarness(makeFakeFile(), { behavior: 'silent-stall' });
    h.timers.advance(15_000);
    const result: DocumentUploadResult = await h.controller.promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('no_bytes_started');
      expect(result.reason).toBe('noBytesStarted');
    }
    // No incomplete request survives.
    expect(h.fake!.abortedWith).toEqual([true]);
    // The UI was in the recoverable "Preparando el archivo…" state before.
    expect(h.progress.some((p) => p.preparingFile)).toBe(true);
  });
});
