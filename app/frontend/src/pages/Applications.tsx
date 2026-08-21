import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  MapPin,
  Building2,
  Calendar,
  Clock,
  FileText,
  Trash2,
  ExternalLink,
  BadgeCheck,
  Search,
  Filter,
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Application {
  id: string;
  user_id: string;
  job_title: string;
  company_name: string;
  location: string | null;
  contract_type: string | null;
  status: string;
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string | null;
  notes?: string | null;
  created_at: string;
}

type StatusFilter = 'all' | 'applied' | 'reviewed' | 'interview' | 'shortlisted' | 'rejected' | 'hired';

const STATUS_KEYS: Record<string, { i18nKey: string; color: string; bg: string }> = {
  applied: { i18nKey: 'applications.applied', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  reviewed: { i18nKey: 'applications.reviewed', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  interview: { i18nKey: 'applications.interview', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
  shortlisted: { i18nKey: 'applications.shortlisted', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  rejected: { i18nKey: 'applications.rejected', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
  hired: { i18nKey: 'applications.hired', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
};

export default function Applications() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  useEffect(() => {
    if (user) fetchApplications();
  }, [user]);

  const fetchApplications = async () => {
    setLoading(true);
    console.log('[Applications] Fetching applications for user:', user!.id);
    const { data, error } = await supabase
      .from(TABLES.jobApplications)
      .select('id, user_id, job_title, company_name, location, contract_type, status, created_at')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error(t('applications.loadFailed'));
      console.error('[Applications] Supabase error:', error.message, error.details, error.hint, error.code);
    } else {
      console.log('[Applications] Loaded', data?.length ?? 0, 'applications');
      setApplications(data ?? []);
    }
    setLoading(false);
  };

  const withdrawApplication = async (id: string) => {
    setWithdrawingId(id);
    const { error } = await supabase
      .from(TABLES.jobApplications)
      .delete()
      .eq('id', id)
      .eq('user_id', user!.id);

    if (error) {
      toast.error(t('applications.withdrawFailed'));
    } else {
      toast.success(t('applications.withdrawSuccess'));
      setApplications((prev) => prev.filter((a) => a.id !== id));
    }
    setWithdrawingId(null);
  };

  const filteredApplications = applications.filter((app) => {
    const matchesSearch =
      !searchQuery ||
      app.job_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.company_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = applications.reduce(
    (acc, app) => {
      acc[app.status] = (acc[app.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getRelativeTime = (dateStr: string) => {
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return t('applications.today');
    if (diffDays === 1) return t('applications.yesterday');
    if (diffDays < 7) return t('common.daysAgo', { count: diffDays });
    if (diffDays < 30) return t('common.daysAgo', { count: Math.floor(diffDays / 7) * 7 });
    return t('common.daysAgo', { count: diffDays });
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48 bg-zinc-800" />
          <Skeleton className="h-9 w-32 bg-zinc-800" />
        </div>
        <div className="grid gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-3 flex-1">
                  <Skeleton className="h-5 w-64 bg-zinc-800" />
                  <Skeleton className="h-4 w-40 bg-zinc-800" />
                  <div className="flex gap-3">
                    <Skeleton className="h-4 w-24 bg-zinc-800" />
                    <Skeleton className="h-4 w-24 bg-zinc-800" />
                    <Skeleton className="h-4 w-24 bg-zinc-800" />
                  </div>
                </div>
                <Skeleton className="h-7 w-20 rounded-full bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (!loading && applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-800/60 ring-1 ring-zinc-700">
          <Briefcase className="h-10 w-10 text-zinc-500" />
        </div>
        <h2 className="text-xl font-semibold text-zinc-200">{t('applications.noApplications')}</h2>
        <p className="mt-2 max-w-sm text-sm text-zinc-500">
          {t('applications.noApplicationsDesc')}
        </p>
        <Button
          onClick={() => navigate('/jobs')}
          className="mt-6 bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
        >
          <Search className="mr-2 h-4 w-4" />
          {t('applications.browseMoreJobs')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{t('applications.title')}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {t('applications.applicationCount', { count: applications.length })}
          </p>
        </div>
        <Button
          onClick={() => navigate('/jobs')}
          className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
        >
          <Briefcase className="mr-2 h-4 w-4" />
          {t('applications.browseMoreJobs')}
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Object.entries(STATUS_KEYS).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? 'all' : (key as StatusFilter))}
            className={cn(
              'rounded-lg border p-3 text-center transition-all duration-200 hover:scale-[1.02]',
              statusFilter === key
                ? `${cfg.bg} border-current`
                : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
            )}
          >
            <p className={cn('text-lg font-bold', cfg.color)}>{statusCounts[key] || 0}</p>
            <p className="text-[11px] text-zinc-500 font-medium">{t(cfg.i18nKey)}</p>
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder={t('applications.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-zinc-900/60 border-zinc-800 text-zinc-200 placeholder:text-zinc-600"
          />
        </div>
        {statusFilter !== 'all' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatusFilter('all')}
            className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
          >
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            {t('applications.all')}
          </Button>
        )}
      </div>

      {/* Application Cards */}
      <div className="grid gap-4">
        {filteredApplications.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-zinc-500">{t('applications.noMatchingApplications')}</p>
          </div>
        ) : (
          filteredApplications.map((app) => {
            const statusCfg = STATUS_KEYS[app.status] || STATUS_KEYS.applied;
            return (
              <div
                key={app.id}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900/80 hover:shadow-lg hover:shadow-black/20"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left content */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-zinc-100 group-hover:text-[#f59e0b] transition-colors">
                        {app.job_title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <Building2 className="h-3.5 w-3.5 text-zinc-500" />
                      <span>{app.company_name}</span>
                      <BadgeCheck className="h-3.5 w-3.5 text-blue-400" />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                      {app.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {app.location}
                        </span>
                      )}
                      {app.contract_type && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {app.contract_type}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(app.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {getRelativeTime(app.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Right content */}
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={cn('text-xs font-medium border', statusCfg.bg, statusCfg.color)}
                    >
                      {t(statusCfg.i18nKey)}
                    </Badge>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 flex items-center gap-2 border-t border-zinc-800/60 pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/jobs')}
                    className="text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    {t('applications.viewJobs')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => withdrawApplication(app.id)}
                    disabled={withdrawingId === app.id}
                    className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    {withdrawingId === app.id ? t('applications.withdrawing') : t('applications.withdraw')}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}