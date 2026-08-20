import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, TABLES } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Link2,
  Users2,
  ArrowRight,
  Wrench,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { adminAssignReferral } from '@/lib/referrals';

/* ─── Types ─── */
interface ReferralRow {
  id: string;
  referrer_id: string;
  referred_id: string;
  referred_email: string;
  status: 'pending' | 'verified' | 'rejected';
  created_at: string;
  verified_at: string | null;
}

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  referral_code: string | null;
  referred_by_user_id: string | null;
  referral_count: number | null;
  account_type: string | null;
  role: string | null;
  created_at: string | null;
}

interface DiagnosticIssue {
  type: 'orphan_record' | 'missing_record' | 'missing_code' | 'count_mismatch' | 'self_referral';
  severity: 'error' | 'warning' | 'info';
  userId: string;
  userName: string | null;
  description: string;
  autoFixable: boolean;
}

/* ─── Component ─── */
export function AdminReferralDiagnostics() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [issues, setIssues] = useState<DiagnosticIssue[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [showAllReferrals, setShowAllReferrals] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    totalReferrals: 0,
    pendingReferrals: 0,
    verifiedReferrals: 0,
    profilesWithReferrer: 0,
    profilesWithCode: 0,
    issueCount: 0,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load all referral records
      const { data: refData } = await supabase
        .from(TABLES.referrals)
        .select('*')
        .order('created_at', { ascending: false });

      const refs = (refData ?? []) as ReferralRow[];
      setReferrals(refs);

      // Load all profiles with referral-related fields
      const { data: profData } = await supabase
        .from(TABLES.profiles)
        .select('user_id, full_name, referral_code, referred_by_user_id, referral_count, account_type, role, created_at')
        .order('created_at', { ascending: false });

      const profs = (profData ?? []) as ProfileRow[];
      setProfiles(profs);

      // Run diagnostics
      const foundIssues: DiagnosticIssue[] = [];

      // Check 1: Profiles with referred_by_user_id but no matching referral record
      for (const p of profs) {
        if (p.referred_by_user_id) {
          const hasRecord = refs.some(
            (r) => r.referred_id === p.user_id && r.referrer_id === p.referred_by_user_id,
          );
          if (!hasRecord) {
            foundIssues.push({
              type: 'missing_record',
              severity: 'warning',
              userId: p.user_id,
              userName: p.full_name,
              description: `Profile has referred_by_user_id=${p.referred_by_user_id.slice(0, 8)}… but no matching referral record in referrals table`,
              autoFixable: true,
            });
          }
        }
      }

      // Check 2: Referral records with no matching profile.referred_by_user_id
      for (const r of refs) {
        const referredProfile = profs.find((p) => p.user_id === r.referred_id);
        if (referredProfile && referredProfile.referred_by_user_id !== r.referrer_id) {
          foundIssues.push({
            type: 'orphan_record',
            severity: 'warning',
            userId: r.referred_id,
            userName: referredProfile.full_name,
            description: `Referral record exists (referrer=${r.referrer_id.slice(0, 8)}…) but profile.referred_by_user_id is ${referredProfile.referred_by_user_id ? referredProfile.referred_by_user_id.slice(0, 8) + '…' : 'NULL'}`,
            autoFixable: true,
          });
        }
      }

      // Check 3: Profiles without referral_code
      for (const p of profs) {
        if (!p.referral_code) {
          foundIssues.push({
            type: 'missing_code',
            severity: 'info',
            userId: p.user_id,
            userName: p.full_name,
            description: 'Profile has no referral_code — cannot be a referrer',
            autoFixable: true,
          });
        }
      }

      // Check 4: referral_count mismatch
      for (const p of profs) {
        if (p.referral_code) {
          const actualCount = refs.filter((r) => r.referrer_id === p.user_id).length;
          const profileCount = p.referral_count ?? 0;
          if (actualCount !== profileCount) {
            foundIssues.push({
              type: 'count_mismatch',
              severity: 'warning',
              userId: p.user_id,
              userName: p.full_name,
              description: `referral_count=${profileCount} but actual referral records=${actualCount}`,
              autoFixable: true,
            });
          }
        }
      }

      // Check 5: Self-referrals
      for (const r of refs) {
        if (r.referrer_id === r.referred_id) {
          const profile = profs.find((p) => p.user_id === r.referred_id);
          foundIssues.push({
            type: 'self_referral',
            severity: 'error',
            userId: r.referred_id,
            userName: profile?.full_name ?? null,
            description: 'Self-referral detected — user referred themselves',
            autoFixable: true,
          });
        }
      }

      setIssues(foundIssues);

      // Calculate stats
      setStats({
        totalReferrals: refs.length,
        pendingReferrals: refs.filter((r) => r.status === 'pending').length,
        verifiedReferrals: refs.filter((r) => r.status === 'verified').length,
        profilesWithReferrer: profs.filter((p) => p.referred_by_user_id).length,
        profilesWithCode: profs.filter((p) => p.referral_code).length,
        issueCount: foundIssues.length,
      });
    } catch (err) {
      console.error('Failed to load referral diagnostics:', err);
      toast.error('Error loading referral data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getProfileName = (userId: string): string => {
    const p = profiles.find((pr) => pr.user_id === userId);
    return p?.full_name || userId.slice(0, 8) + '…';
  };

  const autoFixIssue = async (issue: DiagnosticIssue) => {
    setFixing(issue.userId + issue.type);
    try {
      switch (issue.type) {
        case 'missing_record': {
          // Create missing referral record
          const profile = profiles.find((p) => p.user_id === issue.userId);
          if (profile?.referred_by_user_id) {
            const { error } = await supabase.from(TABLES.referrals).insert({
              referrer_id: profile.referred_by_user_id,
              referred_id: issue.userId,
              referred_email: '',
              status: 'pending',
            });
            if (error) throw error;
            toast.success(`Referral record created for ${issue.userName || issue.userId.slice(0, 8)}`);
          }
          break;
        }
        case 'orphan_record': {
          // Sync profile.referred_by_user_id with referral record
          const ref = referrals.find((r) => r.referred_id === issue.userId);
          if (ref) {
            const { error } = await supabase
              .from(TABLES.profiles)
              .update({ referred_by_user_id: ref.referrer_id })
              .eq('user_id', issue.userId);
            if (error) throw error;
            toast.success(`Profile synced with referral record for ${issue.userName || issue.userId.slice(0, 8)}`);
          }
          break;
        }
        case 'missing_code': {
          const code = `PB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
          const { error } = await supabase
            .from(TABLES.profiles)
            .update({ referral_code: code })
            .eq('user_id', issue.userId);
          if (error) throw error;
          toast.success(`Referral code ${code} generated for ${issue.userName || issue.userId.slice(0, 8)}`);
          break;
        }
        case 'count_mismatch': {
          const actualCount = referrals.filter((r) => r.referrer_id === issue.userId).length;
          const { error } = await supabase
            .from(TABLES.profiles)
            .update({ referral_count: actualCount })
            .eq('user_id', issue.userId);
          if (error) throw error;
          toast.success(`Referral count corrected to ${actualCount} for ${issue.userName || issue.userId.slice(0, 8)}`);
          break;
        }
        case 'self_referral': {
          // Remove self-referral record and clear profile
          await supabase
            .from(TABLES.referrals)
            .delete()
            .eq('referrer_id', issue.userId)
            .eq('referred_id', issue.userId);
          await supabase
            .from(TABLES.profiles)
            .update({ referred_by_user_id: null })
            .eq('user_id', issue.userId);
          toast.success(`Self-referral removed for ${issue.userName || issue.userId.slice(0, 8)}`);
          break;
        }
      }
      await loadData();
    } catch (err) {
      toast.error(`Fix failed: ${(err as Error).message}`);
    } finally {
      setFixing(null);
    }
  };

  const autoFixAll = async () => {
    const fixable = issues.filter((i) => i.autoFixable);
    if (fixable.length === 0) {
      toast.info('No issues to fix');
      return;
    }

    setFixing('all');
    let fixed = 0;
    for (const issue of fixable) {
      try {
        await autoFixIssue(issue);
        fixed++;
      } catch {
        // Continue with next
      }
    }
    toast.success(`Fixed ${fixed}/${fixable.length} issues`);
    setFixing(null);
    await loadData();
  };

  // Manual referral assignment
  const [assignModal, setAssignModal] = useState<{ userId: string; userName: string } | null>(null);
  const [selectedReferrerId, setSelectedReferrerId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const handleManualAssign = async () => {
    if (!assignModal || !selectedReferrerId) return;
    setAssigning(true);
    try {
      const result = await adminAssignReferral(assignModal.userId, selectedReferrerId);
      if (result.success) {
        toast.success(`Referral assigned to ${assignModal.userName}`);
        setAssignModal(null);
        setSelectedReferrerId('');
        await loadData();
      } else {
        toast.error(result.error || 'Assignment failed');
      }
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setAssigning(false);
    }
  };

  // Filter referrals by search
  const filteredReferrals = referrals.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const referrerName = getProfileName(r.referrer_id).toLowerCase();
    const referredName = getProfileName(r.referred_id).toLowerCase();
    return (
      referrerName.includes(q) ||
      referredName.includes(q) ||
      r.referrer_id.toLowerCase().includes(q) ||
      r.referred_id.toLowerCase().includes(q) ||
      r.referred_email.toLowerCase().includes(q)
    );
  });

  const displayedReferrals = showAllReferrals ? filteredReferrals : filteredReferrals.slice(0, 20);

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <XCircle className="h-4 w-4 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-400" />;
      default:
        return <CheckCircle2 className="h-4 w-4 text-blue-400" />;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✅ VERIFIED</span>;
      case 'rejected':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-500/20 text-red-400 border border-red-500/30">❌ REJECTED</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">⏳ PENDING</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-zinc-500" />
        <span className="ml-3 text-sm text-zinc-400">Loading referral diagnostics…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Referrals', value: stats.totalReferrals, color: 'text-zinc-100' },
          { label: 'Pending', value: stats.pendingReferrals, color: 'text-amber-400' },
          { label: 'Verified', value: stats.verifiedReferrals, color: 'text-emerald-400' },
          { label: 'Profiles w/ Referrer', value: stats.profilesWithReferrer, color: 'text-blue-400' },
          { label: 'Profiles w/ Code', value: stats.profilesWithCode, color: 'text-purple-400' },
          { label: 'Issues Found', value: stats.issueCount, color: stats.issueCount > 0 ? 'text-red-400' : 'text-emerald-400' },
        ].map((s) => (
          <div key={s.label} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Issues Section */}
      {issues.length > 0 && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Diagnostic Issues ({issues.length})
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={autoFixAll}
              disabled={fixing === 'all'}
              className="text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            >
              <Wrench className="h-3 w-3 mr-1" />
              {fixing === 'all' ? 'Fixing…' : 'Auto-Fix All'}
            </Button>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {issues.map((issue, idx) => (
              <div
                key={`${issue.userId}-${issue.type}-${idx}`}
                className="flex items-start gap-3 p-2 rounded bg-zinc-950/50 border border-zinc-800/50"
              >
                {severityIcon(issue.severity)}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-300">
                    <span className="font-medium text-zinc-100">{issue.userName || issue.userId.slice(0, 8) + '…'}</span>
                    {' — '}
                    {issue.description}
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-0.5 font-mono">{issue.userId}</p>
                </div>
                {issue.autoFixable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => autoFixIssue(issue)}
                    disabled={fixing === issue.userId + issue.type}
                    className="text-[10px] text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 h-6 px-2"
                  >
                    <Wrench className="h-3 w-3 mr-1" />
                    Fix
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {issues.length === 0 && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <p className="text-sm text-emerald-400 font-medium">All referral data is consistent — no issues found</p>
        </div>
      )}

      {/* Search + Referral Records */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-[#f59e0b]" />
            Referral Records ({referrals.length})
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, ID…"
                className="h-8 pl-8 text-xs bg-zinc-950 border-zinc-700 w-56"
              />
            </div>
            <Button size="sm" variant="outline" onClick={loadData} className="h-8 text-xs">
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        {displayedReferrals.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-6">No referral records found</p>
        ) : (
          <div className="space-y-1.5">
            {displayedReferrals.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 p-2.5 rounded bg-zinc-950/50 border border-zinc-800/50 hover:border-zinc-700/50 transition-colors cursor-pointer"
                onClick={() => setExpandedUser(expandedUser === r.id ? null : r.id)}
              >
                <Users2 className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-200 truncate">
                    {getProfileName(r.referrer_id)}
                  </span>
                  <ArrowRight className="h-3 w-3 text-[#f59e0b] shrink-0" />
                  <span className="text-xs text-zinc-300 truncate">
                    {getProfileName(r.referred_id)}
                  </span>
                  {r.referred_email && (
                    <span className="text-[10px] text-zinc-600 truncate hidden sm:inline">
                      ({r.referred_email})
                    </span>
                  )}
                </div>
                {statusBadge(r.status)}
                <span className="text-[10px] text-zinc-600 shrink-0 hidden sm:inline">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
                {expandedUser === r.id ? (
                  <ChevronUp className="h-3 w-3 text-zinc-500" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-zinc-500" />
                )}
              </div>
            ))}

            {filteredReferrals.length > 20 && !showAllReferrals && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllReferrals(true)}
                className="w-full text-xs text-zinc-400 hover:text-zinc-200"
              >
                Show all {filteredReferrals.length} records
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Referrer Leaderboard */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          🏆 Top Referrers
        </h3>
        <div className="space-y-1.5">
          {profiles
            .filter((p) => (p.referral_count ?? 0) > 0 || referrals.some((r) => r.referrer_id === p.user_id))
            .map((p) => ({
              ...p,
              actualCount: referrals.filter((r) => r.referrer_id === p.user_id).length,
              verifiedCount: referrals.filter((r) => r.referrer_id === p.user_id && r.status === 'verified').length,
            }))
            .sort((a, b) => b.actualCount - a.actualCount)
            .slice(0, 10)
            .map((p, idx) => (
              <div
                key={p.user_id}
                className="flex items-center gap-3 p-2.5 rounded bg-zinc-950/50 border border-zinc-800/50"
              >
                <span className="text-sm font-bold text-[#f59e0b] w-6 text-center">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-200 truncate">
                    {p.full_name || p.user_id.slice(0, 8) + '…'}
                  </p>
                  <p className="text-[10px] text-zinc-600 font-mono">{p.referral_code || 'No code'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-zinc-100">{p.actualCount}</p>
                  <p className="text-[10px] text-zinc-500">
                    {p.verifiedCount} verified
                  </p>
                </div>
              </div>
            ))}

          {profiles.filter((p) => (p.referral_count ?? 0) > 0 || referrals.some((r) => r.referrer_id === p.user_id)).length === 0 && (
            <p className="text-xs text-zinc-500 text-center py-4">No referrers yet</p>
          )}
        </div>
      </div>

      {/* Manual Assignment Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md space-y-4">
            <h3 className="text-sm font-semibold text-zinc-100">
              Assign Referrer to {assignModal.userName}
            </h3>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Select Referrer</label>
              <select
                value={selectedReferrerId}
                onChange={(e) => setSelectedReferrerId(e.target.value)}
                className="w-full h-9 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 px-2"
              >
                <option value="">— Select a user —</option>
                {profiles
                  .filter((p) => p.user_id !== assignModal.userId && p.referral_code)
                  .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))
                  .map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.full_name || p.user_id.slice(0, 8)} — {p.referral_code}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAssignModal(null);
                  setSelectedReferrerId('');
                }}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleManualAssign}
                disabled={!selectedReferrerId || assigning}
                className="text-xs bg-[#f59e0b] text-black hover:bg-[#d97706]"
              >
                {assigning ? 'Assigning…' : 'Assign Referral'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}