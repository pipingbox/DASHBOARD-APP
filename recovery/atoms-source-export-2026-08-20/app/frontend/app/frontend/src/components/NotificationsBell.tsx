import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Heart,
  MessageSquare,
  Briefcase,
  UserCheck,
  UserPlus,
  FileText,
  ShieldAlert,
  Award,
  Mail,
  Loader2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationRow, NotificationType } from '@/lib/notifications';
import { cn } from '@/lib/utils';

const RELATIVE_MIN = 60_000;
const RELATIVE_HOUR = 3_600_000;
const RELATIVE_DAY = 86_400_000;

interface NotificationMeta {
  icon: typeof Bell;
  iconColor: string;
}

function getNotificationMeta(type: NotificationType): NotificationMeta {
  switch (type) {
    case 'like':
      return { icon: Heart, iconColor: 'text-red-500' };
    case 'comment':
      return { icon: MessageSquare, iconColor: 'text-blue-500' };
    case 'job_invitation':
    case 'JOB_INVITATION':
      return { icon: Briefcase, iconColor: 'text-[#f59e0b]' };
    case 'PROFILE_INCOMPLETE':
      return { icon: UserCheck, iconColor: 'text-orange-400' };
    case 'PROFILE_READY':
      return { icon: UserCheck, iconColor: 'text-emerald-500' };
    case 'REFERRAL_JOINED':
      return { icon: UserPlus, iconColor: 'text-purple-400' };
    case 'REFERRAL_VERIFIED':
      return { icon: UserPlus, iconColor: 'text-emerald-400' };
    case 'NEW_MESSAGE':
      return { icon: Mail, iconColor: 'text-blue-400' };
    case 'DOCUMENT_REQUEST':
      return { icon: FileText, iconColor: 'text-cyan-400' };
    case 'CERTIFICATE_EXPIRING':
      return { icon: Award, iconColor: 'text-yellow-500' };
    case 'ADMIN_ALERT':
      return { icon: ShieldAlert, iconColor: 'text-red-400' };
    default:
      return { icon: Bell, iconColor: 'text-zinc-400' };
  }
}

function getNotificationMessage(n: NotificationRow, t: (key: string, opts?: Record<string, string>) => string): string {
  // If a custom message is stored, use it
  if (n.message) return n.message;

  // Fallback to i18n-based messages
  const actor = n.actor_name?.trim() || t('notifications.someone');
  switch (n.type) {
    case 'like':
      return t('notifications.likedYourPost', { actor, title: n.title || '' });
    case 'comment':
      return t('notifications.commentedOnYourPost', { actor, title: n.title || '' });
    case 'job_invitation':
    case 'JOB_INVITATION':
      return t('notifications.jobInvitation', { title: n.title || '' });
    case 'PROFILE_INCOMPLETE':
      return t('notifications.profileIncomplete');
    case 'PROFILE_READY':
      return t('notifications.profileReady');
    case 'REFERRAL_JOINED':
      return t('notifications.referralJoined', { name: actor });
    case 'REFERRAL_VERIFIED':
      return t('notifications.referralVerified', { name: actor });
    case 'NEW_MESSAGE':
      return t('notifications.newMessage', { name: actor });
    case 'DOCUMENT_REQUEST':
      return t('notifications.documentRequest');
    case 'CERTIFICATE_EXPIRING':
      return t('notifications.certificateExpiring');
    case 'ADMIN_ALERT':
      return t('notifications.adminAlert');
    default:
      return n.title || t('notifications.empty');
  }
}

export function NotificationsBell() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const {
    unreadCount,
    notifications,
    loading,
    loadNotifications,
    markRead,
    markAllRead,
    deleteNotification: removeNotification,
  } = useNotifications();

  useEffect(() => {
    if (open) void loadNotifications();
  }, [open, loadNotifications]);

  const relativeTime = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < RELATIVE_MIN) return t('notifications.justNow');
    if (diff < RELATIVE_HOUR) {
      const mins = Math.floor(diff / RELATIVE_MIN);
      return `${mins}m`;
    }
    if (diff < RELATIVE_DAY) {
      const hrs = Math.floor(diff / RELATIVE_HOUR);
      return `${hrs}h`;
    }
    const days = Math.floor(diff / RELATIVE_DAY);
    return `${days}d`;
  };

  const handleItemClick = async (n: NotificationRow) => {
    if (!n.is_read) {
      await markRead(n.id);
    }
    setOpen(false);
    // Navigate to action URL if available
    if (n.action_url) {
      navigate(n.action_url);
    }
  };

  if (!user) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
        disabled
        aria-label={t('notifications.title')}
      >
        <Bell className="h-4 w-4" />
      </Button>
    );
  }

  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
          aria-label={t('notifications.title')}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#f59e0b] px-1 text-[10px] font-bold text-black">
              {badgeText}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[360px] max-w-[calc(100vw-2rem)] border-zinc-800 bg-[#0d0d0d] p-0 text-zinc-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <span className="text-sm font-semibold">{t('notifications.title')}</span>
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
            className={cn(
              'text-xs',
              unreadCount === 0
                ? 'cursor-not-allowed text-zinc-600'
                : 'text-[#f59e0b] hover:underline',
            )}
          >
            {t('notifications.markAllRead')}
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-zinc-500">
              {t('notifications.empty')}
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800/50">
              {notifications.map((n) => {
                const meta = getNotificationMeta(n.type);
                const Icon = meta.icon;
                const message = getNotificationMessage(n, t);

                return (
                  <li key={n.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => void handleItemClick(n)}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-900',
                        !n.is_read && 'bg-zinc-900/40',
                      )}
                    >
                      <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800/80')}>
                        <Icon className={cn('h-4 w-4', meta.iconColor)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        {n.title && (
                          <p className="text-xs font-medium text-zinc-400 mb-0.5">{n.title}</p>
                        )}
                        <p className="text-sm text-zinc-200 line-clamp-2">{message}</p>
                        <p className="mt-1 text-xs text-zinc-500">{relativeTime(n.created_at)}</p>
                      </div>
                      {!n.is_read && (
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#f59e0b]" />
                      )}
                    </button>
                    {/* Delete button on hover */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeNotification(n.id);
                      }}
                      className="absolute right-2 top-2 hidden h-5 w-5 items-center justify-center rounded bg-zinc-800 text-zinc-500 hover:text-zinc-200 group-hover:flex"
                      aria-label="Delete"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}