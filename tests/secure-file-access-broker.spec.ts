import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Broker access E2E for PB-STORAGE-SECURITY-001 Security NO-GO #5.
 *
 * The suite is self-contained: it creates valid private Storage objects and the
 * minimum authorization relationship it needs, runs exactly 9 tests with zero
 * skips, and restores/deletes every temporary fixture in afterAll.
 *
 * Verifies that the `secure-file-access` Edge Function:
 *   - allows owners to access their own files;
 *   - allows an explicitly related company to access a visible CV;
 *   - denies an unrelated company;
 *   - denies non-owner workers across CV/document/certification;
 *   - allows legitimate admin access;
 *   - rejects metadata that points to a missing object;
 *   - keeps the storage-ownership RPC backend-only.
 *
 * Required env vars (never committed):
 *   E2E_WORKER_EMAIL / E2E_WORKER_PASSWORD
 *   E2E_SECOND_WORKER_EMAIL / E2E_SECOND_WORKER_PASSWORD
 *   E2E_COMPANY_AUTHORIZED_EMAIL / E2E_COMPANY_AUTHORIZED_PASSWORD
 *   E2E_COMPANY_UNAUTHORIZED_EMAIL / E2E_COMPANY_UNAUTHORIZED_PASSWORD
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 */

const WORKER_EMAIL = process.env.E2E_WORKER_EMAIL;
const WORKER_PASSWORD = process.env.E2E_WORKER_PASSWORD;
const SECOND_WORKER_EMAIL = process.env.E2E_SECOND_WORKER_EMAIL;
const SECOND_WORKER_PASSWORD = process.env.E2E_SECOND_WORKER_PASSWORD;
const COMPANY_AUTH_EMAIL = process.env.E2E_COMPANY_AUTHORIZED_EMAIL;
const COMPANY_AUTH_PASSWORD = process.env.E2E_COMPANY_AUTHORIZED_PASSWORD;
const COMPANY_UNAUTH_EMAIL = process.env.E2E_COMPANY_UNAUTHORIZED_EMAIL;
const COMPANY_UNAUTH_PASSWORD = process.env.E2E_COMPANY_UNAUTHORIZED_PASSWORD;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const CV_BUCKET = 'app_14da0f1941_certificates';
const WORKER_FILES_BUCKET = 'worker-documents';
const FIXTURE_TAG = '[QA FIXTURE] PB-STORAGE-SECURITY-001';
const RUN_TOKEN = [
  process.env.GITHUB_RUN_ID || 'local',
  process.env.GITHUB_RUN_ATTEMPT || '1',
  Date.now().toString(36),
].join('-');

interface CvState {
  cv_file_url: string | null;
  cv_file_name: string | null;
  cv_visible: boolean | null;
  cv_storage_bucket: string | null;
  cv_storage_path: string | null;
}

interface BrokerFixture {
  workerId?: string;
  secondWorkerId?: string;
  authorizedCompanyId?: string;
  workerCvPath?: string;
  secondWorkerCvPath?: string;
  documentPath?: string;
  certificationPath?: string;
  documentId?: string;
  certificationId?: string;
  historicalDocumentPath?: string;
  historicalDocumentId?: string;
  probeDocumentPath?: string;
  probeDocumentId?: string;
  certInCertsPath?: string;
  certInCertsId?: string;
  certInDocsPath?: string;
  certInDocsId?: string;
  secondWorkerCvWrongBucketPath?: string;
  jobId?: string;
  applicationId?: string;
  originalWorkerCv?: CvState;
  originalSecondWorkerCv?: CvState;
}

