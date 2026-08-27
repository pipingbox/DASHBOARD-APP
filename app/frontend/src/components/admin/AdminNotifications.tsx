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
  Megaphone,
  Send,
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { NotificationRow, NotificationType } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type FilterType = 'all' | 'registrations' | 'referrals' | 'jobs' | 'alerts' | 'announcements';
type Audience = 'all' | 'workers' | 'companies';

const FILTER_TYPES: Record<FilterType, NotificationType[]> = {
  all: [],
  registrations: ['PROFILE_INCOMPLETE', 'PROFILE_READY', 'ADMIN_ALERT'],
  referrals: ['REFERRAL_JOINED', 'REFERRAL_VERIFIED'],
  jobs: ['JOB_INVITATION', 'job_invitation', 'JOB_MATCH'],
  alerts: ['ADMIN_ALERT', 'CERTIFICATE_EXPIRING', 'DOCUMENT_REQUEST'],
  announcements: ['PRODUCT_UPDATE'],
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
    case 'JOB_MATCH':
      return Briefcase;
    case 'NEW_MESSAGE':
      return Mail;
    case 'CERTIFICATE_EXPIRING':
      return Award;
    case 'DOCUMENT_REQUEST':
      return FileText;
    case 'ADMIN_ALERT':
      return ShieldAlert;
    case 'PRODUCT_UPDATE':
      return Megaphone;
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
    case 'JOB_MATCH':
      return 'text-[#f59e0b] bg-[#f59e0b]/10';
    case 'NEW_MESSAGE':
      return 'text-blue-400 bg-blue-400/10';
    case 'CERTIFICATE_EXPIRING':
      return 'text-yellow-500 bg-yellow-500/10';
    case 'DOCUMENT_REQUEST':
      return 'text-cyan-400 bg-cyan-400/10';
    case 'ADMIN_ALERT':
      return 'text-red-400 bg-red-400/10';
    case 'PRODUCT_UPDATE':
      return 'text-indigo-400 bg-indigo-400/10';
    default:
      return 'text-zinc-400 bg-zinc-400/10';
  }
}

// ── Broadcast panel ─────────────────────────────────────────────────────────

function BroadcastPanel({ onSent }: { onSent: () => void }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const t = title.trim();
    const m = message.trim();
    if (!t || !m) {
      toast.error('Title and message are required.');
      return;
    }

    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await supabase.functions.invoke('broadcast-notification', {
        body: { type: 'PRODUCT_UPDATE', audience, title: t, message: m },
      });

      if (res.error) throw res.error;

      const result = res.data as { sent: number; skipped_duplicates: number; total_targets: number };
      toast.success(
        `Broadcast sent to ${result.sent} user${result.sent !== 1 ? 's' : ''}` +
        (result.skipped_duplicates > 0 ? ` (${result.skipped_duplicates} already notified)` : '') +
        `.`,
      );

      setTitle('');
      setMessage('');
      onSent();
    } catch (err) {
      toast.error('Broadcast failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300">
        <Megaphone className="h-4 w-4" />
        Broadcast announcement
      </div>

      <div className="space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Announcement title…"
          maxLength={120}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What's new? Keep it short and actionable…"
          maxLength={400}
          rows={3}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none resize-none"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {(['all', 'workers', 'companies'] as Audience[]).map((seg) => (
            <button
              key={seg}
              onClick={() => setAudience(seg)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors capitalize',
                audience === seg
                  ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-500/40'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600',
              )}
            >
              {seg}
            </button>
          ))}
        </div>

        <button
          onClick={handleSend}
          disabled={sending || !title.trim() || !message.trim()}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors',
            sending || !title.trim() || !message.trim()
              ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
              : 'bg-indigo-500 text-white hover:bg-indigo-400',
          )}
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function AdminNotifications() {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showBroadcast, setShowBroadcast] = useState(false);

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
    jobs: notifications.filter((n) => ['JOB_INVITATION', 'job_invitation', 'JOB_MATCH'].includes(n.type)).length,
    alerts: notifications.filter((n) => n.type === 'ADMIN_ALERT').length,
    announcements: notifications.filter((n) => n.type === 'PRODUCT_UPDATE').length,
  };

  const filters: { id: FilterType; label: string; count: number }[] = [
    { id: 'all', label: t('admin.notifications.all'), count: stats.total },
    { id: 'registrations', label: t('admin.notifications.registrations'), count: stats.registrations },
    { id: 'referrals', label: t('admin.notifications.referrals'), count: stats.referrals },
    { id: 'jobs', label: t('admin.notifications.jobs'), count: stats.jobs },
    { id: 'alerts', label: t('admin.notifications.alerts'), count: stats.alerts },
    { id: 'announcements', label: 'Announcements', count: stats.announcements },
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBroadcast((v) => !v)}
            className={cn(
              'flex items-center gap-1 text-xs transition-colors',
              showBroadcast ? 'text-indigo-400 hover:text-indigo-300' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            <Megaphone className="h-3 w-3" />
            Broadcast
          </button>
          <button
            onClick={() => void loadNotifications()}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* Broadcast panel (toggled) */}
      {showBroadcast && (
        <BroadcastPanel
          onSent={() => {
            setShowBroadcast(false);
            void loadNotifications();
          }}
        />
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
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
