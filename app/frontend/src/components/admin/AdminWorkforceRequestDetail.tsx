import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import {
  X,
  Building2,
  Mail,
  MapPin,
  Calendar,
  Clock,
  MessageSquare,
  Users,
  FileText,
  Activity,
  UserCheck,
  Lock,
  Archive,
  ArchiveRestore,
  Search,
  Plus,
  UserX,
  Save,
  Copy,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { WORKFORCE_PRIORITIES } from '@/lib/workforce-pipeline';
import {
  WORKFORCE_STATUSES,
  WORKFORCE_AUDIT_ACTIONS,
  CANDIDATE_STAGES,
  CANDIDATE_PIPELINE_ENABLED,
  CANDIDATE_PIPELINE_BLOCKED_REASON,
  COVERAGE_COUNTING_STAGES,
  getWorkforceStatusConfig,
  getCandidateStageConfig,
  getAllowedTransitions,
  getCompanyStatusConfig,
  computeCoverage,
  getCoverageTone,
  describeWorkforceError,
  saveInternalRecruiter,
  INTERNAL_STORE_BLOCKED_REASON,
  emitWorkforceEvent,
  logWorkforceNote,
  fetchWorkforceTimeline,
  fetchRecruiterOptions,
  normalizeDocumentationProgress,
  getDocumentationStats,
  type WorkforceCapabilities,
  type WorkforceTimelineEntry,
  type RecruiterOption,
  type CandidateStage,
} from '@/lib/workforce-admin';

/* ─── Types ─── */

export interface WorkforceRequestRow {
  id: string;
  company_name: string | null;
  contact_person: string | null;
  email: string | null;
  country: string | null;
  worker_type: string | null;
  workers_requested: number | null;
  workers_assigned: number | null;
  coverage_percentage: number | null;
  estimated_start_date: string | null;
  project_duration: string | null;
  priority: string | null;
  status: string | null;
  message: string | null;
  documentation_progress: unknown;
  created_at: string | null;
  /** Present only if the column exists — see PB-ADMIN-WORKFORCE-001-schema.sql. */
  updated_at?: string | null;
  archived?: boolean | null;
  /**
   * Merged in memory from the admin-only internal store, never selected from
   * `workforce_requests`. The deprecated `recruiter_assigned` column is
   * deliberately absent from this type so it cannot be read by accident —
   * see PB-SEC-INTERNAL-DATA-001.
   */
  recruiter_name?: string | null;
  recruiter_user_id?: string | null;
}

interface CandidateRow {
  id: string;
  request_id: string;
  worker_id: string;
  worker_name: string | null;
  worker_position: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
}

interface WorkerOption {
  user_id: string;
  full_name: string | null;
  username: string | null;
  title: string | null;
  location: string | null;
}

interface Props {
  request: WorkforceRequestRow;
  capabilities: WorkforceCapabilities;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<WorkforceRequestRow>) => void;
}

