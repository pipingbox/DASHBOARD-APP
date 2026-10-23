import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PB-CE-COMPANY-CORE-001 — Company tenant + team accounts security contract.
 *
 * This suite pins the backend contract of sql/058 (and its rollback sql/058b)
 * plus the frontend wiring, without a browser or a live database:
 *
 *  1. Three new tables with RLS ENABLE + FORCE.
 *  2. Zero direct-write grants for `authenticated`; mutations only via
 *     SECURITY DEFINER RPCs with a fixed search_path.
 *  3. Invitations: never for role owner, only the token hash is persisted,
 *     single-use, expiring, revocable, anti-enumeration responses.
 *  4. Owner invariants: last-owner guard on degrade/remove, atomic transfer.
 *  5. Legacy migration is idempotent and non-destructive (no DROP/ALTER of
 *     legacy tables, ON CONFLICT guards).
 *  6. The rollback drops every object the forward migration creates.
 *  7. The frontend mutates exclusively through RPCs and the PostHog events
 *     are registered in the closed allowlist without PII props.
 *  8. i18n: every companyCore key exists in en + es (others fall back to en).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readCode = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const SQL = readCode('sql/058-pb-ce-company-core-001.sql');
const ROLLBACK = readCode('sql/058b-pb-ce-company-core-rollback.sql');
const CLIENT = readCode('app/frontend/src/lib/companyCore.ts');
const OBS = readCode('app/frontend/src/lib/observability.ts');
const EN = JSON.parse(readCode('app/frontend/src/i18n/locales/en.json'));
const ES = JSON.parse(readCode('app/frontend/src/i18n/locales/es.json'));

const TABLES = ['app_companies', 'app_company_memberships', 'app_company_invitations'];

const RPCS = [
  'pb_company_create',
  'pb_company_invite',
  'pb_company_invitation_accept',
  'pb_company_invitation_reject',
  'pb_company_invitation_revoke',
  'pb_company_member_change_role',
  'pb_company_member_remove',
  'pb_company_transfer_ownership',
  'pb_company_members',
  'pb_company_my_context',
];

const OBS_EVENTS = [
  'company_created',
  'company_invite_sent',
  'company_invite_accepted',
  'company_invite_revoked',
  'company_member_role_changed',
  'company_member_removed',
  'company_owner_transferred',
  'company_context_selected',
];

