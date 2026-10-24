import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PB-NOTIFICATION-PROFILE-INCOMPLETE-FIX-001 — source contract for the
 * dedicated profile-suggestion path.
 *
 * Incident: notifyProfileSuggestions() routed self-notifications of type
 * PROFILE_INCOMPLETE through createNotification() → pb_create_client_notification
 * (the hardened CROSS-USER boundary). The RPC correctly rejected them
 * (type not client-creatable + self-recipient banned) → 21 ×
 * notification_rpc_error "PROFILE_INCOMPLETE: P0001" on 23/10/2026, and the
 * suggestion feature never delivered a single row.
 *
 * Fix: dedicated zero-argument RPC pb_create_profile_suggestions() that
 * derives everything server-side (user from auth.uid(), gaps from the
 * canonical profile row, fixed type/content, 30-day per-field cooldown,
 * max 3 per call, fail-open when no profile row exists).
 *
 * These tests are pure source assertions: no browser, no network.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf-8');

const SQL_062 = read('sql/062-pb-notification-profile-suggestion-001.sql');
const SQL_032 = read('sql/032-pb-notifications-referral-hardening.sql');
const NOTIFICATIONS_LIB = read('app/frontend/src/lib/notifications.ts');
const PROFILE_PAGE = read('app/frontend/src/pages/Profile.tsx');
const INVITE_MODAL = read('app/frontend/src/components/InviteToJobModal.tsx');
const COMMUNITY_POST = read('app/frontend/src/pages/CommunityPost.tsx');
const REFERRALS_LIB = read('app/frontend/src/lib/referrals.ts');