const fixture: BrokerFixture = {};

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required for deterministic broker E2E fixtures`);
  return value;
}

async function signIn(email: string, password: string) {
  const supabase = createClient(
    requireEnv('VITE_SUPABASE_URL', SUPABASE_URL),
    requireEnv('VITE_SUPABASE_ANON_KEY', SUPABASE_ANON_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(error?.message || `Login failed for ${email}`);
  return { supabase, user: data.session.user };
}

function makePdf(label: string): Blob {
  return new Blob(
    [
      '%PDF-1.4\n',
      `% PipingBox deterministic E2E fixture: ${label}\n`,
      '1 0 obj<< /Type /Catalog >>endobj\n',
      'trailer<<>>\n%%EOF\n',
    ],
    { type: 'application/pdf' },
  );
}

function throwIfError(label: string, error: { message?: string } | null) {
  if (error) throw new Error(`${label}: ${error.message || 'unknown Supabase error'}`);
}

async function uploadFixture(
  client: Awaited<ReturnType<typeof signIn>>['supabase'],
  bucket: string,
  path: string,
  label: string,
) {
  const { error } = await client.storage
    .from(bucket)
    .upload(path, makePdf(label), { contentType: 'application/pdf', upsert: false });
  throwIfError(`Upload ${bucket}/${path}`, error);
}

async function readCvState(
  client: Awaited<ReturnType<typeof signIn>>['supabase'],
  userId: string,
): Promise<CvState> {
  const { data, error } = await client
    .from('app_14da0f1941_profiles')
    .select('cv_file_url, cv_file_name, cv_visible, cv_storage_bucket, cv_storage_path')
    .eq('user_id', userId)
    .single();
  throwIfError(`Read CV state for ${userId}`, error);
  if (!data) throw new Error(`Profile missing for ${userId}`);
  return data as CvState;
}

async function setCvFixture(
  client: Awaited<ReturnType<typeof signIn>>['supabase'],
  userId: string,
  path: string,
  fileName: string,
) {
  const { error } = await client
    .from('app_14da0f1941_profiles')
    .update({
      cv_storage_bucket: CV_BUCKET,
      cv_storage_path: path,
      cv_file_name: fileName,
      cv_visible: true,
    })
    .eq('user_id', userId);
  throwIfError(`Set CV fixture for ${userId}`, error);
}

async function restoreCvState(
  client: Awaited<ReturnType<typeof signIn>>['supabase'],
  userId: string,
  state: CvState | undefined,
) {
  if (!state) return;
  const { error } = await client
    .from('app_14da0f1941_profiles')
    .update(state)
    .eq('user_id', userId);
  throwIfError(`Restore CV state for ${userId}`, error);
}

/**
 * supabase-js wraps a non-2xx Edge Function reply in a FunctionsHttpError whose
 * `.message` is only the generic "Edge Function returned a non-2xx status code".
 * The actual status and body live in `.context`, which is the raw Response.
 *
 * Without this, every broker rejection looks identical and there is no way to
 * tell a visibility denial from a relationship denial from an internal 500.
 * Run #1 of the gate failed exactly here: "returned non-2xx" and nothing else.
 */
async function readInvokeError(error: any): Promise<{ status?: number; body: string }> {
  const context = error?.context;
  if (!context) return { body: '' };

  const status = typeof context.status === 'number' ? context.status : undefined;

  let body = '';
  try {
    // Clone so the body stays readable if anything else consumes it.
    if (typeof context.clone === 'function') {
      body = await context.clone().text();
    } else if (typeof context.text === 'function') {
      body = await context.text();
    }
  } catch {
    body = '<body already consumed or unreadable>';
  }

  return { status, body };
}

/** Broker reason string, e.g. "File not visible to companies". */
function extractReason(body: string, fallback: unknown): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === 'string') return parsed.error;
  } catch {
    /* body is not JSON; fall through */
  }
  return body || String(fallback ?? '');
}

async function describeFailure(label: string, data: any, error: any): Promise<string> {
  const { status, body } = await readInvokeError(error);
  return [
    `${label}`,
    `  status: ${status ?? '(none)'}`,
    `  broker reason: ${extractReason(body, error?.message) || '(empty)'}`,
    `  raw body: ${body || '(empty)'}`,
    `  error name: ${error?.name ?? '(none)'}`,
    `  error message: ${error?.message ?? '(none)'}`,
    `  data: ${data ? JSON.stringify(data) : '(none)'}`,
  ].join('\n');
}

async function assertSignedUrl(label: string, data: any, error: any) {
  if (error || !data?.signedUrl) {
    // Surfaces the broker's own reason instead of "non-2xx".
    throw new Error(await describeFailure(`${label}: expected a signed URL`, data, error));
  }
  expect(data.signedUrl).toMatch(/[?&]token=/);
  expect(data.signedUrl).not.toMatch(/\/object\/public\//);
}

/**
 * A denial must be an explicit 403/404 from the broker. A 500, a network error
 * or an unlabelled failure is NOT a pass: it would prove the request failed,
 * not that authorization rejected it. The previous version accepted any
 * "non-2xx" message, so an internal error would have been recorded as a
 * successful denial.
 */
async function assertDenied(label: string, data: any, error: any): Promise<string> {
  expect(data?.signedUrl, `${label}: expected no signed URL`).toBeFalsy();

  const { status, body } = await readInvokeError(error);
  const reason = extractReason(body, error?.message);

  if (typeof status !== 'number') {
    throw new Error(
      await describeFailure(`${label}: denial had no HTTP status (not a broker rejection)`, data, error),
    );
  }

  if (![403, 404].includes(status)) {
    throw new Error(
      await describeFailure(`${label}: expected 403/404, got ${status}`, data, error),
    );
  }

  console.log(`[broker-e2e] ${label} -> ${status} "${reason}"`);
  return reason;
}

async function cleanupFixtures(): Promise<string[]> {
  const failures: string[] = [];
  const attempt = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  if (WORKER_EMAIL && WORKER_PASSWORD) {
    await attempt('worker cleanup', async () => {
      const client = await signIn(WORKER_EMAIL, WORKER_PASSWORD);

      if (fixture.applicationId) {
        const { error } = await client.supabase
          .from('app_14da0f1941_job_applications')
          .delete()
          .eq('id', fixture.applicationId);
        throwIfError('Delete QA application', error);
      }

      if (fixture.workerId) {
        await restoreCvState(client.supabase, fixture.workerId, fixture.originalWorkerCv);
      }

      for (const [table, id, label] of [
        ['app_worker_documents', fixture.historicalDocumentId, 'historical document row'],
        ['app_worker_documents', fixture.probeDocumentId, 'probe document row'],
        ['app_worker_certifications', fixture.certInCertsId, 'certificates-bucket certification row'],
        ['app_worker_certifications', fixture.certInDocsId, 'documents-bucket certification row'],
      ] as const) {
        if (!id) continue;
        const { error } = await client.supabase.from(table).delete().eq('id', id);
        throwIfError(`Delete QA ${label}`, error);
      }

      const certBucketPaths = [
        fixture.workerCvPath,
        fixture.historicalDocumentPath,
        fixture.certInCertsPath,
      ].filter(Boolean) as string[];
      if (certBucketPaths.length > 0) {
        const { error } = await client.supabase.storage
          .from(CV_BUCKET)
          .remove(certBucketPaths);
        throwIfError('Delete worker certificates-bucket fixtures', error);
      }

      const docBucketPaths = [
        fixture.probeDocumentPath,
        fixture.certInDocsPath,
      ].filter(Boolean) as string[];
      if (docBucketPaths.length > 0) {
        const { error } = await client.supabase.storage
          .from(WORKER_FILES_BUCKET)
          .remove(docBucketPaths);
        throwIfError('Delete worker documents-bucket fixtures', error);
      }

      await client.supabase.auth.signOut();
    });
  }

  if (SECOND_WORKER_EMAIL && SECOND_WORKER_PASSWORD) {
    await attempt('second worker cleanup', async () => {
      const client = await signIn(SECOND_WORKER_EMAIL, SECOND_WORKER_PASSWORD);

      if (fixture.documentId) {
        const { error } = await client.supabase
          .from('app_worker_documents')
          .delete()
          .eq('id', fixture.documentId);
        throwIfError('Delete QA document row', error);
      }

      if (fixture.certificationId) {
        const { error } = await client.supabase
          .from('app_worker_certifications')
          .delete()
          .eq('id', fixture.certificationId);
        throwIfError('Delete QA certification row', error);
      }

      if (fixture.secondWorkerId) {
        await restoreCvState(client.supabase, fixture.secondWorkerId, fixture.originalSecondWorkerCv);
      }

      if (fixture.secondWorkerCvPath) {
        const { error } = await client.supabase.storage
          .from(CV_BUCKET)
          .remove([fixture.secondWorkerCvPath]);
        throwIfError('Delete second worker CV fixture', error);
      }

      const workerFilePaths = [
        fixture.documentPath,
        fixture.secondWorkerCvWrongBucketPath,
      ].filter(Boolean) as string[];
      if (workerFilePaths.length > 0) {
        const { error } = await client.supabase.storage
          .from(WORKER_FILES_BUCKET)
          .remove(workerFilePaths);
        throwIfError('Delete worker document fixtures', error);
      }

      if (fixture.certificationPath) {
        const { error } = await client.supabase.storage
          .from(CV_BUCKET)
          .remove([fixture.certificationPath]);
        throwIfError('Delete worker certification fixture', error);
      }

      await client.supabase.auth.signOut();
    });
  }

  if (COMPANY_AUTH_EMAIL && COMPANY_AUTH_PASSWORD && fixture.jobId) {
    await attempt('authorized company cleanup', async () => {
      const client = await signIn(COMPANY_AUTH_EMAIL, COMPANY_AUTH_PASSWORD);
      const { error } = await client.supabase
        .from('app_14da0f1941_jobs')
        .delete()
        .eq('id', fixture.jobId);
      throwIfError('Delete QA job', error);
      await client.supabase.auth.signOut();
    });
  }

  return failures;
}

let historicalRecord: { id: string; ownerId: string } | null = null;

test.describe('secure-file-access broker', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);

    requireEnv('E2E_WORKER_EMAIL', WORKER_EMAIL);
    requireEnv('E2E_WORKER_PASSWORD', WORKER_PASSWORD);
    requireEnv('E2E_SECOND_WORKER_EMAIL', SECOND_WORKER_EMAIL);
    requireEnv('E2E_SECOND_WORKER_PASSWORD', SECOND_WORKER_PASSWORD);
    requireEnv('E2E_COMPANY_AUTHORIZED_EMAIL', COMPANY_AUTH_EMAIL);
    requireEnv('E2E_COMPANY_AUTHORIZED_PASSWORD', COMPANY_AUTH_PASSWORD);
    requireEnv('E2E_COMPANY_UNAUTHORIZED_EMAIL', COMPANY_UNAUTH_EMAIL);
    requireEnv('E2E_COMPANY_UNAUTHORIZED_PASSWORD', COMPANY_UNAUTH_PASSWORD);
    requireEnv('E2E_ADMIN_EMAIL', ADMIN_EMAIL);
    requireEnv('E2E_ADMIN_PASSWORD', ADMIN_PASSWORD);
    requireEnv('VITE_SUPABASE_URL', SUPABASE_URL);
    requireEnv('VITE_SUPABASE_ANON_KEY', SUPABASE_ANON_KEY);

    try {
      const worker = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
      const secondWorker = await signIn(SECOND_WORKER_EMAIL!, SECOND_WORKER_PASSWORD!);
      const authorizedCompany = await signIn(COMPANY_AUTH_EMAIL!, COMPANY_AUTH_PASSWORD!);

      fixture.workerId = worker.user.id;
      fixture.secondWorkerId = secondWorker.user.id;
      fixture.authorizedCompanyId = authorizedCompany.user.id;
      fixture.originalWorkerCv = await readCvState(worker.supabase, worker.user.id);
      fixture.originalSecondWorkerCv = await readCvState(secondWorker.supabase, secondWorker.user.id);

      const workerCvName = `e2e-broker-${RUN_TOKEN}-worker-cv.pdf`;
      const secondWorkerCvName = `e2e-broker-${RUN_TOKEN}-second-worker-cv.pdf`;
      fixture.workerCvPath = `${worker.user.id}/${workerCvName}`;
      fixture.secondWorkerCvPath = `${secondWorker.user.id}/${secondWorkerCvName}`;

      await uploadFixture(worker.supabase, CV_BUCKET, fixture.workerCvPath, 'worker CV');
      await setCvFixture(worker.supabase, worker.user.id, fixture.workerCvPath, workerCvName);

      await uploadFixture(secondWorker.supabase, CV_BUCKET, fixture.secondWorkerCvPath, 'second worker CV');
      await setCvFixture(
        secondWorker.supabase,
        secondWorker.user.id,
        fixture.secondWorkerCvPath,
        secondWorkerCvName,
      );

      const documentName = `e2e-broker-${RUN_TOKEN}-document.pdf`;
      const certificationName = `e2e-broker-${RUN_TOKEN}-certification.pdf`;
      fixture.documentPath = `${secondWorker.user.id}/${documentName}`;
      fixture.certificationPath = `${secondWorker.user.id}/${certificationName}`;

      await uploadFixture(secondWorker.supabase, WORKER_FILES_BUCKET, fixture.documentPath, 'worker document');
      // Certifications are canonical in the certificates bucket.
      await uploadFixture(secondWorker.supabase, CV_BUCKET, fixture.certificationPath, 'worker certification');

      const { data: document, error: documentError } = await secondWorker.supabase
        .from('app_worker_documents')
        .insert({
          user_id: secondWorker.user.id,
          document_name: 'QA Broker Document',
          document_type: 'qa_fixture',
          file_name: documentName,
          mime_type: 'application/pdf',
          notes: `${FIXTURE_TAG} ${RUN_TOKEN}`,
          is_visible: true,
          visible_to_companies: true,
          storage_bucket: WORKER_FILES_BUCKET,
          storage_path: fixture.documentPath,
        })
        .select('id')
        .single();
      throwIfError('Insert QA document row', documentError);
      if (!document?.id) throw new Error('QA document insert returned no id');
      fixture.documentId = document.id;

      const { data: certification, error: certificationError } = await secondWorker.supabase
        .from('app_worker_certifications')
        .insert({
          user_id: secondWorker.user.id,
          certification_name: 'QA Broker Certification',
          issuing_organization: 'PipingBox QA',
          file_name: certificationName,
          document_name: 'QA Broker Certification',
          notes: `${FIXTURE_TAG} ${RUN_TOKEN}`,
          is_visible: true,
          visible_to_companies: true,
          is_verified: false,
          storage_bucket: CV_BUCKET,
          storage_path: fixture.certificationPath,
        })
        .select('id')
        .single();
      throwIfError('Insert QA certification row', certificationError);
      if (!certification?.id) throw new Error('QA certification insert returned no id');
      fixture.certificationId = certification.id;

      /* Allowlist fixtures, all owned by worker A so the company-relationship
       * tests below apply to them. Every object is uploaded by its own owner,
       * so Storage writes the correct owner_id and the ownership RPC passes. */
      const historicalDocumentName = `e2e-broker-${RUN_TOKEN}-historical-document.pdf`;
      const probeDocumentName = `e2e-broker-${RUN_TOKEN}-probe-document.pdf`;
      const certInCertsName = `e2e-broker-${RUN_TOKEN}-cert-in-certificates.pdf`;
      const certInDocsName = `e2e-broker-${RUN_TOKEN}-cert-in-documents.pdf`;
      fixture.historicalDocumentPath = `${worker.user.id}/${historicalDocumentName}`;
      fixture.probeDocumentPath = `${worker.user.id}/${probeDocumentName}`;
      fixture.certInCertsPath = `${worker.user.id}/${certInCertsName}`;
      fixture.certInDocsPath = `${worker.user.id}/${certInDocsName}`;

      // Reproduces the real historical layout: a document in the certificates
      // bucket, exactly like the 16 records that predate the bucket split.
      await uploadFixture(worker.supabase, CV_BUCKET, fixture.historicalDocumentPath, 'historical document');
      await uploadFixture(worker.supabase, WORKER_FILES_BUCKET, fixture.probeDocumentPath, 'probe document');
      await uploadFixture(worker.supabase, CV_BUCKET, fixture.certInCertsPath, 'certification in certificates');
      await uploadFixture(worker.supabase, WORKER_FILES_BUCKET, fixture.certInDocsPath, 'certification in documents');

      const insertDocument = async (
        name: string,
        bucket: string,
        path: string,
        label: string,
      ) => {
        const { data, error } = await worker.supabase
          .from('app_worker_documents')
          .insert({
            user_id: worker.user.id,
            document_name: label,
            document_type: 'qa_fixture',
            file_name: name,
            mime_type: 'application/pdf',
            notes: `${FIXTURE_TAG} ${RUN_TOKEN}`,
            is_visible: true,
            visible_to_companies: true,
            storage_bucket: bucket,
            storage_path: path,
          })
          .select('id')
          .single();
        throwIfError(`Insert ${label}`, error);
        if (!data?.id) throw new Error(`${label} insert returned no id`);
        return data.id as string;
      };

      const insertCertification = async (
        name: string,
        bucket: string,
        path: string,
        label: string,
      ) => {
        const { data, error } = await worker.supabase
          .from('app_worker_certifications')
          .insert({
            user_id: worker.user.id,
            certification_name: label,
            issuing_organization: 'PipingBox QA',
            file_name: name,
            document_name: label,
            notes: `${FIXTURE_TAG} ${RUN_TOKEN}`,
            is_visible: true,
            visible_to_companies: true,
            is_verified: false,
            storage_bucket: bucket,
            storage_path: path,
          })
          .select('id')
          .single();
        throwIfError(`Insert ${label}`, error);
        if (!data?.id) throw new Error(`${label} insert returned no id`);
        return data.id as string;
      };

      fixture.historicalDocumentId = await insertDocument(
        historicalDocumentName, CV_BUCKET, fixture.historicalDocumentPath,
        'QA Historical Layout Document',
      );
      fixture.probeDocumentId = await insertDocument(
        probeDocumentName, WORKER_FILES_BUCKET, fixture.probeDocumentPath,
        'QA Canonical Document',
      );
      fixture.certInCertsId = await insertCertification(
        certInCertsName, CV_BUCKET, fixture.certInCertsPath,
        'QA Certification In Certificates Bucket',
      );
      fixture.certInDocsId = await insertCertification(
        certInDocsName, WORKER_FILES_BUCKET, fixture.certInDocsPath,
        'QA Certification In Documents Bucket',
      );

      const jobTitle = `QA Broker Access ${RUN_TOKEN}`;
      const companyName = `PipingBox QA ${RUN_TOKEN}`;
      const { data: job, error: jobError } = await authorizedCompany.supabase
        .from('app_14da0f1941_jobs')
        .insert({
          posted_by: authorizedCompany.user.id,
          company_user_id: authorizedCompany.user.id,
          title: jobTitle,
          company: companyName,
          company_name: companyName,
          location: 'QA Automation',
          status: 'open',
        })
        .select('id')
        .single();
      throwIfError('Insert QA company job', jobError);
      if (!job?.id) throw new Error('QA job insert returned no id');
      fixture.jobId = job.id;

      const { data: application, error: applicationError } = await worker.supabase
        .from('app_14da0f1941_job_applications')
        .insert({
          user_id: worker.user.id,
          job_id: job.id,
          company_user_id: authorizedCompany.user.id,
          job_title: jobTitle,
          company_name: companyName,
          location: 'QA Automation',
          status: 'applied',
        })
        .select('id')
        .single();
      throwIfError('Insert QA worker application', applicationError);
      if (!application?.id) throw new Error('QA application insert returned no id');
      fixture.applicationId = application.id;

      // Read back exactly what isCompanyAuthorized() looks for, so a company
      // rejection can be attributed to the broker rather than to a fixture that
      // silently failed to persist the relationship columns.
      const { data: relationCheck, error: relationError } = await worker.supabase
        .from('app_14da0f1941_job_applications')
        .select('id, user_id, job_id, company_user_id, status')
        .eq('id', application.id)
        .maybeSingle();

      console.log(
        '[broker-e2e] authorization fixture:\n' +
        `  worker_user_id:   ${worker.user.id}\n` +
        `  company_user_id:  ${authorizedCompany.user.id}\n` +
        `  job_id:           ${job.id}\n` +
        `  application_id:   ${application.id}\n` +
        `  read-back:        ${relationCheck ? JSON.stringify(relationCheck) : '(none)'}\n` +
        `  read-back error:  ${relationError?.message ?? '(none)'}`,
      );

      if (relationCheck && relationCheck.company_user_id !== authorizedCompany.user.id) {
        throw new Error(
          'QA application persisted without the expected company_user_id: got ' +
          `${relationCheck.company_user_id}, expected ${authorizedCompany.user.id}. ` +
          'The authorization fixture is invalid, so a company denial would be inconclusive.',
        );
      }

      await worker.supabase.auth.signOut();
      await secondWorker.supabase.auth.signOut();
      await authorizedCompany.supabase.auth.signOut();
    } catch (error) {
      const cleanupFailures = await cleanupFixtures();
      if (cleanupFailures.length > 0) {
        console.error('Fixture cleanup after setup failure:', cleanupFailures.join(' | '));
      }
      throw error;
    }
  });

  test.afterAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    const failures = await cleanupFixtures();
    if (failures.length > 0) {
      throw new Error(`Broker E2E fixture cleanup failed: ${failures.join(' | ')}`);
    }
  });

  test('owner can retrieve a signed URL for their CV', async () => {
    const client = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: fixture.workerId, file_type: 'cv' },
    });

    await assertSignedUrl('owner CV', data, error);
    await client.supabase.auth.signOut();
  });

  test('authorized company can retrieve a signed URL for a visible CV', async () => {
    const client = await signIn(COMPANY_AUTH_EMAIL!, COMPANY_AUTH_PASSWORD!);

    // Gate run #2 returned 403 "Company not authorized to access this candidate"
    // while the fixture read-back showed the exact row isCompanyAuthorized()
    // looks for. That narrows the failure to relationship resolution, so replay
    // the broker's first query from here to tell "the data is wrong" apart from
    // "the broker cannot see correct data".
    //
    // The broker runs this with service_role; this client is the company under
    // RLS, so an empty result is only conclusive when paired with the error.
    const probe = await client.supabase
      .from('app_14da0f1941_job_applications')
      .select('id, user_id, company_user_id')
      .eq('user_id', fixture.workerId)
      .eq('company_user_id', client.user.id)
      .limit(1);

    console.log(
      '[broker-e2e] relationship probe (as company, under RLS):\n' +
      `  viewer id (jwt):      ${client.user.id}\n` +
      `  fixture company id:   ${fixture.authorizedCompanyId ?? '(unset)'}\n` +
      `  candidate id queried: ${fixture.workerId}\n` +
      `  rows:  ${probe.data ? JSON.stringify(probe.data) : '(none)'}\n` +
      `  error: ${probe.error?.message ?? '(none)'}`,
    );

    // If the JWT identity differs from the id used to build the fixture, the
    // broker is right to reject and the fixture is the defect.
    if (fixture.authorizedCompanyId && client.user.id !== fixture.authorizedCompanyId) {
      throw new Error(
        `Company JWT identity (${client.user.id}) differs from the id used to build the ` +
        `authorization fixture (${fixture.authorizedCompanyId}). The broker rejection is ` +
        'correct; the fixture is invalid.',
      );
    }

    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: fixture.workerId, file_type: 'cv' },
    });

    await assertSignedUrl('authorized company CV', data, error);
    await client.supabase.auth.signOut();
  });

  test('unauthorized company is denied access', async () => {
    const client = await signIn(COMPANY_UNAUTH_EMAIL!, COMPANY_UNAUTH_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: fixture.workerId, file_type: 'cv' },
    });

    await assertDenied('unauthorized company CV', data, error);
    await client.supabase.auth.signOut();
  });

  test('non-owner worker is denied access to another worker visible CV', async () => {
    const client = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: fixture.secondWorkerId, file_type: 'cv' },
    });

    await assertDenied('non-owner worker -> other CV', data, error);
    await client.supabase.auth.signOut();
  });

  test('non-owner worker is denied access to another worker document', async () => {
    const owner = await signIn(SECOND_WORKER_EMAIL!, SECOND_WORKER_PASSWORD!);
    const ownerResult = await owner.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.secondWorkerId,
        file_type: 'document',
        record_id: fixture.documentId,
      },
    });
    await assertSignedUrl('owner document', ownerResult.data, ownerResult.error);
    await owner.supabase.auth.signOut();

    const attacker = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { data, error } = await attacker.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.secondWorkerId,
        file_type: 'document',
        record_id: fixture.documentId,
      },
    });
    await assertDenied('non-owner worker -> other document', data, error);
    await attacker.supabase.auth.signOut();
  });

  test('non-owner worker is denied access to another worker certification', async () => {
    const owner = await signIn(SECOND_WORKER_EMAIL!, SECOND_WORKER_PASSWORD!);
    const ownerResult = await owner.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.secondWorkerId,
        file_type: 'certification',
        record_id: fixture.certificationId,
      },
    });
    await assertSignedUrl('owner certification', ownerResult.data, ownerResult.error);
    await owner.supabase.auth.signOut();

    const attacker = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { data, error } = await attacker.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.secondWorkerId,
        file_type: 'certification',
        record_id: fixture.certificationId,
      },
    });
    await assertDenied('non-owner worker -> other certification', data, error);
    await attacker.supabase.auth.signOut();
  });

  test('legitimate admin can retrieve a signed URL for a worker CV', async () => {
    const client = await signIn(ADMIN_EMAIL!, ADMIN_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: fixture.workerId, file_type: 'cv' },
    });

    await assertSignedUrl('admin CV', data, error);
    await client.supabase.auth.signOut();
  });

  test('broker denies a CV path inside owner namespace when the storage object does not exist', async () => {
    const client = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const missingPath = `${fixture.workerId}/e2e-broker-${RUN_TOKEN}-missing.pdf`;

    try {
      const { error: updateError } = await client.supabase
        .from('app_14da0f1941_profiles')
        .update({
          cv_storage_bucket: CV_BUCKET,
          cv_storage_path: missingPath,
        })
        .eq('user_id', fixture.workerId);
      throwIfError('Point CV metadata at missing object', updateError);

      const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
        body: { owner_user_id: fixture.workerId, file_type: 'cv' },
      });
      await assertDenied('CV metadata pointing at missing object', data, error);
    } finally {
      const { error } = await client.supabase
        .from('app_14da0f1941_profiles')
        .update({
          cv_storage_bucket: CV_BUCKET,
          cv_storage_path: fixture.workerCvPath,
        })
        .eq('user_id', fixture.workerId);
      throwIfError('Restore active CV fixture after integrity test', error);
      await client.supabase.auth.signOut();
    }
  });

  /* ---------------------------------------------------------------------- *
   * PB-STORAGE-SECURITY-001 phase 2 — canonical-only records.
   *
   * Writers no longer mint public URLs, so a record created today has
   * storage_bucket/storage_path set and its legacy *_file_url NULL. These tests
   * prove such a record is fully functional end to end: the broker signs it for
   * whoever is entitled, and denies everyone else, without any legacy URL to
   * fall back on.
   * ---------------------------------------------------------------------- */

  test('canonical-only document and certification carry no legacy URL and are brokered to their owner', async () => {
    const client = await signIn(SECOND_WORKER_EMAIL!, SECOND_WORKER_PASSWORD!);

    const { data: document, error: documentError } = await client.supabase
      .from('app_worker_documents')
      .select('storage_bucket, storage_path, file_url')
      .eq('id', fixture.documentId)
      .single();
    throwIfError('Read canonical document fixture', documentError);

    expect(document?.storage_bucket, 'document bucket').toBe(WORKER_FILES_BUCKET);
    expect(document?.storage_path, 'document path').toBe(fixture.documentPath);
    expect(document?.file_url, 'document must carry no legacy URL').toBeNull();

    const { data: certification, error: certificationError } = await client.supabase
      .from('app_worker_certifications')
      .select('storage_bucket, storage_path, file_url, certificate_file_url')
      .eq('id', fixture.certificationId)
      .single();
    throwIfError('Read canonical certification fixture', certificationError);

    expect(certification?.storage_bucket, 'certification bucket').toBe(CV_BUCKET);
    expect(certification?.storage_path, 'certification path').toBe(fixture.certificationPath);
    expect(certification?.file_url, 'certification must carry no legacy URL').toBeNull();
    expect(
      certification?.certificate_file_url,
      'certification must carry no legacy certificate URL',
    ).toBeNull();

    const documentAccess = await client.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.secondWorkerId,
        file_type: 'document',
        record_id: fixture.documentId,
      },
    });
    await assertSignedUrl('owner canonical document', documentAccess.data, documentAccess.error);

    const certificationAccess = await client.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.secondWorkerId,
        file_type: 'certification',
        record_id: fixture.certificationId,
      },
    });
    await assertSignedUrl(
      'owner canonical certification',
      certificationAccess.data,
      certificationAccess.error,
    );

    await client.supabase.auth.signOut();
  });

  test('a CV with no legacy URL is still signed for the owner and the authorized company', async () => {
    const owner = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { error: clearError } = await owner.supabase
      .from('app_14da0f1941_profiles')
      .update({ cv_file_url: null })
      .eq('user_id', fixture.workerId);
    throwIfError('Clear legacy CV URL for the canonical fixture', clearError);

    const { data: profile, error: readError } = await owner.supabase
      .from('app_14da0f1941_profiles')
      .select('cv_storage_bucket, cv_storage_path, cv_file_url')
      .eq('user_id', fixture.workerId)
      .single();
    throwIfError('Read canonical CV fixture', readError);
    expect(profile?.cv_file_url, 'CV must carry no legacy URL').toBeNull();
    expect(profile?.cv_storage_bucket, 'CV bucket').toBe(CV_BUCKET);
    expect(profile?.cv_storage_path, 'CV path').toBe(fixture.workerCvPath);

    const ownerAccess = await owner.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: fixture.workerId, file_type: 'cv' },
    });
    await assertSignedUrl('owner canonical CV', ownerAccess.data, ownerAccess.error);
    await owner.supabase.auth.signOut();

    const company = await signIn(COMPANY_AUTH_EMAIL!, COMPANY_AUTH_PASSWORD!);
    const companyAccess = await company.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: fixture.workerId, file_type: 'cv' },
    });
    await assertSignedUrl('authorized company canonical CV', companyAccess.data, companyAccess.error);
    await company.supabase.auth.signOut();
  });

  test('a CV with no legacy URL is still denied to an unauthorized company', async () => {
    const client = await signIn(COMPANY_UNAUTH_EMAIL!, COMPANY_UNAUTH_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: fixture.workerId, file_type: 'cv' },
    });

    await assertDenied('unauthorized company canonical CV', data, error);
    await client.supabase.auth.signOut();
  });

  /* ------------------------------------------------------------------------
   * Bucket allowlist (PB-STORAGE-SECURITY-001 P0B).
   *
   * Documents accept two buckets: worker-documents for everything new, and the
   * certificates bucket as a documented compatibility exception for the 16
   * historical records. CVs and certifications accept the certificates bucket
   * only. Everything else is refused before the broker ever reaches Storage.
   * ---------------------------------------------------------------------- */

  test('owner can retrieve a historical document stored in the certificates bucket', async () => {
    const client = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);

    const { data: row, error: readError } = await client.supabase
      .from('app_worker_documents')
      .select('storage_bucket, storage_path')
      .eq('id', fixture.historicalDocumentId)
      .single();
    throwIfError('Read historical document fixture', readError);
    expect(row?.storage_bucket, 'historical document bucket').toBe(CV_BUCKET);

    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.workerId,
        file_type: 'document',
        record_id: fixture.historicalDocumentId,
      },
    });

    await assertSignedUrl('owner historical document', data, error);
    await client.supabase.auth.signOut();
  });

  test('authorized company can retrieve a visible historical document', async () => {
    const client = await signIn(COMPANY_AUTH_EMAIL!, COMPANY_AUTH_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.workerId,
        file_type: 'document',
        record_id: fixture.historicalDocumentId,
      },
    });

    await assertSignedUrl('authorized company historical document', data, error);
    await client.supabase.auth.signOut();
  });

  test('unauthorized company is denied a historical document', async () => {
    const client = await signIn(COMPANY_UNAUTH_EMAIL!, COMPANY_UNAUTH_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.workerId,
        file_type: 'document',
        record_id: fixture.historicalDocumentId,
      },
    });

    await assertDenied('unauthorized company historical document', data, error);
    await client.supabase.auth.signOut();
  });

  test('a second worker is denied a historical document', async () => {
    const client = await signIn(SECOND_WORKER_EMAIL!, SECOND_WORKER_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.workerId,
        file_type: 'document',
        record_id: fixture.historicalDocumentId,
      },
    });

    await assertDenied('second worker historical document', data, error);
    await client.supabase.auth.signOut();
  });

  test('owner can retrieve a canonical document in the worker-documents bucket', async () => {
    const client = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.workerId,
        file_type: 'document',
        record_id: fixture.probeDocumentId,
      },
    });

    await assertSignedUrl('owner canonical document in worker-documents', data, error);
    await client.supabase.auth.signOut();
  });

  test('owner can retrieve a certification stored in the certificates bucket', async () => {
    const client = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.workerId,
        file_type: 'certification',
        record_id: fixture.certInCertsId,
      },
    });

    await assertSignedUrl('owner certification in certificates bucket', data, error);
    await client.supabase.auth.signOut();
  });

  test('a certification in the worker-documents bucket is denied even to its owner', async () => {
    const client = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.workerId,
        file_type: 'certification',
        record_id: fixture.certInDocsId,
      },
    });

    const reason = await assertDenied('owner certification in wrong bucket', data, error);
    expect(reason).toContain('Bucket not allowed');
    await client.supabase.auth.signOut();
  });

  test('a CV in the worker-documents bucket is denied even to its owner', async () => {
    const client = await signIn(SECOND_WORKER_EMAIL!, SECOND_WORKER_PASSWORD!);
    const wrongBucketName = `e2e-broker-${RUN_TOKEN}-cv-wrong-bucket.pdf`;
    fixture.secondWorkerCvWrongBucketPath = `${fixture.secondWorkerId}/${wrongBucketName}`;

    // A real object, correctly owned, in a bucket CVs must never be read from:
    // the denial can only come from the allowlist.
    await uploadFixture(
      client.supabase,
      WORKER_FILES_BUCKET,
      fixture.secondWorkerCvWrongBucketPath,
      'CV in wrong bucket',
    );

    const { error: pointError } = await client.supabase
      .from('app_14da0f1941_profiles')
      .update({
        cv_storage_bucket: WORKER_FILES_BUCKET,
        cv_storage_path: fixture.secondWorkerCvWrongBucketPath,
      })
      .eq('user_id', fixture.secondWorkerId);
    throwIfError('Point second worker CV at the wrong bucket', pointError);

    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: fixture.secondWorkerId, file_type: 'cv' },
    });

    const reason = await assertDenied('owner CV in wrong bucket', data, error);
    expect(reason).toContain('Bucket not allowed');

    // Restore the valid CV fixture so later tests are unaffected.
    const { error: restoreError } = await client.supabase
      .from('app_14da0f1941_profiles')
      .update({
        cv_storage_bucket: CV_BUCKET,
        cv_storage_path: fixture.secondWorkerCvPath,
      })
      .eq('user_id', fixture.secondWorkerId);
    throwIfError('Restore second worker CV fixture', restoreError);

    await client.supabase.auth.signOut();
  });

  test('a document pointing at an arbitrary third bucket is denied', async () => {
    const client = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { error: pointError } = await client.supabase
      .from('app_worker_documents')
      .update({ storage_bucket: 'pb-arbitrary-bucket' })
      .eq('id', fixture.probeDocumentId);
    throwIfError('Point probe document at an arbitrary bucket', pointError);

    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.workerId,
        file_type: 'document',
        record_id: fixture.probeDocumentId,
      },
    });

    const reason = await assertDenied('document in arbitrary bucket', data, error);
    expect(reason).toContain('Bucket not allowed');

    const { error: restoreError } = await client.supabase
      .from('app_worker_documents')
      .update({ storage_bucket: WORKER_FILES_BUCKET })
      .eq('id', fixture.probeDocumentId);
    throwIfError('Restore probe document bucket', restoreError);
    await client.supabase.auth.signOut();
  });

  test('a document pointing at a missing object is denied', async () => {
    const client = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const missingPath = `${fixture.workerId}/e2e-broker-${RUN_TOKEN}-missing.pdf`;
    const { error: pointError } = await client.supabase
      .from('app_worker_documents')
      .update({ storage_path: missingPath })
      .eq('id', fixture.probeDocumentId);
    throwIfError('Point probe document at a missing object', pointError);

    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.workerId,
        file_type: 'document',
        record_id: fixture.probeDocumentId,
      },
    });

    const reason = await assertDenied('document with missing object', data, error);
    expect(reason).toContain('ownership mismatch');

    const { error: restoreError } = await client.supabase
      .from('app_worker_documents')
      .update({ storage_path: fixture.probeDocumentPath })
      .eq('id', fixture.probeDocumentId);
    throwIfError('Restore probe document path', restoreError);
    await client.supabase.auth.signOut();
  });

  test('a document pointing at another user object is denied', async () => {
    const client = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);

    // Points at a real, existing object that belongs to the second worker. The
    // path is outside the owner namespace, which is refused before Storage is
    // consulted at all.
    const { error: pointError } = await client.supabase
      .from('app_worker_documents')
      .update({ storage_path: fixture.documentPath })
      .eq('id', fixture.probeDocumentId);
    throwIfError('Point probe document at another user object', pointError);

    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.workerId,
        file_type: 'document',
        record_id: fixture.probeDocumentId,
      },
    });

    const reason = await assertDenied('document owned by another user', data, error);
    expect(reason).toMatch(/owner namespace|ownership mismatch/);

    const { error: restoreError } = await client.supabase
      .from('app_worker_documents')
      .update({ storage_path: fixture.probeDocumentPath })
      .eq('id', fixture.probeDocumentId);
    throwIfError('Restore probe document path', restoreError);
    await client.supabase.auth.signOut();
  });

  /* ------------------------------------------------------------------------
   * Real historical data.
   *
   * Every test above builds its own fixture, which is precisely why none of
   * them caught the deployed v3 refusing real records. These two exercise an
   * actual pre-existing production document that still lives in the
   * certificates bucket.
   *
   * The owner's own session cannot be used: all 16 historical documents belong
   * to real end users, and this suite has no password for them -- fabricating
   * one would be impersonation. A legitimately privileged admin is the closest
   * authorized viewer available, and the unauthorized-company counter-test
   * below proves the widened allowlist did not open the record up to everyone.
   *
   * Read-only: inserts nothing, updates nothing, deletes nothing, touches no
   * Storage object, and never prints a signed URL or its token.
   * ---------------------------------------------------------------------- */

  /** Picks a real historical document belonging to somebody else. */
  async function selectHistoricalDocument(
    supabase: SupabaseClient,
    viewerId: string,
  ): Promise<{ id: string; user_id: string; storage_path: string; created_at: string }> {
    const { data: rows, error } = await supabase
      .from('app_worker_documents')
      .select('id, user_id, document_name, document_type, notes, storage_bucket, storage_path, created_at, is_visible')
      .eq('storage_bucket', CV_BUCKET)
      .neq('user_id', viewerId)
      .order('created_at', { ascending: true });
    throwIfError('Query historical documents', error);

    // Never select a fixture this suite created itself.
    const candidates = (rows ?? []).filter((row) => {
      const haystack = [row.document_name, row.document_type, row.notes, row.storage_path]
        .filter(Boolean)
        .join(' ');
      const isFixture = ['qa_fixture', 'e2e-broker-', FIXTURE_TAG].some((marker) =>
        haystack.includes(marker),
      );
      return !isFixture && row.is_visible !== false;
    });

    expect(candidates.length, 'no pre-existing historical document available').toBeGreaterThan(0);
    const target = candidates[0];
    expect(target.storage_bucket, 'historical bucket').toBe(CV_BUCKET);
    expect(
      target.storage_path?.startsWith(`${target.user_id}/`),
      'historical path inside owner namespace',
    ).toBe(true);
    console.log(
      `Historical document selected: id=${target.id} bucket=${target.storage_bucket} created=${target.created_at}`,
    );
    return target as { id: string; user_id: string; storage_path: string; created_at: string };
  }

  test('a legitimate admin retrieves a real pre-existing historical document', async () => {
    const client = await signIn(ADMIN_EMAIL!, ADMIN_PASSWORD!);
    const target = await selectHistoricalDocument(client.supabase, client.user.id);
    historicalRecord = { id: target.id, ownerId: target.user_id };

    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: target.user_id,
        file_type: 'document',
        record_id: target.id,
      },
    });

    if (error || !data?.signedUrl) {
      throw new Error(
        await describeFailure('real historical document: expected a signed URL', data, error),
      );
    }

    const signedUrl = data.signedUrl as string;
    // Assert the URL shape without logging the token.
    expect(signedUrl).toMatch(/[?&]token=/);
    expect(signedUrl).toContain('/object/sign/');
    expect(signedUrl).not.toContain('/object/public/');
    expect(signedUrl).toContain(CV_BUCKET);

    const response = await fetch(signedUrl, { method: 'GET' });
    expect(response.status, 'signed URL must return HTTP 200').toBe(200);
    const bytes = (await response.arrayBuffer()).byteLength;
    expect(bytes, 'signed URL must serve a non-empty object').toBeGreaterThan(0);
    console.log(`Signed URL served ${bytes} bytes over a private /object/sign/ path.`);

    // The same object must not be reachable through the legacy public path.
    const publicAttempt = signedUrl.replace('/object/sign/', '/object/public/').split('?')[0];
    const publicResponse = await fetch(publicAttempt, { method: 'GET' });
    expect(
      publicResponse.status,
      'legacy public path must not serve the object',
    ).toBeGreaterThanOrEqual(400);
    console.log(`Legacy public path rejected with HTTP ${publicResponse.status}.`);

    await client.supabase.auth.signOut();
  });

  test('an unauthorized company is denied that same real historical document', async () => {
    expect(historicalRecord, 'historical record must have been selected').not.toBeNull();
    const client = await signIn(COMPANY_UNAUTH_EMAIL!, COMPANY_UNAUTH_PASSWORD!);

    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: historicalRecord!.ownerId,
        file_type: 'document',
        record_id: historicalRecord!.id,
      },
    });

    await assertDenied('unauthorized company on real historical document', data, error);
    await client.supabase.auth.signOut();
  });

  test('authenticated user cannot execute pb_verify_storage_object_ownership RPC directly', async () => {
    const client = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { data, error } = await client.supabase.rpc('pb_verify_storage_object_ownership', {
      p_bucket_name: CV_BUCKET,
      p_path: fixture.workerCvPath,
      p_owner_user_id: fixture.workerId,
    });

    expect(error).not.toBeNull();
    expect(String(error?.message || data).toLowerCase()).toMatch(
      /permission denied|not authorized|unauthorized/,
    );

    await client.supabase.auth.signOut();
  });
});

/* ===========================================================================
 * Production writer smoke — PB-STORAGE-SECURITY-001 frontend cutover.
 *
 * Everything above drives the broker directly and builds its fixtures through
 * supabase-js. That proves the read path, and proves nothing about what the
 * deployed frontend actually writes.
 *
 * This block exercises the reachable frontend writers through the deployed UI
 * and then inspects the rows they produced. It is what catches a writer that
 * still persists a public URL, or one that targets the wrong bucket.
 *
 * Lives in this file, and not in a dedicated spec, because adding a workflow
 * requires a `workflow` OAuth scope this environment does not have. The gate
 * that runs this file accepts `passed > 0` with zero skips, so hosting the
 * smoke here does not weaken its acceptance.
 *
 * Serial and self-cleaning: every row and Storage object it creates is removed
 * in afterAll, and the worker's original CV state is restored.
 *
 * Not covered on purpose: CertificationDialog. `CertificationList`, its only
 * consumer, is exported but never rendered anywhere in the app, so that writer
 * is not operationally reachable through the UI. Its bucket target and
 * canonical-metadata contract are pinned by the static guards in
 * reader-cutover.spec.ts instead.
 * ========================================================================= */

test.describe.serial('production writer smoke through the deployed frontend', () => {
  const WRITER_TOKEN = `pbws-${RUN_TOKEN}`;
  let writerUserId = '';
  let originalCv: CvState | undefined;

  const created: {
    cvPath?: string;
    documentId?: string;
    documentPath?: string;
    certificationId?: string;
    certificationPath?: string;
  } = {};

  /**
   * The QA account's UI language is not fixed, and a locale-specific label is
   * exactly what hung the first run of this smoke: an English-only regex waits
   * for a button that renders in another language until the test times out.
   *
   * So the labels come from the app's own translation files: every locale's
   * value for the key becomes an alternative. If a translation changes, the
   * locator follows it.
   */
  function localizedLabelRegex(dottedKey: string): RegExp {
    const dir = path.join(process.cwd(), 'app/frontend/src/i18n/locales');
    const variants = new Set<string>();

    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.json'))) {
      const bundle = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      const value = dottedKey
        .split('.')
        .reduce<any>((node, key) => (node == null ? node : node[key]), bundle);
      if (typeof value === 'string' && value.trim()) variants.add(value.trim());
    }

    if (variants.size === 0) throw new Error(`No translation found for ${dottedKey}`);
    const alternatives = [...variants].map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(alternatives.join('|'), 'i');
  }

  function pdfBuffer(label: string): Buffer {
    return Buffer.from(
      `%PDF-1.4\n% PipingBox production writer smoke: ${label}\n1 0 obj<< /Type /Catalog >>endobj\ntrailer<<>>\n%%EOF\n`,
      'utf-8',
    );
  }

  async function workerClient() {
    return signIn(
      requireEnv('E2E_WORKER_EMAIL', WORKER_EMAIL),
      requireEnv('E2E_WORKER_PASSWORD', WORKER_PASSWORD),
    );
  }

  async function loginUi(page: any) {
    await page.goto('/login');
    await page.locator('#email').fill(WORKER_EMAIL!);
    await page.locator('#password').fill(WORKER_PASSWORD!);
    await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await page.goto('/profile');
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 20_000 });
  }

  /**
   * Opens an "add" dialog from a profile section. Every wait has an explicit
   * timeout so a locator that no longer matches fails in seconds with the
   * offending selector, instead of consuming the whole test budget in silence.
   */
  async function openAddDialog(page: any, addKey: string, step: string) {
    const trigger = page.getByRole('button', { name: localizedLabelRegex(addKey) }).first();
    await expect(trigger, `${step}: add trigger must be present`).toBeVisible({ timeout: 30_000 });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click({ timeout: 15_000 });

    const dialog = page.getByRole('dialog');
    await expect(dialog, `${step}: dialog must open`).toBeVisible({ timeout: 20_000 });
    console.log(`[writer-smoke] ${step}: dialog open`);
    return dialog;
  }

  /** Submits a dialog form and surfaces any toast text if it refuses to close. */
  async function submitDialog(page: any, dialog: any, step: string) {
    await dialog.locator('button[type="submit"]').first().click({ timeout: 15_000 });
    try {
      await expect(dialog).toBeHidden({ timeout: 60_000 });
    } catch (err) {
      const toasts = await page
        .locator('[data-sonner-toast], [role="status"], [role="alert"]')
        .allInnerTexts()
        .catch(() => [] as string[]);
      throw new Error(
        `${step}: the dialog never closed after submit. Visible notifications: ${
          toasts.length ? JSON.stringify(toasts) : '(none)'
        }`,
      );
    }
    console.log(`[writer-smoke] ${step}: submitted`);
  }

  /** The signed URL must be private and must actually serve bytes. */
  async function assertBrokerServesPrivately(
    client: Awaited<ReturnType<typeof signIn>>,
    label: string,
    body: Record<string, unknown>,
  ) {
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', { body });
    await assertSignedUrl(label, data, error);

    const signedUrl = data.signedUrl as string;
    expect(signedUrl).toContain('/object/sign/');
    const response = await fetch(signedUrl, { method: 'GET' });
    expect(response.status, `${label}: signed URL must return HTTP 200`).toBe(200);
    expect(
      (await response.arrayBuffer()).byteLength,
      `${label}: signed URL must serve a non-empty object`,
    ).toBeGreaterThan(0);
    console.log(`[writer-smoke] ${label}: broker served a private signed URL`);
  }

  test.beforeAll(async () => {
    const client = await workerClient();
    writerUserId = client.user.id;
    originalCv = await readCvState(client.supabase, writerUserId);
    await client.supabase.auth.signOut();
  });

  test.afterAll(async () => {
    const client = await workerClient();

    if (created.documentId) {
      await client.supabase.from('app_worker_documents').delete().eq('id', created.documentId);
    }
    if (created.certificationId) {
      await client.supabase.from('app_worker_certifications').delete().eq('id', created.certificationId);
    }
    if (created.documentPath) {
      await client.supabase.storage.from(WORKER_FILES_BUCKET).remove([created.documentPath]);
    }
    if (created.certificationPath) {
      await client.supabase.storage.from(CV_BUCKET).remove([created.certificationPath]);
    }
    if (created.cvPath && created.cvPath !== originalCv?.cv_storage_path) {
      await client.supabase.storage.from(CV_BUCKET).remove([created.cvPath]);
    }

    await restoreCvState(client.supabase, writerUserId, originalCv);
    await client.supabase.auth.signOut();
  });

  test('the CV writer persists canonical metadata and no public URL', async ({ page }) => {
    test.setTimeout(240_000);
    const runtimeErrors: string[] = [];
    page.on('pageerror', (e: Error) => runtimeErrors.push(e.message));

    await loginUi(page);

    // Anchored to the start of the heading so it cannot match the "AI CV" section.
    const cvSection = page.locator('section').filter({ hasText: /^CV\s*\/\s*Resume/i });
    await expect(cvSection).toBeVisible({ timeout: 30_000 });

    const fileName = `${WRITER_TOKEN}-cv.pdf`;
    await cvSection
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: pdfBuffer(fileName) });
    await expect(cvSection.getByText(fileName)).toBeVisible({ timeout: 90_000 });

    const client = await workerClient();
    const state = await readCvState(client.supabase, writerUserId);
    created.cvPath = state.cv_storage_path ?? undefined;

    expect(state.cv_storage_bucket, 'CV must land in the certificates bucket').toBe(CV_BUCKET);
    expect(state.cv_storage_path, 'CV path must be set').toBeTruthy();
    expect(
      state.cv_storage_path!.startsWith(`${writerUserId}/`),
      'CV path must sit inside the owner namespace',
    ).toBe(true);
    expect(state.cv_file_name).toBe(fileName);
    expect(state.cv_file_url, 'the CV writer must not persist a public URL').toBeNull();

    await assertBrokerServesPrivately(client, 'production CV writer', {
      owner_user_id: writerUserId,
      file_type: 'cv',
    });

    await client.supabase.auth.signOut();
    expect(runtimeErrors, 'no runtime errors during the CV write').toEqual([]);
  });

  test('the document writer targets worker-documents with canonical metadata', async ({ page }) => {
    test.setTimeout(240_000);
    const runtimeErrors: string[] = [];
    page.on('pageerror', (e: Error) => runtimeErrors.push(e.message));

    await loginUi(page);
    const dialog = await openAddDialog(page, 'workerProfile.documents.add', 'document writer');

    const fileName = `${WRITER_TOKEN}-document.pdf`;
    await dialog
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: pdfBuffer(fileName) });

    // The upload finished when the dialog swaps the picker for the file name.
    await expect(
      dialog.getByText(fileName),
      'document writer: upload must confirm with the file name',
    ).toBeVisible({ timeout: 90_000 });

    await submitDialog(page, dialog, 'document writer');

    const client = await workerClient();
    const { data: rows, error } = await client.supabase
      .from('app_worker_documents')
      .select('id, user_id, file_name, file_url, storage_bucket, storage_path')
      .eq('user_id', writerUserId)
      .eq('file_name', fileName);
    throwIfError('Read document written by the frontend', error);

    expect(rows?.length, 'the document writer must have inserted exactly one row').toBe(1);
    const row = rows![0];
    created.documentId = row.id;
    created.documentPath = row.storage_path ?? undefined;

    expect(row.storage_bucket, 'new documents must target worker-documents').toBe(WORKER_FILES_BUCKET);
    expect(row.storage_path, 'document path must be set').toBeTruthy();
    expect(
      row.storage_path!.startsWith(`${writerUserId}/`),
      'document path must sit inside the owner namespace',
    ).toBe(true);
    expect(row.file_url, 'the document writer must not persist a legacy/public URL').toBeNull();

    await assertBrokerServesPrivately(client, 'production document writer', {
      owner_user_id: writerUserId,
      file_type: 'document',
      record_id: row.id,
    });

    await client.supabase.auth.signOut();
    expect(runtimeErrors, 'no runtime errors during the document write').toEqual([]);
  });

  test('the certification writer targets the certificates bucket with canonical metadata', async ({ page }) => {
    test.setTimeout(240_000);
    const runtimeErrors: string[] = [];
    page.on('pageerror', (e: Error) => runtimeErrors.push(e.message));

    await loginUi(page);
    const dialog = await openAddDialog(
      page,
      'workerProfile.certifications.add',
      'certification writer',
    );

    const certName = `${WRITER_TOKEN} certification`;
    await dialog.locator('input[required]').first().fill(certName);
    await dialog.locator('input[required]').nth(1).fill('PipingBox QA');

    const fileName = `${WRITER_TOKEN}-certification.pdf`;
    // Stable, language-independent handle on the certificate picker.
    await dialog
      .locator('#cert-file-upload-input, input[type="file"]')
      .first()
      .setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: pdfBuffer(fileName) });
    await expect(
      dialog.getByText(fileName),
      'certification writer: upload must confirm with the file name',
    ).toBeVisible({ timeout: 90_000 });

    await submitDialog(page, dialog, 'certification writer');

    const client = await workerClient();
    const { data: rows, error } = await client.supabase
      .from('app_worker_certifications')
      .select('id, user_id, certification_name, file_url, certificate_file_url, storage_bucket, storage_path')
      .eq('user_id', writerUserId)
      .eq('certification_name', certName);
    throwIfError('Read certification written by the frontend', error);

    expect(rows?.length, 'the certification writer must have inserted exactly one row').toBe(1);
    const row = rows![0];
    created.certificationId = row.id;
    created.certificationPath = row.storage_path ?? undefined;

    expect(row.storage_bucket, 'certifications must target the certificates bucket').toBe(CV_BUCKET);
    expect(row.storage_path, 'certification path must be set').toBeTruthy();
    expect(
      row.storage_path!.startsWith(`${writerUserId}/`),
      'certification path must sit inside the owner namespace',
    ).toBe(true);
    expect(row.file_url, 'the certification writer must not persist a legacy/public URL').toBeNull();
    expect(
      row.certificate_file_url,
      'the certification writer must not persist a legacy/public URL',
    ).toBeNull();

    await assertBrokerServesPrivately(client, 'production certification writer', {
      owner_user_id: writerUserId,
      file_type: 'certification',
      record_id: row.id,
    });

    await client.supabase.auth.signOut();
    expect(runtimeErrors, 'no runtime errors during the certification write').toEqual([]);
  });
});
