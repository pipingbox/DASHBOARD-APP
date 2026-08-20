import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  Briefcase,
  ClipboardList,
  HardHat,
  Users,
  Calendar,
  TrendingUp,
  Plus,
  Search,
  Eye,
  Building2,
  MapPin,
  Clock,
  FileText,
  ArrowRight,
  Globe,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { JobInvitationsStatusWidget } from '@/components/JobInvitationsStatusWidget';
import { ProNetworkWidget } from '@/components/profile/ProNetworkWidget';

/* ─── Types ─── */
interface CompanyMetrics {
  activeJobs: number;
  totalApplications: number;
  workforceRequests: number;
  savedCandidates: number;
  interviewsPending: number;
  hiresThisMonth: number;
}

interface ActivityItem {
  id: string;
  type: 'application' | 'workforce_update' | 'job_published' | 'candidate_saved' | 'candidate_withdrawn';
  title: string;
  subtitle: string;
  date: string;
}

interface JobItem {
  id: string;
  title: string;
  location: string;
  applications_count: number;
  status: string;
  created_at: string;
}

export default function CompanyDashboard() {
  const { profile } = useAuth();
  const [metrics, setMetrics] = useState<CompanyMetrics>({
    activeJobs: 0,
    totalApplications: 0,
    workforceRequests: 0,
    savedCandidates: 0,
    interviewsPending: 0,
    hiresThisMonth: 0,
  });
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);

      const userId = profile?.user_id;
      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Fetch company-specific data
      const [jobsRes, appsRes, leadsRes] = await Promise.all([
        supabase
          .from(TABLES.jobs)
          .select('id, title, location, status, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from(TABLES.jobApplications)
          .select('id, created_at, applicant_name, job_title, status')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from(TABLES.companyLeads)
          .select('id, created_at, company_name, workers_needed, status, country')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (!mounted) return;

      const allJobs = (jobsRes.data || []) as JobItem[];
      const allApps = (appsRes.data || []) as { id: string; created_at: string; applicant_name: string; job_title: string; status: string }[];
      const allLeads = (leadsRes.data || []) as { id: string; created_at: string; company_name: string; workers_needed: string; status: string; country: string }[];

      // Compute metrics
      const activeJobs = allJobs.filter((j) => j.status === 'open' || j.status === 'active' || !j.status).length;
      const hiresThisMonth = allApps.filter(
        (a) => a.status === 'hired' && new Date(a.created_at).toISOString() >= monthAgo
      ).length;

      setMetrics({
        activeJobs,
        totalApplications: allApps.length,
        workforceRequests: allLeads.length,
        savedCandidates: allApps.filter((a) => a.status === 'shortlisted' || a.status === 'saved').length,
        interviewsPending: allApps.filter((a) => a.status === 'interview').length,
        hiresThisMonth,
      });

      // Build activity feed
      const items: ActivityItem[] = [];

      allApps.slice(0, 8).forEach((a) => {
        items.push({
          id: `app-${a.id}`,
          type: a.status === 'withdrawn' ? 'candidate_withdrawn' : 'application',
          title: a.status === 'withdrawn'
            ? `${a.applicant_name || 'Candidate'} withdrew application`
            : `${a.applicant_name || 'New candidate'} applied to ${a.job_title || 'a position'}`,
          subtitle: `Status: ${a.status || 'pending'}`,
          date: a.created_at,
        });
      });

      allLeads.slice(0, 5).forEach((l) => {
        items.push({
          id: `lead-${l.id}`,
          type: 'workforce_update',
          title: `Workforce request: ${l.workers_needed || '?'} workers`,
          subtitle: `${l.country || 'Unknown'} · Status: ${l.status || 'new'}`,
          date: l.created_at,
        });
      });

      allJobs.slice(0, 5).forEach((j) => {
        items.push({
          id: `job-${j.id}`,
          type: 'job_published',
          title: `Job posted: ${j.title}`,
          subtitle: j.location || 'Remote',
          date: j.created_at,
        });
      });

      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setActivity(items.slice(0, 12));

      // Set jobs with application counts
      const jobsWithCounts = allJobs.slice(0, 5).map((j) => ({
        ...j,
        applications_count: allApps.filter((a) => a.job_title === j.title).length,
      }));
      setJobs(jobsWithCounts);

      setLoading(false);
    })();

    return () => { mounted = false; };
  }, [profile?.user_id]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Company Dashboard"
        title="Recruitment Operations"
        description="Manage your jobs, workforce requests, and monitor candidate activity."
        actions={
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
            <Building2 className="h-3.5 w-3.5" />
            Company Portal
          </span>
        }
      />

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction
          to="/company/post-job"
          icon={Plus}
          label="Post New Job"
          description="Create a new job listing"
        />
        <QuickAction
          to="/company/workforce-requests"
          icon={HardHat}
          label="Request Workforce"
          description="Submit workforce request"
        />
        <QuickAction
          to="/company/workers-search"
          icon={Search}
          label="Search Workers"
          description="Browse available talent"
        />
        <QuickAction
          to="/company/candidates"
          icon={Eye}
          label="View Candidates"
          description="Review applications"
        />
      </div>

      {/* Metrics Grid */}
      <MetricsGrid metrics={metrics} loading={loading} />

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Activity Feed - 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          <ActivityFeed activity={activity} loading={loading} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Company Profile Card */}
          <CompanyProfileCard profile={profile} />

          {/* Job Invitations Status */}
          <JobInvitationsStatusWidget />

          {/* Referral / Pro Network Widget (companies can also refer) */}
          <ProNetworkWidget />

          {/* Latest Jobs Widget */}
          <JobsWidget jobs={jobs} loading={loading} />
        </div>
      </div>
    </div>
  );
}

