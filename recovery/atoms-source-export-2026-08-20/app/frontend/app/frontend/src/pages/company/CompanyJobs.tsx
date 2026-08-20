import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAdminPreview } from '@/contexts/AdminPreviewContext';
import {
  Briefcase,
  Plus,
  MapPin,
  Clock,
  Users,
  FileText,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

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

export default function CompanyJobs() {
  const { user } = useAuth();
  const { isRealAdmin, isPreviewMode } = useAdminPreview();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'draft' | 'closed'>('all');

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

  const filtered = jobs.filter((j) => {
    if (filter === 'all') return true;
    if (filter === 'open') return j.status === 'open' || j.status === 'active' || !j.status;
    if (filter === 'draft') return j.status === 'draft';
    if (filter === 'closed') return j.status === 'closed' || j.status === 'expired';
    return true;
  });

  const counts = {
    all: jobs.length,
    open: jobs.filter((j) => j.status === 'open' || j.status === 'active' || !j.status).length,
    draft: jobs.filter((j) => j.status === 'draft').length,
    closed: jobs.filter((j) => j.status === 'closed' || j.status === 'expired').length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Jobs Management"
        description="Manage your company job listings — active, draft, and closed positions."
        actions={
          <Link
            to="/company/post-job"
            className="inline-flex items-center gap-2 rounded-sm bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-black hover:bg-[#d97706] transition"
          >
            <Plus className="h-4 w-4" />
            Post New Job
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
          Failed to load jobs: {error}
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
              ? "You haven't posted any jobs yet."
              : `No ${filter} jobs found.`}
          </p>
          <Link
            to="/company/post-job"
            className="mt-4 inline-flex items-center gap-2 text-sm text-[#f59e0b] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Create your first job listing
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
                    {job.applications_count ?? 0} applicants
                  </span>
                </div>
              </div>
              <StatusBadge status={job.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isOpen = status === 'open' || status === 'active' || !status;
  const isDraft = status === 'draft';

  if (isOpen) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
        <CheckCircle2 className="h-3 w-3" />
        Active
      </span>
    );
  }
  if (isDraft) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider bg-zinc-500/10 text-zinc-400 border-zinc-500/30">
        <FileText className="h-3 w-3" />
        Draft
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider bg-red-500/10 text-red-400 border-red-500/30">
      <XCircle className="h-3 w-3" />
      Closed
    </span>
  );
}