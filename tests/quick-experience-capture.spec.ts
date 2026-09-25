import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createWorkerExperienceOperations,
  type WorkerExperiencePayload,
  type WorkerExperienceRepository,
} from '../app/frontend/src/lib/workerExperienceOperations';
import {
  countQualifyingExperiences,
  type WorkforceReadinessInput,
} from '../app/frontend/src/lib/workforceReadiness';
import {
  diffReadinessEvents,
  readinessSnapshot,
} from '../app/frontend/src/lib/workforceReadinessEvents';

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const quick = read('../app/frontend/src/components/profile/ExperienceQuickCapture.tsx');
const section = read('../app/frontend/src/components/profile/WorkExperienceSection.tsx');
const service = read('../app/frontend/src/lib/workerExperienceService.ts');
const banner = read('../app/frontend/src/components/profile/MatchReadyBanner.tsx');
const profile = read('../app/frontend/src/pages/Profile.tsx');

class MemoryExperienceRepository implements WorkerExperienceRepository {
  rows: Record<string, unknown>[] = [];
  failNextInsert = false;
  private sequence = 1;

  async list(userId: string) {
    return {
      data: this.rows.filter((row) => row.user_id === userId),
      error: null,
    };
  }

  async insert(userId: string, payload: WorkerExperiencePayload) {
    if (this.failNextInsert) {
      this.failNextInsert = false;
      return { data: null, error: 'temporary failure' };
    }
    const row = {
      id: `exp-${this.sequence++}`,
      user_id: userId,
      created_at: new Date(0).toISOString(),
      ...payload,
    };
    this.rows.push(row);
    return { data: row, error: null };
  }

  async update(
    experienceId: string,
    userId: string,
    payload: WorkerExperiencePayload,
  ) {
    const index = this.rows.findIndex(
      (row) => row.id === experienceId && row.user_id === userId,
    );
    if (index === -1) return { data: null, error: 'not found' };
    this.rows[index] = { ...this.rows[index], ...payload };
    return { data: this.rows[index], error: null };
  }

  async setVisibility(
    experienceId: string,
    userId: string,
    visible: boolean,
  ) {
    const row = this.rows.find(
      (candidate) =>
        candidate.id === experienceId && candidate.user_id === userId,
    );
    if (!row) return { data: null, error: 'not found' };
    row.visible_to_companies = visible;
    return { data: { id: experienceId }, error: null };
  }

  async remove(experienceId: string, userId: string) {
    const index = this.rows.findIndex(
      (row) => row.id === experienceId && row.user_id === userId,
    );
    if (index === -1) return { data: null, error: 'not found' };
    this.rows.splice(index, 1);
    return { data: { id: experienceId }, error: null };
  }
}

const qualifyingInput = {
  position: 'Pipefitter',
  company_name: 'Industrial Services',
  start_date: '2022-01-01',
  currently_working: true,
};

const readyInput = (
  qualifyingExperienceCount: number,
): WorkforceReadinessInput => ({
  role: 'worker',
  full_name: 'Test Worker',
  title: 'Pipefitter',
  location: 'Antwerp',
  years_experience: 8,
  bio: 'Experienced industrial pipefitter.',
  skills: ['Pipefitting'],
  availability_status: 'available_immediately',
  profile_visibility: 'public',
  cv_visible: true,
  qualifying_experience_count: qualifyingExperienceCount,
  certification_count: 0,
  verified_certification_count: 0,
});