/* ─── Quick Action Button ─── */
function QuickAction({
  to,
  icon: Icon,
  label,
  description,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 border border-zinc-800/80 bg-[#0d0d0d] p-4 rounded-sm hover:border-[#f59e0b]/40 hover:bg-[#f59e0b]/5 transition"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/20 group-hover:bg-[#f59e0b]/20 transition">
        <Icon className="h-4.5 w-4.5 text-[#f59e0b]" />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-200 group-hover:text-[#f59e0b] transition">{label}</p>
        <p className="text-[10px] text-zinc-500">{description}</p>
      </div>
    </Link>
  );
}

/* ─── Metrics Grid ─── */
function MetricsGrid({ metrics, loading }: { metrics: CompanyMetrics; loading: boolean }) {
  const cards = [
    { label: 'Active Jobs', value: metrics.activeJobs, icon: Briefcase, color: 'text-emerald-400' },
    { label: 'Total Applications', value: metrics.totalApplications, icon: ClipboardList, color: 'text-blue-400' },
    { label: 'Workforce Requests', value: metrics.workforceRequests, icon: HardHat, color: 'text-orange-400' },
    { label: 'Saved Candidates', value: metrics.savedCandidates, icon: Users, color: 'text-purple-400' },
    { label: 'Interviews Pending', value: metrics.interviewsPending, icon: Calendar, color: 'text-cyan-400' },
    { label: 'Hires This Month', value: metrics.hiresThisMonth, icon: TrendingUp, color: 'text-[#f59e0b]' },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className="border border-zinc-800/80 bg-[#0d0d0d] p-4 rounded-sm hover:border-zinc-700 transition"
        >
          <div className="flex items-center justify-between">
            <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">{c.label}</p>
            <c.icon className="h-3.5 w-3.5 text-zinc-600" />
          </div>
          <p className={`mt-2 text-2xl font-bold ${c.color}`}>
            {loading ? '—' : c.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ─── Activity Feed ─── */
function ActivityFeed({ activity, loading }: { activity: ActivityItem[]; loading: boolean }) {
  const getIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'application': return <ClipboardList className="h-3.5 w-3.5 text-blue-400" />;
      case 'workforce_update': return <HardHat className="h-3.5 w-3.5 text-amber-400" />;
      case 'job_published': return <Briefcase className="h-3.5 w-3.5 text-emerald-400" />;
      case 'candidate_saved': return <Users className="h-3.5 w-3.5 text-purple-400" />;
      case 'candidate_withdrawn': return <FileText className="h-3.5 w-3.5 text-red-400" />;
    }
  };

  const getTypeColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'application': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'workforce_update': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'job_published': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'candidate_saved': return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'candidate_withdrawn': return 'bg-red-500/10 text-red-400 border-red-500/30';
    }
  };

  const getTypeLabel = (type: ActivityItem['type']) => {
    switch (type) {
      case 'application': return 'Application';
      case 'workforce_update': return 'Workforce';
      case 'job_published': return 'Job Posted';
      case 'candidate_saved': return 'Saved';
      case 'candidate_withdrawn': return 'Withdrawn';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">Recent Activity</h3>
        <span className="text-[10px] text-zinc-500">{activity.length} events</span>
      </div>
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm divide-y divide-zinc-800/50">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
          </div>
        ) : activity.length === 0 ? (
          <p className="text-sm text-zinc-500 py-12 text-center">No recent activity.</p>
        ) : (
          activity.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/50 transition group"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 shrink-0 group-hover:border-zinc-700 transition">
                {getIcon(item.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 truncate">{item.title}</p>
                <p className="text-[11px] text-zinc-500 truncate">{item.subtitle}</p>
              </div>
              <span
                className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider shrink-0 ${getTypeColor(item.type)}`}
              >
                {getTypeLabel(item.type)}
              </span>
              <span className="text-[10px] text-zinc-600 whitespace-nowrap shrink-0">
                {formatRelative(item.date)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Company Profile Card ─── */
function CompanyProfileCard({ profile }: { profile: { full_name?: string; username?: string; avatar_url?: string } | null }) {
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm space-y-4">
      <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-medium">Company Profile</p>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-zinc-800 border border-zinc-700">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="logo" className="h-full w-full object-cover rounded-sm" />
          ) : (
            <Building2 className="h-6 w-6 text-zinc-500" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100">{profile?.full_name || 'Company Name'}</p>
          <p className="text-[11px] text-zinc-500">@{profile?.username || 'company'}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Globe className="h-3.5 w-3.5 text-zinc-600" />
          <span>Industrial Services</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <MapPin className="h-3.5 w-3.5 text-zinc-600" />
          <span>International</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-emerald-400">Verified Company</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Layers className="h-3.5 w-3.5 text-zinc-600" />
          <span>Active Projects: —</span>
        </div>
      </div>

      <Link
        to="/profile"
        className="flex items-center justify-center gap-2 w-full py-2 text-xs font-medium text-[#f59e0b] border border-[#f59e0b]/20 bg-[#f59e0b]/5 rounded-sm hover:bg-[#f59e0b]/10 transition"
      >
        Edit Profile
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

/* ─── Jobs Widget ─── */
function JobsWidget({ jobs, loading }: { jobs: JobItem[]; loading: boolean }) {
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-medium">Latest Jobs</p>
        <Link to="/jobs" className="text-[10px] text-[#f59e0b] hover:underline">View All</Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
        </div>
      ) : jobs.length === 0 ? (
        <p className="text-xs text-zinc-500 py-4 text-center">No jobs posted yet.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="border border-zinc-800/60 bg-zinc-950/50 p-3 rounded-sm hover:border-zinc-700 transition"
            >
              <p className="text-sm font-medium text-zinc-200 truncate">{job.title}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <MapPin className="h-3 w-3" />
                  {job.location || 'Remote'}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <Users className="h-3 w-3" />
                  {job.applications_count} apps
                </span>
                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <Clock className="h-3 w-3" />
                  {formatRelative(job.created_at)}
                </span>
              </div>
              <div className="mt-2">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider ${
                    job.status === 'open' || job.status === 'active' || !job.status
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'
                  }`}
                >
                  {job.status || 'open'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ─── */
function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}