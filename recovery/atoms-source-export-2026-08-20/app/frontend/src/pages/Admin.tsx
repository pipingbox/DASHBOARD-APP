import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { supabase, TABLES } from '@/lib/supabase';
import {
  ShieldCheck,
  Users2,
  Briefcase,
  ClipboardList,
  Building2,
  HardHat,
  FileText,
  Save,
  Search,
  Activity,
  UserPlus,
  Calendar,
  BarChart3,
  Shield,
  RefreshCw,
  Bell,
  Link2,
  MessageSquareWarning,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminLeads } from '@/components/admin/AdminLeads';
import { AdminAnalytics } from '@/components/admin/AdminAnalytics';
import { AdminAuditLog, logAuditEvent } from '@/components/admin/AdminAuditLog';
import { AdminRegistros } from '@/components/admin/AdminRegistros';
import { AdminNotifications } from '@/components/admin/AdminNotifications';
import { AdminReferralDiagnostics } from '@/components/admin/AdminReferralDiagnostics';
import { AdminBetaFeedback } from '@/components/admin/AdminBetaFeedback';
import { AdminWorkforceRequests } from '@/components/admin/AdminWorkforceRequests';
import { AdminCompanyVerification } from '@/components/admin/AdminCompanyVerification';
import { ALL_ROLES, getRoleLabel } from '@/lib/roles';
import { toast } from 'sonner';

/* ─── Types ─── */
interface OverviewCounts {
  totalUsers: number;
  workers: number;
  companies: number;
  communityModerators: number;
  jobsModerators: number;
  totalApplications: number;
  totalWorkforceRequests: number;
  totalContentDrafts: number;
}

interface UserRow {
  id: string;
  user_id: string;
  full_name: string | null;
  username: string | null;
  email?: string | null;
  role: string;
  created_at?: string;
  avatar_url?: string | null;
  last_sign_in_at?: string | null;
  // Visibility fields
  marketplace_ready?: boolean | null;
  profile_visibility?: string | null;
  cv_visible?: boolean | null;
  profile_completion?: number | null;
  title?: string | null;
  cv_file_url?: string | null;
  cv_url?: string | null;
  onboarding_status?: string | null;
  location?: string | null;
  years_experience?: number | null;
}

type VisibilityStatus = 'visible' | 'hidden' | 'incomplete';

function getVisibilityStatus(user: UserRow): { status: VisibilityStatus; missingFields: string[] } {
  const missingFields: string[] = [];
  const completion = user.profile_completion ?? 0;
  const hasName = !!user.full_name && user.full_name.trim().length > 0;
  const hasTitle = !!user.title && user.title.trim().length > 0;
  const hasCV = !!(user.cv_file_url || user.cv_url);
  const hasLocation = !!user.location && user.location.trim().length > 0;

  // Check incomplete conditions
  if (completion < 60 || !hasName || !hasTitle || !hasCV) {
    if (!hasCV) missingFields.push('CV');
    if (!hasTitle) missingFields.push('oficio');
    if (!hasLocation) missingFields.push('ubicación');
    if (!hasName) missingFields.push('nombre');
    if (completion < 60) missingFields.push(`perfil ${completion}% (mín. 60%)`);
    return { status: 'incomplete', missingFields };
  }

  // Check hidden conditions
  if (user.profile_visibility === 'private' || user.marketplace_ready === false) {
    return { status: 'hidden', missingFields: [] };
  }

  // Visible
  if (user.marketplace_ready === true && user.profile_visibility !== 'private' && hasName) {
    return { status: 'visible', missingFields: [] };
  }

  // Default to hidden if not explicitly visible
  return { status: 'hidden', missingFields: [] };
}

interface ActivityItem {
  id: string;
  type: 'application' | 'workforce_request' | 'content_draft' | 'new_user';
  title: string;
  subtitle: string;
  date: string;
}

/* ─── Role badge colors ─── */
function getRoleBadgeColor(role: string): string {
  const colors: Record<string, string> = {
    admin: 'bg-red-500/10 text-red-400 border-red-500/30',
    community_moderator: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    jobs_moderator: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    worker: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    company: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    user: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  };
  return colors[role] ?? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
}

function getActivityIcon(type: ActivityItem['type']) {
  switch (type) {
    case 'application':
      return <ClipboardList className="h-3.5 w-3.5 text-blue-400" />;
    case 'workforce_request':
      return <HardHat className="h-3.5 w-3.5 text-amber-400" />;
    case 'content_draft':
      return <FileText className="h-3.5 w-3.5 text-purple-400" />;
    case 'new_user':
      return <UserPlus className="h-3.5 w-3.5 text-emerald-400" />;
  }
}

/* ─── Tabs ─── */
type AdminTab = 'overview' | 'users' | 'registros' | 'activity' | 'leads' | 'analytics' | 'audit' | 'notifications' | 'referrals' | 'feedback' | 'workforce' | 'companies';

