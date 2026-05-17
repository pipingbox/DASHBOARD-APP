import { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminLeads } from '@/components/admin/AdminLeads';
import { AdminAnalytics } from '@/components/admin/AdminAnalytics';
import { AdminAuditLog, logAuditEvent } from '@/components/admin/AdminAuditLog';
import { AdminRegistros } from '@/components/admin/AdminRegistros';
import { AdminNotifications } from '@/components/admin/AdminNotifications';
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
type AdminTab = 'overview' | 'users' | 'registros' | 'activity' | 'leads' | 'analytics' | 'audit' | 'notifications';

export default function Admin() {
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

  /* ─── Fetch users ─── */
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    const { data, error } = await supabase
      .from(TABLES.profiles)
      .select('id, user_id, full_name, username, role, created_at, avatar_url')
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
          title: `${a.applicant_name || 'Unknown'} applied to ${a.job_title || 'a job'}`,
          subtitle: a.company_name ? `Company: ${a.company_name}` : 'Job application submitted',
          date: a.created_at,
        });
      });

      (leadsRes.data || []).forEach((l: Record<string, string>) => {
        items.push({
          id: `lead-${l.id}`,
          type: 'workforce_request',
          title: `${l.company_name || 'Unknown'} requested workforce`,
          subtitle: `${l.country || 'Unknown country'} · ${l.workers_needed || '?'} workers needed`,
          date: l.created_at,
        });
      });

      (draftsRes.data || []).forEach((d: Record<string, string>) => {
        items.push({
          id: `draft-${d.id}`,
          type: 'content_draft',
          title: `Draft created: ${d.title || 'Untitled'}`,
          subtitle: `Channel: ${d.suggested_channel || 'N/A'} · Status: ${d.status || 'draft'}`,
          date: d.created_at,
        });
      });

      (usersRes.data || []).forEach((u: Record<string, string>) => {
        const roleLabel = u.role ? getRoleLabel(u.role === 'user' ? 'worker' : u.role) : 'Worker';
        items.push({
          id: `user-${u.id}`,
          type: 'new_user',
          title: `New user registered: ${u.full_name || u.username || 'Unknown'}`,
          subtitle: `Role: ${roleLabel}`,
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
      toast.error('Failed to update role: ' + error.message);
    } else {
      toast.success(
        `Role updated to ${getRoleLabel(user.role)} for ${user.full_name || user.username || 'user'}`,
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
    const normalizedRole = u.role === 'user' ? 'worker' : u.role;
    // Role filter
    if (roleFilter !== 'all' && normalizedRole !== roleFilter) return false;
    // Text search
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      normalizedRole.toLowerCase().includes(q)
    );
  });

  /* ─── Tab buttons ─── */
  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Activity className="h-3.5 w-3.5" /> },
    { id: 'registros', label: 'Registros', icon: <UserPlus className="h-3.5 w-3.5" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { id: 'users', label: 'Users', icon: <Users2 className="h-3.5 w-3.5" /> },
    { id: 'activity', label: 'Activity', icon: <Calendar className="h-3.5 w-3.5" /> },
    { id: 'leads', label: 'Lead Pipeline', icon: <Building2 className="h-3.5 w-3.5" /> },
    { id: 'audit', label: 'Audit Log', icon: <Shield className="h-3.5 w-3.5" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Center"
        title="Platform Management"
        description="Manage users, roles, and monitor platform activity."
        actions={
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin Access
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
                <h3 className="text-lg font-bold text-zinc-100">⚠️ Remove Your Admin Role?</h3>
                <p className="text-sm text-zinc-400">
                  You are about to change <span className="text-[#f59e0b] font-medium">your own role</span> from Admin to{' '}
                  <span className="text-[#f59e0b] font-medium">{getRoleLabel(confirmDemotion.role)}</span>.
                </p>
                <p className="text-xs text-red-400">
                  This will remove your access to the Admin Center. You will not be able to undo this without another admin.
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
                    Cancel
                  </button>
                  <button
                    onClick={() => executeSaveRole(confirmDemotion)}
                    className="px-4 py-2 text-xs font-bold text-black bg-red-500 rounded-sm hover:bg-red-600 transition"
                  >
                    Yes, Remove My Admin Role
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
    </div>
  );
}

/* ─── Overview Tab ─── */
function OverviewTab({ counts, loading, onRefresh }: { counts: OverviewCounts; loading: boolean; onRefresh?: () => void }) {
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
      setBackfillResult({ message: `Network error: ${String(err)}`, created: 0 });
    } finally {
      setBackfilling(false);
    }
  };

  const tiles = [
    { label: 'Total Users', value: counts.totalUsers, icon: Users2, color: 'text-zinc-100' },
    { label: 'Workers', value: counts.workers, icon: HardHat, color: 'text-emerald-400' },
    { label: 'Companies', value: counts.companies, icon: Building2, color: 'text-amber-400' },
    { label: 'Community Mods', value: counts.communityModerators, icon: Users2, color: 'text-purple-400' },
    { label: 'Jobs Mods', value: counts.jobsModerators, icon: Briefcase, color: 'text-blue-400' },
    { label: 'Applications', value: counts.totalApplications, icon: ClipboardList, color: 'text-cyan-400' },
    { label: 'Workforce Requests', value: counts.totalWorkforceRequests, icon: HardHat, color: 'text-orange-400' },
    { label: 'Content Drafts', value: counts.totalContentDrafts, icon: FileText, color: 'text-pink-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                {t.label}
              </p>
              <t.icon className="h-4 w-4 text-zinc-600" />
            </div>
            <p className={`mt-3 text-3xl font-bold ${t.color}`}>
              {loading ? '—' : t.value}
            </p>
          </div>
        ))}
      </div>

      {/* Backfill Missing Profiles */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] p-6 rounded-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Database Repair</p>
            <p className="text-sm text-zinc-400">
              Find auth users without profile rows and create missing profiles with default values.
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
                Running...
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 mr-1.5" />
                Backfill Profiles
              </>
            )}
          </Button>
        </div>
        {backfillResult && (
          <div className={`mt-3 p-4 rounded-sm text-sm ${backfillResult.created > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : backfillResult.error_details ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-zinc-800/50 text-zinc-300 border border-zinc-700'}`}>
            <p className="font-medium">{backfillResult.message}</p>
            {backfillResult.total_auth_users !== undefined && (
              <p className="text-xs mt-1 text-zinc-400">
                Auth users scanned: {backfillResult.total_auth_users} · Profiles after: {backfillResult.total_profiles_after ?? '—'}
              </p>
            )}
            {backfillResult.created > 0 && (
              <div className="mt-2">
                <p className="text-xs text-emerald-300/70 mb-1.5">
                  ✓ {backfillResult.created} new profile(s) created. Dashboard counters refreshed.
                </p>
                {backfillResult.created_profiles && backfillResult.created_profiles.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-500/60 font-medium">Created profiles:</p>
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
              <p className="text-xs mt-1.5 text-red-300/70">Details: {backfillResult.error_details}</p>
            )}
            {backfillResult.missing_users && backfillResult.missing_users.length > 0 && (
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                <p className="text-[10px] uppercase tracking-[0.2em] text-red-500/60 font-medium">Users that need profiles:</p>
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
        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-3">Role Reference</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_ROLES.map((role) => (
            <div key={role} className="flex items-center gap-2 text-xs text-zinc-400">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-[10px] font-semibold uppercase tracking-wider ${getRoleBadgeColor(role)}`}
              >
                {getRoleLabel(role)}
              </span>
              <span className="text-zinc-600">— {getRoleDescription(role)}</span>
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
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">User Management</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {users.length} user{users.length !== 1 ? 's' : ''} found. Assign roles to control platform access.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={(e) => onRoleFilterChange(e.target.value)}
            className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-[#f59e0b] transition"
          >
            <option value="all">All Roles</option>
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
              placeholder="Search by name, email, or role..."
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
                    Full Name
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Email
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Current Role
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Created Date
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Change Role
                  </th>
                  <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const normalizedRole = u.role === 'user' ? 'worker' : u.role;
                  const email = u.username ? `${u.username}@` : '—';
                  const isActive = u.created_at
                    ? (Date.now() - new Date(u.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000
                    : false;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-zinc-800/40 hover:bg-zinc-900/50 transition"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-300">
                            {(u.full_name || u.username || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-zinc-200 font-medium">
                            {u.full_name || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-zinc-400 text-xs">
                        {u.username || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-[10px] font-semibold uppercase tracking-wider ${getRoleBadgeColor(normalizedRole)}`}
                        >
                          {getRoleLabel(normalizedRole)}
                        </span>
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
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
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
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onSaveRole(u)}
                          disabled={savingId === u.user_id}
                          className="inline-flex items-center gap-1.5 rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#f59e0b] font-medium hover:bg-[#f59e0b]/20 transition disabled:opacity-50"
                        >
                          <Save className="h-3 w-3" />
                          {savingId === u.user_id ? 'Saving...' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-500 text-sm">
                      No users found.
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
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const filters: { id: ActivityFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'application', label: 'Applications' },
    { id: 'workforce_request', label: 'Workforce' },
    { id: 'content_draft', label: 'Content' },
    { id: 'new_user', label: 'Users' },
  ];

  const filteredActivity = filter === 'all'
    ? activity
    : activity.filter((item) => item.type === filter);

  const getActivityTypeLabel = (type: ActivityItem['type']) => {
    switch (type) {
      case 'application': return 'New Application';
      case 'workforce_request': return 'Workforce Request';
      case 'content_draft': return 'Content Draft';
      case 'new_user': return 'New User';
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
            <h3 className="text-lg font-semibold text-zinc-100">Platform Activity</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Loading recent platform activity...</p>
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
          <h3 className="text-lg font-semibold text-zinc-100">Platform Activity</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {filteredActivity.length} recent activit{filteredActivity.length !== 1 ? 'ies' : 'y'} across the platform.
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
          <p className="text-sm text-zinc-500 py-12 text-center">No platform activity yet.</p>
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
                  <p className="text-sm text-zinc-200 truncate font-medium">{item.title}</p>
                </div>
                <p className="text-xs text-zinc-500 truncate mt-0.5">{item.subtitle}</p>
              </div>
              {/* Source label */}
              <span
                className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider shrink-0 ${getActivitySourceColor(item.type)}`}
              >
                {getActivityTypeLabel(item.type)}
              </span>
              {/* Timestamp */}
              <span className="text-[10px] text-zinc-600 whitespace-nowrap shrink-0">
                {item.date ? formatRelativeDate(item.date) : '—'}
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
  const descriptions: Record<string, string> = {
    admin: 'Full platform access',
    community_moderator: 'Community & content management',
    jobs_moderator: 'Recruitment & workforce management',
    worker: 'Standard user experience',
    company: 'Company-focused interface',
  };
  return descriptions[role] ?? 'Standard access';
}

function formatRelativeDate(dateStr: string): string {
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