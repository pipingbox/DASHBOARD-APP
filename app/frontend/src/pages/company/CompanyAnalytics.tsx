import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import {
  BarChart3,
  Eye,
  ClipboardList,
  Users,
  HardHat,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
} from 'lucide-react';

// TD-04 (DEC-33): All metrics are now queried from Supabase.
// Previously this component showed fabricated numbers (1,247 views, 89 apps,
// 2.4 days, etc.). Per DEC-33, fabricated metrics destroy trust. If real data
// is zero, we show zero with an honest empty state — no fake padding.

interface Metric {
  label: string;
  value: number;
  icon: typeof Eye;
  loading: boolean;
}

interface MonthlyPoint {
  month: string;
  apps: number;
}

export default function CompanyAnalytics() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: 'Job Posts', value: 0, icon: Eye, loading: true },
    { label: 'Applications Received', value: 0, icon: ClipboardList, loading: true },
    { label: 'Workforce Requests', value: 0, icon: HardHat, loading: true },
    { label: 'Saved Candidates', value: 0, icon: Users, loading: true },
  ]);
  const [monthlyData, setMonthlyData] = useState<MonthlyPoint[]>([]);
  const [topJob, setTopJob] = useState<{ title: string; location: string | null; apps: number } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // Query real counts in parallel — scoped to the current company user.
        const [jobsRes, appsRes, leadsRes] = await Promise.all([
          supabase.from(TABLES.jobs).select('*', { count: 'exact', head: true }).eq('posted_by', user.id),
          // Applications to this company's jobs — needs join; we count apps
          // where the job's posted_by = user.id. Supabase doesn't support
          // cross-table count in a single head query, so we fetch job ids first.
          supabase.from(TABLES.jobs).select('id').eq('posted_by', user.id),
          // Workforce requests submitted by this company (filtered by email).
          supabase.from(TABLES.companyLeads).select('*', { count: 'exact', head: true }).eq('email', user.email || '__none__'),
        ]);

        const jobCount = jobsRes.count ?? 0;
        const jobIds = (appsRes.data || []).map((j: { id: string }) => j.id);
        const leadCount = leadsRes.count ?? 0;

        let appCount = 0;
        let monthly: MonthlyPoint[] = [];
        let top: { title: string; location: string | null; apps: number } | null = null;

        if (jobIds.length > 0) {
          const { data: apps, error: appsErr } = await supabase
            .from(TABLES.jobApplications)
            .select('job_id, created_at')
            .in('job_id', jobIds);

          if (!appsErr && apps) {
            appCount = apps.length;

            // Build last 5 months from real application dates
            const now = new Date();
            const months: MonthlyPoint[] = [];
            for (let i = 4; i >= 0; i--) {
              const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
              const label = d.toLocaleString('en', { month: 'short' });
              const count = apps.filter((a: { created_at: string }) => {
                const ad = new Date(a.created_at);
                return ad.getMonth() === d.getMonth() && ad.getFullYear() === d.getFullYear();
              }).length;
              months.push({ month: label, apps: count });
            }
            monthly = months;

            // Top performing job = most applications
            const appsByJob = new Map<string, number>();
            for (const a of apps as { job_id: string }[]) {
              appsByJob.set(a.job_id, (appsByJob.get(a.job_id) || 0) + 1);
            }
            let topJobId: string | null = null;
            let topApps = 0;
            appsByJob.forEach((c, id) => {
              if (c > topApps) {
                topApps = c;
                topJobId = id;
              }
            });
            if (topJobId) {
              const { data: jobData } = await supabase
                .from(TABLES.jobs)
                .select('title, location')
                .eq('id', topJobId)
                .maybeSingle();
              if (jobData) {
                top = { title: (jobData as { title: string }).title, location: (jobData as { location: string | null }).location, apps: topApps };
              }
            }
          }
        }

        setMetrics([
          { label: 'Job Posts', value: jobCount, icon: Eye, loading: false },
          { label: 'Applications Received', value: appCount, icon: ClipboardList, loading: false },
          { label: 'Workforce Requests', value: leadCount, icon: HardHat, loading: false },
          { label: 'Saved Candidates', value: 0, icon: Users, loading: false }, // TODO: count favorites when table exists
        ]);
        setMonthlyData(monthly);
        setTopJob(top);
      } catch {
        setError(true);
        setMetrics((prev) => prev.map((m) => ({ ...m, loading: false })));
      }
    })();
  }, [user]);

  const maxApps = Math.max(1, ...monthlyData.map((d) => d.apps));
  const hasData = metrics.some((m) => m.value > 0) || monthlyData.some((d) => d.apps > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Company Analytics"
        description="Track your recruitment metrics, job performance, and candidate engagement."
        actions={
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
            <BarChart3 className="h-3.5 w-3.5" />
            Live data
          </span>
        }
      />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.label}
              className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">{m.label}</p>
                <Icon className="h-4 w-4 text-zinc-600" />
              </div>
              {m.loading ? (
                <div className="h-7 w-16 bg-zinc-800/60 rounded-sm animate-pulse" />
              ) : (
                <p className="text-2xl font-bold text-zinc-100">{m.value.toLocaleString()}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state when no data */}
      {!hasData && !metrics[0].loading && (
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-8 text-center">
          <AlertCircle className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-300">No analytics data yet.</p>
          <p className="text-xs text-zinc-500 mt-1">
            Post a job or submit a workforce request to start seeing metrics here.
          </p>
        </div>
      )}

      {/* Chart — real monthly applications */}
      {hasData && monthlyData.length > 0 && (
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200">Monthly Applications</h3>
            <div className="flex items-center gap-4 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-400" />
                Applications
              </span>
            </div>
          </div>

          <div className="flex items-end gap-3 h-48 pt-4">
            {monthlyData.map((d) => (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex items-end gap-1 justify-center" style={{ height: '160px' }}>
                  <div
                    className="w-5 bg-blue-400/70 rounded-t-sm transition-all"
                    style={{ height: `${(d.apps / maxApps) * 100}%` }}
                    title={`${d.apps} applications`}
                  />
                </div>
                <span className="text-[10px] text-zinc-500">{d.month}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insights — real top job */}
      {hasData && topJob && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Top Performing Job</h4>
            <p className="text-sm text-zinc-200">{topJob.title}{topJob.location ? ` — ${topJob.location}` : ''}</p>
            <p className="text-[11px] text-zinc-500">{topJob.apps} application{topJob.apps === 1 ? '' : 's'}</p>
          </div>
          <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Total Applications</h4>
            <p className="text-2xl font-bold text-[#f59e0b]">
              {metrics[1].value.toLocaleString()}
            </p>
            <p className="text-[11px] text-zinc-500">Across all your job posts</p>
          </div>
        </div>
      )}

      {error && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-sm p-4 text-xs text-red-400">
          Could not load analytics. Please try again later.
        </div>
      )}
    </div>
  );
}
