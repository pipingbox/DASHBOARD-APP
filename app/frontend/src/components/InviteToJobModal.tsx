import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Briefcase, Send, Loader2, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { createNotification } from '@/lib/notifications';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Job {
  id: string;
  title: string;
  location: string | null;
  status: string;
}

interface InviteToJobModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateUserId: string;
  candidateName: string;
}

export function InviteToJobModal({
  open,
  onOpenChange,
  candidateUserId,
  candidateName,
}: InviteToJobModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const loadCompanyJobs = useCallback(async () => {
    if (!user) return;
    setJobsLoading(true);
    try {
      const { data } = await supabase
        .from(TABLES.jobs)
        .select('id, title, location, status')
        .eq('posted_by', user.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      const jobsList = (data as Job[]) ?? [];
      setJobs(jobsList);
      // Auto-select if only one job exists
      if (jobsList.length === 1) {
        setSelectedJobId(jobsList[0].id);
      }
    } finally {
      setJobsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open) {
      loadCompanyJobs();
      setSelectedJobId(null);
      setMessage('');
    }
  }, [open, loadCompanyJobs]);

  const handleSend = async () => {
    if (!user || !selectedJobId || !candidateUserId) return;

    // Get the authenticated session user id directly from Supabase auth
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      toast.error(t('inviteToJob.error'));
      return;
    }

    const payload = {
      company_user_id: authUser.id,
      candidate_user_id: candidateUserId,
      job_id: selectedJobId,
      message: message.trim() || null,
      status: 'pending',
    };

    console.log('AUTH USER', authUser.id);
    console.log('PAYLOAD', payload);

    setSending(true);
    try {
      const { error } = await supabase
        .from(TABLES.jobInvitations)
        .insert(payload)
        .select();

      if (error) {
        console.log('ERROR', error);
        toast.error(t('inviteToJob.error'));
        return;
      }

      // Create notification for the candidate (non-blocking)
      const selectedJob = jobs.find((j) => j.id === selectedJobId);
      try {
        // Fetch current user's profile name for actor_name
        const { data: profileData } = await supabase
          .from(TABLES.profiles)
          .select('full_name, username')
          .eq('user_id', authUser.id)
          .single();

        const actorName = profileData?.full_name || profileData?.username || 'Company';

        await createNotification({
          recipientId: candidateUserId,
          actorId: authUser.id,
          type: 'job_invitation',
          postTitle: selectedJob?.title || 'Job',
          actorName,
        });
      } catch (notifErr) {
        console.error('Failed to create notification for job invitation:', notifErr);
        // Do not fail the invitation if notification insert fails
      }

      toast.success(t('inviteToJob.success'));
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  const canSend = !!selectedJobId && !!candidateUserId && !!user?.id;
  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d0d0d] border-zinc-800 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <Briefcase className="h-5 w-5 text-[#f59e0b]" />
            {t('inviteToJob.title')}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {t('inviteToJob.description', { name: candidateName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Job Selection */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-500">
              {t('inviteToJob.selectJob')}
            </Label>

            {jobsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="border border-dashed border-zinc-800 p-6 text-center">
                <Briefcase className="mx-auto mb-2 h-6 w-6 text-zinc-600" />
                <p className="text-sm text-zinc-500">{t('inviteToJob.noJobs')}</p>
              </div>
            ) : (
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {jobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setSelectedJobId(job.id)}
                    className={`w-full text-left p-3 border transition ${
                      selectedJobId === job.id
                        ? 'border-[#f59e0b] bg-[#f59e0b]/5'
                        : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-medium truncate ${
                            selectedJobId === job.id
                              ? 'text-[#f59e0b]'
                              : 'text-zinc-200'
                          }`}
                        >
                          {job.title}
                        </p>
                        {job.location && (
                          <p className="mt-0.5 text-xs text-zinc-500 truncate">
                            {job.location}
                          </p>
                        )}
                      </div>
                      {selectedJobId === job.id && (
                        <Check className="h-4 w-4 text-[#f59e0b] flex-shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Optional Message */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-500">
              {t('inviteToJob.messageLabel')}
            </Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('inviteToJob.messagePlaceholder')}
              className="min-h-[80px] resize-none border-zinc-800 bg-zinc-900/50 text-zinc-200 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:ring-[#f59e0b]/20"
              maxLength={500}
            />
            <p className="text-[10px] text-zinc-600 text-right">
              {message.length}/500
            </p>
          </div>

          {/* Selected job summary */}
          {selectedJob && (
            <div className="border border-zinc-800/60 bg-zinc-900/20 p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                {t('inviteToJob.invitingSummary')}
              </p>
              <p className="text-sm text-zinc-200">
                <span className="text-[#f59e0b] font-medium">{candidateName}</span>
                {' → '}
                <span className="font-medium">{selectedJob.title}</span>
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="!bg-transparent border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSend}
            disabled={!canSend || sending || jobs.length === 0}
            className="bg-[#f59e0b] text-black font-medium hover:bg-[#d97706] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('inviteToJob.sending')}
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                {t('inviteToJob.sendInvite')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}