export default function Admin() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [counts, setCounts] = useState<OverviewCounts>({
    totalUsers: 0,
    workers: 0,
    companies: 0,
    communityModerators: 0,
    jobsModerators: 0,
    totalApplications: 0,
    totalWorkforceRequests: 0,
    totalContentDrafts: 0,
  });
  const [countsLoading, setCountsLoading] = useState(true);

  // Users
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDemotion, setConfirmDemotion] = useState<UserRow | null>(null);

  // Activity
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  /* ─── Fetch overview counts ─── */
  const refreshCounts = useCallback(async () => {
    setCountsLoading(true);
    const [profilesRes, appsRes, leadsRes, draftsRes] = await Promise.all([
      supabase.from(TABLES.profiles).select('role'),
      supabase.from(TABLES.jobApplications).select('*', { count: 'exact', head: true }),
      supabase.from(TABLES.companyLeads).select('*', { count: 'exact', head: true }),
      supabase.from(TABLES.aiContentDrafts).select('*', { count: 'exact', head: true }),
    ]);

    const profiles = (profilesRes.data || []) as { role: string }[];
    const normalizeRole = (r: string) => (r === 'user' ? 'worker' : r);

    setCounts({
      totalUsers: profiles.length,
      workers: profiles.filter((p) => normalizeRole(p.role) === 'worker').length,
      companies: profiles.filter((p) => normalizeRole(p.role) === 'company').length,
      communityModerators: profiles.filter((p) => normalizeRole(p.role) === 'community_moderator').length,
      jobsModerators: profiles.filter((p) => normalizeRole(p.role) === 'jobs_moderator').length,
      totalApplications: appsRes.count ?? 0,
      totalWorkforceRequests: leadsRes.count ?? 0,
      totalContentDrafts: draftsRes.count ?? 0,
    });
    setCountsLoading(false);
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  /* ─── Fetch users (merged: edge function auth.users + profiles) ─── */
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      // Try edge function first to get ALL auth users merged with profiles
      const res = await fetch(
        'https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/backfill-profiles?mode=list-all',
        { method: 'GET', headers: { 'Content-Type': 'application/json' } },
      );
      if (res.ok) {
        const data = await res.json();
        const authUsers = data.auth_users || [];
        const merged: UserRow[] = authUsers.map((au: Record<string, unknown>) => ({
          id: (au.profile as Record<string, unknown>)?.id || au.auth_id,
          user_id: au.auth_id as string,
          full_name: (au.profile as Record<string, unknown>)?.full_name || au.full_name || null,
          username: au.email ? (au.email as string).split('@')[0] : null,
          email: au.email || null,
          role: (au.profile as Record<string, unknown>)?.role || 'orphan',
          created_at: au.created_at as string || null,
          avatar_url: (au.profile as Record<string, unknown>)?.avatar_url || null,
          last_sign_in_at: au.last_sign_in_at as string || null,
          // Visibility fields
          marketplace_ready: (au.profile as Record<string, unknown>)?.marketplace_ready as boolean | null ?? null,
          profile_visibility: (au.profile as Record<string, unknown>)?.profile_visibility as string | null ?? null,
          cv_visible: (au.profile as Record<string, unknown>)?.cv_visible as boolean | null ?? null,
          profile_completion: (au.profile as Record<string, unknown>)?.profile_completion as number | null ?? null,
          title: (au.profile as Record<string, unknown>)?.title as string | null ?? null,
          cv_file_url: (au.profile as Record<string, unknown>)?.cv_file_url as string | null ?? null,
          cv_url: (au.profile as Record<string, unknown>)?.cv_url as string | null ?? null,
          onboarding_status: (au.profile as Record<string, unknown>)?.onboarding_status as string | null ?? null,
          location: (au.profile as Record<string, unknown>)?.location as string | null ?? null,
          years_experience: (au.profile as Record<string, unknown>)?.years_experience as number | null ?? null,
        }));
        // Sort by created_at descending
        merged.sort((a, b) => {
          if (!a.created_at) return 1;
          if (!b.created_at) return -1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        setUsers(merged);
        setUsersLoading(false);
        return;
      }
    } catch (err) {
      console.warn('[Admin] Edge function unavailable, falling back to profiles:', err);
    }

    // Fallback: profiles table only
    const { data, error } = await supabase
      .from(TABLES.profiles)
      .select('id, user_id, full_name, username, role, created_at, avatar_url, marketplace_ready, profile_visibility, cv_visible, profile_completion, title, cv_file_url, cv_url, onboarding_status, location, years_experience')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error('[Admin] Failed to fetch users:', error);
    }
    setUsers((data as UserRow[]) ?? []);
    setUsersLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  /* ─── Fetch activity ─── */
  useEffect(() => {
    let mounted = true;
    (async () => {
      setActivityLoading(true);
      const [appsRes, leadsRes, draftsRes, usersRes] = await Promise.all([
        supabase
          .from(TABLES.jobApplications)
          .select('id, created_at, applicant_name, job_title, company_name')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from(TABLES.companyLeads)
          .select('id, created_at, company_name, workers_needed, country')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from(TABLES.aiContentDrafts)
          .select('id, created_at, title, status, suggested_channel')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from(TABLES.profiles)
          .select('id, created_at, full_name, username, role')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      if (!mounted) return;

      const items: ActivityItem[] = [];

      (appsRes.data || []).forEach((a: Record<string, string>) => {
        items.push({
          id: `app-${a.id}`,
          type: 'application',
          title: JSON.stringify({ key: 'appliedTo', name: a.applicant_name || '', job: a.job_title || '' }),
          subtitle: a.company_name
            ? JSON.stringify({ key: 'companyPrefix', name: a.company_name })
            : JSON.stringify({ key: 'applicationSubmitted' }),
          date: a.created_at,
        });
      });

      (leadsRes.data || []).forEach((l: Record<string, string>) => {
        items.push({
          id: `lead-${l.id}`,
          type: 'workforce_request',
          title: JSON.stringify({ key: 'requestedWorkforce', name: l.company_name || '' }),
          subtitle: JSON.stringify({ key: 'workersNeeded', country: l.country || '', count: l.workers_needed || '?' }),
          date: l.created_at,
        });
      });

      (draftsRes.data || []).forEach((d: Record<string, string>) => {
        items.push({
          id: `draft-${d.id}`,
          type: 'content_draft',
          title: JSON.stringify({ key: 'draftCreated', title: d.title || '' }),
          subtitle: JSON.stringify({ key: 'channelStatus', channel: d.suggested_channel || '', status: d.status || 'draft' }),
          date: d.created_at,
        });
      });

      (usersRes.data || []).forEach((u: Record<string, string>) => {
        const roleLabel = u.role ? getRoleLabel(u.role === 'user' ? 'worker' : u.role) : 'Worker';
        items.push({
          id: `user-${u.id}`,
          type: 'new_user',
          title: JSON.stringify({ key: 'newUserRegistered', name: u.full_name || u.username || '' }),
          subtitle: JSON.stringify({ key: 'roleLabel', role: roleLabel }),
          date: u.created_at,
        });
      });

      // Sort by date descending
      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setActivity(items.slice(0, 30));
      setActivityLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  /* ─── Role change handlers ─── */
  const handleRoleChange = (userId: string, newRole: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u)),
    );
  };

  const handleSaveRole = async (user: UserRow) => {
    // Self-demotion protection: if admin is changing their own role away from admin
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id;

    if (currentUserId === user.user_id && user.role !== 'admin') {
      setConfirmDemotion(user);
      return;
    }

    await executeSaveRole(user);
  };

  const executeSaveRole = async (user: UserRow) => {
    setSavingId(user.user_id);
    const { error } = await supabase
      .from(TABLES.profiles)
      .update({ role: user.role })
      .eq('user_id', user.user_id);
    setSavingId(null);
    if (error) {
      console.error('[Admin] Role update failed:', error);
      toast.error(t('admin.users.roleUpdateFailed') + ': ' + error.message);
    } else {
      toast.success(
        t('admin.users.roleUpdated', { role: getRoleLabel(user.role), name: user.full_name || user.username || 'user' }),
      );
      // Log audit event
      logAuditEvent({
        actionType: 'role_change',
        targetType: 'user',
        targetId: user.user_id,
        details: `Changed role to ${getRoleLabel(user.role)} for ${user.full_name || user.username || 'unknown'}`,
      });
      // Refresh users list
      fetchUsers();
    }
    setConfirmDemotion(null);
  };

  /* ─── Filtered users ─── */
  const filteredUsers = users.filter((u) => {
    const isOrphan = u.role === 'orphan';
    const normalizedRole = isOrphan ? 'orphan' : (u.role === 'user' ? 'worker' : u.role);
    // Role filter
    if (roleFilter !== 'all' && normalizedRole !== roleFilter) return false;
    // Text search
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      normalizedRole.toLowerCase().includes(q)
    );
  });

  /* ─── Tab buttons ─── */
  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: t('admin.tabs.overview'), icon: <Activity className="h-3.5 w-3.5" /> },
    { id: 'registros', label: t('admin.tabs.registros'), icon: <UserPlus className="h-3.5 w-3.5" /> },
    { id: 'analytics', label: t('admin.tabs.analytics'), icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { id: 'users', label: t('admin.tabs.users'), icon: <Users2 className="h-3.5 w-3.5" /> },
    { id: 'activity', label: t('admin.tabs.activity'), icon: <Calendar className="h-3.5 w-3.5" /> },
    { id: 'leads', label: t('admin.tabs.leadPipeline'), icon: <Building2 className="h-3.5 w-3.5" /> },
    { id: 'audit', label: t('admin.tabs.auditLog'), icon: <Shield className="h-3.5 w-3.5" /> },
    { id: 'notifications', label: t('admin.tabs.notifications'), icon: <Bell className="h-3.5 w-3.5" /> },
    { id: 'referrals', label: t('admin.tabs.referrals', 'Referrals'), icon: <Link2 className="h-3.5 w-3.5" /> },
    { id: 'feedback', label: t('admin.tabs.feedback', 'Feedback Beta'), icon: <MessageSquareWarning className="h-3.5 w-3.5" /> },
    { id: 'workforce', label: t('admin.tabs.workforce', 'Workforce Pipeline'), icon: <HardHat className="h-3.5 w-3.5" /> },
    { id: 'companies', label: t('admin.tabs.companies', 'Companies'), icon: <Building2 className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('admin.eyebrow')}
        title={t('admin.title')}
        description={t('admin.description')}
        actions={
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t('admin.adminAccess')}
          </span>
        }
      />

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-zinc-800/80 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition border-b-2 whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-[#f59e0b] text-[#f59e0b]'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab counts={counts} loading={countsLoading} onRefresh={refreshCounts} />
      )}
      {activeTab === 'users' && (
        <>
          <UsersTab
            users={filteredUsers}
            loading={usersLoading}
            search={userSearch}
            onSearchChange={setUserSearch}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            onRoleChange={handleRoleChange}
            onSaveRole={handleSaveRole}
            savingId={savingId}
          />
          {/* Self-demotion confirmation dialog */}
          {confirmDemotion && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-sm border border-zinc-800 bg-[#0d0d0d] p-6 space-y-4">
                <h3 className="text-lg font-bold text-zinc-100">⚠️ {t('admin.users.removeAdminTitle')}</h3>
                <p className="text-sm text-zinc-400">
                  {t('admin.users.removeAdminDesc', { role: getRoleLabel(confirmDemotion.role) })}
                </p>
                <p className="text-xs text-red-400">
                  {t('admin.users.removeAdminWarning')}
                </p>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      // Revert the role change in UI
                      setUsers((prev) =>
                        prev.map((u) =>
                          u.user_id === confirmDemotion.user_id ? { ...u, role: 'admin' } : u,
                        ),
                      );
                      setConfirmDemotion(null);
                    }}
                    className="px-4 py-2 text-xs font-medium text-zinc-400 border border-zinc-700 rounded-sm hover:bg-zinc-900 transition"
                  >
                    {t('admin.users.cancel')}
                  </button>
                  <button
                    onClick={() => executeSaveRole(confirmDemotion)}
                    className="px-4 py-2 text-xs font-bold text-black bg-red-500 rounded-sm hover:bg-red-600 transition"
                  >
                    {t('admin.users.confirmRemoveAdmin')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {activeTab === 'registros' && <AdminRegistros />}
      {activeTab === 'activity' && (
        <ActivityTab activity={activity} loading={activityLoading} />
      )}
      {activeTab === 'leads' && <AdminLeads />}
      {activeTab === 'analytics' && <AdminAnalytics />}
      {activeTab === 'audit' && <AdminAuditLog />}
      {activeTab === 'notifications' && <AdminNotifications />}
      {activeTab === 'referrals' && <AdminReferralDiagnostics />}
      {activeTab === 'feedback' && <AdminBetaFeedback />}
      {activeTab === 'workforce' && <AdminWorkforceRequests />}
      {activeTab === 'companies' && <AdminCompanyVerification />}
    </div>
  );
}

/* ─── Overview Tab ─── */
function OverviewTab({ counts, loading, onRefresh }: { counts: OverviewCounts; loading: boolean; onRefresh?: () => void }) {
  const { t } = useTranslation();
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{
    message: string;
    created: number;
    total_auth_users?: number;
    total_profiles_after?: number;
    created_profiles?: { user_id: string; full_name: string }[];
    error_details?: string;
    missing_users?: { id: string; email: string; full_name: string }[];
  } | null>(null);

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch(
        'https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/backfill-profiles',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const data = await res.json();
      if (res.ok) {
        setBackfillResult({
          message: data.message,
          created: data.created ?? 0,
          total_auth_users: data.total_auth_users,
          total_profiles_after: data.total_profiles_after,
          created_profiles: data.created_profiles,
        });
        // Refresh admin counters after backfill
        if (onRefresh) onRefresh();
      } else {
        setBackfillResult({
          message: `Error: ${data.error || 'Unknown'}`,
          created: 0,
          error_details: data.details,
          missing_users: data.missing_users,
        });
      }
    } catch (err) {
      setBackfillResult({ message: `${t('admin.overview.networkError')}: ${String(err)}`, created: 0 });
    } finally {
      setBackfilling(false);
    }
  };

  const tiles = [
    { label: t('admin.overview.totalUsers'), value: counts.totalUsers, icon: Users2, color: 'text-zinc-100' },
    { label: t('admin.overview.workers'), value: counts.workers, icon: HardHat, color: 'text-emerald-400' },
    { label: t('admin.overview.companies'), value: counts.companies, icon: Building2, color: 'text-amber-400' },
    { label: t('admin.overview.communityMods'), value: counts.communityModerators, icon: Users2, color: 'text-purple-400' },
    { label: t('admin.overview.jobsMods'), value: counts.jobsModerators, icon: Briefcase, color: 'text-blue-400' },
    { label: t('admin.overview.applications'), value: counts.totalApplications, icon: ClipboardList, color: 'text-cyan-400' },
    { label: t('admin.overview.workforceRequests'), value: counts.totalWorkforceRequests, icon: HardHat, color: 'text-orange-400' },
    { label: t('admin.overview.contentDrafts'), value: counts.totalContentDrafts, icon: FileText, color: 'text-pink-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                {tile.label}
              </p>
              <tile.icon className="h-4 w-4 text-zinc-600" />
            </div>
            <p className={`mt-3 text-3xl font-bold ${tile.color}`}>
              {loading ? '—' : tile.value}
            </p>
          </div>
        ))}
      </div>

      {/* Backfill Missing Profiles */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] p-6 rounded-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">{t('admin.overview.databaseRepair')}</p>
            <p className="text-sm text-zinc-400">
              {t('admin.overview.databaseRepairDesc')}
            </p>
          </div>
          <Button
            onClick={handleBackfill}
            disabled={backfilling}
            variant="outline"
            size="sm"
            className="border-[#f59e0b]/50 text-[#f59e0b] hover:bg-[#f59e0b]/10 shrink-0"
          >
            {backfilling ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                {t('admin.overview.running')}
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 mr-1.5" />
                {t('admin.overview.backfillProfiles')}
              </>
            )}
          </Button>
        </div>
        {backfillResult && (
          <div className={`mt-3 p-4 rounded-sm text-sm ${backfillResult.created > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : backfillResult.error_details ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-zinc-800/50 text-zinc-300 border border-zinc-700'}`}>
            <p className="font-medium">{backfillResult.message}</p>
            {backfillResult.total_auth_users !== undefined && (
              <p className="text-xs mt-1 text-zinc-400">
                {t('admin.overview.authUsersScanned')}: {backfillResult.total_auth_users} · {t('admin.overview.profilesAfter')}: {backfillResult.total_profiles_after ?? '—'}
              </p>
            )}
            {backfillResult.created > 0 && (
              <div className="mt-2">
                <p className="text-xs text-emerald-300/70 mb-1.5">
                  ✓ {t('admin.overview.newProfilesCreated', { count: backfillResult.created })}
                </p>
                {backfillResult.created_profiles && backfillResult.created_profiles.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-500/60 font-medium">{t('admin.overview.createdProfiles')}</p>
                    {backfillResult.created_profiles.map((p) => (
                      <div key={p.user_id} className="flex items-center gap-2 text-xs text-emerald-300/80 bg-emerald-500/5 px-2 py-1 rounded">
                        <span className="font-mono text-[10px] text-emerald-500/50">{p.user_id.slice(0, 8)}…</span>
                        <span className="font-medium">{p.full_name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {backfillResult.error_details && (
              <p className="text-xs mt-1.5 text-red-300/70">{t('admin.overview.details')}: {backfillResult.error_details}</p>
            )}
            {backfillResult.missing_users && backfillResult.missing_users.length > 0 && (
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                <p className="text-[10px] uppercase tracking-[0.2em] text-red-500/60 font-medium">{t('admin.overview.usersNeedProfiles')}</p>
                {backfillResult.missing_users.map((u) => (
                  <div key={u.id} className="flex items-center gap-2 text-xs text-red-300/80 bg-red-500/5 px-2 py-1 rounded">
                    <span className="font-mono text-[10px] text-red-500/50">{u.id.slice(0, 8)}…</span>
                    <span className="font-medium">{u.full_name}</span>
                    <span className="text-red-400/50">{u.email}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Role Reference */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] p-6 rounded-sm">
        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-3">{t('admin.overview.roleReference')}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_ROLES.map((role) => (
            <div key={role} className="flex items-center gap-2 text-xs text-zinc-400">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-[10px] font-semibold uppercase tracking-wider ${getRoleBadgeColor(role)}`}
              >
                {getRoleLabel(role)}
              </span>
              <span className="text-zinc-600">— {t(`admin.roles.${role}`, t('admin.roles.default'))}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Users Tab ─── */
function UsersTab({
  users,
  loading,
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  onRoleChange,
  onSaveRole,
  savingId,
}: {
  users: UserRow[];
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  roleFilter: string;
  onRoleFilterChange: (v: string) => void;
  onRoleChange: (userId: string, role: string) => void;
  onSaveRole: (user: UserRow) => void;
  savingId: string | null;
}) {
  const { t } = useTranslation();
  const [syncing, setSyncing] = useState(false);

  const orphanCount = users.filter((u) => u.role === 'orphan').length;

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await fetch(
        'https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/backfill-profiles',
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      );
      const data = await res.json();
      if (res.ok) {
        toast.success(
          t('admin.users.syncSuccess', { count: data.created || 0 }),
        );
        // Reload users after sync
        window.location.reload();
      } else {
        toast.error(t('admin.users.syncFailed') + ': ' + (data.error || 'Unknown'));
      }
    } catch (err) {
      toast.error(t('admin.users.syncFailed') + ': ' + String(err));
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateSingleProfile = async (user: UserRow) => {
    try {
      const res = await fetch(
        'https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/backfill-profiles',
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      );
      const data = await res.json();
      if (res.ok) {
        toast.success(t('admin.users.profileCreated', { name: user.full_name || user.email || 'User' }));
        window.location.reload();
      } else {
        toast.error(t('admin.users.profileCreateFailed') + ': ' + (data.error || 'Unknown'));
      }
    } catch (err) {
      toast.error(t('admin.users.profileCreateFailed') + ': ' + String(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">{t('admin.users.title')}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {t('admin.users.usersFound', { count: users.length })}
            {orphanCount > 0 && (
              <span className="ml-2 text-amber-400">
                · {t('admin.users.orphanCount', { count: orphanCount })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sync button */}
          {orphanCount > 0 && (
            <Button
              onClick={handleSyncAll}
              disabled={syncing}
              variant="outline"
              size="sm"
              className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
            >
              {syncing ? (
                <>
                  <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                  {t('admin.users.syncing')}
                </>
              ) : (
                <>
                  <UserPlus className="h-3 w-3 mr-1.5" />
                  {t('admin.users.syncAll', { count: orphanCount })}
                </>
              )}
            </Button>
          )}
          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={(e) => onRoleFilterChange(e.target.value)}
            className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-[#f59e0b] transition"
          >
            <option value="all">{t('admin.users.allRoles')}</option>
            <option value="orphan">⚠️ {t('admin.users.orphans')}</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {getRoleLabel(r)}
              </option>
            ))}
          </select>
          {/* Search */}
          <div className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-400 min-w-[240px]">
            <Search className="h-4 w-4 shrink-0" />
            <input
              placeholder={t('admin.users.searchPlaceholder')}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="flex-1 bg-transparent outline-none placeholder:text-zinc-600 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/50">
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    {t('admin.users.fullName')}
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    {t('admin.users.email')}
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    {t('admin.users.currentRole')}
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    {t('admin.users.createdDate')}
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    {t('admin.users.status')}
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    {t('admin.users.visibility', 'Visibility')}
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    {t('admin.users.changeRole')}
                  </th>
                  <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    {t('admin.users.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isOrphan = u.role === 'orphan';
                  const normalizedRole = isOrphan ? 'orphan' : (u.role === 'user' ? 'worker' : u.role);
                  const displayEmail = u.email || (u.username ? `${u.username}@...` : '—');
                  const isActive = u.last_sign_in_at
                    ? (Date.now() - new Date(u.last_sign_in_at).getTime()) < 30 * 24 * 60 * 60 * 1000
                    : u.created_at
                      ? (Date.now() - new Date(u.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000
                      : false;
                  return (
                    <tr
                      key={u.user_id || u.id}
                      className={`border-b border-zinc-800/40 hover:bg-zinc-900/50 transition ${isOrphan ? 'bg-amber-500/5' : ''}`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${isOrphan ? 'bg-amber-900/30 border-amber-500/40 text-amber-400' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}`}>
                            {isOrphan ? '!' : (u.full_name || u.username || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-zinc-200 font-medium">
                              {u.full_name || '—'}
                            </span>
                            {isOrphan && (
                              <span className="text-[10px] text-amber-400/70">{t('admin.users.noProfile')}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-zinc-400 text-xs">
                        {displayEmail}
                      </td>
                      <td className="py-3 px-4">
                        {isOrphan ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-sm border text-[10px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400 border-amber-500/30">
                            ⚠️ {t('admin.users.orphanLabel')}
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-[10px] font-semibold uppercase tracking-wider ${getRoleBadgeColor(normalizedRole)}`}
                          >
                            {getRoleLabel(normalizedRole)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-zinc-500 text-xs">
                        {u.created_at
                          ? new Date(u.created_at).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider ${
                            isActive
                              ? 'text-emerald-400'
                              : 'text-zinc-500'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isActive ? 'bg-emerald-400' : 'bg-zinc-600'
                            }`}
                          />
                          {isActive ? t('admin.users.active') : t('admin.users.inactive')}
                        </span>
                      </td>
                      {/* Visibility indicators */}
                      <td className="py-3 px-4">
                        {isOrphan ? (
                          <span className="text-zinc-600 text-[10px]">—</span>
                        ) : (() => {
                          const isMarketplace = u.marketplace_ready === true;
                          const vis = u.profile_visibility || (u.cv_visible ? 'public' : 'private');
                          const completion = u.profile_completion ?? 0;
                          const hasCV = !!(u.cv_file_url || u.cv_url);
                          const hasTitle = !!u.title;
                          // Determine marketplace eligibility
                          const meetsMarketplace = isMarketplace || (completion >= 30 && hasTitle && u.cv_visible !== false);
                          return (
                            <div className="flex flex-col gap-1">
                              {/* Marketplace status */}
                              <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${meetsMarketplace ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${meetsMarketplace ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                                {meetsMarketplace ? 'Marketplace' : 'No visible'}
                              </span>
                              {/* Profile visibility */}
                              <span className={`text-[9px] ${vis === 'public' ? 'text-blue-400' : 'text-zinc-500'}`}>
                                {vis === 'public' ? '🌐 Public' : '🔒 Private'}
                              </span>
                              {/* CV indicator */}
                              <span className={`text-[9px] ${hasCV ? 'text-emerald-400/70' : 'text-zinc-600'}`}>
                                {hasCV ? '📄 CV ✓' : '📄 CV ✗'}
                              </span>
                              {/* Completion % */}
                              <div className="flex items-center gap-1">
                                <div className="h-1 w-12 rounded-full bg-zinc-800 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${completion >= 60 ? 'bg-emerald-500' : completion >= 30 ? 'bg-amber-500' : 'bg-red-500'}`}
                                    style={{ width: `${Math.min(completion, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[9px] text-zinc-500">{completion}%</span>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4">
                        {isOrphan ? (
                          <button
                            onClick={() => handleCreateSingleProfile(u)}
                            className="inline-flex items-center gap-1.5 rounded-sm bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-emerald-400 font-medium hover:bg-emerald-500/20 transition"
                          >
                            <UserPlus className="h-3 w-3" />
                            {t('admin.users.createProfile')}
                          </button>
                        ) : (
                          <select
                            value={normalizedRole}
                            onChange={(e) => onRoleChange(u.user_id, e.target.value)}
                            className="bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-[#f59e0b] transition w-full max-w-[160px]"
                          >
                            {ALL_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {getRoleLabel(r)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!isOrphan && (
                            <>
                              <button
                                onClick={async () => {
                                  const newVis = u.profile_visibility === 'public' ? 'private' : 'public';
                                  const updatePayload: Record<string, unknown> = { 
                                    profile_visibility: newVis, 
                                    cv_visible: newVis === 'public' 
                                  };
                                  // When making public, also set marketplace_ready
                                  if (newVis === 'public') {
                                    updatePayload.marketplace_ready = true;
                                    updatePayload.onboarding_status = 'MARKETPLACE_READY';
                                  } else {
                                    updatePayload.marketplace_ready = false;
                                    updatePayload.onboarding_status = 'PROFILE_STARTED';
                                  }
                                  const { error: visErr } = await supabase
                                    .from(TABLES.profiles)
                                    .update(updatePayload)
                                    .eq('user_id', u.user_id);
                                  if (!visErr) {
                                    setUsers(prev => prev.map(x => x.user_id === u.user_id ? { 
                                      ...x, 
                                      profile_visibility: newVis, 
                                      cv_visible: newVis === 'public',
                                      marketplace_ready: newVis === 'public' ? true : false,
                                    } : x));
                                  }
                                }}
                                className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[9px] uppercase tracking-wider font-medium transition ${
                                  (u.profile_visibility || (u.cv_visible ? 'public' : 'private')) === 'public'
                                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20'
                                    : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-700/50'
                                }`}
                                title={u.profile_visibility === 'public' ? 'Ocultar del Marketplace' : 'Publicar en Marketplace'}
                              >
                                {(u.profile_visibility || (u.cv_visible ? 'public' : 'private')) === 'public' ? '🌐' : '🔒'}
                                <span className="hidden sm:inline">
                                  {(u.profile_visibility || (u.cv_visible ? 'public' : 'private')) === 'public' ? 'Ocultar' : 'Publicar'}
                                </span>
                              </button>
                              <button
                                onClick={() => onSaveRole(u)}
                                disabled={savingId === u.user_id}
                                className="inline-flex items-center gap-1.5 rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#f59e0b] font-medium hover:bg-[#f59e0b]/20 transition disabled:opacity-50"
                              >
                                <Save className="h-3 w-3" />
                                {savingId === u.user_id ? t('admin.users.saving') : t('admin.users.save')}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-zinc-500 text-sm">
                      {t('admin.users.noUsersFound')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Activity Tab ─── */
type ActivityFilter = 'all' | 'application' | 'workforce_request' | 'content_draft' | 'new_user';

function ActivityTab({
  activity,
  loading,
}: {
  activity: ActivityItem[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const filters: { id: ActivityFilter; label: string }[] = [
    { id: 'all', label: t('admin.activity.filters.all') },
    { id: 'application', label: t('admin.activity.filters.applications') },
    { id: 'workforce_request', label: t('admin.activity.filters.workforce') },
    { id: 'content_draft', label: t('admin.activity.filters.content') },
    { id: 'new_user', label: t('admin.activity.filters.users') },
  ];

  const filteredActivity = filter === 'all'
    ? activity
    : activity.filter((item) => item.type === filter);

  const getActivityTypeLabel = (type: ActivityItem['type']) => {
    return t(`admin.activity.types.${type}`);
  };

  const renderActivityText = (text: string): string => {
    try {
      const data = JSON.parse(text);
      const unknown = t('admin.activity.unknown');
      switch (data.key) {
        case 'appliedTo':
          return t('admin.activity.appliedTo', { name: data.name || unknown, job: data.job || t('admin.activity.aJob') });
        case 'companyPrefix':
          return t('admin.activity.companyPrefix', { name: data.name });
        case 'applicationSubmitted':
          return t('admin.activity.applicationSubmitted');
        case 'requestedWorkforce':
          return t('admin.activity.requestedWorkforce', { name: data.name || unknown });
        case 'workersNeeded':
          return t('admin.activity.workersNeeded', { country: data.country || t('admin.activity.unknownCountry'), count: data.count });
        case 'draftCreated':
          return t('admin.activity.draftCreated', { title: data.title || t('admin.activity.untitled') });
        case 'channelStatus':
          return t('admin.activity.channelStatus', { channel: data.channel || t('admin.activity.na'), status: data.status });
        case 'newUserRegistered':
          return t('admin.activity.newUserRegistered', { name: data.name || unknown });
        case 'roleLabel':
          return t('admin.activity.roleLabel', { role: data.role });
        default:
          return text;
      }
    } catch {
      return text;
    }
  };

  const getActivitySourceColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'application': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'workforce_request': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'content_draft': return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'new_user': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">{t('admin.activity.title')}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{t('admin.activity.loading')}</p>
          </div>
        </div>
        {/* Loading skeletons */}
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm divide-y divide-zinc-800/50">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
              <div className="h-9 w-9 rounded-full bg-zinc-800" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 bg-zinc-800 rounded" />
                <div className="h-2.5 w-1/3 bg-zinc-800/60 rounded" />
              </div>
              <div className="h-3 w-12 bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">{t('admin.activity.title')}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {filteredActivity.length !== 1
              ? t('admin.activity.count', { count: filteredActivity.length })
              : t('admin.activity.countSingular', { count: filteredActivity.length })}
          </p>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] font-medium rounded-sm border transition ${
              filter === f.id
                ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]'
                : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Activity feed */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm divide-y divide-zinc-800/50">
        {filteredActivity.length === 0 ? (
          <p className="text-sm text-zinc-500 py-12 text-center">{t('admin.activity.noActivity')}</p>
        ) : (
          filteredActivity.slice(0, 20).map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-900/50 transition group"
            >
              {/* Icon */}
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 shrink-0 group-hover:border-zinc-700 transition">
                {getActivityIcon(item.type)}
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-zinc-200 truncate font-medium">{renderActivityText(item.title)}</p>
                </div>
                <p className="text-xs text-zinc-500 truncate mt-0.5">{renderActivityText(item.subtitle)}</p>
              </div>
              {/* Source label */}
              <span
                className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider shrink-0 ${getActivitySourceColor(item.type)}`}
              >
                {getActivityTypeLabel(item.type)}
              </span>
              {/* Timestamp */}
              <span className="text-[10px] text-zinc-600 whitespace-nowrap shrink-0">
                {item.date ? formatRelativeDate(item.date, t) : '—'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ─── */
function getRoleDescription(role: string): string {
  // Note: This is used in OverviewTab which has its own t() via useTranslation
  // For static context, we keep a fallback. The OverviewTab renders via t('admin.roles.*')
  const descriptions: Record<string, string> = {
    admin: 'Full platform access',
    community_moderator: 'Community & content management',
    jobs_moderator: 'Recruitment & workforce management',
    worker: 'Standard user experience',
    company: 'Company-focused interface',
  };
  return descriptions[role] ?? 'Standard access';
}

function formatRelativeDate(dateStr: string, t?: (key: string, opts?: Record<string, unknown>) => string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (t) {
    if (diffMins < 1) return t('admin.time.justNow');
    if (diffMins < 60) return t('admin.time.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('admin.time.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('admin.time.daysAgo', { count: diffDays });
  } else {
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
  }
  return date.toLocaleDateString();
}