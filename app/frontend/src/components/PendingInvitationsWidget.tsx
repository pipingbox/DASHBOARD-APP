import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Briefcase, Check, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface JobInvitation {
  id: string;
  job_id: string;
  company_user_id: string;
  message: string | null;
  status: string;
  created_at: string;
  job_title?: string;
  job_location?: string | null;
  company_name?: string;
}

export function PendingInvitationsWidget() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<JobInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch pending invitations for this worker
      const { data, error } = await supabase
        .from(TABLES.jobInvitations)
        .select('*')
        .eq('candidate_user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('[PendingInvitations] Fetch error:', error.message);
        setInvitations([]);
        return;
      }

      const rawInvitations = (data ?? []) as JobInvitation[];

      // Enrich with job titles and company names
      const enriched = await Promise.all(
        rawInvitations.map(async (inv) => {
          // Get job info
          const { data: jobData } = await supabase
            .from(TABLES.jobs)
            .select('title, location')
            .eq('id', inv.job_id)
            .single();

          // Get company user profile name
          const { data: profileData } = await supabase
            .from(TABLES.profiles)
            .select('full_name, company_name')
            .eq('user_id', inv.company_user_id)
            .single();

          return {
            ...inv,
            job_title: jobData?.title ?? t('pendingInvitations.unknownJob'),
            job_location: jobData?.location ?? null,
            company_name:
              (profileData as { full_name?: string; company_name?: string })?.company_name ||
              (profileData as { full_name?: string; company_name?: string })?.full_name ||
              t('pendingInvitations.unknownCompany'),
          };
        }),
      );

      setInvitations(enriched);
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const handleAction = async (invitationId: string, action: 'accepted' | 'declined') => {
    setActionLoading(invitationId);
    try {
      const { error } = await supabase
        .from(TABLES.jobInvitations)
        .update({ status: action })
        .eq('id', invitationId);

      if (error) {
        console.error('[PendingInvitations] Update error:', error.message);
        toast.error(t('pendingInvitations.actionError'));
        return;
      }

      toast.success(
        action === 'accepted'
          ? t('pendingInvitations.accepted')
          : t('pendingInvitations.declined'),
      );
      // Remove from local list
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
    } finally {
      setActionLoading(null);
    }
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

  // Don't render if no invitations and not loading
  if (!loading && invitations.length === 0) return null;

  return (
    <div className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="h-4 w-4 text-[#f59e0b]" />
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('pendingInvitations.eyebrow')}
        </p>
        {invitations.length > 0 && (
          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f59e0b] px-1.5 text-[10px] font-bold text-black">
            {invitations.length}
          </span>
        )}
      </div>
      <h3 className="text-lg font-semibold text-zinc-100 mb-3">
        {t('pendingInvitations.title')}
      </h3>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : (
        <div className="space-y-3">
          {invitations.map((inv) => (
            <div
              key={inv.id}
              className="border border-zinc-800 bg-[#0d0d0d] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-[#f59e0b] flex-shrink-0" />
                    <p className="text-sm font-medium text-zinc-100 truncate">
                      {inv.job_title}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {t('pendingInvitations.from')} <span className="text-zinc-300">{inv.company_name}</span>
                  </p>
                  {inv.job_location && (
                    <p className="mt-0.5 text-xs text-zinc-600">{inv.job_location}</p>
                  )}
                  {inv.message && (
                    <p className="mt-2 text-xs text-zinc-400 italic border-l-2 border-zinc-700 pl-2">
                      &ldquo;{inv.message}&rdquo;
                    </p>
                  )}
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-zinc-600">
                    {formatRelative(inv.created_at)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800/60">
                <Button
                  size="sm"
                  onClick={() => handleAction(inv.id, 'accepted')}
                  disabled={actionLoading === inv.id}
                  className="bg-[#f59e0b] text-black font-medium hover:bg-[#d97706] h-8 text-xs"
                >
                  {actionLoading === inv.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Check className="mr-1 h-3 w-3" />
                      {t('pendingInvitations.accept')}
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction(inv.id, 'declined')}
                  disabled={actionLoading === inv.id}
                  className="!bg-transparent border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 h-8 text-xs"
                >
                  <X className="mr-1 h-3 w-3" />
                  {t('pendingInvitations.decline')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}