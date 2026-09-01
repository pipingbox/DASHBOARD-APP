/**
 * PB-ADMIN-WORKFORCE-001 — Internal Workforce Operations: domain logic.
 *
 * Single home for the workforce request state machine, the company-facing
 * projection, coverage maths and the audit vocabulary. Components must not
 * re-implement any of this.
 *
 * Production reality this module is built against (read-only diagnostic,
 * 43 rows in app_14da0f1941_workforce_requests):
 *   status   → new: 24 · cancelled: 19
 *   priority → normal: 41 · high: 2
 *   recruiter_assigned → NULL in all 43
 *
 * Nothing here migrates or rewrites those values. Legacy tokens are mapped on
 * READ only; no UPDATE is ever issued against existing data.
 */

import { supabase, TABLES } from '@/lib/supabase';

/* ─── Canonical state machine ─── */

export const WORKFORCE_STATUSES = [
  {
    value: 'new',
    label: 'New',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    dotColor: 'bg-blue-400',
  },
  {
    value: 'reviewing',
    label: 'Reviewing',
    color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    dotColor: 'bg-cyan-400',
  },
  {
    value: 'sourcing',
    label: 'Sourcing',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    dotColor: 'bg-purple-400',
  },
  {
    value: 'candidates_proposed',
    label: 'Candidates Proposed',
    color: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    dotColor: 'bg-violet-400',
  },
  {
    value: 'in_progress',
    label: 'In Progress',
    color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    dotColor: 'bg-indigo-400',
  },
  {
    value: 'completed',
    label: 'Completed',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    dotColor: 'bg-emerald-400',
  },
  {
    value: 'on_hold',
    label: 'On Hold',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    dotColor: 'bg-amber-400',
  },
  {
    value: 'cancelled',
    label: 'Cancelled',
    color: 'bg-red-500/10 text-red-400 border-red-500/30',
    dotColor: 'bg-red-400',
  },
] as const;

export type WorkforceStatus = (typeof WORKFORCE_STATUSES)[number]['value'];

/**
 * Tokens written by earlier iterations of the app. Mapped on read so no row is
 * ever mis-rendered, and never written back.
 *
 * `archived` was historically overloaded as a status. It is treated as an
 * archive flag, not as a pipeline state — see `isArchivedStatus`.
 */
export const LEGACY_STATUS_ALIASES: Record<string, WorkforceStatus> = {
  recruiting: 'sourcing',
  partially_staffed: 'in_progress',
  fully_staffed: 'in_progress',
  candidates_sent: 'candidates_proposed',
  closed: 'completed',
  rejected: 'cancelled',
  canceled: 'cancelled',
};

/** Statuses that were never part of the canonical set but exist as data. */
export function isArchivedStatus(raw: string | null | undefined): boolean {
  return (raw || '').toLowerCase() === 'archived';
}

/**
 * Resolve any stored value to a canonical status.
 * Returns `null` for values we have never seen, so the UI can show the raw
 * token instead of silently pretending it is something else — the exact bug
 * that made 19 `cancelled` rows render as "New" in the company view.
 */
export function normalizeStatus(raw: string | null | undefined): WorkforceStatus | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  if (WORKFORCE_STATUSES.some((s) => s.value === key)) return key as WorkforceStatus;
  return LEGACY_STATUS_ALIASES[key] ?? null;
}

const UNKNOWN_STATUS_STYLE = {
  color: 'bg-zinc-500/10 text-zinc-400 border-zinc-600',
  dotColor: 'bg-zinc-500',
};

/** Badge config for any stored value, including unknown ones. */
export function getWorkforceStatusConfig(raw: string | null | undefined): {
  value: string;
  label: string;
  color: string;
  dotColor: string;
  known: boolean;
} {
  if (isArchivedStatus(raw)) {
    return { value: 'archived', label: 'Archived', ...UNKNOWN_STATUS_STYLE, known: true };
  }
  const canonical = normalizeStatus(raw);
  if (canonical) {
    const cfg = WORKFORCE_STATUSES.find((s) => s.value === canonical)!;
    return { value: cfg.value, label: cfg.label, color: cfg.color, dotColor: cfg.dotColor, known: true };
  }
  return {
    value: raw || 'unknown',
    label: raw ? raw.replace(/_/g, ' ') : 'Unknown',
    ...UNKNOWN_STATUS_STYLE,
    known: false,
  };
}

