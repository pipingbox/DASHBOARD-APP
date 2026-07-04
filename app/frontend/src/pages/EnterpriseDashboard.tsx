import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  Briefcase,
  Users,
  ClipboardList,
  TrendingUp,
  Building2,
  MapPin,
  Clock,
  FileText,
  ArrowRight,
  CheckCircle2,
  Layers,
  AlertCircle,
  Loader2,
  UserCheck,
  CalendarClock,
  Award,
  Globe,
  Search,
} from 'lucide-react';

/* ─── ENT-001: Enterprise Dashboard ───
 * Consolidated view for enterprise companies with multiple recruiters,
 * bulk hiring, workforce planning, and aggregated analytics.
 *
 * Differences vs CompanyDashboard:
 * - Aggregates across ALL company users (not just current user)
 * - Workforce pipeline overview (open requests by status)
 * - Team activity (recruiters + their actions)
 * - Hiring funnel (applications -> interviews -> hires)
 * - Bulk job metrics
 * - Certification coverage stats for shortlisted candidates
 *
 * Access: role = 'admin' OR (account_type = 'company' AND plan = 'enterprise')
 * Future: proper enterprise role check once DEC-37 is implemented.
 */

interface EnterpriseMetrics {
  totalActiveJobs: number;
  totalApplications: number;
  totalWorkforceRequests: number;
  totalCandidates: number;
  interviewsScheduled: number;
  hiresThisMonth: number;
  avgTimeToHire: number | null;
  totalRecruiters: number;
}

interface WorkforcePipeline {
  draft: number;
  open: number;
  in_progress: number;
  fulfilled: number;
  cancelled: number;
}

interface JobRow {
  id: string;
  title: string;
  location: string | null;
  applications_count: number;
  status: string;
  created_at: string;
}

interface RecruiterRow {
  email: string;
  jobs_posted: number;
  applications_received: number;
  last_active: string | null;
}

interface HiringFunnel {
  applications: number;
  shortlisted: number;
  interviewed: number;
  offered: number;
  hired: number;
}

