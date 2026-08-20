import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Briefcase,
  Wrench,
  ClipboardList,
  Activity,
  ArrowRight,
  UserCircle2,
  History,
  MapPin,
  Euro,
  Plus,
  Settings2,
  Route,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { WorkDayLogDialog } from '@/components/WorkDayLogDialog';
import { WorkDayCalendar } from '@/components/WorkDayCalendar';
import { RatePresetManager } from '@/components/RatePresetManager';
import { ProNetworkWidget } from '@/components/profile/ProNetworkWidget';
import { PendingInvitationsWidget } from '@/components/PendingInvitationsWidget';
import { ProfileCompletionCard } from '@/components/dashboard/ProfileCompletionCard';
import { processStoredReferral, verifyReferralIfEligible } from '@/lib/referrals';
import { CurrencyCode, DEFAULT_CURRENCY, formatCurrency } from '@/lib/currency';
import { RatePreset, WorkDayLog, monthBounds } from '@/lib/workDayLogs';

interface Stats {
  jobsOpen: number;
  applications: number;
  toolsUsed: number;
  currency: CurrencyCode;
}

interface JobRow {
  id: string;
  title: string;
  company: string;
  location: string | null;
  created_at: string;
}

interface ToolRow {
  id: string;
  tool_name: string;
  tool_category: string | null;
  created_at: string;
}

function StatTile({
  label,
  value,
  icon: Icon,
  to,
  loading,
  hint,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  loading: boolean;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      className="group border border-zinc-800/80 bg-[#0d0d0d] p-5 hover:border-[#f59e0b] transition"
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">{label}</p>
        <Icon className="h-4 w-4 text-zinc-600 group-hover:text-[#f59e0b]" />
      </div>
      <p className="mt-3 text-2xl font-bold text-zinc-100">{loading ? '—' : value}</p>
      {hint && (
        <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-zinc-600">{hint}</p>
      )}
    </Link>
  );
}