/**
 * Allowed forward transitions. `on_hold` and `cancelled` are reachable from any
 * live state; `cancelled` is terminal, `completed` may only reopen to
 * `in_progress`.
 */
const BASE_TRANSITIONS: Record<WorkforceStatus, WorkforceStatus[]> = {
  new: ['reviewing', 'sourcing'],
  reviewing: ['sourcing', 'new'],
  sourcing: ['candidates_proposed', 'reviewing'],
  candidates_proposed: ['in_progress', 'sourcing'],
  in_progress: ['completed', 'candidates_proposed'],
  completed: ['in_progress'],
  on_hold: ['reviewing', 'sourcing', 'in_progress'],
  cancelled: ['new'],
};

const INTERRUPTIBLE: WorkforceStatus[] = ['new', 'reviewing', 'sourcing', 'candidates_proposed', 'in_progress'];

export function getAllowedTransitions(raw: string | null | undefined): WorkforceStatus[] {
  const current = normalizeStatus(raw);
  // Unknown or archived values: allow re-entry into the canonical machine
  // rather than trapping the record in a state the admin cannot leave.
  if (!current) return ['new', 'reviewing', 'sourcing', 'in_progress', 'completed', 'on_hold', 'cancelled'];

  const next = [...BASE_TRANSITIONS[current]];
  if (INTERRUPTIBLE.includes(current)) {
    if (!next.includes('on_hold')) next.push('on_hold');
    if (!next.includes('cancelled')) next.push('cancelled');
  }
  return next;
}

/* ─── Company-facing projection ─── */

export type CompanyStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';

const COMPANY_PROJECTION: Record<WorkforceStatus, CompanyStatus> = {
  new: 'NEW',
  reviewing: 'NEW',
  sourcing: 'IN_PROGRESS',
  candidates_proposed: 'IN_PROGRESS',
  in_progress: 'IN_PROGRESS',
  completed: 'COMPLETED',
  on_hold: 'ON_HOLD',
  cancelled: 'CANCELLED',
};