test.describe('tables and RLS', () => {
  test('the three tenant tables are created', () => {
    for (const table of TABLES) {
      expect(SQL).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }
  });

  test('every table has RLS enabled AND forced', () => {
    for (const table of TABLES) {
      const enable = new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`);
      const force = new RegExp(`ALTER TABLE public\\.${table}\\s+FORCE ROW LEVEL SECURITY`);
      expect(SQL).toMatch(enable);
      expect(SQL).toMatch(force);
    }
  });

  test('authenticated gets SELECT only — never direct writes', () => {
    for (const table of TABLES) {
      expect(SQL).toContain(`GRANT SELECT ON public.${table}`);
      expect(SQL).toContain(`REVOKE INSERT, UPDATE, DELETE ON public.${table}`);
    }
    // No grants to anon or PUBLIC anywhere in the migration.
    expect(SQL).not.toMatch(/GRANT .* TO (anon|PUBLIC)\b/i);
  });

  test('service_role keeps full access for reconciliation and edge functions', () => {
    for (const table of TABLES) {
      expect(SQL).toMatch(new RegExp(`GRANT ALL ON public\\.${table}\\s+TO service_role`));
    }
  });
});

test.describe('privileged functions', () => {
  test('every RPC is SECURITY DEFINER with a fixed search_path', () => {
    for (const rpc of RPCS) {
      const start = SQL.indexOf(`FUNCTION public.${rpc}(`);
      expect(start, `${rpc} must exist`).toBeGreaterThan(-1);
      const body = SQL.slice(start, start + 1200);
      expect(body, `${rpc} SECURITY DEFINER`).toContain('SECURITY DEFINER');
      expect(body, `${rpc} fixed search_path`).toContain("SET search_path TO 'public', 'pg_temp'");
    }
  });

  test('the audit function is not executable by authenticated', () => {
    expect(SQL).toContain(
      'REVOKE EXECUTE ON FUNCTION public.pb_company_audit(text,text,text,text) FROM authenticated;',
    );
  });

  test('the blanket grant loop excludes the audit function', () => {
    expect(SQL).toContain("AND proname <> 'pb_company_audit'");
  });
});

test.describe('invitation security', () => {
  test('owner can never be invited', () => {
    expect(SQL).toContain("CHECK (role IN ('admin','recruiter','viewer'))");
    expect(SQL).toContain("IF p_role NOT IN ('admin','recruiter','viewer') THEN");
  });

  test('only the SHA-256 hash is persisted; there is no plain-token column', () => {
    expect(SQL).toContain('token_hash       text NOT NULL');
    expect(SQL).not.toMatch(/^\s*token\s+text/m);
    expect(SQL).toContain("encode(extensions.digest(v_token, 'sha256'), 'hex')");
    // pgcrypto lives in the 'extensions' schema; with search_path='public','pg_temp'
    // an unqualified pgcrypto call would fail at runtime.
    expect(SQL).toContain('extensions.gen_random_bytes(32)');
    expect(SQL).not.toMatch(/(?<!extensions\.)gen_random_bytes/);
  });

  test('single-use + expiry + revocation + anti-enumeration are enforced', () => {
    expect(SQL).toContain("RAISE EXCEPTION 'invalid_or_expired'");
    expect(SQL).toContain('expires_at > now()');
    expect(SQL).toContain("SET status = 'revoked'");
    // Recipient binding: the JWT email must match the invitee email.
    expect(SQL).toContain("RAISE EXCEPTION 'email_mismatch'");
  });

  test('duplicate pending invitations are idempotent (no token reissue)', () => {
    expect(SQL).toContain('app_company_invitations_pending_uniq');
    expect(SQL).toContain('already_pending boolean');
    expect(SQL).toContain('RETURN QUERY SELECT v_existing, NULL::text, true;');
  });

  test('time-expired pending invitations are lazily retired before re-inviting (QA finding)', () => {
    // A pending-but-expired row still holds the pending_uniq slot; without this
    // transition a re-invite fails with 23505 duplicate key.
    expect(SQL).toMatch(/SET status = 'expired'[\s\S]{0,200}expires_at <= now\(\)/);
  });
});

test.describe('owner invariants', () => {
  test('last owner cannot be degraded or removed from an active company', () => {
    const matches = SQL.match(/RAISE EXCEPTION 'last_owner'/g) ?? [];
    // change_role + member_remove
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test('ownership transfer is a single atomic function touching both rows', () => {
    const start = SQL.indexOf('FUNCTION public.pb_company_transfer_ownership(');
    const end = SQL.indexOf('END $$;', start);
    const body = SQL.slice(start, end);
    expect(body).toContain("SET role = 'admin'");
    expect(body).toContain("SET role = 'owner'");
    expect(body).toContain("RAISE EXCEPTION 'cannot_transfer_to_self'");
  });

  test('no DELETE CASCADE anywhere in the tenant model', () => {
    expect(SQL).not.toMatch(/ON DELETE CASCADE/i);
  });
});

test.describe('legacy compatibility migration', () => {
  test('is idempotent and non-destructive', () => {
    expect(SQL).toContain("WHERE p.account_type = 'company'");
    expect(SQL).toContain('ON CONFLICT (legacy_profile_user_id)');
    expect(SQL).not.toMatch(/DROP TABLE public\.app_14da0f1941/i);
    expect(SQL).not.toMatch(/ALTER TABLE public\.app_14da0f1941/i);
    // Legacy data ownership columns stay untouched in this phase (DDL/DML only;
    // the header documents that company_user_id is intentionally preserved).
    expect(SQL).not.toMatch(/^\s*(ALTER|UPDATE)\b.*company_user_id/im);
  });
});

test.describe('rollback', () => {
  test('drops every function the forward migration creates', () => {
    for (const rpc of [...RPCS, 'pb_company_audit', 'pb_company_role',
      'pb_is_company_member', 'pb_is_company_admin_or_owner']) {
      expect(ROLLBACK, `${rpc} must be dropped`).toContain(`DROP FUNCTION IF EXISTS public.${rpc}(`);
    }
  });

  test('drops the three tables', () => {
    for (const table of TABLES) {
      expect(ROLLBACK).toContain(`DROP TABLE IF EXISTS public.${table};`);
    }
  });

  test('tables drop BEFORE membership helpers (policies reference them — QA finding)', () => {
    const tablesPos = ROLLBACK.indexOf('DROP TABLE IF EXISTS public.app_companies;');
    const helperPos = ROLLBACK.indexOf('DROP FUNCTION IF EXISTS public.pb_is_company_member(uuid);');
    expect(tablesPos).toBeGreaterThan(-1);
    expect(helperPos).toBeGreaterThan(-1);
    expect(tablesPos).toBeLessThan(helperPos);
  });

  test('never touches legacy tables or audit history', () => {
    expect(ROLLBACK).not.toMatch(/DROP TABLE.*app_14da0f1941/i);
    expect(ROLLBACK).not.toMatch(/DELETE FROM public\.app_14da0f1941/i);
  });
});

test.describe('frontend wiring', () => {
  test('mutations go exclusively through RPCs — no direct table writes', () => {
    expect(CLIENT).not.toMatch(/\.from\('app_compan[^']*'\)\.(insert|update|delete|upsert)/);
    const rpcCalls = CLIENT.match(/supabase\.rpc\('(pb_company_[a-z_]+)'/g) ?? [];
    const called = new Set(rpcCalls.map((c) => c.match(/'(pb_company_[a-z_]+)'/)?.[1]));
    for (const rpc of RPCS) {
      expect(called.has(rpc), `${rpc} must be wrapped by the client`).toBe(true);
    }
  });

  test('the plain token is never persisted client-side (link built in memory)', () => {
    // Active company selection stores only the company UUID, never a token.
    expect(CLIENT).not.toMatch(/localStorage.*token/i);
  });
});

test.describe('observability (PostHog, no PII)', () => {
  test('all 8 events are registered in the closed allowlist', () => {
    for (const event of OBS_EVENTS) {
      expect(OBS).toContain(`'${event}'`);
      expect(OBS).toMatch(new RegExp(`${event}: \\[`));
    }
  });

  test('no event prop may carry PII (email, name, phone, token)', () => {
    for (const event of OBS_EVENTS) {
      const match = OBS.match(new RegExp(`${event}: \\[([^\\]]*)\\]`));
      expect(match, `${event} props`).toBeTruthy();
      const props = match?.[1] ?? '';
      expect(props).not.toMatch(/email|name|phone|token|fiscal|vat/i);
    }
  });
});

test.describe('i18n', () => {
  const REQUIRED_KEYS = [
    'loading',
    'switcher.label',
    'roles.owner', 'roles.admin', 'roles.recruiter', 'roles.viewer',
    'verification.unverified', 'verification.pending', 'verification.verified', 'verification.rejected',
    'create.title', 'create.nameLabel', 'create.submit',
    'view.title', 'view.verificationTitle', 'view.teamTitle', 'view.yourRoleTitle',
    'team.title', 'team.membersTitle', 'team.confirmRemove', 'team.confirmTransfer',
    'invite.title', 'invite.emailLabel', 'invite.submit', 'invite.created', 'invite.alreadyPending',
    'invitations.title', 'invitations.revoke',
    'invitations.status.pending', 'invitations.status.accepted', 'invitations.status.rejected',
    'invitations.status.revoked', 'invitations.status.expired',
    'accept.title', 'accept.sessionRequired', 'accept.question', 'accept.accept', 'accept.reject',
    'errors.not_authenticated', 'errors.forbidden', 'errors.not_found', 'errors.invalid_name',
    'errors.invalid_email', 'errors.invalid_role', 'errors.invalid_or_expired',
    'errors.email_mismatch', 'errors.not_active', 'errors.last_owner',
    'errors.cannot_transfer_to_self', 'errors.unknown',
  ];

  const dig = (obj: Record<string, unknown>, path: string) =>
    path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
      return undefined;
    }, obj);

  for (const locale of [['en', EN], ['es', ES]] as const) {
    test(`companyCore keys complete in ${locale[0]}`, () => {
      for (const key of REQUIRED_KEYS) {
        expect(dig(locale[1].companyCore, key), `companyCore.${key} in ${locale[0]}`).toBeTruthy();
      }
    });
  }

  test('nav keys exist in en and es', () => {
    expect(EN.nav.companyTenant).toBeTruthy();
    expect(EN.nav.companyTeam).toBeTruthy();
    expect(ES.nav.companyTenant).toBeTruthy();
    expect(ES.nav.companyTeam).toBeTruthy();
  });
});
