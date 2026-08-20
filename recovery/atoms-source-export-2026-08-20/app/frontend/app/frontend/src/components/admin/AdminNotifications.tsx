import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Briefcase,
  UserPlus,
  ShieldAlert,
  Award,
  FileText,
  Mail,
  UserCheck,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { NotificationRow, NotificationType } from '@/lib/notifications';
import { cn } from '@/lib/utils';

type FilterType = 'all' | 'registrations' | 'referrals' | 'jobs' | 'alerts';

const FILTER_TYPES: Record<FilterType, NotificationType[]> = {
  all: [],
  registrations: ['PROFILE_INCOMPLETE', 'PROFILE_READY', 'ADMIN_ALERT'],
  referrals: ['REFERRAL_JOINED', 'REFERRAL_VERIFIED'],
  jobs: ['JOB_INVITATION', 'job_invitation'],
  alerts: ['ADMIN_ALERT', 'CERTIFICATE_EXPIRING', 'DOCUMENT_REQUEST'],
};

function getTypeIcon(type: NotificationType) {
  switch (type) {
    case 'PROFILE_INCOMPLETE':
    case 'PROFILE_READY':
      return UserCheck;
    case 'REFERRAL_JOINED':
    case 'REFERRAL_VERIFIED':
      return UserPlus;
    case 'JOB_INVITATION':
    case 'job_invitation':
      return Briefcase;
    case 'NEW_MESSAGE':
      return Mail;
    case 'CERTIFICATE_EXPIRING':
      return Award;
    case 'DOCUMENT_REQUEST':
      return FileText;
    case 'ADMIN_ALERT':
      return ShieldAlert;
    default:
      return Bell;
  }
}

function getTypeColor(type: NotificationType): string {
  switch (type) {
    case 'PROFILE_INCOMPLETE':
      return 'text-orange-400 bg-orange-400/10';
    case 'PROFILE_READY':
      return 'text-emerald-400 bg-emerald-400/10';
    case 'REFERRAL_JOINED':
      return 'text-purple-400 bg-purple-400/10';
    case 'REFERRAL_VERIFIED':
      return 'text-emerald-400 bg-emerald-400/10';
    case 'JOB_INVITATION':
    case 'job_invitation':
      return 'text-[#f59e0b] bg-[#f59e0b]/10';
    case 'NEW_MESSAGE':
      return 'text-blue-400 bg-blue-400/10';
    case 'CERTIFICATE_EXPIRING':
      return 'text-yellow-500 bg-yellow-500/10';
    case 'DOCUMENT_REQUEST':
      return 'text-cyan-400 bg-cyan-400/10';
    case 'ADMIN_ALERT':
      return 'text-red-400 bg-red-400/10';
    default:
      return 'text-zinc-400 bg-zinc-400/10';
  }
}

export function AdminNotifications() {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from(TABLES.notifications)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      setNotifications((data as NotificationRow[]) ?? []);
    } catch {
      setNotifications([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const filtered = filter === 'all'
    ? notifications
    : notifications.filter((n) => FILTER_TYPES[filter].includes(n.type));

  // Stats
  const stats = {
    total: notifications.length,
    registrations: notifications.filter((n) => ['PROFILE_INCOMPLETE', 'PROFILE_READY'].includes(n.type)).length,
    referrals: notifications.filter((n) => ['REFERRAL_JOINED', 'REFERRAL_VERIFIED'].includes(n.type)).length,
    jobs: notifications.filter((n) => ['JOB_INVITATION', 'job_invitation'].includes(n.type)).length,
    alerts: notifications.filter((n) => n.type === 'ADMIN_ALERT').length,
  };

  const filters: { id: FilterType; label: string; count: number }[] = [
    { id: 'all', label: t('admin.notifications.all'), count: stats.total },
    { id: 'registrations', label: t('admin.notifications.registrations'), count: stats.registrations },
    { id: 'referrals', label: t('admin.notifications.referrals'), count: stats.referrals },
    { id: 'jobs', label: t('admin.notifications.jobs'), count: stats.jobs },
    { id: 'alerts', label: t('admin.notifications.alerts'), count: stats.alerts },
  ];

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">{t('admin.notifications.title')}</h3>
        <button
          onClick={() => void loadNotifications()}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          {t('common.refresh')}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-lg border px-3 py-2 text-left transition-colors',
              filter === f.id
                ? 'border-[#f59e0b]/50 bg-[#f59e0b]/10'
                : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700',
            )}
          >
            <p className="text-lg font-bold text-zinc-100">{f.count}</p>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">{f.label}</p>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-zinc-500">
          {t('notifications.empty')}
        </div>
      ) : (
        <div className="space-y-1 max-h-[500px] overflow-y-auto">
          {filtered.map((n) => {
            const Icon = getTypeIcon(n.type);
            const colorClass = getTypeColor(n.type);
            return (
              <div
                key={n.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border border-zinc-800/50 px-3 py-2.5 transition-colors',
                  !n.is_read ? 'bg-zinc-900/60' : 'bg-transparent',
                )}
              >
                <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', colorClass)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                      {n.type}
                    </span>
                    {n.actor_name && (
                      <span className="text-xs text-zinc-500">{n.actor_name}</span>
                    )}
                  </div>
                  {n.title && <p className="text-xs font-medium text-zinc-300 mt-0.5">{n.title}</p>}
                  {n.message && <p className="text-xs text-zinc-400 line-clamp-2 mt-0.5">{n.message}</p>}
                  <p className="text-[10px] text-zinc-600 mt-1">{formatDate(n.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}