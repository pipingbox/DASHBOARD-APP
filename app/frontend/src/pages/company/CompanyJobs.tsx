import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAdminPreview } from '@/contexts/AdminPreviewContext';
import { toast } from 'sonner';
import {
  Briefcase,
  Plus,
  MapPin,
  Clock,
  Users,
  FileText,
  CheckCircle2,
  XCircle,
  Pencil,
  Upload,
  Archive,
  Share2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ShareLinksDialog } from '@/components/jobs/ShareLinksDialog';

interface Job {
  id: string;
  title: string;
  location: string;
  country: string | null;
  status: string;
  created_at: string;
  applications_count: number;
  company_name: string | null;
}

const isOpenStatus = (s: string) => s === 'open' || s === 'active' || !s;
const isClosedStatus = (s: string) => s === 'closed' || s === 'expired';

export default function CompanyJobs() {
  const { user } = useAuth();
  const { isRealAdmin, isPreviewMode } = useAdminPreview();
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'draft' | 'closed'>('all');
  const [actionJobId, setActionJobId] = useState<string | null>(null);
  const [shareJob, setShareJob] = useState<Job | null>(null);

  useEffect(() => {
    if (!user) return;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from(TABLES.jobs)
          .select('id, title, location, country, status, created_at, applications_count, company_name')
          .order('created_at', { ascending: false });

        // Admin in preview mode or real admin can see all jobs
        // Company users only see their own jobs
        if (!isRealAdmin) {
          query = query.eq('company_user_id', user.id);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          console.error('Jobs fetch error:', fetchError);
          setError(fetchError.message);
          setJobs([]);
        } else {
          setJobs((data || []) as Job[]);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load jobs');
      } finally {
        setLoading(false);
      }
    })();
  }, [user, isRealAdmin]);

  // Publish / close / reopen (PB-JOBS-PILOT-003 §13). Rides on the existing
  // jobs_*_own_or_primary_admin UPDATE policy — no permission change.
  // Historical applications are untouched: only the job status flips.
  const setStatus = async (job: Job, status: 'open' | 'closed') => {
    setActionJobId(job.id);
    const { error: updateError } = await supabase
      .from(TABLES.jobs)
      .update({ status })
      .eq('id', job.id);
    setActionJobId(null);
    if (updateError) {
      toast.error(t('companyJobs.actionFailed', { error: updateError.message }));
      return;
    }
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status } : j)));
    toast.success(status === 'open' ? t('companyJobs.publishSuccess') : t('companyJobs.closeSuccess'));
  };

  const filtered = jobs.filter((j) => {
    if (filter === 'all') return true;
    if (filter === 'open') return isOpenStatus(j.status);
    if (filter === 'draft') return j.status === 'draft';
    if (filter === 'closed') return isClosedStatus(j.status);
    return true;
  });

  const counts = {
    all: jobs.length,
    open: jobs.filter((j) => isOpenStatus(j.status)).length,
    draft: jobs.filter((j) => j.status === 'draft').length,
    closed: jobs.filter((j) => isClosedStatus(j.status)).length,
  };

  const list = (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('companyJobs.eyebrow')}
        title={t('companyJobs.title')}
        description={t('companyJobs.description')}
        actions={
          <Link
            to="/company/post-job"
            className="inline-flex items-center gap-2 rounded-sm bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-black hover:bg-[#d97706] transition"
          >
            <Plus className="h-4 w-4" />
            {t('companyJobs.postNewJob')}
          </Link>
        }
      />

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800/80 pb-0">
        {(['all', 'open', 'draft', 'closed'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2.5 text-xs font-medium uppercase tracking-wider border-b-2 transition ${
              filter === tab
                ? 'border-[#f59e0b] text-[#f59e0b]'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab} ({counts[tab]})
          </button>
        ))}
      </div>

      {/* Error State */}
      {error && (
        <div className="border border-red-500/30 bg-red-500/5 rounded-sm p-4 text-sm text-red-400">
          {t('companyJobs.failedToLoad', { error })}
        </div>
      )}

      {/* Jobs List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Briefcase className="h-10 w-10 text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-400">
            {filter === 'all'
              ? t('companyJobs.noJobsYet')
              : t('companyJobs.noFilteredJobs', { filter })}
          </p>
          <Link
            to="/company/post-job"
            className="mt-4 inline-flex items-center gap-2 text-sm text-[#f59e0b] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('companyJobs.createFirst')}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => (
            <div
              key={job.id}
              className="flex items-center gap-4 border border-zinc-800/80 bg-[#0d0d0d] p-4 rounded-sm hover:border-zinc-700 transition"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-zinc-900 border border-zinc-800 shrink-0">
                <Briefcase className="h-4 w-4 text-zinc-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">{job.title}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                    <MapPin className="h-3 w-3" />
                    {job.location || 'Remote'}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                    <Clock className="h-3 w-3" />
                    {new Date(job.created_at).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                    <Users className="h-3 w-3" />
                    {t('companyJobs.applicants', { count: job.applications_count ?? 0 })}
                  </span>
                </div>
              </div>
              <StatusBadge status={job.status} />
              {/* Manage actions (PB-JOBS-PILOT-003 §13) */}
              <div className="flex items-center gap-1 shrink-0">
                <Link
                  to={`/company/post-job?edit=${job.id}`}
                  title={t('companyJobs.edit')}
                  className="inline-flex items-center gap-1 rounded-sm border border-zinc-700 px-2.5 py-1.5 text-[10px] font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition"
                >
                  <Pencil className="h-3 w-3" />
                  {t('companyJobs.edit')}
                </Link>
                <button
                  onClick={() => setShareJob(job)}
                  title={t('shareLinks.title')}
                  className="inline-flex items-center gap-1 rounded-sm border border-zinc-700 px-2.5 py-1.5 text-[10px] font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition"
                >
                  <Share2 className="h-3 w-3" />
                  {t('shareLinks.title')}
                </button>
                {!isOpenStatus(job.status) && (
                  <button
                    onClick={() => void setStatus(job, 'open')}
                    disabled={actionJobId === job.id}
                    title={t('companyJobs.publish')}
                    className="inline-flex items-center gap-1 rounded-sm border border-emerald-500/40 px-2.5 py-1.5 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/10 transition disabled:opacity-50"
                  >
                    <Upload className="h-3 w-3" />
                    {t('companyJobs.publish')}
                  </button>
                )}
                {isOpenStatus(job.status) && (
                  <button
                    onClick={() => void setStatus(job, 'closed')}
                    disabled={actionJobId === job.id}
                    title={t('companyJobs.close')}
                    className="inline-flex items-center gap-1 rounded-sm border border-red-500/40 px-2.5 py-1.5 text-[10px] font-medium text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
                  >
                    <Archive className="h-3 w-3" />
                    {t('companyJobs.close')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Share links dialog is rendered outside the list markup.
  return (
    <>
      {list}
      <ShareLinksDialog
        job={shareJob ? { id: shareJob.id, title: shareJob.title, company: shareJob.company_name ?? '', location: shareJob.location ?? '' } : null}
        onClose={() => setShareJob(null)}
      />
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const isOpen = status === 'open' || status === 'active' || !status;
  const isDraft = status === 'draft';

  if (isOpen) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
        <CheckCircle2 className="h-3 w-3" />
        {t('companyJobs.active')}
      </span>
    );
  }
  if (isDraft) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider bg-zinc-500/10 text-zinc-400 border-zinc-500/30">
        <FileText className="h-3 w-3" />
        {t('companyJobs.draftStatus')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider bg-red-500/10 text-red-400 border-red-500/30">
      <XCircle className="h-3 w-3" />
      {t('companyJobs.closedStatus')}
    </span>
  );
}