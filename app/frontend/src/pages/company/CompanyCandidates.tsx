import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import {
  Users,
  MapPin,
  Search,
  Star,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  UserCheck,
  XCircle,
  Briefcase,
  Calendar,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAdminPreview } from '@/contexts/AdminPreviewContext';
import { toast } from 'sonner';

/* ─── Types ─── */
interface Application {
  id: string;
  user_id: string;
  job_id: string | null;
  company_user_id: string | null;
  job_title: string;
  company_name: string;
  location: string | null;
  contract_type: string | null;
  status: string;
  created_at: string;
  // Joined from profiles
  worker_name?: string;
  worker_skills?: string[];
}

const STATUS_OPTIONS = [
  'applied',
  'reviewed',
  'interview',
  'shortlisted',
  'rejected',
  'hired',
] as const;

type ApplicationStatus = (typeof STATUS_OPTIONS)[number];

/* ─── Status Badge ─── */
function CandidateStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string; icon: React.ElementType }> = {
    applied: { label: 'Applied', classes: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30', icon: AlertCircle },
    reviewed: { label: 'Reviewed', classes: 'bg-blue-500/10 text-blue-400 border-blue-500/30', icon: Eye },
    interview: { label: 'Interview', classes: 'bg-purple-500/10 text-purple-400 border-purple-500/30', icon: Clock },
    shortlisted: { label: 'Shortlisted', classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30', icon: Star },
    rejected: { label: 'Rejected', classes: 'bg-red-500/10 text-red-400 border-red-500/30', icon: XCircle },
    hired: { label: 'Hired', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: CheckCircle2 },
  };
  const c = config[status] || config.applied;
  const Icon = c.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider ${c.classes}`}>
      <Icon className="h-2.5 w-2.5" />
      {c.label}
    </span>
  );
}

/* ─── Main Component ─── */
export default function CompanyCandidates() {
  const { user } = useAuth();
  const { isRealAdmin, isPreviewMode } = useAdminPreview();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) {
        console.log('[CompanyCandidates] No auth uid found');
        setLoading(false);
        return;
      }

      console.log('[CompanyCandidates] Current auth user id:', uid);
      console.log('[CompanyCandidates] isRealAdmin:', isRealAdmin, '| isPreviewMode:', isPreviewMode);

      let query = supabase
        .from(TABLES.jobApplications)
        .select('*')
        .order('created_at', { ascending: false });

      // Determine fetch strategy:
      // 1. Admin (not in preview) OR Admin in preview as company → see ALL applications
      // 2. Real company user → see only applications to their jobs
      let fetchFilter = 'all';

      if (isRealAdmin) {
        // Admin always sees all applications (whether in preview mode or not)
        // This allows admin to test the company view with real data
        fetchFilter = 'all (admin)';
      } else {
        // Real company user: fetch by company_user_id OR by jobs they posted
        // First try company_user_id match
        // Also fetch applications linked to jobs posted by this user
        const { data: companyJobs } = await supabase
          .from(TABLES.jobs)
          .select('id')
          .eq('company_user_id', uid);

        const jobIds = (companyJobs ?? []).map((j: { id: string }) => j.id);

        if (jobIds.length > 0) {
          // Fetch applications where company_user_id matches OR job_id is in company's jobs
          query = query.or(`company_user_id.eq.${uid},job_id.in.(${jobIds.join(',')})`);
          fetchFilter = `company_user_id=${uid} OR job_id in [${jobIds.join(',')}]`;
        } else {
          // Fallback: just filter by company_user_id
          query = query.eq('company_user_id', uid);
          fetchFilter = `company_user_id=${uid}`;
        }
      }

      console.log('[CompanyCandidates] Fetch filter used:', fetchFilter);

      const { data, error } = await query;

      if (error) {
        console.error('[CompanyCandidates] Fetch applications error:', error.message);
        toast.error('Failed to load candidates');
        setApplications([]);
        setLoading(false);
        return;
      }

      console.log('[CompanyCandidates] Number of applications returned:', data?.length ?? 0);

      // Fetch worker profiles for names and skills
      const apps = (data ?? []) as Application[];
      if (apps.length > 0) {
        const workerIds = [...new Set(apps.map((a) => a.user_id))];
        const { data: profiles } = await supabase
          .from(TABLES.profiles)
          .select('user_id, full_name, skills')
          .in('user_id', workerIds);

        const profileMap = new Map(
          (profiles ?? []).map((p: { user_id: string; full_name: string | null; skills: string[] | null }) => [
            p.user_id,
            { name: p.full_name, skills: p.skills },
          ])
        );

        apps.forEach((app) => {
          const profile = profileMap.get(app.user_id);
          if (profile) {
            app.worker_name = profile.name || undefined;
            app.worker_skills = profile.skills || undefined;
          }
        });
      }

      setApplications(apps);
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Failed to load candidates');
    } finally {
      setLoading(false);
    }
  }, [user, isRealAdmin, isPreviewMode]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const updateStatus = async (applicationId: string, newStatus: ApplicationStatus) => {
    setUpdatingId(applicationId);
    const { error } = await supabase
      .from(TABLES.jobApplications)
      .update({ status: newStatus })
      .eq('id', applicationId);

    if (error) {
      toast.error('Failed to update status', { description: error.message });
    } else {
      toast.success(`Status updated to "${newStatus}"`);
      setApplications((prev) =>
        prev.map((a) => (a.id === applicationId ? { ...a, status: newStatus } : a))
      );
    }
    setUpdatingId(null);
  };

  // Filter applications
  const filtered = applications.filter((app) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (app.worker_name ?? '').toLowerCase().includes(q) ||
      app.job_title.toLowerCase().includes(q) ||
      (app.location ?? '').toLowerCase().includes(q) ||
      (app.worker_skills ?? []).some((s) => s.toLowerCase().includes(q));

    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Candidates"
        description="Review workers who applied to your company's job listings."
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={fetchApplications}
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              <Users className="h-3.5 w-3.5" />
              {filtered.length} candidate{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        }
      />

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 flex-1 max-w-md">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidates by name, role, or skill..."
            className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {['all', ...STATUS_OPTIONS].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 text-[10px] uppercase tracking-wider rounded-sm border transition-colors ${
                statusFilter === s
                  ? 'border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b]'
                  : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          <span className="ml-2 text-sm text-zinc-500">Loading candidates...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 mb-4">
            <Users className="h-6 w-6 text-zinc-600" />
          </div>
          <h3 className="text-sm font-medium text-zinc-300 mb-1">No candidates found</h3>
          <p className="text-xs text-zinc-500 max-w-sm">
            {applications.length === 0
              ? 'No workers have applied to your jobs yet. Applications will appear here when workers apply.'
              : 'No candidates match your current filters. Try adjusting your search or status filter.'}
          </p>
        </div>
      )}

      {/* Candidates Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((app) => (
            <div
              key={app.id}
              className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm hover:border-zinc-700 transition space-y-3"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-sm font-bold text-zinc-300">
                    {(app.worker_name || 'W')
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      {app.worker_name || 'Worker'}
                    </p>
                    <p className="text-[11px] text-zinc-500 flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      {app.job_title}
                    </p>
                  </div>
                </div>
                <CandidateStatusBadge status={app.status} />
              </div>

              {/* Location */}
              {app.location && (
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <MapPin className="h-3 w-3 text-zinc-600" />
                  {app.location}
                </div>
              )}

              {/* Applied date */}
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Calendar className="h-3 w-3 text-zinc-600" />
                Applied {formatDate(app.created_at)}
              </div>

              {/* Skills */}
              {app.worker_skills && app.worker_skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {app.worker_skills.slice(0, 4).map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center px-2 py-0.5 rounded-sm border border-zinc-800 bg-zinc-900/50 text-[9px] font-medium uppercase tracking-wider text-zinc-400"
                    >
                      {skill}
                    </span>
                  ))}
                  {app.worker_skills.length > 4 && (
                    <span className="inline-flex items-center px-2 py-0.5 text-[9px] text-zinc-600">
                      +{app.worker_skills.length - 4} more
                    </span>
                  )}
                </div>
              )}

              {/* Contract type */}
              {app.contract_type && (
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">
                  {app.contract_type}
                </div>
              )}

              {/* Status Control */}
              <div className="pt-2 border-t border-zinc-800/60 space-y-2">
                <label className="text-[9px] uppercase tracking-wider text-zinc-600 font-medium">
                  Update Status
                </label>
                <select
                  value={app.status}
                  onChange={(e) => updateStatus(app.id, e.target.value as ApplicationStatus)}
                  disabled={updatingId === app.id}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-[#f59e0b]/50 transition-colors disabled:opacity-50"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => navigate(`/candidate/${app.user_id}`)}
                  className="flex-1 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[#f59e0b] border border-[#f59e0b]/20 bg-[#f59e0b]/5 rounded-sm hover:bg-[#f59e0b]/10 transition flex items-center justify-center gap-1"
                >
                  <UserCheck className="h-3 w-3" />
                  View Profile
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}