test.describe('PB-NOTIFICATION-PROFILE-INCOMPLETE-FIX-001 — sql/062 dedicated RPC', () => {
  test('zero-argument signature: nothing client-controllable', () => {
    expect(SQL_062).toContain('CREATE OR REPLACE FUNCTION public.pb_create_profile_suggestions()');
    // No parameters at all — type, actor, recipient and content cannot be
    // passed (let alone forged) from the browser.
    expect(SQL_062).toMatch(/pb_create_profile_suggestions\(\)\s*\nRETURNS integer/);
    expect(SQL_062).not.toContain('p_recipient_id');
    expect(SQL_062).not.toContain('p_type');
  });

  test('least-privilege pattern: SECURITY INVOKER (PO G2) + hardened grants', () => {
    // G2 (PO review): no RLS bypass is needed for this RPC — authenticated
    // already owns SELECT on own profile, SELECT on own notifications and
    // INSERT on own notifications (authenticated_insert_own_notifications).
    // SECURITY DEFINER would only trigger the Supabase Advisor warning
    // "authenticated_security_definer_function_executable".
    // Checked on the executable body: the explanatory header legitimately
    // mentions SECURITY DEFINER when documenting why it was rejected.
    const body = SQL_062.slice(SQL_062.indexOf('CREATE OR REPLACE FUNCTION'));
    expect(body).toContain('SECURITY INVOKER');
    expect(body).not.toContain('SECURITY DEFINER');
    expect(SQL_062).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(SQL_062).toContain('REVOKE EXECUTE ON FUNCTION public.pb_create_profile_suggestions() FROM PUBLIC, anon');
    expect(SQL_062).toContain('GRANT EXECUTE ON FUNCTION public.pb_create_profile_suggestions() TO authenticated');
  });

  test('user derived exclusively from auth.uid()', () => {
    expect(SQL_062).toContain('v_user uuid := auth.uid()');
    expect(SQL_062).toContain('IF v_user IS NULL THEN');
    // The only INSERT targets v_user — no other recipient is possible.
    expect(SQL_062).toContain('v_user, \'PROFILE_INCOMPLETE\', \'Completa tu perfil\', v_message, \'profile\',');
  });

  test('type is a fixed server-side literal (only PROFILE_INCOMPLETE)', () => {
    expect(SQL_062).toContain("'PROFILE_INCOMPLETE'");
    expect(SQL_062).not.toContain('p_type');
    expect(SQL_062).not.toContain('v_type');
  });

  test('gaps derive from canonical profile state', () => {
    expect(SQL_062).toContain(
      'SELECT p.title, p.skills, p.location, p.years_experience, p.availability_status, p.account_type',
    );
    expect(SQL_062).toContain('FROM public.app_14da0f1941_profiles AS p');
    expect(SQL_062).toContain('WHERE p.user_id = v_user');
    // All evaluated fields have a real canonical column.
    for (const field of ['title', 'skills', 'location', 'years_experience', 'availability_status']) {
      expect(SQL_062).toContain(`'${field}'`);
    }
    // 'languages' has no canonical column and no form input: it was a phantom
    // suggestion that could never be cleared — it must not be suggested.
    // (Checked on the executable body, not on the explanatory header.)
    const body = SQL_062.slice(SQL_062.indexOf('CREATE OR REPLACE FUNCTION'));
    expect(body).not.toContain("'languages'");
  });

  test('G3: worker-only domain guard, fail-closed, in the backend', () => {
    // The suggestions are worker-domain (title/skills/location/years/
    // availability + offer-oriented messages). Production has company and
    // admin profiles with those fields empty, so without this guard the PR
    // would activate worker suggestions for non-worker accounts.
    const body = SQL_062.slice(SQL_062.indexOf('CREATE OR REPLACE FUNCTION'));
    // account_type is read from the canonical profile row...
    expect(SQL_062).toContain('p.account_type');
    // ...and any non-worker (company, admin, NULL, unknown) returns 0 rows.
    const guardIdx = body.indexOf("IF v_account_type IS DISTINCT FROM 'worker' THEN");
    expect(guardIdx).toBeGreaterThan(-1);
    const returnIdx = body.indexOf('RETURN 0;', guardIdx);
    expect(returnIdx).toBeGreaterThan(guardIdx);
    // The guard must run BEFORE any suggestion INSERT (fail-closed ordering).
    const insertIdx = body.indexOf('INSERT INTO public.app_14da0f1941_notifications');
    expect(guardIdx).toBeLessThan(insertIdx);
    // account_type itself is never modified, and no RLS/policy is touched.
    expect(SQL_062).not.toMatch(/UPDATE\s+public\.app_14da0f1941_profiles/i);
    expect(SQL_062).not.toContain('ALTER POLICY');
    expect(SQL_062).not.toContain('DROP POLICY');
  });

  test('fail-open: missing profile row returns 0 without raising', () => {
    expect(SQL_062).toContain('IF NOT FOUND THEN');
    const notFoundIdx = SQL_062.indexOf('IF NOT FOUND THEN');
    const returnZeroIdx = SQL_062.indexOf('RETURN 0;');
    expect(notFoundIdx).toBeGreaterThan(-1);
    expect(returnZeroIdx).toBeGreaterThan(notFoundIdx);
  });

  test('30-day per-field cooldown and 3-per-call limit live in the RPC', () => {
    expect(SQL_062).toContain("interval '30 days'");
    expect(SQL_062).toContain("n.related_entity_id = 'field:' || v_field");
    expect(SQL_062).toContain('IF v_created >= 3 THEN');
  });

  test('rollback block drops only the new RPC', () => {
    expect(SQL_062).toContain('DROP FUNCTION IF EXISTS public.pb_create_profile_suggestions();');
    expect(SQL_062).not.toContain('DROP FUNCTION IF EXISTS public.pb_create_client_notification');
  });
});

