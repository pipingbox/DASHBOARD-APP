import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { supabase, TABLES } from '@/lib/supabase';
import {
  HardHat,
  Plus,
  MapPin,
  Users,
  Clock,
  CheckCircle2,
  Loader2,
  FileText,
  Filter,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PipelineTimeline } from '@/components/workforce/PipelineTimeline';
import { WorkforcePriorityBadge } from '@/components/workforce/WorkforcePriorityBadge';
import { WORKFORCE_PRIORITIES, getStageFromStatus } from '@/lib/workforce-pipeline';
import {
  COMPANY_REQUEST_COLUMNS,
  getCompanyStatusConfig,
  computeCoverage,
  getCoverageTone,
  normalizeDocumentationProgress,
  isPendingForCompany,
  isActiveForCompany,
  isFulfilledForCompany,
} from '@/lib/workforce-admin';

interface WorkforceRequest {
  id: string;
  company_name: string;
  contact_person: string;
  country: string | null;
  worker_type: string;
  workers_requested: number;
  workers_assigned: number;
  coverage_percentage: number;
  estimated_start_date: string | null;
  project_duration: string | null;
  priority: string;
  status: string;
  documentation_progress: Record<string, boolean>;
  created_at: string;
}

export default function CompanyWorkforceRequests() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<WorkforceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Explicit allow-list, not `select('*')`.
        // `wr_auth_select_own_or_admin` grants SELECT on the whole row, so a
        // wildcard ships every administrative column to the company's browser
        // even when nothing renders it. Internal fields must never be listed
        // here — internal notes live in the audit trail, not on this table.
        const { data, error } = await supabase
          .from(TABLES.workforceRequests)
          .select(COMPANY_REQUEST_COLUMNS)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[CompanyWorkforce] Fetch error:', error);
        }
        // Normalize data - ensure documentation_progress is always an object
        const normalized = (data || []).map((row: Record<string, unknown>) => ({
          ...row,
          documentation_progress: normalizeDocumentationProgress(row.documentation_progress),
          workers_assigned: (row.workers_assigned as number) ?? 0,
          workers_requested: (row.workers_requested as number) ?? 1,
          coverage_percentage: (row.coverage_percentage as number) ?? 0,
          priority: (row.priority as string) || 'normal',
          status: (row.status as string) || 'new',
        })) as WorkforceRequest[];
        setRequests(normalized);
      } catch (err) {
        console.error('[CompanyWorkforce] Unexpected error:', err);
      }
      setLoading(false);
    })();
  }, []);

  const filteredRequests = requests.filter((req) => {
    if (priorityFilter !== 'all' && req.priority !== priorityFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('companyWorkforce.eyebrow')}
        title={t('companyWorkforce.title')}
        description={t('companyWorkforce.description')}
        actions={
          <Link
            to="/companies/request-workers"
            className="inline-flex items-center gap-2 rounded-sm bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-black hover:bg-[#d97706] transition"
          >
            <Plus className="h-4 w-4" />
            {t('companyWorkforce.newRequest')}
          </Link>
        }
      />

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label={t('companyWorkforce.totalRequests')} value={requests.length} icon={HardHat} />
        <StatCard
          label={t('companyWorkforce.pending')}
          value={requests.filter((r) => isPendingForCompany(r.status)).length}
          icon={Clock}
        />
        <StatCard
          label={t('companyWorkforce.inProgress')}
          value={requests.filter((r) => isActiveForCompany(r.status)).length}
          icon={Users}
        />
        <StatCard
          label={t('companyWorkforce.fulfilled')}
          value={requests.filter((r) => isFulfilledForCompany(r.status)).length}
          icon={CheckCircle2}
        />
      </div>

      {/* Priority Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-zinc-500" />
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="text-xs bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-2 text-zinc-300 focus:outline-none focus:border-[#f59e0b]"
        >
          <option value="all">{t('companyWorkforce.allPriorities', 'All Priorities')}</option>
          {WORKFORCE_PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <span className="text-[10px] text-zinc-500 ml-2">
          {filteredRequests.length} {t('companyWorkforce.results', 'results')}
        </span>
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-zinc-800/80 bg-[#0d0d0d] rounded-sm">
          <HardHat className="h-10 w-10 text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-400">{t('companyWorkforce.noRequests')}</p>
          <Link
            to="/companies/request-workers"
            className="mt-4 inline-flex items-center gap-2 text-sm text-[#f59e0b] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('companyWorkforce.submitFirst')}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((req) => {
            const coverage = computeCoverage(req);
            const coverageTone = getCoverageTone(coverage.percentage);
            const currentStage = getStageFromStatus(req.status);

            return (
              <div
                key={req.id}
                className="border border-zinc-800/80 bg-[#0d0d0d] p-4 rounded-sm hover:border-zinc-700 transition"
              >
                {/* Header */}
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-amber-500/10 border border-amber-500/20 shrink-0">
                    <HardHat className="h-4.5 w-4.5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-zinc-200">
                        {req.worker_type} — {req.workers_requested} {t('companyWorkforce.workersNeeded', { count: req.workers_requested })}
                      </p>
                      <WorkforcePriorityBadge priority={req.priority} />
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                        <MapPin className="h-3 w-3" />
                        {req.country || t('companyWorkforce.international')}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                        <Clock className="h-3 w-3" />
                        {new Date(req.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <RequestStatusBadge status={req.status} />
                </div>

                {/* Pipeline Timeline */}
                <div className="mt-3 pt-3 border-t border-zinc-800/50">
                  <PipelineTimeline currentStage={currentStage} compact />
                </div>

                {/* Coverage + Documentation */}
                <div className="mt-3 pt-3 border-t border-zinc-800/50 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Coverage — real values only: requested, assigned, percentage. */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {t('companyWorkforce.staffingProgress', 'Staffing Progress')}
                      </span>
                      <span className={`text-[11px] font-semibold ${coverageTone.text}`}>
                        {coverage.requested} {t('companyWorkforce.requestedShort', 'requested')} /{' '}
                        {coverage.assigned} {t('companyWorkforce.assignedShort', 'assigned')} ·{' '}
                        {coverage.percentage}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${coverage.percentage}%`,
                          backgroundColor: coverageTone.bar,
                        }}
                      />
                    </div>
                  </div>

                  {/* Documentation Progress */}
                  {req.documentation_progress && typeof req.documentation_progress === 'object' && Object.keys(req.documentation_progress).length > 0 && (
                    <div className="flex items-center gap-2">
                      <FileText className="h-3 w-3 text-zinc-600" />
                      <span className="text-[10px] text-zinc-500">
                        Docs: {Object.values(req.documentation_progress).filter(Boolean).length}/
                        {Object.keys(req.documentation_progress).length}
                      </span>
                      <div className="flex gap-0.5">
                        {Object.entries(req.documentation_progress).map(([key, done]) => (
                          <div
                            key={key}
                            className={`w-2 h-2 rounded-full ${done ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                            title={key}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-4 rounded-sm">
      <div className="flex items-center justify-between">
        <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
        <Icon className="h-3.5 w-3.5 text-zinc-600" />
      </div>
      <p className="mt-2 text-xl font-bold text-zinc-200">{value}</p>
    </div>
  );
}

/**
 * Company-facing status badge.
 *
 * Reads through the shared projection instead of a local map. The previous
 * local map had no `cancelled` entry and fell back to `configs.new`, so every
 * cancelled request was shown to the company as "New" — 19 of the 43 rows in
 * production. Unknown values now render as themselves rather than as "New".
 */
function RequestStatusBadge({ status }: { status: string }) {
  const cfg = getCompanyStatusConfig(status);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}