const COMPANY_STATUS_LABELS: Record<CompanyStatus, { label: string; color: string }> = {
  NEW: { label: 'New', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  COMPLETED: { label: 'Completed', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  ON_HOLD: { label: 'On Hold', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
};

/**
 * The simplified view a company is allowed to see. Internal granularity
 * (sourcing vs candidates_proposed) collapses into IN PROGRESS.
 */
export function getCompanyStatusConfig(raw: string | null | undefined): {
  value: string;
  label: string;
  color: string;
} {
  if (isArchivedStatus(raw)) {
    return { value: 'archived', label: 'Archived', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-600' };
  }
  const canonical = normalizeStatus(raw);
  if (!canonical) {
    return {
      value: raw || 'unknown',
      label: raw ? raw.replace(/_/g, ' ') : 'Unknown',
      color: 'bg-zinc-500/10 text-zinc-400 border-zinc-600',
    };
  }
  const projected = COMPANY_PROJECTION[canonical];
  return { value: projected, ...COMPANY_STATUS_LABELS[projected] };
}

/** Groups used by the company summary tiles. */
export function isPendingForCompany(raw: string | null | undefined): boolean {
  return getCompanyStatusConfig(raw).value === 'NEW';
}
export function isActiveForCompany(raw: string | null | undefined): boolean {
  return getCompanyStatusConfig(raw).value === 'IN_PROGRESS';
}
export function isFulfilledForCompany(raw: string | null | undefined): boolean {
  return getCompanyStatusConfig(raw).value === 'COMPLETED';
}

/* ─── Coverage (real values only — DEC-33) ─── */

export interface WorkforceCoverage {
  requested: number;
  assigned: number;
  percentage: number;
}

/**
 * Coverage derived strictly from stored values. No synthetic sub-buckets:
 * the platform only knows how many workers were requested and how many were
 * assigned, so that is all it may display.
 */
export function computeCoverage(req: {
  workers_requested?: number | null;
  workers_assigned?: number | null;
  coverage_percentage?: number | null;
}): WorkforceCoverage {
  const requested = Math.max(0, Number(req.workers_requested) || 0);
  const assigned = Math.max(0, Number(req.workers_assigned) || 0);
  const stored = Number(req.coverage_percentage);
  const percentage =
    Number.isFinite(stored) && stored > 0
      ? Math.min(100, Math.round(stored))
      : requested > 0
        ? Math.min(100, Math.round((assigned / requested) * 100))
        : 0;
  return { requested, assigned, percentage };
}

export function getCoverageTone(percentage: number): { text: string; bar: string } {
  if (percentage >= 100) return { text: 'text-emerald-400', bar: '#10b981' };
  if (percentage >= 50) return { text: 'text-amber-400', bar: '#f59e0b' };
  return { text: 'text-red-400', bar: '#ef4444' };
}

/* ─── Candidate pipeline ─── */

/**
 * Stages stored in app_14da0f1941_workforce_assignments.status.
 * The table exists with 0 rows, so this vocabulary is defined without any
 * migration of existing data.
 */
export const CANDIDATE_STAGES = [
  { value: 'shortlisted', label: 'Shortlisted', color: 'bg-zinc-500/10 text-zinc-300 border-zinc-600' },
  { value: 'proposed', label: 'Proposed', color: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
  { value: 'accepted', label: 'Accepted', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
  { value: 'deployed', label: 'Deployed', color: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
] as const;

export type CandidateStage = (typeof CANDIDATE_STAGES)[number]['value'];

/** Stages that count towards `workers_assigned`. */
export const COVERAGE_COUNTING_STAGES: CandidateStage[] = ['accepted', 'deployed'];

export function getCandidateStageConfig(raw: string | null | undefined) {
  return CANDIDATE_STAGES.find((s) => s.value === raw) ?? CANDIDATE_STAGES[0];
}

/**
 * SECURITY GATE — PB-SEC-RLS-ASSIGNMENTS-001 + PB-SEC-RLS-AUDITLOG-001.
 *
 * Verified against production on 2026-08-31:
 *
 *   workforce_assignments — 0 rows, RLS enabled, but carrying legacy permissive
 *   policies (`public` SELECT/INSERT/UPDATE/DELETE with `true`, plus
 *   `authenticated` equivalents). No effective Data API grants exist today, so
 *   the exposure is *dormant*, not absent: the policies are wide open and only
 *   the missing grant is holding the door shut.
 *
 * That distinction is the whole reason this flag exists. Grants are the door;
 * policies are the filter, and they are only evaluated once the door opens.
 * Granting Data API access before rewriting the policies would publish worker
 * names, positions and internal notes to anonymous callers in the same instant.
 *
 * Order of operations, no shortcuts:
 *   1. apply `sql/PB-SEC-RLS-ASSIGNMENTS-001-rls.sql`  (policies, then grants)
 *   2. apply `sql/PB-SEC-RLS-AUDITLOG-001-rls.sql`
 *   3. run   `sql/PB-ADMIN-WORKFORCE-001-verification.sql` — all checks PASS
 *   4. only then flip this to `true`
 */
export const CANDIDATE_PIPELINE_ENABLED = false;

export const CANDIDATE_PIPELINE_BLOCKED_REASON =
  'Candidate pipeline is locked until PB-SEC-RLS-ASSIGNMENTS-001 (legacy permissive RLS on workforce_assignments) is applied and verified in production.';

/* ─── Column allow-lists ─── */

/**
 * Columns the company view is allowed to pull.
 *
 * `wr_auth_select_own_or_admin` grants SELECT on the whole row, so `select('*')`
 * ships every administrative column to the browser even when the UI does not
 * render it. Any internal field must be kept out of this list — and internal
 * notes must not live on this table at all (see `logWorkforceNote`).
 *
 * Be honest about what this list does and does not buy: it shrinks the payload
 * the app requests, it does NOT make the excluded columns unreadable. RLS has no
 * column masking, so a company can still ask the Data API for `notes` or
 * `recruiter_assigned` directly. The real control is that `notes` is never
 * written (deprecated at the schema level) and `recruiter_assigned` only ever
 * holds a display name, never an email. Closing that gap structurally is
 * PB-SEC-INTERNAL-DATA-001.
 */
export const COMPANY_REQUEST_COLUMNS = [
  'id',
  'company_name',
  'contact_person',
  'country',
  'worker_type',
  'workers_requested',
  'workers_assigned',
  'coverage_percentage',
  'estimated_start_date',
  'project_duration',
  'priority',
  'status',
  // `recruiter_assigned` is deliberately absent: internal staffing ownership is
  // not part of the company-facing contract. Never add `notes` here.
  'documentation_progress',
  'created_at',
].join(', ');

/* ─── Postgres error helpers ─── */

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

/** 42703 — undefined_column. Used by the capability probe. */
export function isMissingColumnError(error: PostgrestLikeError | null | undefined): boolean {
  return error?.code === '42703';
}

/** 23514 — check_violation. Surfaces a CHECK constraint rejecting a new token. */
export function isCheckViolation(error: PostgrestLikeError | null | undefined): boolean {
  return error?.code === '23514';
}

/**
 * Turn an opaque Postgres failure into something an operator can act on.
 * A silent "update failed" is what hides schema drift for months.
 */
export function describeWorkforceError(error: PostgrestLikeError | null | undefined): string {
  if (!error) return 'Unknown error';
  if (isCheckViolation(error)) {
    return `Database rejected the value: ${error.message ?? 'check constraint violation'}. The status CHECK constraint needs widening — see brain/03-ENGINEERING/sql/PB-ADMIN-WORKFORCE-001-schema.sql.`;
  }
  if (isMissingColumnError(error)) {
    return `Column does not exist yet: ${error.message ?? 'undefined column'}. See brain/03-ENGINEERING/sql/PB-ADMIN-WORKFORCE-001-schema.sql.`;
  }
  return error.message ?? 'Unknown error';
}

/* ─── Schema capability probe ─── */

export interface WorkforceCapabilities {
  /** `archived` boolean column present on workforce_requests. */
  archived: boolean;
}

let capabilitiesPromise: Promise<WorkforceCapabilities> | null = null;

/**
 * One cheap probe per session, cached. Lets the archive control degrade
 * honestly (disabled, with a reason) instead of failing silently when the
 * column has not been created yet.
 */
export function detectWorkforceCapabilities(): Promise<WorkforceCapabilities> {
  if (!capabilitiesPromise) {
    capabilitiesPromise = (async () => {
      const { error } = await supabase
        .from(TABLES.workforceRequests)
        .select('archived')
        .limit(1);
      return { archived: !isMissingColumnError(error) && !error };
    })();
  }
  return capabilitiesPromise;
}

/* ─── Audit vocabulary & event emission ─── */

export const WORKFORCE_TARGET_TYPE = 'workforce_request';

export const WORKFORCE_AUDIT_ACTIONS = {
  statusChange: 'workforce_status_change',
  priorityChange: 'workforce_priority_change',
  recruiterAssigned: 'workforce_recruiter_assigned',
  note: 'workforce_note',
  candidateAdded: 'workforce_candidate_added',
  candidateStage: 'workforce_candidate_stage',
  candidateRemoved: 'workforce_candidate_removed',
  coverageUpdate: 'workforce_coverage_update',
  archived: 'workforce_archived',
} as const;

export type WorkforceAuditAction =
  (typeof WORKFORCE_AUDIT_ACTIONS)[keyof typeof WORKFORCE_AUDIT_ACTIONS];

export const WORKFORCE_ACTION_LABELS: { value: string; label: string; color: string }[] = [
  { value: WORKFORCE_AUDIT_ACTIONS.statusChange, label: 'WF Status', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.priorityChange, label: 'WF Priority', color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.recruiterAssigned, label: 'WF Recruiter', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.note, label: 'WF Note', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.candidateAdded, label: 'WF Candidate Added', color: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.candidateStage, label: 'WF Candidate Stage', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.candidateRemoved, label: 'WF Candidate Removed', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.coverageUpdate, label: 'WF Coverage', color: 'bg-teal-500/10 text-teal-400 border-teal-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.archived, label: 'WF Archived', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' },
];

export interface WorkforceTimelineEntry {
  id: string;
  created_at: string;
  actor_email: string | null;
  action_type: string;
  details: string | null;
}

/**
 * Timeline for one request: the audit trail plus a synthesised "created" event,
 * since the original submission predates any audit logging.
 */
export async function fetchWorkforceTimeline(
  requestId: string,
  createdAt?: string | null,
): Promise<WorkforceTimelineEntry[]> {
  const { data, error } = await supabase
    .from(TABLES.auditLogs)
    .select('id, created_at, actor_email, action_type, details')
    .eq('target_type', WORKFORCE_TARGET_TYPE)
    .eq('target_id', requestId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[WorkforceAdmin] Timeline fetch failed:', error.message);
  }

  const entries = ((data || []) as WorkforceTimelineEntry[]).slice();

  if (createdAt) {
    entries.push({
      id: `synthetic-created-${requestId}`,
      created_at: createdAt,
      actor_email: null,
      action_type: 'workforce_request_created',
      details: 'Request submitted through the public workforce form.',
    });
  }

  return entries.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/**
 * Append-only internal note.
 *
 * Notes go to the audit log rather than to a column on workforce_requests: the
 * company holds SELECT on its own rows, so anything stored there travels to the
 * client. The audit table is never queried by company-facing code.
 */
export async function logWorkforceNote(requestId: string, note: string): Promise<boolean> {
  return emitWorkforceEvent({
    action: WORKFORCE_AUDIT_ACTIONS.note,
    requestId,
    details: note,
  });
}

/**
 * Fase D event surface. Every operational event funnels through here so future
 * fan-out (in-app notification, digest, webhook) has one insertion point.
 * No new mail provider: the existing SMTP alert stays untouched.
 */
export async function emitWorkforceEvent(params: {
  action: WorkforceAuditAction | string;
  requestId: string;
  details: string;
  /** Optional actor id, recorded so `recruiter_user_id` can be backfilled later. */
  actorUserId?: string | null;
}): Promise<boolean> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData?.session?.user?.email;

    // `al_admin_insert` enforces `actor_email = auth.jwt() ->> 'email'` so the
    // audit trail actually proves who did what. A placeholder like 'unknown'
    // would be rejected by the policy anyway; failing here gives a readable
    // reason instead of an opaque RLS violation.
    if (!email) {
      console.error('[WorkforceAdmin] Event emit aborted: no authenticated session email.');
      return false;
    }

    const suffix = params.actorUserId ? ` [user_id:${params.actorUserId}]` : '';

    const { error } = await supabase.from(TABLES.auditLogs).insert({
      actor_email: email,
      action_type: params.action,
      target_type: WORKFORCE_TARGET_TYPE,
      target_id: params.requestId,
      details: `${params.details}${suffix}`,
    });

    if (error) {
      console.error('[WorkforceAdmin] Event emit failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[WorkforceAdmin] Event emit crashed:', err);
    return false;
  }
}

/* ─── Recruiter directory ─── */

export interface RecruiterOption {
  user_id: string;
  name: string;
}

/**
 * Internal staff eligible to own a request.
 *
 * Queries both roles even though `jobs_moderator` has zero members today, so
 * the selector fills itself once recruiters exist — no code change required.
 *
 * The display name (not the email) is what gets written to
 * `recruiter_assigned`: the company reads that column, and internal staff
 * emails should not travel to a customer's browser. The `user_id` is recorded
 * in the audit entry instead, which is what a future `recruiter_user_id`
 * backfill will read from.
 */
export async function fetchRecruiterOptions(): Promise<RecruiterOption[]> {
  const { data, error } = await supabase
    .from(TABLES.profiles)
    .select('user_id, full_name, username, role')
    .in('role', ['admin', 'jobs_moderator'])
    .order('full_name', { ascending: true });

  if (error) {
    console.error('[WorkforceAdmin] Recruiter fetch failed:', error.message);
    return [];
  }

  return (data || [])
    .map((row: Record<string, unknown>) => ({
      user_id: String(row.user_id ?? ''),
      name: String(row.full_name || row.username || '').trim(),
    }))
    .filter((r) => r.user_id && r.name);
}

/* ─── Documentation progress ─── */

export const DEFAULT_DOCUMENTATION_KEYS = [
  'contracts',
  'certifications',
  'onboarding',
  'compliance',
  'medical',
  'payroll',
] as const;

export function normalizeDocumentationProgress(
  raw: unknown,
): Record<string, boolean> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const entries = Object.entries(raw as Record<string, unknown>);
    if (entries.length > 0) {
      return Object.fromEntries(entries.map(([k, v]) => [k, Boolean(v)]));
    }
  }
  return Object.fromEntries(DEFAULT_DOCUMENTATION_KEYS.map((k) => [k, false]));
}

export function getDocumentationStats(progress: Record<string, boolean>): {
  done: number;
  total: number;
  percentage: number;
} {
  const values = Object.values(progress);
  const done = values.filter(Boolean).length;
  const total = values.length;
  return { done, total, percentage: total > 0 ? Math.round((done / total) * 100) : 0 };
}