test.describe('WFA-001 — shared Quick and Full architecture', () => {
  test('Quick and Full use the same persistence service', () => {
    expect(quick).toMatch(/from '@\/lib\/workerExperienceService'/);
    expect(section).toMatch(/from '@\/lib\/workerExperienceService'/);
    expect(quick).not.toMatch(/supabase|TABLES\.workerExperiences/);
    expect(section).not.toMatch(/supabase|TABLES\.workerExperiences/);
  });

  test('Add details hands the saved row to the Full editor', () => {
    expect(quick).toMatch(/onAddDetails\(savedRow\)/);
    expect(banner).toMatch(/onAddExperienceDetails\(experience\)/);
    expect(profile).toMatch(/experienceToEdit=\{experienceToEdit\}/);
    expect(section).toMatch(/openEdit\(experienceToEdit\)/);
  });

  test('canonical worker gap is the only Quick Capture entry point', () => {
    expect(banner).toMatch(/isCanonicalWorker\(input\)/);
    expect(banner).toMatch(/gaps\.some\(\(g\) => g\.key === 'experience'\)/);
    expect(banner).not.toMatch(/role\s*===\s*['"]/);
  });

  test('Quick Capture has exactly two required fields and responsive layout', () => {
    const requiredProps = quick.match(/required\s*\n\s*className=/g) ?? [];
    expect(requiredProps).toHaveLength(2);
    expect(quick).toContain('sm:grid-cols-2');
    expect(quick).toContain('max-h-[90vh] overflow-y-auto');
  });

  test('pseudo-translation generation is not exposed in Quick or Full', () => {
    for (const source of [quick, section]) {
      expect(source).not.toMatch(/generateTranslation|translationGenerated|Sparkles/);
    }
  });
});

test.describe('WFA-001 — executable persistence contract', () => {
  test('qualifying experience saves and survives reload', async () => {
    const repository = new MemoryExperienceRepository();
    const operations = createWorkerExperienceOperations(repository);

    const saved = await operations.insert('worker-a', qualifyingInput);
    expect(saved.ok).toBe(true);

    const reloaded = await operations.list('worker-a');
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    expect(reloaded.data).toHaveLength(1);
    expect(reloaded.data[0]).toMatchObject({
      user_id: 'worker-a',
      position: 'Pipefitter',
      company_name: 'Industrial Services',
    });
  });

  test('data survives a new operations instance (logout/login boundary)', async () => {
    const repository = new MemoryExperienceRepository();
    const firstSession = createWorkerExperienceOperations(repository);
    await firstSession.insert('worker-a', qualifyingInput);

    const nextSession = createWorkerExperienceOperations(repository);
    const reloaded = await nextSession.list('worker-a');
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    expect(reloaded.data[0].position).toBe('Pipefitter');
  });

  test('row missing position or company cannot persist', async () => {
    const repository = new MemoryExperienceRepository();
    const operations = createWorkerExperienceOperations(repository);

    const missingPosition = await operations.insert('worker-a', {
      position: ' ',
      company_name: 'Industrial Services',
    });
    const missingCompany = await operations.insert('worker-a', {
      position: 'Pipefitter',
      company_name: '',
    });

    expect(missingPosition).toEqual({
      ok: false,
      error: 'workerProfile.experience.titleCompanyRequired',
    });
    expect(missingCompany).toEqual({
      ok: false,
      error: 'workerProfile.experience.titleCompanyRequired',
    });
    expect(repository.rows).toHaveLength(0);
  });

  test('insert error is recoverable and retry persists the same input', async () => {
    const repository = new MemoryExperienceRepository();
    repository.failNextInsert = true;
    const operations = createWorkerExperienceOperations(repository);

    expect(await operations.insert('worker-a', qualifyingInput)).toEqual({
      ok: false,
      error: 'temporary failure',
    });
    const retried = await operations.insert('worker-a', qualifyingInput);
    expect(retried.ok).toBe(true);
    expect(repository.rows).toHaveLength(1);
  });

  test('edit and delete continue to work for the owner', async () => {
    const repository = new MemoryExperienceRepository();
    const operations = createWorkerExperienceOperations(repository);
    const saved = await operations.insert('worker-a', qualifyingInput);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const updated = await operations.update(saved.data.id, 'worker-a', {
      ...qualifyingInput,
      position: 'Senior Pipefitter',
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.data.position).toBe('Senior Pipefitter');

    expect(await operations.remove(saved.data.id, 'worker-a')).toEqual({
      ok: true,
    });
    expect(repository.rows).toHaveLength(0);
  });

  test('cross-user update, visibility and delete are rejected', async () => {
    const repository = new MemoryExperienceRepository();
    const operations = createWorkerExperienceOperations(repository);
    const saved = await operations.insert('worker-a', qualifyingInput);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    expect(
      await operations.update(saved.data.id, 'worker-b', {
        ...qualifyingInput,
        position: 'Tampered',
      }),
    ).toEqual({ ok: false, error: 'not found' });
    expect(
      await operations.setVisibility(saved.data.id, 'worker-b', false),
    ).toEqual({ ok: false, error: 'not found' });
    expect(await operations.remove(saved.data.id, 'worker-b')).toEqual({
      ok: false,
      error: 'not found',
    });
    expect(repository.rows[0].position).toBe('Pipefitter');
  });

  test('Supabase repository scopes every non-insert mutation by user_id', () => {
    const ownershipFilters = service.match(/\.eq\('user_id', userId\)/g) ?? [];
    expect(ownershipFilters.length).toBeGreaterThanOrEqual(4);
    expect(service).toMatch(
      /insert\(\{ \.\.\.payload, user_id: userId \}\)/,
    );
  });
});

test.describe('WFA-001 — readiness transition after persistence', () => {
  test('reloaded qualifying experience unlocks readiness once', async () => {
    const repository = new MemoryExperienceRepository();
    const operations = createWorkerExperienceOperations(repository);
    const before = readinessSnapshot(readyInput(0));

    await operations.insert('worker-a', qualifyingInput);
    const reloaded = await operations.list('worker-a');
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;

    const qualifyingCount = countQualifyingExperiences(reloaded.data);
    const after = readinessSnapshot(readyInput(qualifyingCount));
    const events = diffReadinessEvents(before, after).map((event) => event.name);

    expect(events).toContain('experience_added');
    expect(events).toContain('workforce_ready_reached');
    expect(events).toContain('matchable_reached');
    expect(diffReadinessEvents(after, after)).toEqual([]);
  });

  test('banner re-queries canonical counts after save', () => {
    expect(banner).toMatch(/onSaved=\{\(\) => setRefreshKey/);
    expect(banner).toMatch(/countQualifyingExperiences\(exp\.data \?\? \[\]\)/);
  });
});