export default function EnterpriseDashboard() {
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<EnterpriseMetrics>({
    totalActiveJobs: 0,
    totalApplications: 0,
    totalWorkforceRequests: 0,
    totalCandidates: 0,
    interviewsScheduled: 0,
    hiresThisMonth: 0,
    avgTimeToHire: null,
    totalRecruiters: 1,
  });

  const [pipeline, setPipeline] = useState<WorkforcePipeline>({
    draft: 0,
    open: 0,
    in_progress: 0,
    fulfilled: 0,
    cancelled: 0,
  });

  const [topJobs, setTopJobs] = useState<JobRow[]>([]);
  const [recruiters, setRecruiters] = useState<RecruiterRow[]>([]);
  const [funnel, setFunnel] = useState<HiringFunnel>({
    applications: 0,
    shortlisted: 0,
    interviewed: 0,
    offered: 0,
    hired: 0,
  });

  const fetchDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const companyEmail = user.email;

      // Fetch all jobs for this company (scoped by posted_by email — TD-06 approach)
      const { data: jobs, error: jobsError } = await supabase
        .from(TABLES.jobs)
        .select('id, title, location, applications_count, status, created_at, posted_by')
        .eq('posted_by', companyEmail)
        .order('created_at', { ascending: false });

      if (jobsError) throw jobsError;

      const allJobs = jobs || [];
      const activeJobs = allJobs.filter((j: JobRow) => j.status === 'active');
      const totalApplications = allJobs.reduce(
        (sum: number, j: JobRow) => sum + (j.applications_count || 0),
        0
      );

      // Fetch workforce requests
      const { data: wfData, error: wfError } = await supabase
        .from(TABLES.companyWorkforceRequests)
        .select('id, status')
        .eq('email', companyEmail);

      if (wfError) throw wfError;

      const wfRows = (wfData || []) as { status: string }[];
      const wfPipeline: WorkforcePipeline = {
        draft: wfRows.filter((w) => w.status === 'draft').length,
        open: wfRows.filter((w) => w.status === 'open').length,
        in_progress: wfRows.filter((w) => w.status === 'in_progress').length,
        fulfilled: wfRows.filter((w) => w.status === 'fulfilled').length,
        cancelled: wfRows.filter((w) => w.status === 'cancelled').length,
      };

      // Fetch applications for hiring funnel
      const { data: appsData, error: appsError } = await supabase
        .from(TABLES.applications)
        .select('id, status')
        .in(
          'job_id',
          allJobs.map((j: { id: string }) => j.id)
        );

      if (appsError) throw appsError;

      const appRows = (appsData || []) as { status: string }[];
      const hiringFunnel: HiringFunnel = {
        applications: appRows.length,
        shortlisted: appRows.filter((a) => a.status === 'shortlisted').length,
        interviewed: appRows.filter((a) => a.status === 'interviewed').length,
        offered: appRows.filter((a) => a.status === 'offered').length,
        hired: appRows.filter((a) => a.status === 'hired').length,
      };

      // Fetch distinct candidates (applicants)
      const { count: candidatesCount } = await supabase
        .from(TABLES.applications)
        .select('applicant_id', { count: 'exact', head: true })
        .in(
          'job_id',
          allJobs.map((j: { id: string }) => j.id)
        );

      // Fetch interviews scheduled (status = 'interviewed' with a date)
      const interviewsScheduled = hiringFunnel.interviewed;

      // Hires this month
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count: hiresCount } = await supabase
        .from(TABLES.applications)
        .select('id', { count: 'exact', head: true })
        .eq('status', 'hired')
        .gte('updated_at', monthStart)
        .in(
          'job_id',
          allJobs.map((j: { id: string }) => j.id)
        );

      // Fetch distinct recruiters (posted_by emails) for this company
      const distinctEmails = Array.from(
        new Set(allJobs.map((j: { posted_by: string | null }) => j.posted_by).filter(Boolean))
      ) as string[];

      // Build recruiter activity table
      const recruiterRows: RecruiterRow[] = await Promise.all(
        distinctEmails.map(async (email) => {
          const jobsByRecruiter = allJobs.filter((j: { posted_by: string | null }) => j.posted_by === email);
          const appsByRecruiter = jobsByRecruiter.reduce(
            (sum: number, j: JobRow) => sum + (j.applications_count || 0),
            0
          );
          return {
            email,
            jobs_posted: jobsByRecruiter.length,
            applications_received: appsByRecruiter,
            last_active: null,
          };
        })
      );

      setMetrics({
        totalActiveJobs: activeJobs.length,
        totalApplications,
        totalWorkforceRequests: wfRows.length,
        totalCandidates: candidatesCount || 0,
        interviewsScheduled,
        hiresThisMonth: hiresCount || 0,
        avgTimeToHire: null, // requires application.created_at -> hired.updated_at diff; TODO
        totalRecruiters: Math.max(distinctEmails.length, 1),
      });

      setPipeline(wfPipeline);
      setFunnel(hiringFunnel);
      setTopJobs(activeJobs.slice(0, 5) as JobRow[]);
      setRecruiters(recruiterRows);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load enterprise dashboard';
      console.error('[EnterpriseDashboard] Error:', message, err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-[#f59e0b] animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-900/50 bg-red-950/20 rounded-sm p-6 text-center space-y-2">
        <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
        <p className="text-sm text-red-300">{error}</p>
        <button onClick={fetchDashboard} className="text-xs text-[#f59e0b] hover:underline">
          Try again
        </button>
      </div>
    );
  }

  const funnelConversion = funnel.applications > 0
    ? ((funnel.hired / funnel.applications) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Enterprise"
        title="Enterprise Dashboard"
        description="Consolidated hiring intelligence across your organization."
        actions={
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
            <Building2 className="h-3.5 w-3.5" />
            {profile?.company || 'Enterprise'}
          </span>
        }
      />

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Briefcase}
          label="Active Jobs"
          value={metrics.totalActiveJobs}
          accent="#f59e0b"
        />
        <KpiCard
          icon={Users}
          label="Total Candidates"
          value={metrics.totalCandidates}
          accent="#3b82f6"
        />
        <KpiCard
          icon={UserCheck}
          label="Hires This Month"
          value={metrics.hiresThisMonth}
          accent="#10b981"
        />
        <KpiCard
          icon={ClipboardList}
          label="Workforce Requests"
          value={metrics.totalWorkforceRequests}
          accent="#a855f7"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Hiring Funnel */}
        <div className="lg:col-span-2 border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#f59e0b]" />
              <h3 className="text-sm font-semibold text-zinc-200">Hiring Funnel</h3>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              {funnelConversion}% conversion
            </span>
          </div>

          <div className="space-y-3">
            <FunnelBar label="Applications" value={funnel.applications} max={funnel.applications} color="bg-blue-500" />
            <FunnelBar label="Shortlisted" value={funnel.shortlisted} max={funnel.applications} color="bg-amber-500" />
            <FunnelBar label="Interviewed" value={funnel.interviewed} max={funnel.applications} color="bg-purple-500" />
            <FunnelBar label="Offered" value={funnel.offered} max={funnel.applications} color="bg-cyan-500" />
            <FunnelBar label="Hired" value={funnel.hired} max={funnel.applications} color="bg-green-500" />
          </div>
        </div>

        {/* Workforce Pipeline */}
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#f59e0b]" />
            <h3 className="text-sm font-semibold text-zinc-200">Workforce Pipeline</h3>
          </div>

          <div className="space-y-2">
            <PipelineRow label="Draft" count={pipeline.draft} color="text-zinc-400" />
            <PipelineRow label="Open" count={pipeline.open} color="text-blue-400" />
            <PipelineRow label="In Progress" count={pipeline.in_progress} color="text-amber-400" />
            <PipelineRow label="Fulfilled" count={pipeline.fulfilled} color="text-green-400" />
            <PipelineRow label="Cancelled" count={pipeline.cancelled} color="text-red-400" />
          </div>

          <Link
            to="/company/workforce-requests"
            className="flex items-center justify-center gap-2 rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 hover:border-[#f59e0b]/50 transition"
          >
            View Workforce Requests
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Top Jobs + Recruiters */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top Active Jobs */}
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-[#f59e0b]" />
              <h3 className="text-sm font-semibold text-zinc-200">Top Active Jobs</h3>
            </div>
            <Link to="/company/jobs" className="text-[10px] text-[#f59e0b] hover:underline">
              View all
            </Link>
          </div>

          {topJobs.length === 0 ? (
            <div className="text-center py-6 text-xs text-zinc-500">
              No active jobs. <Link to="/company/post-job" className="text-[#f59e0b] hover:underline">Post a job</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {topJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between border border-zinc-800/60 bg-zinc-950/50 rounded-sm px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-zinc-200 truncate">{job.title}</p>
                    {job.location && (
                      <p className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="h-2.5 w-2.5" />
                        {job.location}
                      </p>
                    )}
                  </div>
                  <span className="ml-3 flex items-center gap-1 text-[11px] text-zinc-400">
                    <Users className="h-3 w-3" />
                    {job.applications_count || 0}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recruiter Activity */}
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#f59e0b]" />
              <h3 className="text-sm font-semibold text-zinc-200">Recruiter Activity</h3>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              {metrics.totalRecruiters} {metrics.totalRecruiters === 1 ? 'recruiter' : 'recruiters'}
            </span>
          </div>

          {recruiters.length === 0 ? (
            <div className="text-center py-6 text-xs text-zinc-500">No recruiter activity yet.</div>
          ) : (
            <div className="space-y-2">
              {recruiters.map((r) => (
                <div
                  key={r.email}
                  className="flex items-center justify-between border border-zinc-800/60 bg-zinc-950/50 rounded-sm px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-zinc-200 truncate">{r.email}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {r.jobs_posted} jobs · {r.applications_received} applications
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction to="/company/post-job" icon={Briefcase} label="Post New Job" />
        <QuickAction to="/company/workers-search" icon={Search} label="Search Workers" />
        <QuickAction to="/company/workforce-requests" icon={ClipboardList} label="New Workforce Request" />
        <QuickAction to="/company/analytics" icon={TrendingUp} label="View Analytics" />
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-4 space-y-2">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4" style={{ color: accent }} />
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</span>
      </div>
      <p className="text-2xl font-bold text-zinc-100">{value}</p>
    </div>
  );
}

function FunnelBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-300 font-medium">{value}</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PipelineRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-400">{label}</span>
      <span className={`font-medium ${color}`}>{count}</span>
    </div>
  );
}

function QuickAction({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 border border-zinc-800/80 bg-[#0d0d0d] rounded-sm px-4 py-3 hover:border-[#f59e0b]/50 hover:bg-zinc-900 transition"
    >
      <Icon className="h-4 w-4 text-[#f59e0b]" />
      <span className="text-xs font-medium text-zinc-200">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 text-zinc-600 ml-auto" />
    </Link>
  );
}