function WidgetShell({
  eyebrow,
  title,
  children,
  cta,
  right,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  cta?: { to: string; label: string };
  right?: React.ReactNode;
}) {
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">{eyebrow}</p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-100">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {right}
          {cta && (
            <Link
              to={cta.to}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-[#f59e0b]"
            >
              {cta.label} <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
      {message}
    </div>
  );
}

function ErrorState({ message, onRetry, retryLabel }: { message: string; onRetry: () => void; retryLabel: string }) {
  return (
    <div className="border border-red-900/50 bg-red-950/20 p-6 text-center">
      <AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-400" />
      <p className="text-xs text-red-300">{message}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="mt-3 !bg-transparent !hover:bg-transparent border-red-900 text-red-300 hover:text-red-100 hover:border-red-700"
      >
        <RefreshCw className="mr-1 h-3 w-3" /> {retryLabel}
      </Button>
    </div>
  );
}

function SkeletonRow() {
  return <div className="h-10 animate-pulse bg-zinc-900/80" />;
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { user, profile, loading: authLoading } = useAuth();
  const location = useLocation();

  const [stats, setStats] = useState<Stats>({
    jobsOpen: 0,
    applications: 0,
    toolsUsed: 0,
    currency: DEFAULT_CURRENCY,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [monthLogs, setMonthLogs] = useState<WorkDayLog[]>([]);
  const [monthLogsLoading, setMonthLogsLoading] = useState(true);
  const [recentLogs, setRecentLogs] = useState<WorkDayLog[]>([]);
  const [recentLogsLoading, setRecentLogsLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitialDate, setDialogInitialDate] = useState<string | undefined>();
  const [dialogExistingLog, setDialogExistingLog] = useState<WorkDayLog | null>(null);

  const [presets, setPresets] = useState<RatePreset[]>([]);
  const [presetManagerOpen, setPresetManagerOpen] = useState(false);

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  const [tools, setTools] = useState<ToolRow[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);

  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadStats = useCallback(async (_userId?: string) => {
    setStatsLoading(true);
    try {
      // Use fresh auth user for RLS compliance
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) {
        setStatsLoading(false);
        return;
      }
      const [jobsOpenRes, appsRes, toolsCountRes] = await Promise.all([
        supabase
          .from(TABLES.jobs)
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open'),
        supabase
          .from(TABLES.jobApplications)
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid),
        supabase
          .from(TABLES.toolUsage)
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid),
      ]);
      setStats((prev) => ({
        ...prev,
        jobsOpen: jobsOpenRes.count ?? 0,
        applications: appsRes.count ?? 0,
        toolsUsed: toolsCountRes.count ?? 0,
      }));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadMonthLogs = useCallback(
    async (userId: string, year: number, month: number) => {
      setMonthLogsLoading(true);
      try {
        const { start, end } = monthBounds(year, month);
        const { data } = await supabase
          .from(TABLES.workDayLogs)
          .select('*')
          .eq('user_id', userId)
          .gte('log_date', start)
          .lte('log_date', end)
          .order('log_date', { ascending: true });
        setMonthLogs((data as WorkDayLog[]) ?? []);
      } finally {
        setMonthLogsLoading(false);
      }
    },
    [],
  );

  const loadRecentLogs = useCallback(async (userId: string) => {
    setRecentLogsLoading(true);
    try {
      const { data } = await supabase
        .from(TABLES.workDayLogs)
        .select('*')
        .eq('user_id', userId)
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentLogs((data as WorkDayLog[]) ?? []);
    } finally {
      setRecentLogsLoading(false);
    }
  }, []);

  const loadPresets = useCallback(async (_userId?: string) => {
    // Use supabase.auth.getUser() for a fresh, server-validated user id
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id;
    if (!uid) return;
    const { data } = await supabase
      .from(TABLES.ratePresets)
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    setPresets((data as RatePreset[]) ?? []);
  }, []);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const { data } = await supabase
        .from(TABLES.jobs)
        .select('id, title, company, location, created_at')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(5);
      setJobs((data as JobRow[]) ?? []);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const loadTools = useCallback(async (userId: string) => {
    setToolsLoading(true);
    try {
      const { data } = await supabase
        .from(TABLES.toolUsage)
        .select('id, tool_name, tool_category, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      setTools((data as ToolRow[]) ?? []);
    } finally {
      setToolsLoading(false);
    }
  }, []);

  // Process stored referral code after signup and check verification eligibility
  useEffect(() => {
    if (!user) return;
    processStoredReferral(user.id, user.email);
    // Check if any pending referral (where this user is the referred) can be verified
    verifyReferralIfEligible(user.id);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!location.pathname.startsWith('/dashboard')) return;

    let cancelled = false;
    setFetchError(null);

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!sessionData.session) {
        return;
      }

      try {
        await Promise.all([
          loadStats(user.id),
          loadRecentLogs(user.id),
          loadPresets(user.id),
          loadJobs(),
          loadTools(user.id),
        ]);
      } catch (err) {
        if (!cancelled) {
          setFetchError(
            err instanceof Error ? err.message : t('dashboard.failedToLoad'),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    user,
    location.pathname,
    reloadKey,
    loadStats,
    loadRecentLogs,
    loadPresets,
    loadJobs,
    loadTools,
    t,
  ]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!location.pathname.startsWith('/dashboard')) return;
    loadMonthLogs(user.id, viewYear, viewMonth);
  }, [authLoading, user, location.pathname, viewYear, viewMonth, reloadKey, loadMonthLogs]);

  const monthTotals = useMemo(() => {
    let normalHours = 0;
    let extraHours = 0;
    let grossSalary = 0;
    let km = 0;
    let travel = 0;
    let finalTotal = 0;
    let currency: CurrencyCode = DEFAULT_CURRENCY;
    for (const l of monthLogs) {
      normalHours += Number(l.normal_hours || 0);
      extraHours += Number(l.extra_hours || 0);
      grossSalary += Number(l.total_salary || 0);
      km += Number(l.kilometers || 0);
      travel += Number(l.travel_allowance || 0);
      finalTotal += Number(l.final_total || 0);
      if (l.currency) currency = l.currency as CurrencyCode;
    }
    return {
      normalHours: Math.round(normalHours * 10) / 10,
      extraHours: Math.round(extraHours * 10) / 10,
      grossSalary: Math.round(grossSalary * 100) / 100,
      km: Math.round(km * 10) / 10,
      travel: Math.round(travel * 100) / 100,
      finalTotal: Math.round(finalTotal * 100) / 100,
      currency,
    };
  }, [monthLogs]);

  const handleLogChanged = useCallback(() => {
    if (!user) return;
    loadMonthLogs(user.id, viewYear, viewMonth);
    loadRecentLogs(user.id);
    loadStats(user.id);
  }, [user, viewYear, viewMonth, loadMonthLogs, loadRecentLogs, loadStats]);

  const handleRetry = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  const openForDay = (dateIso: string, existing: WorkDayLog | null) => {
    setDialogInitialDate(dateIso);
    setDialogExistingLog(existing);
    setDialogOpen(true);
  };

  const firstName =
    profile?.full_name?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'there';

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(i18n.language, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('common.justNow');
    if (mins < 60) return t('common.minutesAgo', { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('common.hoursAgo', { count: hrs });
    const days = Math.floor(hrs / 24);
    return t('common.daysAgo', { count: days });
  };

  const hasTravel = monthTotals.km > 0 || monthTotals.travel > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('dashboard.overview')}
        title={t('dashboard.welcomeBack', { name: firstName })}
        description={t('dashboard.description')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="!bg-transparent !hover:bg-transparent border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600"
            >
              <Link to="/profile">{t('dashboard.updateProfile')}</Link>
            </Button>
            <Button
              variant="outline"
              className="!bg-transparent !hover:bg-transparent border-zinc-800 text-zinc-300 hover:text-[#f59e0b] hover:border-[#f59e0b]"
              onClick={() => setPresetManagerOpen(true)}
            >
              <Settings2 className="mr-2 h-4 w-4" />
              {t('dashboard.ratePresets')}
            </Button>
            <WorkDayLogDialog onChanged={handleLogChanged} />
          </div>
        }
      />

      {fetchError && (
        <ErrorState message={fetchError} onRetry={handleRetry} retryLabel={t('common.retry')} />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 border border-zinc-800/80 bg-[#0d0d0d] p-5">
          {profile && (
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden bg-zinc-900 text-[#f59e0b]">
                {profile.avatar_url && profile.show_avatar !== false ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name || 'avatar'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserCircle2 className="h-8 w-8" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                  {t('dashboard.yourProfile')}
                </p>
                <p className="mt-1 text-base font-semibold text-zinc-100 truncate">
                  {profile.full_name || t('dashboard.unnamedUser')}
                </p>
                {profile.title && (
                  <p className="mt-1 text-xs text-zinc-500">{profile.title}</p>
                )}
                <Link
                  to="/profile"
                  className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-[#f59e0b] hover:underline"
                >
                  {t('dashboard.editProfile')} <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 grid gap-4 sm:grid-cols-3">
          <StatTile
            label={t('dashboard.openJobs')}
            value={stats.jobsOpen}
            icon={Briefcase}
            to="/jobs"
            loading={statsLoading}
          />
          <StatTile
            label={t('dashboard.myApplications')}
            value={stats.applications}
            icon={ClipboardList}
            to="/jobs"
            loading={statsLoading}
          />
          <StatTile
            label={t('dashboard.toolsUsed')}
            value={stats.toolsUsed}
            icon={Wrench}
            to="/tools"
            loading={statsLoading}
          />
        </div>
      </div>

      <div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            label={t('dashboard.normalHours')}
            value={monthLogsLoading ? '—' : monthTotals.normalHours}
            icon={Activity}
            to="/profile"
            loading={monthLogsLoading}
            hint={t('dashboard.thisMonth')}
          />
          <StatTile
            label={t('dashboard.extraHours')}
            value={monthLogsLoading ? '—' : monthTotals.extraHours}
            icon={Activity}
            to="/profile"
            loading={monthLogsLoading}
            hint={t('dashboard.thisMonth')}
          />
          <StatTile
            label={t('dashboard.grossSalary')}
            value={formatCurrency(monthTotals.grossSalary, monthTotals.currency)}
            icon={Euro}
            to="/profile"
            loading={monthLogsLoading}
            hint={`${monthTotals.currency} • ${t('dashboard.gross')}`}
          />
          <StatTile
            label={t('dashboard.kilometers')}
            value={monthLogsLoading ? '—' : `${monthTotals.km} km`}
            icon={Route}
            to="/profile"
            loading={monthLogsLoading}
            hint={t('dashboard.thisMonth')}
          />
          <StatTile
            label={hasTravel ? t('dashboard.travelPlusGross') : t('dashboard.travelAllowance')}
            value={formatCurrency(
              hasTravel ? monthTotals.finalTotal : monthTotals.travel,
              monthTotals.currency,
            )}
            icon={Euro}
            to="/profile"
            loading={monthLogsLoading}
            hint={hasTravel ? t('dashboard.finalTotal') : t('dashboard.thisMonth')}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 border border-zinc-800/80 bg-[#0d0d0d] p-5">
          <WorkDayCalendar
            year={viewYear}
            monthIndex={viewMonth}
            logs={monthLogs}
            onChangeMonth={(y, m) => {
              setViewYear(y);
              setViewMonth(m);
            }}
            onDayClick={openForDay}
          />
        </div>

        <div className="lg:col-span-2">
          <WidgetShell
            eyebrow={t('dashboard.workDayLog')}
            title={t('dashboard.latestEntries')}
            right={
              <WorkDayLogDialog
                onChanged={handleLogChanged}
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    className="!bg-transparent !hover:bg-transparent h-8 border-zinc-800 text-zinc-300 hover:text-[#f59e0b] hover:border-[#f59e0b]"
                  >
                    <Plus className="mr-1 h-3 w-3" /> {t('dashboard.newEntry')}
                  </Button>
                }
              />
            }
          >
            {recentLogsLoading ? (
              <div className="space-y-2">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            ) : recentLogs.length === 0 ? (
              <EmptyState message={t('dashboard.noLogsYet')} />
            ) : (
              <div className="overflow-x-auto border border-zinc-800/80">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-950 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t('dashboard.dateCol')}</th>
                      <th className="px-3 py-2 font-medium">{t('dashboard.locationCol')}</th>
                      <th className="px-3 py-2 font-medium text-right">{t('dashboard.hoursCol')}</th>
                      <th className="px-3 py-2 font-medium text-right">{t('dashboard.totalCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {recentLogs.map((l) => {
                      const hn = Number(l.normal_hours ?? 0);
                      const he = Number(l.extra_hours ?? 0);
                      const cur = (l.currency as CurrencyCode) || DEFAULT_CURRENCY;
                      const dayTotal = Number(l.final_total || l.total_salary || 0);
                      return (
                        <tr
                          key={l.id}
                          onClick={() => openForDay(l.log_date, l)}
                          className="text-zinc-300 hover:bg-zinc-900/40 cursor-pointer"
                        >
                          <td className="px-3 py-2 text-xs text-zinc-500">
                            {formatDate(l.log_date)}
                          </td>
                          <td className="px-3 py-2 text-xs truncate max-w-[120px]">
                            {l.location || <span className="text-zinc-600">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            <span className="text-zinc-200">{hn.toFixed(1)}</span>
                            {he > 0 && (
                              <span className="text-[#f59e0b]"> +{he.toFixed(1)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-zinc-100">
                            {formatCurrency(dayTotal, cur)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </WidgetShell>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <WidgetShell
          eyebrow={t('dashboard.jobBoard')}
          title={t('dashboard.latestOpenRoles')}
          cta={{ to: '/jobs', label: t('dashboard.browseJobs') }}
        >
          {jobsLoading ? (
            <div className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState message={t('dashboard.noOpenRoles')} />
          ) : (
            <ul className="divide-y divide-zinc-800/60">
              {jobs.map((j) => (
                <li key={j.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-100 truncate">
                        {j.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                        <span className="inline-flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {j.company}
                        </span>
                        {j.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {j.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 whitespace-nowrap">
                      {formatRelative(j.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </WidgetShell>

        <WidgetShell
          eyebrow={t('dashboard.toolsEyebrow')}
          title={t('dashboard.recentToolUsage')}
          cta={{ to: '/tools', label: t('dashboard.openTools') }}
        >
          {toolsLoading ? (
            <div className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : tools.length === 0 ? (
            <EmptyState message={t('dashboard.noToolUsage')} />
          ) : (
            <ul className="divide-y divide-zinc-800/60">
              {tools.map((tl) => (
                <li key={tl.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-100 truncate">
                        {tl.tool_name}
                      </p>
                      {tl.tool_category && (
                        <p className="mt-1 text-xs text-zinc-500 inline-flex items-center gap-1">
                          <History className="h-3 w-3" />
                          {tl.tool_category}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 whitespace-nowrap">
                      {formatRelative(tl.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </WidgetShell>
      </div>

      {/* Profile Completion Card */}
      <ProfileCompletionCard />

      {/* Pending Job Invitations for Workers */}
      <PendingInvitationsWidget />

      {/* Professional Network / Referral Widget */}
      <ProNetworkWidget />

      <WorkDayLogDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setDialogExistingLog(null);
        }}
        initialDate={dialogInitialDate}
        existingLog={dialogExistingLog}
        onChanged={handleLogChanged}
      />

      <RatePresetManager
        open={presetManagerOpen}
        onOpenChange={setPresetManagerOpen}
        presets={presets}
        onChanged={() => user && loadPresets(user.id)}
      />
    </div>
  );
}