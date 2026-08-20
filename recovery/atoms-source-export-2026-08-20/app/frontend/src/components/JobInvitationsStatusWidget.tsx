import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
} from 'lucide-react';

interface InvitationRecord {
  id: string;
  candidate_user_id: string;
  job_id: string;
  status: string;
  created_at: string;
  message: string | null;
}

interface InvitationCounts {
  pending: number;
  accepted: number;
  declined: number;
  total: number;
}

interface RecentInvitation {
  id: string;
  candidateName: string;
  jobTitle: string;
  status: string;
  date: string;
}

export function JobInvitationsStatusWidget() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [counts, setCounts] = useState<InvitationCounts>({
    pending: 0,
    accepted: 0,
    declined: 0,
    total: 0,
  });
  const [recent, setRecent] = useState<RecentInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;

    (async () => {
      setLoading(true);

      // Fetch all invitations sent by this company user
      const { data: invitations } = await supabase
        .from(TABLES.jobInvitations)
        .select('id, candidate_user_id, job_id, status, created_at, message')
        .eq('company_user_id', user.id)
        .order('created_at', { ascending: false });

      if (!mounted) return;

      const all = (invitations || []) as InvitationRecord[];

      const pending = all.filter((i) => i.status === 'pending').length;
      const accepted = all.filter((i) => i.status === 'accepted').length;
      const declined = all.filter((i) => i.status === 'declined').length;

      setCounts({ pending, accepted, declined, total: all.length });

      // Get recent 5 invitations with candidate and job names
      const recentItems = all.slice(0, 5);

      if (recentItems.length > 0) {
        // Fetch candidate names
        const candidateIds = [...new Set(recentItems.map((i) => i.candidate_user_id))];
        const { data: profiles } = await supabase
          .from(TABLES.profiles)
          .select('user_id, full_name, username')
          .in('user_id', candidateIds);

        // Fetch job titles
        const jobIds = [...new Set(recentItems.map((i) => i.job_id))];
        const { data: jobs } = await supabase
          .from(TABLES.jobs)
          .select('id, title')
          .in('id', jobIds);

        if (!mounted) return;

        const profileMap = new Map(
          (profiles || []).map((p: { user_id: string; full_name?: string; username?: string }) => [
            p.user_id,
            p.full_name || p.username || 'Unknown',
          ])
        );
        const jobMap = new Map(
          (jobs || []).map((j: { id: string; title: string }) => [j.id, j.title])
        );

        setRecent(
          recentItems.map((i) => ({
            id: i.id,
            candidateName: profileMap.get(i.candidate_user_id) || 'Unknown',
            jobTitle: jobMap.get(i.job_id) || 'Unknown Job',
            status: i.status,
            date: i.created_at,
          }))
        );
      }

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
      case 'declined':
        return <XCircle className="h-3.5 w-3.5 text-red-400" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-amber-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'declined':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    }
  };

  const formatRelative = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-[#f59e0b]" />
          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-medium">
            {t('invitationStatus.title')}
          </p>
        </div>
        <span className="text-[10px] text-zinc-600">{t('invitationStatus.subtitle')}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
        </div>
      ) : counts.total === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <UserCheck className="h-8 w-8 text-zinc-700 mb-2" />
          <p className="text-xs text-zinc-500">{t('invitationStatus.noInvitations')}</p>
        </div>
      ) : (
        <>
          {/* Status Counters */}
          <div className="grid grid-cols-4 gap-2">
            <StatusCard
              label={t('invitationStatus.pending')}
              count={counts.pending}
              icon={<Clock className="h-3.5 w-3.5 text-amber-400" />}
              color="text-amber-400"
              bgColor="bg-amber-500/5 border-amber-500/20"
            />
            <StatusCard
              label={t('invitationStatus.accepted')}
              count={counts.accepted}
              icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
              color="text-emerald-400"
              bgColor="bg-emerald-500/5 border-emerald-500/20"
            />
            <StatusCard
              label={t('invitationStatus.declined')}
              count={counts.declined}
              icon={<XCircle className="h-3.5 w-3.5 text-red-400" />}
              color="text-red-400"
              bgColor="bg-red-500/5 border-red-500/20"
            />
            <StatusCard
              label={t('invitationStatus.total')}
              count={counts.total}
              icon={<Send className="h-3.5 w-3.5 text-blue-400" />}
              color="text-blue-400"
              bgColor="bg-blue-500/5 border-blue-500/20"
            />
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-800/50">
              {counts.accepted > 0 && (
                <div
                  className="bg-emerald-500 transition-all duration-500"
                  style={{ width: `${(counts.accepted / counts.total) * 100}%` }}
                />
              )}
              {counts.pending > 0 && (
                <div
                  className="bg-amber-500 transition-all duration-500"
                  style={{ width: `${(counts.pending / counts.total) * 100}%` }}
                />
              )}
              {counts.declined > 0 && (
                <div
                  className="bg-red-500 transition-all duration-500"
                  style={{ width: `${(counts.declined / counts.total) * 100}%` }}
                />
              )}
            </div>
            <div className="flex items-center gap-3 text-[9px] text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {t('invitationStatus.accepted')}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {t('invitationStatus.pending')}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {t('invitationStatus.declined')}
              </span>
            </div>
          </div>

          {/* Recent Activity */}
          {recent.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                {t('invitationStatus.recentActivity')}
              </p>
              <div className="divide-y divide-zinc-800/50">
                {recent.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0"
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 shrink-0">
                      {getStatusIcon(item.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-zinc-300 truncate">
                        <span className="font-medium">{item.candidateName}</span>{' '}
                        <span className="text-zinc-500">{t('invitationStatus.invitedTo')}</span>{' '}
                        <span className="text-zinc-300">{item.jobTitle}</span>
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm border text-[8px] font-semibold uppercase tracking-wider shrink-0 ${getStatusColor(item.status)}`}
                    >
                      {item.status}
                    </span>
                    <span className="text-[9px] text-zinc-600 shrink-0">
                      {formatRelative(item.date)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Status Card ─── */
function StatusCard({
  label,
  count,
  icon,
  color,
  bgColor,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}) {
  return (
    <div className={`border rounded-sm p-2.5 text-center ${bgColor}`}>
      <div className="flex items-center justify-center mb-1">{icon}</div>
      <p className={`text-lg font-bold ${color}`}>{count}</p>
      <p className="text-[8px] uppercase tracking-wider text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}