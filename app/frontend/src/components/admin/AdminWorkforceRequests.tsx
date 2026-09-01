import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import {
  HardHat,
  Search,
  Filter,
  Archive,
  ArchiveRestore,
  RefreshCw,
  ArrowUpDown,
  Users,
  AlertTriangle,
  Inbox,
  UserCheck,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { WORKFORCE_PRIORITIES } from '@/lib/workforce-pipeline';
import {
  WORKFORCE_STATUSES,
  getWorkforceStatusConfig,
  computeCoverage,
  getCoverageTone,
  detectWorkforceCapabilities,
  fetchInternalStates,
  isArchivedStatus,
  normalizeDocumentationProgress,
  getDocumentationStats,
  type WorkforceCapabilities,
} from '@/lib/workforce-admin';
import { AdminWorkforceRequestDetail, type WorkforceRequestRow } from './AdminWorkforceRequestDetail';

type SortKey =
  | 'company_name'
  | 'country'
  | 'worker_type'
  | 'workers_requested'
  | 'coverage'
  | 'estimated_start_date'
  | 'priority'
  | 'status'
  | 'recruiter_name'
  | 'created_at'
  | 'updated_at';

const UNASSIGNED = '__unassigned__';

export function AdminWorkforceRequests({ initialRequestId }: { initialRequestId?: string | null }) {
  const [requests, setRequests] = useState<WorkforceRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState<WorkforceCapabilities>({ archived: false, internalStore: false });
  const [selectedId, setSelectedId] = useState<string | null>(initialRequestId ?? null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [workerTypeFilter, setWorkerTypeFilter] = useState('all');
  const [recruiterFilter, setRecruiterFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  /* ─── Fetch ─── */
  // `select('*')` is deliberate here and only here: this is the admin surface,
  // where every column is legitimately visible, and it keeps the query immune
  // to columns that may not exist yet (`archived`, `updated_at`). The company
  // view uses an explicit allow-list instead.
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from(TABLES.workforceRequests)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[AdminWorkforce] Fetch error:', error.message);
      toast.error(`Failed to load workforce requests: ${error.message}`);
      setRequests([]);
      setLoading(false);
      return;
    }

    const rows = (data || []) as WorkforceRequestRow[];

    // Recruiter ownership comes from the admin-only internal store, never from
    // the deprecated `recruiter_assigned` column that the company can read.
    // A separate round-trip rather than a PostgREST embed: if the store is not
    // there yet, the cost is one disabled control, not a broken list.
    const internal = await fetchInternalStates(rows.map((r) => r.id));
    setRequests(
      rows.map((r) => {
        const state = internal.get(r.id);
        return {
          ...r,
          recruiter_name: state?.recruiter_name ?? null,
          recruiter_user_id: state?.recruiter_user_id ?? null,
        };
      }),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
    detectWorkforceCapabilities().then(setCapabilities);

    const channel = supabase
      .channel('workforce_requests_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.workforceRequests },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as WorkforceRequestRow;
            setRequests((prev) => (prev.some((r) => r.id === row.id) ? prev : [row, ...prev]));
            toast.success(`New workforce request: ${row.company_name || 'Unknown company'}`);
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as WorkforceRequestRow;
            // Preserve the locally merged internal state: the realtime payload
            // only carries `workforce_requests` columns, so replacing the row
            // wholesale would blank the recruiter until the next full fetch.
            setRequests((prev) =>
              prev.map((r) =>
                r.id === row.id
                  ? {
                      ...row,
                      recruiter_name: r.recruiter_name ?? null,
                      recruiter_user_id: r.recruiter_user_id ?? null,
                    }
                  : r,
              ),
            );
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as WorkforceRequestRow;
            setRequests((prev) => prev.filter((r) => r.id !== row.id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRequests]);

  /* ─── Archive state ─── */
  // Two sources of truth depending on what the schema actually offers: a real
  // `archived` boolean when it exists, otherwise the legacy `archived` status
  // token. Never fabricated.
  const isArchived = useCallback(
    (row: WorkforceRequestRow) =>
      capabilities.archived ? Boolean(row.archived) : isArchivedStatus(row.status),
    [capabilities.archived],
  );

  const applyLocalPatch = useCallback((id: string, patch: Partial<WorkforceRequestRow>) => {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  /* ─── Filter option sources ─── */
  const uniqueCountries = useMemo(
    () => Array.from(new Set(requests.map((r) => r.country).filter(Boolean))).sort() as string[],
    [requests],
  );
  const uniqueWorkerTypes = useMemo(
    () => Array.from(new Set(requests.map((r) => r.worker_type).filter(Boolean))).sort() as string[],
    [requests],
  );
  const uniqueRecruiters = useMemo(
    () =>
      Array.from(
        new Set(requests.map((r) => r.recruiter_name).filter(Boolean)),
      ).sort() as string[],
    [requests],
  );

  /* ─── Filter + sort ─── */
  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = requests.filter((r) => {
      if (isArchived(r) !== showArchived) return false;
      if (statusFilter !== 'all' && getWorkforceStatusConfig(r.status).value !== statusFilter) return false;
      if (priorityFilter !== 'all' && (r.priority || 'normal') !== priorityFilter) return false;
      if (countryFilter !== 'all' && r.country !== countryFilter) return false;
      if (workerTypeFilter !== 'all' && r.worker_type !== workerTypeFilter) return false;
      if (recruiterFilter === UNASSIGNED && r.recruiter_name) return false;
      if (recruiterFilter !== 'all' && recruiterFilter !== UNASSIGNED && r.recruiter_name !== recruiterFilter) {
        return false;
      }
      if (!q) return true;
      return [r.company_name, r.contact_person, r.email, r.country, r.worker_type, r.recruiter_name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';

      if (sortKey === 'coverage') {
        av = computeCoverage(a).percentage;
        bv = computeCoverage(b).percentage;
      } else if (sortKey === 'workers_requested') {
        av = Number(a.workers_requested) || 0;
        bv = Number(b.workers_requested) || 0;
      } else if (sortKey === 'priority') {
        const order = WORKFORCE_PRIORITIES.map((p) => p.value) as readonly string[];
        av = order.indexOf(a.priority || 'normal');
        bv = order.indexOf(b.priority || 'normal');
      } else if (sortKey === 'status') {
        av = getWorkforceStatusConfig(a.status).label;
        bv = getWorkforceStatusConfig(b.status).label;
      } else if (sortKey === 'created_at' || sortKey === 'updated_at' || sortKey === 'estimated_start_date') {
        av = a[sortKey] ? new Date(a[sortKey] as string).getTime() : 0;
        bv = b[sortKey] ? new Date(b[sortKey] as string).getTime() : 0;
      } else {
        av = String(a[sortKey] ?? '').toLowerCase();
        bv = String(b[sortKey] ?? '').toLowerCase();
      }

      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [
    requests,
    searchQuery,
    statusFilter,
    priorityFilter,
    countryFilter,
    workerTypeFilter,
    recruiterFilter,
    showArchived,
    sortKey,
    sortDir,
    isArchived,
  ]);

  /* ─── KPIs (active records only) ─── */
  const kpis = useMemo(() => {
    const active = requests.filter((r) => !isArchived(r));
    const requested = active.reduce((sum, r) => sum + (Number(r.workers_requested) || 0), 0);
    const assigned = active.reduce((sum, r) => sum + (Number(r.workers_assigned) || 0), 0);
    return {
      total: active.length,
      unassigned: active.filter((r) => !r.recruiter_name).length,
      needsTriage: active.filter((r) => getWorkforceStatusConfig(r.status).value === 'new').length,
      requested,
      assigned,
      coverage: requested > 0 ? Math.round((assigned / requested) * 100) : 0,
    };
  }, [requests, isArchived]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'created_at' || key === 'updated_at' ? 'desc' : 'asc');
    }
  };

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  const activeFilterCount = [
    statusFilter !== 'all',
    priorityFilter !== 'all',
    countryFilter !== 'all',
    workerTypeFilter !== 'all',
    recruiterFilter !== 'all',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setStatusFilter('all');
    setPriorityFilter('all');
    setCountryFilter('all');
    setWorkerTypeFilter('all');
    setRecruiterFilter('all');
    setSearchQuery('');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Internal Operations</p>
          <h3 className="text-lg font-semibold text-zinc-100 mt-1">Workforce Requests</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Operational file for every staffing request. Companies never see this view.
          </p>
        </div>
        <button
          onClick={fetchRequests}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-[10px] uppercase tracking-[0.15em] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Active Requests" value={String(kpis.total)} icon={Inbox} tone="text-zinc-100" />
        <KpiTile
          label="Needs Triage"
          value={String(kpis.needsTriage)}
          icon={AlertTriangle}
          tone={kpis.needsTriage > 0 ? 'text-[#f59e0b]' : 'text-zinc-100'}
        />
        <KpiTile
          label="No Recruiter"
          value={String(kpis.unassigned)}
          icon={UserCheck}
          tone={kpis.unassigned > 0 ? 'text-red-400' : 'text-emerald-400'}
        />
        <KpiTile
          label="Global Coverage"
          value={`${kpis.assigned}/${kpis.requested} · ${kpis.coverage}%`}
          icon={Users}
          tone={getCoverageTone(kpis.coverage).text}
        />
      </div>

      {/* Filters */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search company, contact, email, country, worker type, recruiter..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:outline-none"
            />
          </div>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-2 text-[10px] uppercase tracking-[0.15em] transition ${
              showArchived
                ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]'
                : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
            }`}
          >
            {showArchived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
            {showArchived ? 'Archived' : 'Active'}
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} label="All Statuses">
            {WORKFORCE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={priorityFilter} onChange={setPriorityFilter} label="All Priorities">
            {WORKFORCE_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={countryFilter} onChange={setCountryFilter} label="All Countries">
            {uniqueCountries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={workerTypeFilter} onChange={setWorkerTypeFilter} label="All Worker Types">
            {uniqueWorkerTypes.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={recruiterFilter} onChange={setRecruiterFilter} label="All Recruiters">
            <option value={UNASSIGNED}>— Unassigned —</option>
            {uniqueRecruiters.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </FilterSelect>

          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="text-[10px] uppercase tracking-[0.15em] text-[#f59e0b] hover:underline"
            >
              Clear {activeFilterCount}
            </button>
          )}
          <span className="text-[10px] text-zinc-500 ml-auto">
            {visible.length} of {requests.length} shown
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-[#f59e0b]" />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <HardHat className="h-8 w-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">
              {requests.length === 0
                ? 'No workforce requests yet.'
                : 'No requests match the current filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1500px]">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/50">
                  <Th sortKey="company_name" active={sortKey} dir={sortDir} onSort={toggleSort}>Company</Th>
                  <Th>Contact</Th>
                  <Th>Email</Th>
                  <Th sortKey="country" active={sortKey} dir={sortDir} onSort={toggleSort}>Country</Th>
                  <Th sortKey="worker_type" active={sortKey} dir={sortDir} onSort={toggleSort}>Worker Type</Th>
                  <Th sortKey="workers_requested" active={sortKey} dir={sortDir} onSort={toggleSort}>Staffing</Th>
                  <Th sortKey="coverage" active={sortKey} dir={sortDir} onSort={toggleSort}>Coverage</Th>
                  <Th sortKey="estimated_start_date" active={sortKey} dir={sortDir} onSort={toggleSort}>Start</Th>
                  <Th>Duration</Th>
                  <Th sortKey="priority" active={sortKey} dir={sortDir} onSort={toggleSort}>Priority</Th>
                  <Th sortKey="status" active={sortKey} dir={sortDir} onSort={toggleSort}>Status</Th>
                  <Th sortKey="recruiter_name" active={sortKey} dir={sortDir} onSort={toggleSort}>Recruiter</Th>
                  <Th>Docs</Th>
                  <Th sortKey="created_at" active={sortKey} dir={sortDir} onSort={toggleSort}>Created</Th>
                  <Th sortKey="updated_at" active={sortKey} dir={sortDir} onSort={toggleSort}>Last Update</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const coverage = computeCoverage(r);
                  const tone = getCoverageTone(coverage.percentage);
                  const status = getWorkforceStatusConfig(r.status);
                  const priority = WORKFORCE_PRIORITIES.find((p) => p.value === (r.priority || 'normal'));
                  const docs = getDocumentationStats(normalizeDocumentationProgress(r.documentation_progress));

                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      className="border-b border-zinc-800/40 hover:bg-zinc-900/60 transition cursor-pointer"
                    >
                      <td className="py-2.5 px-3">
                        <span className="text-zinc-200 font-medium whitespace-nowrap">
                          {r.company_name || '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-zinc-400 whitespace-nowrap">
                        {r.contact_person || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-zinc-500 whitespace-nowrap">
                        {r.email || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-zinc-400 whitespace-nowrap">
                        {r.country || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-zinc-300 whitespace-nowrap">
                        {r.worker_type || '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="text-xs font-semibold text-zinc-200">
                          {coverage.requested}
                        </span>
                        <span className="text-[10px] text-zinc-600"> req </span>
                        <span className="text-[10px] text-zinc-600">/ </span>
                        <span className="text-xs font-semibold text-zinc-200">
                          {coverage.assigned}
                        </span>
                        <span className="text-[10px] text-zinc-600"> asg</span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${coverage.percentage}%`, backgroundColor: tone.bar }}
                            />
                          </div>
                          <span className={`text-[11px] font-bold ${tone.text}`}>
                            {coverage.percentage}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-zinc-400 whitespace-nowrap">
                        {r.estimated_start_date
                          ? new Date(r.estimated_start_date).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-zinc-500 whitespace-nowrap">
                        {r.project_duration || '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider ${
                            priority?.color ?? 'bg-zinc-500/10 text-zinc-400 border-zinc-600'
                          }`}
                        >
                          {priority?.label ?? r.priority ?? 'Normal'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider ${status.color}`}
                          title={status.known ? undefined : `Unrecognised stored value: ${r.status}`}
                        >
                          {!status.known && <AlertTriangle className="h-2.5 w-2.5" />}
                          {status.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-xs whitespace-nowrap">
                        {r.recruiter_name ? (
                          <span className="text-zinc-300">{r.recruiter_name}</span>
                        ) : (
                          <span className="text-red-400/70 text-[10px] uppercase tracking-wider">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="text-[11px] text-zinc-400">
                          {docs.done}/{docs.total}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-zinc-500 whitespace-nowrap">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-zinc-500 whitespace-nowrap">
                        {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail workspace */}
      {selected && (
        <AdminWorkforceRequestDetail
          request={selected}
          capabilities={capabilities}
          onClose={() => setSelectedId(null)}
          onPatch={applyLocalPatch}
        />
      )}
    </div>
  );
}

/* ─── Presentational helpers ─── */

function KpiTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone: string;
}) {
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-3.5 rounded-sm">
      <div className="flex items-center justify-between">
        <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
        <Icon className="h-3.5 w-3.5 text-zinc-600" />
      </div>
      <p className={`mt-1.5 text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-[#f59e0b] max-w-[170px]"
    >
      <option value="all">{label}</option>
      {children}
    </select>
  );
}

function Th({
  children,
  sortKey,
  active,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  sortKey?: SortKey;
  active?: SortKey;
  dir?: 'asc' | 'desc';
  onSort?: (k: SortKey) => void;
}) {
  const sortable = Boolean(sortKey && onSort);
  const isActive = sortable && active === sortKey;
  return (
    <th className="text-left py-2.5 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium whitespace-nowrap">
      {sortable ? (
        <button
          onClick={() => onSort!(sortKey!)}
          className={`inline-flex items-center gap-1 transition hover:text-zinc-300 ${
            isActive ? 'text-[#f59e0b]' : ''
          }`}
        >
          {children}
          <ArrowUpDown className="h-2.5 w-2.5" />
          {isActive && <span className="text-[8px]">{dir === 'asc' ? '▲' : '▼'}</span>}
        </button>
      ) : (
        children
      )}
    </th>
  );
}
