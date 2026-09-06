import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

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

function expectSignedUrl(data: any, error: any) {
  expect(error).toBeNull();
  expect(data?.signedUrl).toMatch(/[?&]token=/);
  expect(data?.signedUrl).not.toMatch(/\/object\/public\//);
}

function expectDenied(data: any, error: any) {
  expect(data?.signedUrl).toBeFalsy();

  const status = error?.context?.status;
  if (typeof status === 'number') {
    expect([403, 404]).toContain(status);
    return;
  }

  const msg = String(error?.message || data?.error || '').toLowerCase();
  expect(
    msg.includes('not authorized') ||
    msg.includes('forbidden') ||
    msg.includes('access denied') ||
    msg.includes('not found') ||
    msg.includes('not visible') ||
    msg.includes('ownership mismatch') ||
    msg.includes('path does not belong') ||
    msg.includes('bucket not allowed') ||
    msg.includes('storage object not found') ||
    msg.includes('storage integrity') ||
    msg.includes('non-2xx')
  ).toBe(true);
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

      if (fixture.workerCvPath) {
        const { error } = await client.supabase.storage
          .from(CV_BUCKET)
          .remove([fixture.workerCvPath]);
        throwIfError('Delete worker CV fixture', error);
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

      const workerFilePaths = [fixture.documentPath, fixture.certificationPath].filter(Boolean) as string[];
      if (workerFilePaths.length > 0) {
        const { error } = await client.supabase.storage
          .from(WORKER_FILES_BUCKET)
          .remove(workerFilePaths);
        throwIfError('Delete worker document fixtures', error);
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
      await uploadFixture(secondWorker.supabase, WORKER_FILES_BUCKET, fixture.certificationPath, 'worker certification');

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
          storage_bucket: WORKER_FILES_BUCKET,
          storage_path: fixture.certificationPath,
        })
        .select('id')
        .single();
      throwIfError('Insert QA certification row', certificationError);
      if (!certification?.id) throw new Error('QA certification insert returned no id');
      fixture.certificationId = certification.id;

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

    expectSignedUrl(data, error);
    await client.supabase.auth.signOut();
  });

  test('authorized company can retrieve a signed URL for a visible CV', async () => {
    const client = await signIn(COMPANY_AUTH_EMAIL!, COMPANY_AUTH_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: fixture.workerId, file_type: 'cv' },
    });

    expectSignedUrl(data, error);
    await client.supabase.auth.signOut();
  });

  test('unauthorized company is denied access', async () => {
    const client = await signIn(COMPANY_UNAUTH_EMAIL!, COMPANY_UNAUTH_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: fixture.workerId, file_type: 'cv' },
    });

    expectDenied(data, error);
    await client.supabase.auth.signOut();
  });

  test('non-owner worker is denied access to another worker visible CV', async () => {
    const client = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: fixture.secondWorkerId, file_type: 'cv' },
    });

    expectDenied(data, error);
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
    expectSignedUrl(ownerResult.data, ownerResult.error);
    await owner.supabase.auth.signOut();

    const attacker = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { data, error } = await attacker.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.secondWorkerId,
        file_type: 'document',
        record_id: fixture.documentId,
      },
    });
    expectDenied(data, error);
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
    expectSignedUrl(ownerResult.data, ownerResult.error);
    await owner.supabase.auth.signOut();

    const attacker = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { data, error } = await attacker.supabase.functions.invoke('secure-file-access', {
      body: {
        owner_user_id: fixture.secondWorkerId,
        file_type: 'certification',
        record_id: fixture.certificationId,
      },
    });
    expectDenied(data, error);
    await attacker.supabase.auth.signOut();
  });

  test('legitimate admin can retrieve a signed URL for a worker CV', async () => {
    const client = await signIn(ADMIN_EMAIL!, ADMIN_PASSWORD!);
    const { data, error } = await client.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: fixture.workerId, file_type: 'cv' },
    });

    expectSignedUrl(data, error);
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
      expectDenied(data, error);
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
