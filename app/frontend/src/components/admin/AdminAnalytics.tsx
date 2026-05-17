import { useEffect, useState, useMemo } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import {
  Users2,
  HardHat,
  Building2,
  ClipboardList,
  FileText,
  Briefcase,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Shield,
  Newspaper,
} from 'lucide-react';

/* ─── Types ─── */
interface AnalyticsData {
  totalUsers: number;
  activeWorkers: number;
  companies: number;
  jobApplications: number;
  workforceRequests: number;
  contentDrafts: number;
  publishedPosts: number;
  openJobs: number;
  platformModerators: number;
}

interface WeeklyGrowth {
  newUsersThisWeek: number;
  newUsersLastWeek: number;
  newAppsThisWeek: number;
  newAppsLastWeek: number;
  newLeadsThisWeek: number;
  newLeadsLastWeek: number;
}

interface TimeSeriesPoint {
  date: string;
  count: number;
}

interface ChartData {
  userGrowth: TimeSeriesPoint[];
  applications: TimeSeriesPoint[];
  workforceRequests: TimeSeriesPoint[];
  draftActivity: TimeSeriesPoint[];
}

export function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [weekly, setWeekly] = useState<WeeklyGrowth | null>(null);
  const [charts, setCharts] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const weekAgoISO = weekAgo.toISOString();
      const twoWeeksAgoISO = twoWeeksAgo.toISOString();
      const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

      // Fetch all data in parallel
      const [
        profilesRes,
        appsRes,
        leadsRes,
        draftsRes,
        jobsRes,
        // Weekly data
        usersThisWeekRes,
        usersLastWeekRes,
        appsThisWeekRes,
        appsLastWeekRes,
        leadsThisWeekRes,
        leadsLastWeekRes,
        // Chart data (last 30 days)
        usersChartRes,
        appsChartRes,
        leadsChartRes,
        draftsChartRes,
      ] = await Promise.all([
        // Main counts
        supabase.from(TABLES.profiles).select('role'),
        supabase.from(TABLES.jobApplications).select('*', { count: 'exact', head: true }),
        supabase.from(TABLES.companyLeads).select('*', { count: 'exact', head: true }),
        supabase.from(TABLES.aiContentDrafts).select('status'),
        supabase.from(TABLES.jobs).select('status'),
        // Weekly growth
        supabase.from(TABLES.profiles).select('*', { count: 'exact', head: true }).gte('created_at', weekAgoISO),
        supabase.from(TABLES.profiles).select('*', { count: 'exact', head: true }).gte('created_at', twoWeeksAgoISO).lt('created_at', weekAgoISO),
        supabase.from(TABLES.jobApplications).select('*', { count: 'exact', head: true }).gte('created_at', weekAgoISO),
        supabase.from(TABLES.jobApplications).select('*', { count: 'exact', head: true }).gte('created_at', twoWeeksAgoISO).lt('created_at', weekAgoISO),
        supabase.from(TABLES.companyLeads).select('*', { count: 'exact', head: true }).gte('created_at', weekAgoISO),
        supabase.from(TABLES.companyLeads).select('*', { count: 'exact', head: true }).gte('created_at', twoWeeksAgoISO).lt('created_at', weekAgoISO),
        // Chart data (last 30 days)
        supabase.from(TABLES.profiles).select('created_at').gte('created_at', thirtyDaysAgoISO).order('created_at', { ascending: true }),
        supabase.from(TABLES.jobApplications).select('created_at').gte('created_at', thirtyDaysAgoISO).order('created_at', { ascending: true }),
        supabase.from(TABLES.companyLeads).select('created_at').gte('created_at', thirtyDaysAgoISO).order('created_at', { ascending: true }),
        supabase.from(TABLES.aiContentDrafts).select('created_at').gte('created_at', thirtyDaysAgoISO).order('created_at', { ascending: true }),
      ]);

      if (!mounted) return;

      const profiles = (profilesRes.data || []) as { role: string }[];
      const drafts = (draftsRes.data || []) as { status: string }[];
      const jobs = (jobsRes.data || []) as { status: string }[];

      const normalizeRole = (r: string) => (r === 'user' ? 'worker' : r);

      setData({
        totalUsers: profiles.length,
        activeWorkers: profiles.filter((p) => normalizeRole(p.role) === 'worker').length,
        companies: profiles.filter((p) => normalizeRole(p.role) === 'company').length,
        jobApplications: appsRes.count ?? 0,
        workforceRequests: leadsRes.count ?? 0,
        contentDrafts: drafts.length,
        publishedPosts: drafts.filter((d) => d.status === 'published').length,
        openJobs: jobs.filter((j) => j.status === 'open' || j.status === 'active' || !j.status).length,
        platformModerators: profiles.filter(
          (p) => normalizeRole(p.role) === 'community_moderator' || normalizeRole(p.role) === 'jobs_moderator' || normalizeRole(p.role) === 'admin'
        ).length,
      });

      setWeekly({
        newUsersThisWeek: usersThisWeekRes.count ?? 0,
        newUsersLastWeek: usersLastWeekRes.count ?? 0,
        newAppsThisWeek: appsThisWeekRes.count ?? 0,
        newAppsLastWeek: appsLastWeekRes.count ?? 0,
        newLeadsThisWeek: leadsThisWeekRes.count ?? 0,
        newLeadsLastWeek: leadsLastWeekRes.count ?? 0,
      });

      // Aggregate chart data by day
      const aggregateByDay = (records: { created_at: string }[]): TimeSeriesPoint[] => {
        const map = new Map<string, number>();
        // Initialize all 30 days
        for (let i = 29; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const key = d.toISOString().split('T')[0];
          map.set(key, 0);
        }
        records.forEach((r) => {
          const key = new Date(r.created_at).toISOString().split('T')[0];
          if (map.has(key)) {
            map.set(key, (map.get(key) || 0) + 1);
          }
        });
        return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
      };

      setCharts({
        userGrowth: aggregateByDay((usersChartRes.data || []) as { created_at: string }[]),
        applications: aggregateByDay((appsChartRes.data || []) as { created_at: string }[]),
        workforceRequests: aggregateByDay((leadsChartRes.data || []) as { created_at: string }[]),
        draftActivity: aggregateByDay((draftsChartRes.data || []) as { created_at: string }[]),
      });

      setLoading(false);
    })();

    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Enterprise Analytics</p>
            <h3 className="text-lg font-semibold text-zinc-100 mt-1">Platform Statistics</h3>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#f59e0b]/10">
            <BarChart3 className="h-4 w-4 text-[#f59e0b]" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm animate-pulse">
              <div className="h-3 w-20 bg-zinc-800 rounded mb-3" />
              <div className="h-8 w-12 bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Enterprise Analytics</p>
          <h3 className="text-lg font-semibold text-zinc-100 mt-1">Platform Statistics</h3>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#f59e0b]/10">
          <BarChart3 className="h-4 w-4 text-[#f59e0b]" />
        </div>
      </div>

      {/* Platform Stats Cards */}
      {data && <StatsGrid data={data} />}

      {/* Weekly Growth */}
      {weekly && <WeeklyGrowthSection weekly={weekly} />}

      {/* Charts */}
      {charts && <ChartsSection charts={charts} />}

      {/* System Health */}
      <SystemHealth />
    </div>
  );
}