export function AdminWorkforceRequestDetail({ request, capabilities, onClose, onPatch }: Props) {
  const [saving, setSaving] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<WorkforceTimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [recruiters, setRecruiters] = useState<RecruiterOption[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [assignedInput, setAssignedInput] = useState(String(request.workers_assigned ?? 0));

  const coverage = computeCoverage(request);
  const tone = getCoverageTone(coverage.percentage);
  const status = getWorkforceStatusConfig(request.status);
  const companyStatus = getCompanyStatusConfig(request.status);
  const docs = useMemo(
    () => normalizeDocumentationProgress(request.documentation_progress),
    [request.documentation_progress],
  );
  const docStats = getDocumentationStats(docs);
  const isArchived = capabilities.archived
    ? Boolean(request.archived)
    : (request.status || '').toLowerCase() === 'archived';

  const reloadTimeline = useCallback(async () => {
    setTimelineLoading(true);
    const entries = await fetchWorkforceTimeline(request.id, request.created_at);
    setTimeline(entries);
    setTimelineLoading(false);
  }, [request.id, request.created_at]);

  useEffect(() => {
    reloadTimeline();
    fetchRecruiterOptions().then(setRecruiters);
  }, [reloadTimeline]);

  useEffect(() => {
    setAssignedInput(String(request.workers_assigned ?? 0));
  }, [request.workers_assigned]);

  /* ─── Mutations ─── */

  const persist = useCallback(
    async (
      patch: Partial<WorkforceRequestRow>,
      audit: { action: string; details: string; actorUserId?: string | null },
      key: string,
    ) => {
      setSaving(key);
      const { error } = await supabase
        .from(TABLES.workforceRequests)
        .update(patch)
        .eq('id', request.id);

      if (error) {
        console.error('[AdminWorkforceDetail] Update failed:', error.message);
        toast.error(describeWorkforceError(error));
        setSaving(null);
        return false;
      }

      onPatch(request.id, patch);
      await emitWorkforceEvent({
        action: audit.action,
        requestId: request.id,
        details: audit.details,
        actorUserId: audit.actorUserId,
      });
      await reloadTimeline();
      setSaving(null);
      return true;
    },
    [request.id, onPatch, reloadTimeline],
  );

  const changeStatus = async (next: string) => {
    const from = getWorkforceStatusConfig(request.status).label;
    const to = getWorkforceStatusConfig(next).label;
    const ok = await persist(
      { status: next },
      { action: WORKFORCE_AUDIT_ACTIONS.statusChange, details: `Status ${from} → ${to}` },
      'status',
    );
    if (ok) toast.success(`Status set to ${to}`);
  };

  const changePriority = async (next: string) => {
    const label = WORKFORCE_PRIORITIES.find((p) => p.value === next)?.label ?? next;
    const ok = await persist(
      { priority: next },
      { action: WORKFORCE_AUDIT_ACTIONS.priorityChange, details: `Priority set to ${label}` },
      'priority',
    );
    if (ok) toast.success(`Priority set to ${label}`);
  };

  /**
   * Assign the recruiter who owns this request.
   *
   * Writes to the admin-only internal store, not to `workforce_requests`. The
   * company can SELECT its own request row column by column through the Data
   * API, so internal ownership cannot live there whatever the UI renders.
   */
  const assignRecruiter = async (userId: string) => {
    const option = recruiters.find((r) => r.user_id === userId) ?? null;
    setSaving('recruiter');

    const { ok, error } = await saveInternalRecruiter(request.id, option);
    if (!ok) {
      toast.error(error ?? 'Failed to assign recruiter');
      setSaving(null);
      return;
    }

    onPatch(request.id, {
      recruiter_name: option?.name ?? null,
      recruiter_user_id: option?.user_id ?? null,
    });
    await emitWorkforceEvent({
      action: WORKFORCE_AUDIT_ACTIONS.recruiterAssigned,
      requestId: request.id,
      details: option ? `Recruiter assigned: ${option.name}` : 'Recruiter unassigned',
      actorUserId: option?.user_id ?? null,
    });
    await reloadTimeline();
    setSaving(null);
    toast.success(option ? `Assigned to ${option.name}` : 'Recruiter cleared');
  };

  const saveStaffing = async () => {
    const assigned = Math.max(0, parseInt(assignedInput, 10) || 0);
    const requested = coverage.requested;
    const percentage = requested > 0 ? Math.min(100, Math.round((assigned / requested) * 100)) : 0;
    const ok = await persist(
      { workers_assigned: assigned, coverage_percentage: percentage },
      {
        action: WORKFORCE_AUDIT_ACTIONS.coverageUpdate,
        details: `Staffing set to ${assigned}/${requested} (${percentage}% coverage)`,
      },
      'staffing',
    );
    if (ok) toast.success(`Coverage updated to ${percentage}%`);
  };

  const toggleArchive = async () => {
    if (!capabilities.archived) return;
    const next = !isArchived;
    const ok = await persist(
      { archived: next },
      {
        action: WORKFORCE_AUDIT_ACTIONS.archived,
        details: next ? 'Request archived' : 'Request restored from archive',
      },
      'archive',
    );
    if (ok) toast.success(next ? 'Request archived' : 'Request restored');
  };

  const toggleDoc = async (key: string) => {
    const next = { ...docs, [key]: !docs[key] };
    const stats = getDocumentationStats(next);
    const ok = await persist(
      { documentation_progress: next },
      {
        action: WORKFORCE_AUDIT_ACTIONS.coverageUpdate,
        details: `Documentation "${key}" marked ${next[key] ? 'complete' : 'pending'} (${stats.done}/${stats.total})`,
      },
      `doc-${key}`,
    );
    if (!ok) return;
  };

  const addNote = async () => {
    const text = noteInput.trim();
    if (!text) return;
    setSaving('note');
    const ok = await logWorkforceNote(request.id, text);
    if (ok) {
      setNoteInput('');
      toast.success('Internal note added');
      await reloadTimeline();
    } else {
      toast.error('Failed to save the internal note');
    }
    setSaving(null);
  };

  const copyEmail = () => {
    if (!request.email) return;
    navigator.clipboard.writeText(request.email);
    toast.success('Email copied');
  };

  const allowedTransitions = getAllowedTransitions(request.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-3xl h-full overflow-y-auto border-l border-zinc-800 bg-[#0a0a0a]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-800 bg-[#0a0a0a] px-6 py-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Workforce Request</p>
            <h3 className="text-lg font-semibold text-zinc-100 truncate">
              {request.company_name || 'Unknown company'}
            </h3>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider ${status.color}`}
              >
                {!status.known && <AlertTriangle className="h-2.5 w-2.5" />}
                {status.label}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-zinc-600">
                company sees: {companyStatus.label}
              </span>
              <span className={`text-xs font-bold ${tone.text}`}>
                {coverage.assigned}/{coverage.requested} · {coverage.percentage}%
              </span>
              {isArchived && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-zinc-700 bg-zinc-500/10 text-[9px] uppercase tracking-wider text-zinc-400">
                  Archived
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-sm border border-zinc-800 p-1.5 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ── 1. Request Overview ── */}
          <Block title="Request Overview" icon={Building2}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Company" value={request.company_name} icon={Building2} />
              <Field label="Contact Person" value={request.contact_person} icon={UserCheck} />
              <Field
                label="Email"
                value={request.email}
                icon={Mail}
                action={
                  request.email ? (
                    <button onClick={copyEmail} className="text-zinc-600 hover:text-[#f59e0b] transition">
                      <Copy className="h-3 w-3" />
                    </button>
                  ) : undefined
                }
              />
              <Field label="Country" value={request.country} icon={MapPin} />
              <Field label="Worker Type" value={request.worker_type} icon={Users} />
              <Field label="Workers Requested" value={String(coverage.requested)} icon={Users} />
              <Field
                label="Estimated Start"
                value={
                  request.estimated_start_date
                    ? new Date(request.estimated_start_date).toLocaleDateString()
                    : null
                }
                icon={Calendar}
              />
              <Field label="Project Duration" value={request.project_duration} icon={Clock} />
              <Field
                label="Priority"
                value={WORKFORCE_PRIORITIES.find((p) => p.value === (request.priority || 'normal'))?.label}
                icon={AlertTriangle}
              />
              <Field
                label="Created"
                value={request.created_at ? new Date(request.created_at).toLocaleString() : null}
                icon={Clock}
              />
            </div>

            {request.message && (
              <div className="mt-4 border-t border-zinc-800/60 pt-3">
                <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="h-3 w-3" />
                  Original Message
                </p>
                <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed bg-zinc-950/60 border border-zinc-800/60 rounded-sm p-3">
                  {request.message}
                </p>
              </div>
            )}
          </Block>

          {/* ── 2. Internal Management ── */}
          <Block title="Internal Management" icon={UserCheck}>
            <div className="grid grid-cols-2 gap-4">
              <Control label="Status">
                <select
                  value=""
                  disabled={saving === 'status'}
                  onChange={(e) => e.target.value && changeStatus(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#f59e0b] disabled:opacity-40"
                >
                  <option value="">
                    {saving === 'status' ? 'Saving…' : `Current: ${status.label} — move to…`}
                  </option>
                  {allowedTransitions.map((s) => (
                    <option key={s} value={s}>
                      {WORKFORCE_STATUSES.find((x) => x.value === s)?.label ?? s}
                    </option>
                  ))}
                </select>
                {!status.known && (
                  <p className="mt-1 text-[10px] text-amber-400">
                    Stored value “{request.status}” is not part of the canonical state machine. It is
                    shown as-is and never rewritten automatically.
                  </p>
                )}
              </Control>

              <Control label="Priority">
                <select
                  value={request.priority || 'normal'}
                  disabled={saving === 'priority'}
                  onChange={(e) => changePriority(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#f59e0b] disabled:opacity-40"
                >
                  {WORKFORCE_PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </Control>

              <Control label="Recruiter / Owner">
                <select
                  value={request.recruiter_user_id ?? ''}
                  disabled={saving === 'recruiter' || !capabilities.internalStore}
                  onChange={(e) => assignRecruiter(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#f59e0b] disabled:opacity-40"
                >
                  <option value="">— Unassigned —</option>
                  {recruiters.map((r) => (
                    <option key={r.user_id} value={r.user_id}>{r.name}</option>
                  ))}
                </select>
                {!capabilities.internalStore ? (
                  <p className="mt-1 text-[10px] text-amber-400 leading-relaxed">
                    {INTERNAL_STORE_BLOCKED_REASON}
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-[10px] text-zinc-600">
                      Stored in the admin-only internal store. Never visible to the company.
                    </p>
                    {recruiters.length === 0 && (
                      <p className="mt-1 text-[10px] text-zinc-500">
                        No internal staff found. The list fills automatically once users hold the
                        admin or jobs moderator role.
                      </p>
                    )}
                    {request.recruiter_name &&
                      !recruiters.some((r) => r.user_id === request.recruiter_user_id) && (
                        <p className="mt-1 text-[10px] text-amber-400">
                          Currently “{request.recruiter_name}”, which no longer matches an internal
                          profile.
                        </p>
                      )}
                  </>
                )}
              </Control>

              <Control label="Workers Assigned">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={assignedInput}
                    onChange={(e) => setAssignedInput(e.target.value)}
                    className="w-20 bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                  />
                  <span className="text-[10px] text-zinc-600">of {coverage.requested}</span>
                  <button
                    onClick={saveStaffing}
                    disabled={saving === 'staffing' || assignedInput === String(request.workers_assigned ?? 0)}
                    className="inline-flex items-center gap-1 rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/30 px-2 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#f59e0b] hover:bg-[#f59e0b]/20 transition disabled:opacity-30"
                  >
                    {saving === 'staffing' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save
                  </button>
                </div>
              </Control>
            </div>

            {/* Coverage bar */}
            <div className="mt-4 border-t border-zinc-800/60 pt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">Coverage</span>
                <span className={`text-sm font-bold ${tone.text}`}>
                  {coverage.requested} requested / {coverage.assigned} assigned / {coverage.percentage}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${coverage.percentage}%`, backgroundColor: tone.bar }}
                />
              </div>
            </div>

            {/* Archive */}
            <div className="mt-4 border-t border-zinc-800/60 pt-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">Archive</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  {capabilities.archived
                    ? 'Archived requests stay queryable but drop out of the active queue.'
                    : 'Unavailable: the `archived` column does not exist yet (PB-ADMIN-WORKFORCE-001-schema.sql).'}
                </p>
              </div>
              <button
                onClick={toggleArchive}
                disabled={!capabilities.archived || saving === 'archive'}
                title={capabilities.archived ? undefined : 'Requires the archived column'}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isArchived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
                {isArchived ? 'Restore' : 'Archive'}
              </button>
            </div>

            {/* Internal notes */}
            <div className="mt-4 border-t border-zinc-800/60 pt-3">
              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-1.5 flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3" />
                Internal Note
              </p>
              <p className="text-[10px] text-zinc-600 mb-2">
                Append-only. Stored in the audit trail, never on the request row — the company holds
                SELECT on its own rows, so anything written there would reach its browser.
              </p>
              <textarea
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                rows={3}
                placeholder="Context for the team: blockers, client calls, sourcing decisions..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-[#f59e0b] resize-none"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={addNote}
                  disabled={!noteInput.trim() || saving === 'note'}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-[#f59e0b] px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] font-semibold text-black hover:bg-[#d97706] transition disabled:opacity-30"
                >
                  {saving === 'note' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Add Note
                </button>
              </div>
            </div>
          </Block>

          {/* ── 3. Candidate Pipeline ── */}
          <CandidatePipelineBlock
            requestId={request.id}
            requestedWorkers={coverage.requested}
            onCoverageRecalculated={(assigned, percentage) => {
              onPatch(request.id, { workers_assigned: assigned, coverage_percentage: percentage });
              reloadTimeline();
            }}
          />

          {/* ── 4. Documentation ── */}
          <Block title="Documentation" icon={FileText}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-zinc-500">
                {docStats.done} of {docStats.total} complete
              </span>
              <span
                className={`text-sm font-bold ${getCoverageTone(docStats.percentage).text}`}
              >
                {docStats.percentage}%
              </span>
            </div>
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${docStats.percentage}%`,
                  backgroundColor: getCoverageTone(docStats.percentage).bar,
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(docs).map(([key, done]) => (
                <button
                  key={key}
                  onClick={() => toggleDoc(key)}
                  disabled={saving === `doc-${key}`}
                  className={`flex items-center gap-2 rounded-sm border px-2.5 py-2 text-left transition disabled:opacity-40 ${
                    done
                      ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50'
                      : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${done ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                  />
                  <span className={`text-xs capitalize ${done ? 'text-emerald-300' : 'text-zinc-400'}`}>
                    {key.replace(/_/g, ' ')}
                  </span>
                </button>
              ))}
            </div>
          </Block>

          {/* ── 5. Activity / Timeline ── */}
          <Block
            title="Activity"
            icon={Activity}
            action={
              <button
                onClick={reloadTimeline}
                className="text-zinc-600 hover:text-[#f59e0b] transition"
                title="Reload timeline"
              >
                <RefreshCw className={`h-3 w-3 ${timelineLoading ? 'animate-spin' : ''}`} />
              </button>
            }
          >
            {timelineLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-[#f59e0b]" />
              </div>
            ) : timeline.length === 0 ? (
              <p className="text-xs text-zinc-600 py-4 text-center">No activity recorded yet.</p>
            ) : (
              <ol className="relative border-l border-zinc-800 ml-1.5 space-y-3">
                {timeline.map((entry) => (
                  <li key={entry.id} className="ml-4">
                    <span className="absolute -left-[5px] h-2 w-2 rounded-full bg-[#f59e0b]" />
                    <p className="text-xs text-zinc-300 leading-snug">{entry.details || '—'}</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">
                      {new Date(entry.created_at).toLocaleString()}
                      {entry.actor_email ? ` · ${entry.actor_email}` : ' · system'}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Block>
        </div>
      </div>
    </div>
  );
}

/* ─── Candidate pipeline ─── */

function CandidatePipelineBlock({
  requestId,
  requestedWorkers,
  onCoverageRecalculated,
}: {
  requestId: string;
  requestedWorkers: number;
  onCoverageRecalculated: (assigned: number, percentage: number) => void;
}) {
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(CANDIDATE_PIPELINE_ENABLED);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WorkerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!CANDIDATE_PIPELINE_ENABLED) return;
    setLoading(true);
    const { data, error } = await supabase
      .from(TABLES.workforceAssignments)
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[CandidatePipeline] Fetch failed:', error.message);
      toast.error(`Failed to load candidates: ${error.message}`);
    } else {
      setCandidates((data || []) as CandidateRow[]);
    }
    setLoading(false);
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  const searchWorkers = async () => {
    const q = query.trim();
    if (q.length < 2) {
      toast.error('Type at least 2 characters');
      return;
    }
    setSearching(true);
    const { data, error } = await supabase
      .from(TABLES.profiles)
      .select('user_id, full_name, username, title, location')
      .in('role', ['worker', 'user'])
      .or(`full_name.ilike.%${q}%,username.ilike.%${q}%,title.ilike.%${q}%`)
      .limit(20);
    if (error) {
      console.error('[CandidatePipeline] Worker search failed:', error.message);
      toast.error(`Search failed: ${error.message}`);
      setResults([]);
    } else {
      setResults((data || []) as WorkerOption[]);
    }
    setSearching(false);
  };

  const addCandidate = async (worker: WorkerOption) => {
    if (candidates.some((c) => c.worker_id === worker.user_id)) {
      toast.error('That worker is already in this pipeline');
      return;
    }
    setBusy(worker.user_id);
    // worker_name / worker_position are denormalised on purpose: the operational
    // file must stay readable even if the profile changes or is deleted.
    const { error } = await supabase.from(TABLES.workforceAssignments).insert({
      request_id: requestId,
      worker_id: worker.user_id,
      worker_name: worker.full_name || worker.username || 'Unknown',
      worker_position: worker.title || null,
      status: 'shortlisted',
    });
    if (error) {
      console.error('[CandidatePipeline] Insert failed:', error.message);
      toast.error(`Failed to add candidate: ${error.message}`);
    } else {
      await emitWorkforceEvent({
        action: WORKFORCE_AUDIT_ACTIONS.candidateAdded,
        requestId,
        details: `Candidate shortlisted: ${worker.full_name || worker.username || worker.user_id}`,
        actorUserId: worker.user_id,
      });
      toast.success('Candidate shortlisted');
      setResults((prev) => prev.filter((r) => r.user_id !== worker.user_id));
      await load();
    }
    setBusy(null);
  };

  const changeStage = async (candidate: CandidateRow, stage: CandidateStage) => {
    setBusy(candidate.id);
    const { error } = await supabase
      .from(TABLES.workforceAssignments)
      .update({ status: stage })
      .eq('id', candidate.id);
    if (error) {
      toast.error(`Failed to update stage: ${error.message}`);
    } else {
      await emitWorkforceEvent({
        action: WORKFORCE_AUDIT_ACTIONS.candidateStage,
        requestId,
        details: `${candidate.worker_name || 'Candidate'} → ${getCandidateStageConfig(stage).label}`,
      });
      await load();
    }
    setBusy(null);
  };

  /**
   * Withdraw a candidate from the pipeline.
   *
   * This is deliberately an UPDATE to the `rejected` stage and not a DELETE.
   * PB-SEC-RLS-ASSIGNMENTS-001 grants no DELETE to anyone, admin included: a
   * hard delete would erase the candidate's history from the case file, which
   * is exactly what an ATS must never lose. Genuine mistyped-entry corrections
   * are rare and are handled by supervised SQL, not by a one-click button in
   * production.
   */
  const rejectCandidate = async (candidate: CandidateRow) => {
    setBusy(candidate.id);
    const { error } = await supabase
      .from(TABLES.workforceAssignments)
      .update({ status: 'rejected' })
      .eq('id', candidate.id);
    if (error) {
      toast.error(`Failed to withdraw candidate: ${describeWorkforceError(error)}`);
    } else {
      await emitWorkforceEvent({
        action: WORKFORCE_AUDIT_ACTIONS.candidateRemoved,
        requestId,
        details: `Candidate withdrawn (moved to rejected): ${candidate.worker_name || candidate.worker_id}`,
      });
      await load();
    }
    setBusy(null);
  };

  const recalculateCoverage = async () => {
    const assigned = candidates.filter((c) =>
      COVERAGE_COUNTING_STAGES.includes((c.status || '') as CandidateStage),
    ).length;
    const percentage =
      requestedWorkers > 0 ? Math.min(100, Math.round((assigned / requestedWorkers) * 100)) : 0;

    setBusy('recalc');
    const { error } = await supabase
      .from(TABLES.workforceRequests)
      .update({ workers_assigned: assigned, coverage_percentage: percentage })
      .eq('id', requestId);
    if (error) {
      toast.error(describeWorkforceError(error));
    } else {
      await emitWorkforceEvent({
        action: WORKFORCE_AUDIT_ACTIONS.coverageUpdate,
        requestId,
        details: `Coverage recalculated from pipeline: ${assigned}/${requestedWorkers} (${percentage}%)`,
      });
      onCoverageRecalculated(assigned, percentage);
      toast.success(`Coverage recalculated to ${percentage}%`);
    }
    setBusy(null);
  };

  /* Security gate — see PB-SEC-RLS-ASSIGNMENTS-001. */
  if (!CANDIDATE_PIPELINE_ENABLED) {
    return (
      <Block title="Candidate Pipeline" icon={Users}>
        <div className="flex items-start gap-3 rounded-sm border border-red-500/30 bg-red-500/5 p-3.5">
          <Lock className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-red-300">Locked — P0 security finding</p>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {CANDIDATE_PIPELINE_BLOCKED_REASON}
            </p>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              The table currently exposes <code className="text-zinc-400">USING (true)</code> policies to{' '}
              <code className="text-zinc-400">public</code>. Writing candidate names, positions or
              internal notes today would publish them to anonymous callers. Enabling this block is a
              one-constant change once the migration is applied.
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-600 mr-1">Planned stages</span>
          {CANDIDATE_STAGES.map((s) => (
            <span
              key={s.value}
              className={`inline-flex items-center px-1.5 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider opacity-50 ${s.color}`}
            >
              {s.label}
            </span>
          ))}
        </div>
      </Block>
    );
  }

  const stageCounts = CANDIDATE_STAGES.map((s) => ({
    ...s,
    count: candidates.filter((c) => c.status === s.value).length,
  }));

  return (
    <Block
      title="Candidate Pipeline"
      icon={Users}
      action={
        <button
          onClick={recalculateCoverage}
          disabled={busy === 'recalc'}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.15em] text-[#f59e0b] hover:underline disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${busy === 'recalc' ? 'animate-spin' : ''}`} />
          Recalculate coverage
        </button>
      }
    >
      {/* Stage summary */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {stageCounts.map((s) => (
          <span
            key={s.value}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider ${s.color}`}
          >
            {s.label} {s.count}
          </span>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchWorkers()}
            placeholder="Search workers by name, username or title..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:outline-none"
          />
        </div>
        <button
          onClick={searchWorkers}
          disabled={searching}
          className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition disabled:opacity-40"
        >
          {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="mb-3 border border-zinc-800 rounded-sm divide-y divide-zinc-800/60 max-h-48 overflow-y-auto">
          {results.map((w) => (
            <div key={w.user_id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs text-zinc-200 truncate">{w.full_name || w.username || '—'}</p>
                <p className="text-[10px] text-zinc-500 truncate">
                  {[w.title, w.location].filter(Boolean).join(' · ') || 'No title'}
                </p>
              </div>
              <button
                onClick={() => addCandidate(w)}
                disabled={busy === w.user_id}
                className="shrink-0 inline-flex items-center gap-1 rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/30 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-[#f59e0b] hover:bg-[#f59e0b]/20 transition disabled:opacity-40"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Current candidates */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-[#f59e0b]" />
        </div>
      ) : candidates.length === 0 ? (
        <p className="text-xs text-zinc-600 py-4 text-center">
          No candidates associated with this request yet.
        </p>
      ) : (
        <div className="border border-zinc-800 rounded-sm divide-y divide-zinc-800/60">
          {candidates.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs text-zinc-200 truncate">{c.worker_name || c.worker_id}</p>
                <p className="text-[10px] text-zinc-500 truncate">{c.worker_position || 'No position'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={c.status || 'shortlisted'}
                  disabled={busy === c.id}
                  onChange={(e) => changeStage(c, e.target.value as CandidateStage)}
                  className="bg-zinc-950 border border-zinc-800 rounded-sm px-1.5 py-1 text-[10px] text-zinc-300 focus:outline-none focus:border-[#f59e0b] disabled:opacity-40"
                >
                  {CANDIDATE_STAGES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => rejectCandidate(c)}
                  disabled={busy === c.id || c.status === 'rejected'}
                  className="text-zinc-600 hover:text-red-400 transition disabled:opacity-30 disabled:hover:text-zinc-600"
                  title="Withdraw candidate (moves to Rejected — the record is kept)"
                >
                  <UserX className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Block>
  );
}

/* ─── Layout primitives ─── */

function Block({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-zinc-400 font-medium">
          <Icon className="h-3.5 w-3.5 text-[#f59e0b]" />
          {title}
        </h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  icon: Icon,
  action,
}: {
  label: string;
  value?: string | null;
  icon: React.ElementType;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-1.5">
        <Icon className="h-2.5 w-2.5" />
        {label}
      </p>
      <p className="text-xs text-zinc-200 mt-0.5 flex items-center gap-1.5 break-words">
        {value || <span className="text-zinc-600">—</span>}
        {action}
      </p>
    </div>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-1.5">{label}</p>
      {children}
    </div>
  );
}