test.describe('PB-NOTIFICATION-PROFILE-INCOMPLETE-FIX-001 — boundary NOT weakened', () => {
  test('sql/062 does not touch pb_create_client_notification', () => {
    expect(SQL_062).not.toContain('CREATE OR REPLACE FUNCTION public.pb_create_client_notification');
    expect(SQL_062).not.toContain('ALTER FUNCTION');
    expect(SQL_062).not.toContain('CREATE POLICY');
    expect(SQL_062).not.toContain('GRANT EXECUTE ON FUNCTION public.pb_create_client_notification');
    expect(SQL_062).not.toContain('REVOKE EXECUTE ON FUNCTION public.pb_create_client_notification');
    // The only REVOKE/GRANT pair in the executable body belongs to the new RPC.
    const body = SQL_062.slice(SQL_062.indexOf('CREATE OR REPLACE FUNCTION'));
    expect((body.match(/REVOKE EXECUTE/g) ?? []).length, 'exactly one REVOKE (new RPC)').toBe(1);
    expect((body.match(/GRANT EXECUTE/g) ?? []).length, 'exactly one GRANT (new RPC)').toBe(1);
  });

  test('cross-user RPC keeplist unchanged (sql/032 still authoritative)', () => {
    expect(SQL_032).toContain(
      "'like', 'comment', 'job_invitation', 'REFERRAL_JOINED', 'REFERRAL_VERIFIED'",
    );
    expect(SQL_032).not.toContain('PROFILE_INCOMPLETE');
    expect(SQL_032).toContain("'recipient is missing or self notifications are not allowed'");
    expect(SQL_032).toContain(
      'REVOKE EXECUTE ON FUNCTION public.pb_create_client_notification(text,text,text,text,text,text,uuid) FROM PUBLIC, anon',
    );
  });
});

test.describe('PB-NOTIFICATION-PROFILE-INCOMPLETE-FIX-001 — frontend wiring', () => {
  test('notifyProfileSuggestions calls the dedicated RPC, never createNotification', () => {
    const fnStart = NOTIFICATIONS_LIB.indexOf('export async function notifyProfileSuggestions');
    const fnEnd = NOTIFICATIONS_LIB.indexOf('// ─── PRODUCT_UPDATE helpers');
    const fn = NOTIFICATIONS_LIB.slice(fnStart, fnEnd);
    expect(fnStart).toBeGreaterThan(-1);
    expect(fn).toContain("supabase.rpc('pb_create_profile_suggestions')");
    expect(fn).not.toContain('createNotification(');
    // No recipient/profile payload is sent from the browser anymore.
    expect(fn).not.toContain('recipientId');
    expect(fn).not.toContain('userId');
  });

  test('fail-open telemetry uses a distinct error name (noise signature retired)', () => {
    const fnStart = NOTIFICATIONS_LIB.indexOf('export async function notifyProfileSuggestions');
    const fnEnd = NOTIFICATIONS_LIB.indexOf('// ─── PRODUCT_UPDATE helpers');
    const fn = NOTIFICATIONS_LIB.slice(fnStart, fnEnd);
    expect(fn).toContain("'profile_suggestion_rpc_error'");
    expect(fn).not.toContain("'notification_rpc_error'");
  });

  test('dead self-notification helpers removed from the broken path', () => {
    expect(NOTIFICATIONS_LIB).not.toContain('export async function notifyProfileIncomplete');
    expect(NOTIFICATIONS_LIB).not.toContain('export async function notifyProfileReady');
    expect(NOTIFICATIONS_LIB).not.toContain('export function buildProfileSuggestions');
    expect(NOTIFICATIONS_LIB).not.toContain('SUGGESTION_COOLDOWN_DAYS');
  });

  test('Profile.tsx: fire-and-forget after a successful save, never blocking it', () => {
    const saveIdx = PROFILE_PAGE.indexOf('const save = async (e: FormEvent) => {');
    const upsertIdx = PROFILE_PAGE.indexOf('.from(TABLES.profiles)');
    const suggestIdx = PROFILE_PAGE.indexOf('notifyProfileSuggestions().catch(() => {});');
    expect(saveIdx).toBeGreaterThan(-1);
    expect(upsertIdx).toBeGreaterThan(saveIdx);
    expect(suggestIdx).toBeGreaterThan(upsertIdx);
    // Fail-open guard: the call happens only after the error-return paths.
    expect(PROFILE_PAGE).toContain('notifyProfileSuggestions().catch(() => {});');
    expect(PROFILE_PAGE).not.toContain('notifyProfileSuggestions(user.id');
    expect(PROFILE_PAGE).not.toContain('savedPayload.languages');
  });

  test('Jobs/Community/Referrals keep using pb_create_client_notification', () => {
    expect(INVITE_MODAL).toContain('createNotification');
    expect(COMMUNITY_POST).toContain('createNotification');
    expect(REFERRALS_LIB).toContain('notifyReferralJoined');
    expect(REFERRALS_LIB).toContain('notifyReferralVerified');
  });
});