/* ─── Stats Grid ─── */
function StatsGrid({ data }: { data: AnalyticsData }) {
  const cards = [
    { label: 'Total Users', value: data.totalUsers, icon: Users2, color: 'text-zinc-100' },
    { label: 'Active Workers', value: data.activeWorkers, icon: HardHat, color: 'text-emerald-400' },
    { label: 'Companies', value: data.companies, icon: Building2, color: 'text-amber-400' },
    { label: 'Job Applications', value: data.jobApplications, icon: ClipboardList, color: 'text-blue-400' },
    { label: 'Workforce Requests', value: data.workforceRequests, icon: HardHat, color: 'text-orange-400' },
    { label: 'Content Drafts', value: data.contentDrafts, icon: FileText, color: 'text-purple-400' },
    { label: 'Published Posts', value: data.publishedPosts, icon: Newspaper, color: 'text-cyan-400' },
    { label: 'Open Jobs', value: data.openJobs, icon: Briefcase, color: 'text-pink-400' },
    { label: 'Platform Moderators', value: data.platformModerators, icon: Shield, color: 'text-red-400' },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <div key={c.label} className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm hover:border-zinc-700 transition">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">{c.label}</p>
            <c.icon className="h-4 w-4 text-zinc-600" />
          </div>
          <p className={`mt-3 text-3xl font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Weekly Growth ─── */
function WeeklyGrowthSection({ weekly }: { weekly: WeeklyGrowth }) {
  const calcGrowth = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const metrics = [
    {
      label: 'New Users This Week',
      value: weekly.newUsersThisWeek,
      growth: calcGrowth(weekly.newUsersThisWeek, weekly.newUsersLastWeek),
    },
    {
      label: 'New Applications This Week',
      value: weekly.newAppsThisWeek,
      growth: calcGrowth(weekly.newAppsThisWeek, weekly.newAppsLastWeek),
    },
    {
      label: 'New Workforce Requests This Week',
      value: weekly.newLeadsThisWeek,
      growth: calcGrowth(weekly.newLeadsThisWeek, weekly.newLeadsLastWeek),
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-medium">Weekly Growth</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.label} className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">{m.label}</p>
            <div className="flex items-end gap-3 mt-2">
              <p className="text-2xl font-bold text-zinc-100">{m.value}</p>
              <GrowthBadge growth={m.growth} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GrowthBadge({ growth }: { growth: number }) {
  if (growth > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-sm">
        <TrendingUp className="h-3 w-3" />
        +{growth}%
      </span>
    );
  }
  if (growth < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/30 rounded-sm">
        <TrendingDown className="h-3 w-3" />
        {growth}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-zinc-500/10 text-zinc-400 border border-zinc-700 rounded-sm">
      <Minus className="h-3 w-3" />
      0%
    </span>
  );
}

/* ─── Charts Section ─── */
function ChartsSection({ charts }: { charts: ChartData }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-medium">30-Day Trends</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <MiniChart title="User Growth" data={charts.userGrowth} color="#10b981" />
        <MiniChart title="Applications" data={charts.applications} color="#3b82f6" />
        <MiniChart title="Workforce Requests" data={charts.workforceRequests} color="#f59e0b" />
        <MiniChart title="Draft Activity" data={charts.draftActivity} color="#a855f7" />
      </div>
    </div>
  );
}

function MiniChart({ title, data, color }: { title: string; data: TimeSeriesPoint[]; color: string }) {
  const maxVal = useMemo(() => Math.max(...data.map((d) => d.count), 1), [data]);
  const total = useMemo(() => data.reduce((sum, d) => sum + d.count, 0), [data]);

  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-zinc-300">{title}</p>
        <span className="text-xs text-zinc-500">Total: {total}</span>
      </div>
      <div className="flex items-end gap-[2px] h-16">
        {data.map((point, i) => {
          const height = maxVal > 0 ? (point.count / maxVal) * 100 : 0;
          return (
            <div
              key={i}
              className="flex-1 rounded-t-sm transition-all hover:opacity-80 group relative"
              style={{
                height: `${Math.max(height, 2)}%`,
                backgroundColor: point.count > 0 ? color : 'rgba(63,63,70,0.3)',
              }}
              title={`${point.date}: ${point.count}`}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[9px] text-zinc-600">30 days ago</span>
        <span className="text-[9px] text-zinc-600">Today</span>
      </div>
    </div>
  );
}

/* ─── System Health ─── */
function SystemHealth() {
  const [health, setHealth] = useState<{
    connected: boolean;
    tablesLoaded: number;
    lastActivity: string | null;
  }>({ connected: false, tablesLoaded: 0, lastActivity: null });

  useEffect(() => {
    (async () => {
      // Check connection
      const { error } = await supabase.from(TABLES.profiles).select('id', { count: 'exact', head: true });
      const connected = !error;

      // Count tables we can access
      const tableKeys = Object.keys(TABLES);
      let tablesLoaded = 0;
      for (const key of tableKeys) {
        const { error: tErr } = await supabase
          .from(TABLES[key as keyof typeof TABLES])
          .select('*', { count: 'exact', head: true });
        if (!tErr) tablesLoaded++;
      }

      // Last activity
      const { data: lastUser } = await supabase
        .from(TABLES.profiles)
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);

      setHealth({
        connected,
        tablesLoaded,
        lastActivity: lastUser?.[0]?.created_at || null,
      });
    })();
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-medium">System Health</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-zinc-800/80 bg-[#0d0d0d] p-4 rounded-sm">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Supabase</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`h-2 w-2 rounded-full ${health.connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className={`text-sm font-medium ${health.connected ? 'text-emerald-400' : 'text-red-400'}`}>
              {health.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        <div className="border border-zinc-800/80 bg-[#0d0d0d] p-4 rounded-sm">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Tables Loaded</p>
          <p className="text-xl font-bold text-zinc-100 mt-2">{health.tablesLoaded}/{Object.keys(TABLES).length}</p>
        </div>
        <div className="border border-zinc-800/80 bg-[#0d0d0d] p-4 rounded-sm">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Last Activity</p>
          <p className="text-sm font-medium text-zinc-300 mt-2">
            {health.lastActivity ? formatRelative(health.lastActivity) : '—'}
          </p>
        </div>
        <div className="border border-zinc-800/80 bg-[#0d0d0d] p-4 rounded-sm">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Environment</p>
          <p className="text-sm font-medium text-zinc-300 mt-2">Production</p>
        </div>
      </div>
    </div>
  );
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}