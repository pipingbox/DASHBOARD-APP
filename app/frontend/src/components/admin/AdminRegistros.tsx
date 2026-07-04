import { useEffect, useState, useCallback } from 'react';
import { supabase, TABLES, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { COMPLETION_THRESHOLDS } from '@/lib/profileCompletion';
import {
  Users2,
  Building2,
  HardHat,
  Search,
  RefreshCw,
  Mail,
  Chrome,
  AlertTriangle,
  UserCheck,
  Clock,
  Filter,
  Download,
  Zap,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/* ─── Constants ─── */
const BACKFILL_URL = `${SUPABASE_URL}/functions/v1/backfill-profiles`;

/* ─── Types ─── */
interface AuthUser {
  auth_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  auth_provider: string;
  has_profile: boolean;
}

interface ProfileRow {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  account_type: string | null;
  created_at: string | null;
  avatar_url: string | null;
  profile_completion: number | null;
  availability_status: string | null;
  cv_visible: boolean | null;
  bio: string | null;
  position: string | null;
  company: string | null;
  location: string | null;
  skills: string[] | null;
  referral_code: string | null;
  referred_by: string | null;
}

interface RegistroUser {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  account_type: string | null;
  created_at: string | null;
  avatar_url: string | null;
  profile_completion: number | null;
  availability_status: string | null;
  cv_visible: boolean | null;
  bio: string | null;
  position: string | null;
  company: string | null;
  location: string | null;
  skills: string[] | null;
  referral_code: string | null;
  referred_by: string | null;
  auth_provider: string;
  has_profile: boolean;
  last_sign_in_at: string | null;
}

type OnboardingStatus = 'AUTH_ONLY' | 'PROFILE_STARTED' | 'PROFILE_COMPLETED' | 'MARKETPLACE_READY';
type RegistroFilter = 'all' | 'complete' | 'incomplete' | 'companies' | 'referrals' | 'orphans';

/* ─── Helpers ─── */
function computeOnboardingStatus(user: RegistroUser): OnboardingStatus {
  if (!user.has_profile) return 'AUTH_ONLY';

  const completion = user.profile_completion ?? 0;
  const hasBasicInfo = !!(user.full_name && user.position);

  // MARKETPLACE_READY: minimum useful fields + profile_visibility = public (cv_visible = true)
  const pVisibility = (user as Record<string, unknown>).profile_visibility as string | undefined;
  const isPublic = pVisibility ? pVisibility === 'public' : user.cv_visible === true;
  if (completion >= COMPLETION_THRESHOLDS.ALMOST_READY && isPublic) return 'MARKETPLACE_READY';
  if (completion >= COMPLETION_THRESHOLDS.GOOD_START || (hasBasicInfo && user.bio)) return 'PROFILE_COMPLETED';
  if (completion > 10 || user.position || user.bio) return 'PROFILE_STARTED';
  return 'AUTH_ONLY';
}

function getStatusBadge(status: OnboardingStatus) {
  switch (status) {
    case 'MARKETPLACE_READY':
      return { label: 'MARKETPLACE READY', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', dot: '🟢' };
    case 'PROFILE_COMPLETED':
      return { label: 'PROFILE STARTED', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30', dot: '🟡' };
    case 'PROFILE_STARTED':
      return { label: 'PROFILE STARTED', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30', dot: '🟡' };
    case 'AUTH_ONLY':
      return { label: 'SOLO AUTH', color: 'bg-red-500/10 text-red-400 border-red-500/30', dot: '🔴' };
  }
}

function getAccountTypeBadge(role: string, accountType: string | null) {
  const normalizedRole = role === 'user' ? 'worker' : role;
  if (normalizedRole === 'company' || accountType === 'company') {
    return { label: 'EMPRESA', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', dot: '🔵' };
  }
  return null;
}

/* ─── Component ─── */
export function AdminRegistros() {
  const [users, setUsers] = useState<RegistroUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RegistroFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Referral assignment modal state
  const [referralModal, setReferralModal] = useState<{ open: boolean; referidoId: string; referidoName: string }>({
    open: false,
    referidoId: '',
    referidoName: '',
  });
  const [selectedReferrerId, setSelectedReferrerId] = useState<string>('');
  const [assigningReferral, setAssigningReferral] = useState(false);

  /* ─── Fetch all registered users combining edge function + profiles ─── */
  const fetchRegistros = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Strategy: Use edge function (service_role_key) as SINGLE source of truth
      // It returns auth.users merged with profiles data (bypasses RLS via service_role)

      let registroUsers: RegistroUser[] = [];
      let edgeFunctionWorked = false;

      try {
        const res = await fetch(`${BACKFILL_URL}?mode=list-all`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          const authUsers = data.auth_users || [];
          edgeFunctionWorked = true;
          console.log('[AdminRegistros] Edge function returned', authUsers.length, 'auth users,', data.total_profiles, 'profiles,', data.orphan_count, 'orphans');

          // Map edge function response to RegistroUser format
          registroUsers = authUsers.map((au: any) => {
            const profile = au.profile;

            if (au.has_profile && profile) {
              return {
                id: profile.id,
                user_id: au.auth_id,
                full_name: profile.full_name || au.full_name,
                email: au.email,
                role: profile.role || 'worker',
                account_type: profile.account_type,
                created_at: profile.created_at || au.created_at,
                avatar_url: profile.avatar_url,
                profile_completion: profile.profile_completion ?? 0,
                availability_status: profile.availability_status,
                cv_visible: profile.cv_visible,
                bio: profile.bio,
                position: profile.title,
                company: profile.company,
                location: profile.location,
                skills: Array.isArray(profile.skills) ? profile.skills : null,
                referral_code: profile.referral_code,
                referred_by: profile.referred_by_user_id,
                auth_provider: au.auth_provider || 'email',
                has_profile: true,
                last_sign_in_at: au.last_sign_in_at,
              };
            } else {
              // Orphan: auth user WITHOUT profile
              return {
                id: au.auth_id,
                user_id: au.auth_id,
                full_name: au.full_name,
                email: au.email,
                role: 'worker',
                account_type: null,
                created_at: au.created_at,
                avatar_url: null,
                profile_completion: 0,
                availability_status: null,
                cv_visible: null,
                bio: null,
                position: null,
                company: null,
                location: null,
                skills: null,
                referral_code: null,
                referred_by: null,
                auth_provider: au.auth_provider || 'email',
                has_profile: false,
                last_sign_in_at: au.last_sign_in_at,
              };
            }
          });
        } else {
          const errText = await res.text();
          console.error('[AdminRegistros] Edge function error:', res.status, errText);
          setError(`⚠️ Error de función edge (${res.status}): ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        console.error('[AdminRegistros] Edge function network error:', err);
        setError(`⚠️ Error de red al conectar con la función edge: ${String(err)}`);
      }

      // FALLBACK: If edge function failed, try fetching profiles directly
      if (!edgeFunctionWorked) {
        const { data: profiles, error: profilesError } = await supabase
          .from(TABLES.profiles)
          .select('id, user_id, full_name, role, account_type, created_at, avatar_url, availability_status, cv_visible, bio, title, company, location, skills, referral_code, referred_by_user_id, years_experience, profile_completion, profile_visibility')
          .order('created_at', { ascending: false })
          .limit(500);

        if (profilesError) {
          console.error('[AdminRegistros] Profiles fallback error:', profilesError);
          setError('⚠️ No se pudo conectar con la función edge NI leer perfiles. Verifica permisos.');
        } else {
          registroUsers = (profiles || []).map((p: any) => ({
            id: p.id,
            user_id: p.user_id,
            full_name: p.full_name,
            email: null,
            role: p.role || 'worker',
            account_type: p.account_type,
            created_at: p.created_at,
            avatar_url: p.avatar_url,
            profile_completion: p.profile_completion ?? 0,
            availability_status: p.availability_status,
            cv_visible: p.cv_visible,
            bio: p.bio,
            position: p.title,
            company: p.company,
            location: p.location,
            skills: Array.isArray(p.skills) ? p.skills : null,
            referral_code: p.referral_code,
            referred_by: p.referred_by_user_id,
            auth_provider: 'email',
            has_profile: true,
            last_sign_in_at: null,
          }));

          if (!edgeFunctionWorked) {
            setError('⚠️ Función edge no disponible. Mostrando solo perfiles existentes. Los usuarios huérfanos (solo auth) no aparecerán.');
          }
        }
      }

      // Sort by created_at descending
      registroUsers.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

      setUsers(registroUsers);
    } catch (err) {
      console.error('[AdminRegistros] Unexpected error:', err);
      setError('Error inesperado al cargar registros.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRegistros();
  }, [fetchRegistros]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRegistros();
    setRefreshing(false);
  };

  /* ─── Auto-repair: backfill orphan profiles ─── */
  const handleBackfillOrphans = async () => {
    setBackfilling(true);
    try {
      const res = await fetch(BACKFILL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`✅ ${data.created || 0} perfiles creados automáticamente`);
        await fetchRegistros();
      } else {
        toast.error(`Error: ${data.error || data.details || 'Unknown'}`);
        console.error('[AdminRegistros] Backfill error:', data);
      }
    } catch (err) {
      toast.error(`Error de red: ${String(err)}`);
    } finally {
      setBackfilling(false);
    }
  };

  /* ─── Open referral assignment modal ─── */
  const openReferralModal = (referidoId: string, referidoName: string) => {
    setReferralModal({ open: true, referidoId, referidoName });
    setSelectedReferrerId('');
  };

  /* ─── Assign referral (from modal) ─── */
  const handleAssignReferral = async () => {
    if (!selectedReferrerId || !referralModal.referidoId) return;

    setAssigningReferral(true);
    try {
      // Update referred_by_user_id on the referido user
      const { error: updateError } = await supabase
        .from(TABLES.profiles)
        .update({ referred_by_user_id: selectedReferrerId })
        .eq('user_id', referralModal.referidoId);

      if (updateError) {
        toast.error(`Error al asignar referral: ${updateError.message}`);
        setAssigningReferral(false);
        return;
      }

      // Increment referrer's referral_count
      const { data: referrerProfile } = await supabase
        .from(TABLES.profiles)
        .select('referral_count')
        .eq('user_id', selectedReferrerId)
        .maybeSingle();

      const currentCount = (referrerProfile?.referral_count as number) || 0;
      await supabase
        .from(TABLES.profiles)
        .update({ referral_count: currentCount + 1 })
        .eq('user_id', selectedReferrerId);

      const referrerUser = users.find((u) => u.user_id === selectedReferrerId);
      console.log('REFERRAL MANUALLY ASSIGNED:', referralModal.referidoName, '←', referrerUser?.full_name || referrerUser?.email);
      toast.success(`✅ Referral asignado: ${referrerUser?.full_name || referrerUser?.email} → ${referralModal.referidoName}`);

      setReferralModal({ open: false, referidoId: '', referidoName: '' });
      await fetchRegistros();
    } catch (err) {
      toast.error(`Error: ${String(err)}`);
    } finally {
      setAssigningReferral(false);
    }
  };

  /* ─── Computed stats ─── */
  const stats = {
    total: users.length,
    marketplaceReady: users.filter((u) => computeOnboardingStatus(u) === 'MARKETPLACE_READY').length,
    companies: users.filter((u) => (u.role === 'company' || u.account_type === 'company')).length,
    googleOAuth: users.filter((u) => u.auth_provider === 'google').length,
    referralsActive: users.filter((u) => u.referred_by || u.referral_code).length,
    authOnly: users.filter((u) => !u.has_profile || computeOnboardingStatus(u) === 'AUTH_ONLY').length,
  };

  /* ─── Filtered users ─── */
  const filteredUsers = users.filter((u) => {
    const status = computeOnboardingStatus(u);
    const normalizedRole = u.role === 'user' ? 'worker' : u.role;

    switch (filter) {
      case 'complete':
        if (status !== 'MARKETPLACE_READY') return false;
        break;
      case 'incomplete':
        if (status === 'MARKETPLACE_READY') return false;
        break;
      case 'companies':
        if (normalizedRole !== 'company' && u.account_type !== 'company') return false;
        break;
      case 'referrals':
        if (!u.referred_by && !u.referral_code) return false;
        break;
      case 'orphans':
        if (u.has_profile && status !== 'AUTH_ONLY') return false;
        break;
    }

    if (search) {
      const q = search.toLowerCase();
      return (
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.position?.toLowerCase().includes(q) ||
        u.company?.toLowerCase().includes(q) ||
        u.referral_code?.toLowerCase().includes(q) ||
        u.referred_by?.toLowerCase().includes(q)
      );
    }

    return true;
  });

  /* ─── Export CSV ─── */
  const handleExportCSV = () => {
    const headers = ['Nombre', 'Email', 'Fecha Registro', 'Rol', 'Tiene Profile', 'Onboarding Status', 'Profile %', 'Auth Provider', 'Referral Code', 'Referred By'];
    const rows = filteredUsers.map((u) => [
      u.full_name || '',
      u.email || '',
      u.created_at ? new Date(u.created_at).toLocaleDateString() : '',
      u.role === 'user' ? 'worker' : u.role,
      u.has_profile ? 'Sí' : 'No',
      computeOnboardingStatus(u),
      String(u.profile_completion ?? 0),
      u.auth_provider,
      u.referral_code || '',
      u.referred_by || '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipingbox-registros-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ─── Filter buttons ─── */
  const filterOptions: { id: RegistroFilter; label: string; count?: number }[] = [
    { id: 'all', label: 'Todos', count: stats.total },
    { id: 'complete', label: 'Completos', count: stats.marketplaceReady },
    { id: 'incomplete', label: 'Incompletos', count: stats.total - stats.marketplaceReady },
    { id: 'companies', label: 'Empresas', count: stats.companies },
    { id: 'referrals', label: 'Referrals', count: stats.referralsActive },
    { id: 'orphans', label: 'Solo Auth', count: stats.authOnly },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">Registros Internos</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Trazabilidad completa: combina <code className="text-zinc-400">auth.users</code> + <code className="text-zinc-400">profiles</code> vía edge function (service_role).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExportCSV}
            variant="outline"
            size="sm"
            className="border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
          >
            <Download className="h-3 w-3 mr-1.5" />
            CSV
          </Button>
          <Button
            onClick={handleBackfillOrphans}
            disabled={backfilling || stats.authOnly === 0}
            variant="outline"
            size="sm"
            className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
          >
            <Zap className={`h-3 w-3 mr-1.5 ${backfilling ? 'animate-pulse' : ''}`} />
            {backfilling ? 'Reparando...' : `Reparar Huérfanos (${stats.authOnly})`}
          </Button>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            size="sm"
            className="border-[#f59e0b]/50 text-[#f59e0b] hover:bg-[#f59e0b]/10"
          >
            <RefreshCw className={`h-3 w-3 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-sm px-4 py-3 text-sm text-amber-300 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stats Counters */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Total Registros" value={stats.total} icon={Users2} color="text-zinc-100" />
        <StatTile label="Onboarding OK" value={stats.marketplaceReady} icon={UserCheck} color="text-emerald-400" />
        <StatTile label="Empresas" value={stats.companies} icon={Building2} color="text-blue-400" />
        <StatTile label="Google OAuth" value={stats.googleOAuth} icon={Chrome} color="text-amber-400" />
        <StatTile label="Referrals" value={stats.referralsActive} icon={HardHat} color="text-purple-400" />
        <StatTile label="Huérfanos" value={stats.authOnly} icon={AlertTriangle} color="text-red-400" />
      </div>

      {/* Filters & Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-zinc-600" />
          {filterOptions.map((f) => (
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
              {f.count !== undefined && (
                <span className="ml-1.5 text-[9px] opacity-70">({f.count})</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-400 min-w-[240px] ml-auto">
          <Search className="h-4 w-4 shrink-0" />
          <input
            placeholder="Buscar nombre, email, empresa, código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none placeholder:text-zinc-600 text-sm"
          />
        </div>
      </div>

      {/* Users Table */}
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
                    Nombre
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Email
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Fecha Registro
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Login
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Rol
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Onboarding
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Perfil %
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Referral
                  </th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const status = computeOnboardingStatus(u);
                  const badge = getStatusBadge(status);
                  const companyBadge = getAccountTypeBadge(u.role, u.account_type);
                  const normalizedRole = u.role === 'user' ? 'worker' : u.role;
                  const completion = u.profile_completion ?? 0;
                  const isGoogleAuth = u.auth_provider === 'google';

                  return (
                    <tr
                      key={u.id}
                      className={`border-b border-zinc-800/40 hover:bg-zinc-900/50 transition ${
                        !u.has_profile ? 'bg-red-500/[0.03]' : ''
                      }`}
                    >
                      {/* Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold shrink-0 ${
                            !u.has_profile
                              ? 'bg-red-500/10 border-red-500/30 text-red-400'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                          }`}>
                            {(u.full_name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="text-zinc-200 font-medium text-sm block truncate">
                              {u.full_name || '(Sin nombre)'}
                            </span>
                            {u.position && (
                              <span className="text-[10px] text-zinc-500 block truncate">
                                {u.position}
                              </span>
                            )}
                            {!u.has_profile && (
                              <span className="text-[9px] text-red-400/70 block">
                                ⚠ Sin fila en profiles
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3 px-4 text-zinc-400 text-xs max-w-[180px] truncate">
                        {u.email || '—'}
                      </td>

                      {/* Registration Date */}
                      <td className="py-3 px-4 text-zinc-500 text-xs whitespace-nowrap">
                        {u.created_at ? (
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3 w-3 text-zinc-600" />
                            {new Date(u.created_at).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </div>
                        ) : '—'}
                      </td>

                      {/* Login Method */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-400">
                          {isGoogleAuth ? (
                            <>
                              <Chrome className="h-3 w-3 text-amber-400" />
                              <span className="text-amber-400">Google</span>
                            </>
                          ) : (
                            <>
                              <Mail className="h-3 w-3 text-zinc-500" />
                              <span>Email</span>
                            </>
                          )}
                        </span>
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-sm border text-[10px] font-semibold uppercase tracking-wider bg-zinc-800/50 text-zinc-300 border-zinc-700 w-fit">
                            {normalizedRole}
                          </span>
                          {companyBadge && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider w-fit ${companyBadge.color}`}>
                              {companyBadge.dot} {companyBadge.label}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Onboarding Status */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-[10px] font-semibold uppercase tracking-wider ${badge.color}`}>
                          <span>{badge.dot}</span>
                          {badge.label}
                        </span>
                      </td>

                      {/* Profile Completion */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                completion >= COMPLETION_THRESHOLDS.ALMOST_READY
                                  ? 'bg-emerald-500'
                                  : completion >= COMPLETION_THRESHOLDS.GOOD_START
                                  ? 'bg-yellow-500'
                                  : completion > 0
                                  ? 'bg-orange-500'
                                  : 'bg-zinc-700'
                              }`}
                              style={{ width: `${Math.min(completion, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {completion}%
                          </span>
                        </div>
                      </td>

                      {/* Referral */}
                      <td className="py-3 px-4 text-xs">
                        {u.referred_by ? (() => {
                          const referrer = users.find((r) => r.user_id === u.referred_by);
                          const referrerName = referrer?.full_name || u.referred_by.slice(0, 8) + '…';
                          return (
                            <span className="inline-flex items-center gap-1 text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-sm border border-purple-500/20 text-[10px]">
                              ← {referrerName}
                            </span>
                          );
                        })() : u.referral_code ? (
                          <span className="text-zinc-500 text-[10px] font-mono">{u.referral_code}</span>
                        ) : (
                          <span className="text-zinc-700">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {!u.referred_by && (
                            <button
                              onClick={() => openReferralModal(u.user_id, u.full_name || u.email || 'Usuario')}
                              title="Asignar referido manualmente"
                              className="p-1.5 rounded-sm border border-zinc-800 hover:border-purple-500/50 hover:bg-purple-500/10 text-zinc-500 hover:text-purple-400 transition"
                            >
                              <Link2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-zinc-500 text-sm">
                      No se encontraron usuarios con estos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between text-[10px] text-zinc-600 px-1">
        <span>
          Mostrando {filteredUsers.length} de {users.length} registros (auth.users + profiles)
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3" />
          Panel interno — No visible para usuarios públicos
        </span>
      </div>

      {/* Referral Assignment Modal */}
      {referralModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-md shadow-xl w-full max-w-md p-6 space-y-4">
            <h4 className="text-lg font-semibold text-zinc-100">Asignar Referido</h4>
            <p className="text-sm text-zinc-400">
              Selecciona quién refirió a <span className="text-amber-400 font-medium">{referralModal.referidoName}</span>
            </p>

            {/* Referrer selector */}
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 uppercase tracking-wider">Referrer (quién lo invitó)</label>
              <select
                value={selectedReferrerId}
                onChange={(e) => setSelectedReferrerId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-sm px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500"
              >
                <option value="">— Seleccionar referrer —</option>
                {users
                  .filter((u) => u.user_id !== referralModal.referidoId && u.has_profile && u.referral_code)
                  .map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      {u.full_name || u.email} {u.referral_code ? `(${u.referral_code})` : ''}
                    </option>
                  ))}
              </select>
            </div>

            {/* Preview */}
            {selectedReferrerId && (
              <div className="border border-zinc-800 bg-zinc-950 rounded-sm p-3 text-xs text-zinc-400">
                <span className="text-purple-400 font-medium">
                  {users.find((u) => u.user_id === selectedReferrerId)?.full_name || 'Referrer'}
                </span>
                {' → refirió a → '}
                <span className="text-amber-400 font-medium">{referralModal.referidoName}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setReferralModal({ open: false, referidoId: '', referidoName: '' })}
                className="px-4 py-2 text-sm text-zinc-400 border border-zinc-700 rounded-sm hover:bg-zinc-800 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssignReferral}
                disabled={!selectedReferrerId || assigningReferral}
                className="px-4 py-2 text-sm bg-purple-600 text-white rounded-sm hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
              >
                {assigningReferral && <RefreshCw className="h-3 w-3 animate-spin" />}
                Asignar Referral
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Stat Tile ─── */
function StatTile({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-4 rounded-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[9px] uppercase tracking-[0.25em] text-zinc-500 leading-tight">
          {label}
        </p>
        <Icon className="h-3.5 w-3.5 text-zinc-600" />
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

/* ─── Detect auth provider from email ─── */
function detectAuthProvider(email: string | null): string {
  if (!email) return 'unknown';
  if (email.endsWith('@gmail.com')) return 'google';
  return 'email';
}